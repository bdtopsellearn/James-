import React, { useState } from 'react';
import {
  Server,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle,
  XCircle,
  Shield,
  Activity,
  Zap,
  Globe,
  X
} from 'lucide-react';
import { ProxyItem } from '../../types';
import { InfoCallout } from '../../components/rayobyte/InfoCallout';
import { CountryFlag } from '../../components/ui/CountryFlag';
import { askConfirm } from '../../lib/dialog';
import { apiAdminCheckProxy } from '../../services/api';

interface AdminProxiesViewProps {
  proxies: ProxyItem[];
  onAddProxy: (proxy: Omit<ProxyItem, 'id' | 'mbUsed' | 'stats' | 'addedAt' | 'latencyMs'>) => void | Promise<void>;
  onToggleProxy: (id: string) => void;
  onDeleteProxy: (id: string) => void;
  onTestProxy: (id: string) => void | Promise<void>;
  onTestAll: () => void | Promise<void>;
  /** Re-fetch proxy state after a batch health check. */
  onRefreshProxies?: () => void | Promise<void>;
}

export const AdminProxiesView: React.FC<AdminProxiesViewProps> = ({
  proxies,
  onAddProxy,
  onToggleProxy,
  onDeleteProxy,
  onTestProxy,
  onTestAll,
  onRefreshProxies
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [server, setServer] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [type, setType] = useState<'socks5' | 'http'>('socks5');
  const [country, setCountry] = useState('US');
  const [quotaMb, setQuotaMb] = useState('20000');
  const [isTestingAll, setIsTestingAll] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [healthMap, setHealthMap] = useState<Record<string, any>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const allSelected = proxies.length > 0 && selected.size === proxies.length;
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(proxies.map((p) => p.id)));
  };
  const deleteSelected = async () => {
    if (!selected.size || bulkBusy) return;
    const ok = await askConfirm(`Delete ${selected.size} selected booster${selected.size > 1 ? 's' : ''}?`, { confirmLabel: 'Yes, Delete' });
    if (!ok) return;
    setBulkBusy(true);
    try {
      for (const id of Array.from(selected)) {
        try { await onDeleteProxy(id); } catch { /* keep going */ }
      }
      setSelected(new Set());
    } finally {
      setBulkBusy(false);
    }
  };
  const deleteAll = async () => {
    if (!proxies.length || bulkBusy) return;
    const ok = await askConfirm(`Delete ALL ${proxies.length} boosters? This cannot be undone.`, { confirmLabel: 'Delete All' });
    if (!ok) return;
    setBulkBusy(true);
    try {
      for (const p of proxies) {
        try { await onDeleteProxy(p.id); } catch { /* keep going */ }
      }
      setSelected(new Set());
    } finally {
      setBulkBusy(false);
    }
  };
  const clearOffline = async () => {
    if (bulkBusy) return;
    const offline = proxies.filter((p) => {
      const h = healthMap[p.id] ?? (p as any).health;
      return h && h.status && h.status !== 'healthy';
    });
    if (!offline.length) {
      await askConfirm('No offline boosters detected. Run "Test All Nodes" first to refresh health.', { confirmLabel: 'OK', cancelLabel: 'Close' });
      return;
    }
    const ok = await askConfirm(`Remove ${offline.length} offline booster${offline.length > 1 ? 's' : ''}?`, { confirmLabel: 'Yes, Remove' });
    if (!ok) return;
    setBulkBusy(true);
    try {
      for (const p of offline) {
        try { await onDeleteProxy(p.id); } catch { /* keep going */ }
      }
      setSelected(new Set());
    } finally {
      setBulkBusy(false);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adding) return;
    const cleanName = name.trim();
    // strip any scheme the admin pasted; the protocol dropdown decides it
    const hostPort = server.trim().replace(/^[a-z0-9]+:\/\//i, '');
    if (!cleanName || !hostPort) return;

    // The server understands  scheme://user:pass@host:port#CC#MB#resi  — build it from the form.
    // (Before, the username / password / protocol / country / quota were silently dropped.)
    const auth = username.trim()
      ? `${encodeURIComponent(username.trim())}:${encodeURIComponent(password)}@`
      : '';
    const tags = [
      /^[A-Za-z]{2}$/.test(country.trim()) ? `#${country.trim().toUpperCase()}` : '',
      parseInt(quotaMb, 10) > 0 ? `#${parseInt(quotaMb, 10)}MB` : '',
      '#resi',
    ].join('');

    setAdding(true);
    try {
      await onAddProxy({
        name: cleanName,
        server: `${type}://${auth}${hostPort}${tags}`,
        type,
        country: country.trim().toUpperCase(),
        residential: true,
        quotaMb: parseInt(quotaMb, 10) || 0,
        enabled: true
      });
      setName('');
      setServer('');
      setUsername('');
      setPassword('');
      setShowAddModal(false);
    } catch {
      /* the parent already showed the error toast — keep the form open so nothing is lost */
    } finally {
      setAdding(false);
    }
  };

  const handleBatchTest = async () => {
    if (isTestingAll) return;
    const ids = proxies.map((p) => p.id);
    if (ids.length === 0) return;
    setIsTestingAll(true);
    setProgress({ done: 0, total: ids.length });
    setHealthMap({});
    let idx = 0;
    let done = 0;
    // Check up to 3 proxies at a time so the pool is never flooded.
    const worker = async () => {
      while (idx < ids.length) {
        const id = ids[idx++];
        try {
          const h = await apiAdminCheckProxy(id);
          setHealthMap((m) => ({ ...m, [id]: h }));
        } catch (e: any) {
          setHealthMap((m) => ({ ...m, [id]: { status: 'failed', error: e?.message || 'Health check failed' } }));
        }
        done += 1;
        setProgress({ done, total: ids.length });
      }
    };
    try {
      await Promise.all([worker(), worker(), worker()]);
      await onRefreshProxies?.();
    } finally {
      setIsTestingAll(false);
      setProgress(null);
      setHealthMap({});
    }
  };

  const handleSingleTest = async (id: string) => {
    if (testingId) return;
    setTestingId(id);
    try { await onTestProxy(id); } finally { setTestingId(null); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              CPM Booster Pool
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Dynamic booster rotation, automated failover cooldowns, exit-country verification, and MB quota meters.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleBatchTest}
            disabled={isTestingAll}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isTestingAll ? 'animate-spin' : ''}`} />
            <span>{isTestingAll ? `Testing ${progress?.done ?? 0}/${progress?.total ?? proxies.length}…` : 'Test All Nodes'}</span>
          </button>

          <button
            type="button"
            onClick={clearOffline}
            disabled={bulkBusy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900 transition-colors cursor-pointer disabled:opacity-60"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Clear Offline</span>
          </button>

          {selected.size > 0 && (
            <button
              type="button"
              onClick={deleteSelected}
              disabled={bulkBusy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer disabled:opacity-60"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Selected ({selected.size})</span>
            </button>
          )}

          <button
            type="button"
            onClick={deleteAll}
            disabled={bulkBusy || proxies.length === 0}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete All</span>
          </button>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Booster</span>
          </button>
        </div>
      </div>

      <InfoCallout
        title="Automated Health Guard"
        message="Boosters with more than 3 consecutive handshake drops are automatically demoted to a 5-minute cooldown pool to protect user traffic success rates."
      />

      <InfoCallout
        type="success"
        title="Country flags & pick-rates"
        message="Every booster's exit country is auto-detected on add and shown with an animated flag. Impressions are delivered in that country. To raise or lower how often a country is chosen, open the Targeting Engine panel."
      />

      {/* Proxy Grid / Table */}
      <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="pn-sticky-actions w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all boosters"
                    className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-4">Booster Label</th>
                <th className="py-3 px-4">Server (Host:Port)</th>
                <th className="py-3 px-4">Protocol</th>
                <th className="py-3 px-4">Country</th>
                <th className="py-3 px-4">Health</th>
                <th className="py-3 px-4">Latency</th>
                <th className="py-3 px-4">Bandwidth / Quota</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {proxies.map((p) => {
                const isTesting = testingId === p.id;
                

                return (
                  <tr key={p.id} className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 ${selected.has(p.id) ? 'bg-teal-50/40 dark:bg-teal-950/20' : ''}`}>
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        aria-label={`Select booster ${p.name}`}
                        className="rounded text-teal-600 focus:ring-teal-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{p.name}</div>
                      <span className="text-[10px] text-teal-600 dark:text-teal-400 font-mono">
                        {p.residential ? 'Residential Peer' : 'Datacenter IP'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-300">
                      {p.server}
                    </td>
                    <td className="py-3 px-4 uppercase font-mono text-[10px] font-bold text-slate-500">
                      {p.type}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-800 dark:text-slate-200">
                      {healthMap[p.id]?.country || (p as any).health?.country || p.country || '—'}
                    </td>
                    <td className="py-3 px-4">
                      {(() => {
                        const h = healthMap[p.id] ?? (p as any).health;
                        if (isTesting || isTestingAll) return <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 animate-pulse">Checking…</span>;
                        if (!h) return <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">Not checked</span>;
                        const ok = h.status === 'healthy';
                        return (
                          <div className="space-y-0.5">
                            <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${ok ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'}`}>
                              {ok ? '● Online · Working' : '● Offline · Failed'}
                            </span>
                            {!ok && h.error && <div className="text-[10px] text-rose-500 max-w-[180px] truncate" title={h.error}>{h.error}</div>}
                            <div className="text-[10px] text-slate-400">{h.lastChecked ? new Date(h.lastChecked).toLocaleString() : ''}</div>
                          </div>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">
                      {(() => {
                        const ms = Number(healthMap[p.id]?.latencyMs || (p as any).health?.latencyMs || p.latencyMs || 0);
                        return (
                          <span className={ms > 0 && ms < 800 ? 'text-emerald-600' : 'text-amber-500'}>
                            {ms ? `${ms}ms` : '—'}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">
                      <span className="text-slate-800 dark:text-slate-200 font-semibold">{p.mbUsed} MB</span>
                      <span className="text-slate-400"> / {p.quotaMb ? `${p.quotaMb} MB` : 'Unlimited'}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase ${
                          p.enabled
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {p.enabled ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleSingleTest(p.id)}
                          disabled={isTesting}
                          className="px-2 py-1 text-[11px] font-medium rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <RefreshCw className={`w-3 h-3 inline mr-1 ${isTesting ? 'animate-spin' : ''}`} />
                          Ping
                        </button>

                        <button
                          onClick={() => onToggleProxy(p.id)}
                          className={`px-2 py-1 text-[11px] font-semibold rounded cursor-pointer ${
                            p.enabled
                              ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300'
                              : 'bg-teal-50 text-teal-700 hover:bg-teal-100 dark:bg-teal-950/40 dark:text-teal-300'
                          }`}
                        >
                          {p.enabled ? 'Disable' : 'Enable'}
                        </button>

                        <button
                          onClick={() => {
                            void askConfirm(`Delete booster ${p.name}?`, { confirmLabel: 'Yes, Delete' }).then((ok) => { if (ok) onDeleteProxy(p.id); });
                          }}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Proxy Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto overscroll-contain">
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-md w-full p-6 space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Add SOCKS5 / HTTP Booster Node
              </h3>
              <button type="button" aria-label="Close" onClick={() => setShowAddModal(false)} className="p-1.5 -mr-1.5 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Booster Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. US-Residential-Node-501"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Server Endpoint (host:port)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 203.0.113.10:1080"
                  value={server}
                  onChange={(e) => setServer(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Username (optional)
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Password (optional)
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Protocol Type
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  >
                    <option value="socks5">SOCKS5</option>
                    <option value="http">HTTP</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Country Code (2-char)
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    placeholder="US"
                    value={country}
                    onChange={(e) => setCountry(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 text-xs font-mono uppercase rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Bandwidth Quota Cap (MB)
                </label>
                <input
                  type="number"
                  placeholder="20000"
                  value={quotaMb}
                  onChange={(e) => setQuotaMb(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer shadow-xs disabled:opacity-60 disabled:cursor-wait"
                >
                  {adding ? 'Saving…' : 'Save & Validate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

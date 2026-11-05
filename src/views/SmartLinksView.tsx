import React, { useState, useEffect } from 'react';
import {
  Zap,
  Key,
  RefreshCw,
  Plus,
  FileCode,
  Sliders,
  DollarSign,
  TrendingUp,
  ExternalLink,
  ShieldCheck,
  CheckCircle,
  Copy,
  Trash2,
  Play,
  Pause,
  History
} from 'lucide-react';
import { SmartLink, LiveImpression } from '../types';
import { InfoCallout } from '../components/rayobyte/InfoCallout';
import { SmartLinkAnalyticsPanel } from '../components/analytics/SmartLinkAnalyticsPanel';
import { ImpressionHistoryPanel } from '../components/analytics/ImpressionHistoryPanel';
import { dhakaDateKey } from '../lib/timezone';
import { askConfirm } from '../lib/dialog';
import { apiImportSmartlinksFromJson, apiGetAdsterraApiKeyStatus, apiSetAdsterraApiKey, apiSyncAdsterra, apiAdsterraSummary, AdsterraNetworkSummary } from '../services/api';
import { StartLimitModal } from '../components/ui/StartLimitModal';

import { useToast } from '../components/ui/Toast';
interface SmartLinksViewProps {
  smartlinks: SmartLink[];
  onAddSmartLink: (name: string, url: string, adsterraId?: string) => void;
  onBulkAdd: (urls: string[]) => void;
  onToggleStatus: (id: string) => void;
  onDeleteSmartLink: (id: string) => void;
  onDeleteAllSmartLinks?: () => void;
  /** Start a SmartLink campaign with a visit limit (auto-stops when reached). */
  onStartWithLimit?: (id: string | 'all', amount: number) => void | Promise<void>;
  /** Available impression balance, used to validate the chosen limit. */
  balance?: number;
  /** Every impression the member has — filtered to SmartLink rows inside the panel. */
  impressions?: LiveImpression[];
  /** Lifetime delivered impressions (server source of truth) — same value shown on Dashboard/History. */
  totalImpressions?: number;
}

export const SmartLinksView: React.FC<SmartLinksViewProps> = ({
  smartlinks,
  onAddSmartLink,
  onBulkAdd,
  onToggleStatus,
  onDeleteSmartLink,
  onDeleteAllSmartLinks,
  onStartWithLimit,
  balance = 0,
  impressions = [],
  totalImpressions = 0
}) => {
  const lifetimeImpressions = Math.max(0, Math.floor(Number(totalImpressions) || 0));
  const { showToast } = useToast();
  const [startModal, setStartModal] = useState<{ open: boolean; id: string | 'all'; label: string }>({
    open: false,
    id: 'all',
    label: ''
  });
  const [apiKey, setApiKey] = useState('');
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [maskedKey, setMaskedKey] = useState('');
  // Live Adsterra publisher revenue (network-wide, pulled from the publisher API).
  const [adsterra, setAdsterra] = useState<AdsterraNetworkSummary | null>(null);

  useEffect(() => {
    apiGetAdsterraApiKeyStatus().then((r) => setMaskedKey(r?.masked || '')).catch(() => {});
    let alive = true;
    apiAdsterraSummary(7)
      .then((r) => { if (alive) setAdsterra(r); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [jsonUrl, setJsonUrl] = useState('');
  const [activeTab, setActiveTab] = useState<'links' | 'analytics' | 'history' | 'report'>('links');

  // Reports are derived from the real SmartLink records returned by the server.
  const publisherReports = smartlinks.map((s) => ({
    date: s.lastVisitAt ? (dhakaDateKey(s.lastVisitAt) || '—') : '—',
    placementId: s.adsterraId || '—',
    impressions: Number(s.stats?.visits || 0),
    cpm: '—',
    revenue: '—',
  }));

  // Real Adsterra publisher-API daily breakdown (newest first). Falls back to the
  // per-SmartLink rows above when the publisher API has no data yet.
  const adsterraRows = (adsterra?.days || [])
    .slice()
    .reverse()
    .map((d) => ({
      date: d.date,
      placementId: 'ALL',
      impressions: Number(d.impressions || 0),
      cpm: `$${Number(d.cpm || 0).toFixed(2)}`,
      revenue: `$${Number(d.revenue || 0).toFixed(2)}`,
    }));

  const handleSyncAdsterra = async () => {
    setIsSyncing(true);
    try {
      const result = await apiSyncAdsterra();
      window.location.reload();
    } catch (e: any) {
      showToast('Sync failed', e?.message || 'Adsterra API sync failed.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveApiKey = async () => {
    if (!apiKey.trim()) { showToast('API key needed', 'Enter your Adsterra API key first.', 'error'); return; }
    setIsSavingKey(true);
    try {
      await apiSetAdsterraApiKey(apiKey.trim());
      apiGetAdsterraApiKeyStatus().then((r) => setMaskedKey(r?.masked || '')).catch(() => {});
      setApiKey('');
      showToast('Saved', 'Adsterra API key saved successfully.', 'success');
    } catch (e: any) {
      showToast('Save failed', e?.message || 'Failed to save API key.', 'error');
    } finally {
      setIsSavingKey(false);
    }
  };

  const handleBulkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lines = bulkText.split('\n').map(l => l.trim()).filter(l => l.length > 5);
    if (lines.length > 0) {
      onBulkAdd(lines);
      setBulkText('');
      setShowBulkModal(false);
    }
  };

  const handleJsonSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jsonUrl.trim()) return;
    try {
      const result = await apiImportSmartlinksFromJson(jsonUrl.trim());
      showToast('Import complete', `${result.added} added, ${result.dup} duplicate.`, 'success');
      setJsonUrl('');
      setShowJsonModal(false);
      window.location.reload();
    } catch (e: any) {
      showToast('Import failed', e?.message || 'JSON feed import failed.', 'error');
    }
  };

  const totalRevenue = smartlinks.reduce((acc, s) => acc + s.revenue, 0);
  const totalVisits = smartlinks.reduce((acc, s) => acc + s.stats.visits, 0);

  return (
    <div className="space-y-6">
      {/* Top Bar with API sync and Quick Stats */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Adsterra SmartLink Engine
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800 font-mono">
              {smartlinks.length} Active Direct Placements
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Optimized for maximum CPM with pixel-fire detection, dwell isolation (60-180s), and strict referral safety.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleSyncAdsterra}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors cursor-pointer shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing Adsterra...' : 'Fetch via API'}</span>
          </button>

          {smartlinks.length > 0 && (
            <button
              onClick={() => setStartModal({ open: true, id: 'all', label: `All ${smartlinks.length} SmartLinks` })}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-gradient-to-br from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white transition-all cursor-pointer shadow-xs"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Start All</span>
            </button>
          )}

          <button
            onClick={() => setShowBulkModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Bulk Paste</span>
          </button>

          <button
            onClick={() => setShowJsonModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Import JSON</span>
          </button>

          {onDeleteAllSmartLinks && smartlinks.length > 0 && (
            <button
              onClick={() => {
                void askConfirm(`Remove all ${smartlinks.length} SmartLinks? This cannot be undone.`, { confirmLabel: 'Yes, Remove All' }).then((ok) => {
                  if (ok) onDeleteAllSmartLinks();
                });
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/60 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove All</span>
            </button>
          )}
        </div>
      </div>

      {/* Safety Policy Callout */}
      <InfoCallout
        title="Adsterra Account Protection Protocol Active"
        message="65+ real Adsterra domains are whitelisted, and every SmartLink you add is auto-trusted at runtime — so impressions are detected even when Adsterra serves them from a rotating domain. The browser context immediately terminates upon conversion postback pixel fire to protect your domain trust score and avoid bot detection."
      />

      {/* API Key Config Card & Total Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs md:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              Adsterra Publisher API Token
            </span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
              <ShieldCheck className="w-3 h-3" /> Encrypted Vault Storage
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="password"
              placeholder={maskedKey || 'Paste Adsterra API token'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="flex-1 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
            <button
              onClick={handleSaveApiKey}
              disabled={isSavingKey}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer"
            >
              {isSavingKey ? 'Saving...' : 'Save Key'}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-slate-400">
            Use <span className="font-semibold text-slate-500 dark:text-slate-300">your own</span> Adsterra publisher API key — impressions, revenue and the dashboard stats below are pulled from your personal Adsterra account.
          </p>
        </div>

        <div className="p-4 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <span>Total SmartLink Earnings</span>
            {adsterra?.ok && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
            )}
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
            ${(adsterra?.revenue ?? totalRevenue).toFixed(2)}
          </div>
          <div className="text-[11px] text-slate-400">
            <span>{lifetimeImpressions.toLocaleString()} impressions delivered</span>
            {adsterra?.ok && (
              <span className="block text-[10px] text-slate-400/80">
                Your Adsterra account · {(adsterra?.impressions ?? 0).toLocaleString()} (7d)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs: Links List vs Adsterra Publisher Report */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('links')}
          className={`px-4 py-2.5 text-xs font-semibold cursor-pointer border-b-2 transition-colors ${
            activeTab === 'links'
              ? 'border-teal-500 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          SmartLinks ({smartlinks.length})
        </button>
        <button
          onClick={() => setActiveTab('analytics')}
          className={`px-4 py-2.5 text-xs font-semibold cursor-pointer border-b-2 transition-colors ${
            activeTab === 'analytics'
              ? 'border-teal-500 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Analytics
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold cursor-pointer border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-teal-500 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          Impression History
        </button>
        <button
          onClick={() => setActiveTab('report')}
          className={`px-4 py-2.5 text-xs font-semibold cursor-pointer border-b-2 transition-colors ${
            activeTab === 'report'
              ? 'border-teal-500 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          Adsterra Publisher Earnings Report
        </button>
      </div>

      {/* Tab 1: SmartLinks Table */}
      {activeTab === 'links' && (
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="pn-sticky-actions w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Placement / Name</th>
                  <th className="py-3 px-4">Direct Monetizer URL</th>
                  <th className="py-3 px-4">CPM</th>
                  <th className="py-3 px-4">Visits (OK / Fail)</th>
                  <th className="py-3 px-4">Revenue</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {smartlinks.map((link) => (
                  <tr key={link.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        {link.name}
                      </div>
                      <div className="font-mono text-[10px] text-teal-600 dark:text-teal-400">
                        {link.adsterraId || 'Custom Placement'}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[11px] text-slate-600 dark:text-slate-400 hover:text-teal-600 flex items-center gap-1 max-w-[200px] truncate"
                      >
                        <span className="truncate">{link.url}</span>
                        <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                      </a>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                      ${link.cpm.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums">
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{link.stats.ok.toLocaleString()}</span>
                      <span className="text-slate-400"> / {link.stats.failed}</span>
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      ${link.revenue.toFixed(2)}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase tracking-wider ${
                          link.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                        }`}
                      >
                        {link.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            if (link.status === 'active') {
                              onToggleStatus(link.id);
                            } else {
                              setStartModal({ open: true, id: link.id, label: link.name || link.url });
                            }
                          }}
                          className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 cursor-pointer"
                          title={link.status === 'active' ? 'Pause' : 'Start with visit limit'}
                        >
                          {link.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => {
                            void askConfirm(`Remove SmartLink "${link.name}"?`, { confirmLabel: 'Yes, Remove' }).then((ok) => {
                              if (ok) onDeleteSmartLink(link.id);
                            });
                          }}
                          className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-500 cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                <tr className="font-semibold">
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-200" colSpan={3}>
                    Total · lifetime delivered
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {lifetimeImpressions.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    ${(adsterra?.revenue ?? totalRevenue).toFixed(2)}
                  </td>
                  <td className="py-3 px-4" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: SmartLink analytics dashboard (7-day chart) */}
      {activeTab === 'analytics' && <SmartLinkAnalyticsPanel smartlinks={smartlinks} />}

      {/* Tab: Impression History — SmartLink deliveries only, newest first */}
      {activeTab === 'history' && (
        <ImpressionHistoryPanel impressions={impressions} linkType="smartlink" />
      )}

      {/* Tab 3: Adsterra Embedded Publisher Report */}
      {activeTab === 'report' && (
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Your Live Publisher API Sync {adsterra?.ok ? `(Past ${adsterra.windowDays || 7} Days)` : '(Past 3 Days)'}
            </span>
            <span className="text-[11px] text-teal-600 dark:text-teal-400 font-mono">
              {adsterra?.updatedAt ? `Updated ${new Date(adsterra.updatedAt).toLocaleString()}` : 'Auto-refreshed every 60 mins'}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Placement ID</th>
                  <th className="py-3 px-4">Impressions</th>
                  <th className="py-3 px-4">Average CPM</th>
                  <th className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">Revenue (USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {(adsterraRows.length ? adsterraRows : publisherReports).map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 font-mono">
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{row.date}</td>
                    <td className="py-3 px-4 font-semibold text-teal-600 dark:text-teal-400">{row.placementId}</td>
                    <td className="py-3 px-4 tabular-nums text-slate-800 dark:text-slate-200">{row.impressions.toLocaleString()}</td>
                    <td className="py-3 px-4 tabular-nums text-slate-800 dark:text-slate-200">{row.cpm}</td>
                    <td className="py-3 px-4 tabular-nums font-bold text-emerald-600 dark:text-emerald-400">{row.revenue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Bulk Add Modal */}
      {showBulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto overscroll-contain">
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Bulk Add SmartLinks
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Paste your SmartLink URLs below, one per line. They will be added to your active rotation.
            </p>
            <form onSubmit={handleBulkSubmit} className="space-y-4">
              <textarea
                rows={5}
                required
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder="https://whomeeno.com/4/8912401&#10;https://whomeeno.com/4/8912402&#10;https://recallscarce.com/stream/ad1"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer"
                >
                  Add Links
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import JSON Modal */}
      {showJsonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto overscroll-contain">
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-md w-full p-6 space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Import from Public JSON URL
            </h3>
            <form onSubmit={handleJsonSubmit} className="space-y-4">
              <input
                type="url"
                required
                value={jsonUrl}
                onChange={(e) => setJsonUrl(e.target.value)}
                placeholder="https://my-feed.com/links.json"
                className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowJsonModal(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer"
                >
                  Fetch & Ingest Feed
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Start-with-limit modal (A3/D1) */}
      <StartLimitModal
        open={startModal.open}
        type="smartlink"
        scopeLabel={startModal.label}
        balance={balance}
        onClose={() => setStartModal((s) => ({ ...s, open: false }))}
        onConfirm={async (amount) => {
          await onStartWithLimit?.(startModal.id, amount);
          setStartModal((s) => ({ ...s, open: false }));
        }}
      />
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import {
  Send,
  Bell,
  AlertTriangle,
  Users,
  Eye,
  CheckCircle,
  ShieldAlert,
  Loader2,
  Trash2
} from 'lucide-react';
import { askConfirm } from '../../lib/dialog';
import { apiFetchBroadcasts, apiAdminDeleteBroadcast, apiGetDeveloperLink, apiAdminSetDeveloperLink, DeveloperLinkConfig } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { RegistrationSwitch } from '../../components/admin/RegistrationSwitch';
import { InfoCallout } from '../../components/rayobyte/InfoCallout';

interface AdminBroadcastViewProps {
  userCount: number;
  onSendBroadcast: (title: string, message: string, targetTier: string) => void | Promise<void>;
  onToggleMaintenance: (enabled: boolean, message: string, eta?: string) => boolean | void | Promise<boolean | void>;
  isMaintenance: boolean;
  maintenanceMessage?: string;
  maintenanceEta?: string;
}

export const AdminBroadcastView: React.FC<AdminBroadcastViewProps> = ({
  userCount,
  onSendBroadcast,
  onToggleMaintenance,
  isMaintenance,
  maintenanceMessage,
  maintenanceEta
}) => {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetGroup, setTargetGroup] = useState('all');
  const DEFAULT_MAINT_MSG = 'We are upgrading to make everything faster and better. Please check back soon!';
  const [maintenanceMsg, setMaintenanceMsg] = useState(maintenanceMessage || DEFAULT_MAINT_MSG);
  const [maintenanceEtaText, setMaintenanceEtaText] = useState(maintenanceEta || '');
  const [maintenanceActive, setMaintenanceActive] = useState(isMaintenance);
  const [sending, setSending] = useState(false);
  const [toggling, setToggling] = useState(false);
  const { showToast } = useToast();
  const [sent, setSent] = useState<{ id: string; title: string; message: string; sentAt: string }[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadSent = async () => {
    try { const l = await apiFetchBroadcasts(); if (Array.isArray(l)) setSent(l); } catch { /* keep list */ }
  };
  useEffect(() => { loadSent(); }, []);

  // Developer button (shown next to Support Desk) — fully admin-controlled
  const [dev, setDev] = useState<DeveloperLinkConfig>({ enabled: true, title: 'Developer', url: 'https://alif-portfolio.pages.dev/', visibility: 'everyone' });
  const [savingDev, setSavingDev] = useState(false);
  useEffect(() => { apiGetDeveloperLink().then((c) => setDev({ enabled: c.enabled, title: c.title, url: c.url, visibility: c.visibility })).catch(() => {}); }, []);
  const handleSaveDev = async () => {
    setSavingDev(true);
    try {
      const saved = await apiAdminSetDeveloperLink(dev);
      setDev(saved);
      showToast('Saved', 'Developer button updated.', 'success');
    } catch (e: any) {
      showToast('Save failed', e?.message || 'Could not save the Developer button.', 'error');
    } finally {
      setSavingDev(false);
    }
  };

  const handleDeleteBroadcast = async (id: string) => {
    const ok = await askConfirm('Delete this broadcast?', { title: 'Delete Broadcast', confirmLabel: 'Delete', cancelLabel: 'Cancel', danger: true });
    if (!ok) return;
    setDeletingId(id);
    try {
      await apiAdminDeleteBroadcast(id);
      setSent((prev) => prev.filter((b) => b.id !== id));
      showToast('Broadcast deleted', 'The broadcast was removed.', 'success');
    } catch (e: any) {
      showToast('Delete failed', e?.message || 'Could not delete the broadcast.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  // Keep the form in sync with the real server state (it used to always start as "Offline").
  useEffect(() => { setMaintenanceActive(isMaintenance); }, [isMaintenance]);
  useEffect(() => { if (maintenanceMessage) setMaintenanceMsg(maintenanceMessage); }, [maintenanceMessage]);
  useEffect(() => { setMaintenanceEtaText(maintenanceEta || ''); }, [maintenanceEta]);

  const handleBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim() || sending) return;
    setSending(true);
    try {
      await onSendBroadcast(title.trim(), message.trim(), targetGroup);
      setTimeout(loadSent, 600);
      setTitle('');
      setMessage('');
    } finally {
      setSending(false);
    }
  };

  const handleMaintenanceToggle = async () => {
    if (toggling) return;
    const nextState = !maintenanceActive;
    const ok = await askConfirm(
      nextState
        ? 'All visitors and signed-in users will be locked out and see the "We are upgrading" page. Admins keep full access. Turn maintenance ON?'
        : 'The website will open to everyone again. Turn maintenance OFF?',
      {
        title: nextState ? '🚧 Enable Maintenance Mode?' : '✅ Disable Maintenance Mode?',
        confirmLabel: nextState ? 'Yes, enable' : 'Yes, disable',
        danger: nextState,
      }
    );
    if (!ok) return;
    setToggling(true);
    try {
      const result = await onToggleMaintenance(nextState, maintenanceMsg.trim() || DEFAULT_MAINT_MSG, maintenanceEtaText.trim());
      if (result !== false) setMaintenanceActive(nextState);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2">
          <Send className="w-5 h-5 text-teal-600 dark:text-teal-400" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Platform Broadcasts & Maintenance Switchboard
          </h1>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Deliver real-time announcements, maintenance notices, and promo alerts to user dashboards.
        </p>
      </div>

      <RegistrationSwitch />

      {/* 2-Column: Broadcast Composer & Maintenance Mode */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Broadcast Form */}
        <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Bell className="w-4 h-4 text-teal-600" />
              Compose User Broadcast
            </h3>
            <span className="text-[11px] font-mono text-slate-400">
              Recipients: {userCount} Users
            </span>
          </div>

          <form onSubmit={handleBroadcast} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Announcement Subject
              </label>
              <input
                type="text"
                required
                placeholder="e.g. New US CPM Booster Pool Added (140ms Latency)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Target Audience Group
              </label>
              <select
                value={targetGroup}
                onChange={(e) => setTargetGroup(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                <option value="all">All Registered Users ({userCount})</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Broadcast Body (Markdown Supported)
              </label>
              <textarea
                rows={4}
                required
                placeholder="Write message content here..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <button
              type="submit"
              disabled={sending}
              className="w-full py-2.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer shadow-xs transition-colors disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2"
            >
              {sending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {sending ? 'Sending…' : 'Dispatch Broadcast Now'}
            </button>
          </form>
        </div>

        {/* Maintenance Mode Controller */}
        <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                Maintenance Mode Governance
              </h3>
              <span
                className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${
                  maintenanceActive
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-300'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                }`}
              >
                {maintenanceActive ? 'ON · Users blocked' : 'OFF · Site live'}
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
              When ON, every visitor and user is blocked and sees an animated "We&apos;re upgrading" page. Admins stay signed in with full access. 🚧
            </p>

            <div className="mt-4 space-y-2">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Custom Public Maintenance Notice
              </label>
              <textarea
                rows={3}
                value={maintenanceMsg}
                onChange={(e) => setMaintenanceMsg(e.target.value)}
                maxLength={500}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 pt-1">
                Expected back (optional)
              </label>
              <input
                type="text"
                value={maintenanceEtaText}
                onChange={(e) => setMaintenanceEtaText(e.target.value)}
                maxLength={120}
                placeholder="e.g. Tonight 10:00 PM, or In about 2 hours"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={handleMaintenanceToggle}
              disabled={toggling}
              className={`w-full py-2.5 text-xs font-semibold rounded-lg text-white cursor-pointer shadow-xs transition-colors disabled:opacity-60 disabled:cursor-wait flex items-center justify-center gap-2 ${
                maintenanceActive
                  ? 'bg-emerald-600 hover:bg-emerald-700'
                  : 'bg-rose-600 hover:bg-rose-700'
              }`}
            >
              {toggling && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {toggling ? 'Applying…' : maintenanceActive ? '✅ Disable Maintenance Mode' : '🚧 Enable Maintenance Mode'}
            </button>
          </div>
        </div>
      </div>

      {/* Developer button control */}
      <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Developer Button</h3>
          <button
            type="button"
            onClick={() => setDev((d) => ({ ...d, enabled: !d.enabled }))}
            className={`px-3 py-1 text-[11px] font-bold rounded-full cursor-pointer ${dev.enabled ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}
          >
            {dev.enabled ? 'ON' : 'OFF'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-[11px] text-slate-500 space-y-1 block">
            Button title
            <input value={dev.title} maxLength={40} onChange={(e) => setDev({ ...dev, title: e.target.value })}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500" />
          </label>
          <label className="text-[11px] text-slate-500 space-y-1 block">
            Visible to
            <select value={dev.visibility} onChange={(e) => setDev({ ...dev, visibility: e.target.value as DeveloperLinkConfig['visibility'] })}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500">
              <option value="everyone">Everyone</option>
              <option value="users">Users only</option>
              <option value="admins">Admins only</option>
            </select>
          </label>
        </div>
        <label className="text-[11px] text-slate-500 space-y-1 block">
          Destination URL (https only)
          <input value={dev.url} onChange={(e) => setDev({ ...dev, url: e.target.value })}
            className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500" />
        </label>
        <button type="button" onClick={handleSaveDev} disabled={savingDev}
          className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 disabled:opacity-60 cursor-pointer inline-flex items-center gap-2">
          {savingDev && <Loader2 className="w-3 h-3 animate-spin" />}
          {savingDev ? 'Saving…' : 'Save Developer Button'}
        </button>
      </div>

      {/* Sent broadcasts with delete */}
      <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Bell className="w-4 h-4 text-teal-500" /> Sent Broadcasts
        </h3>
        {sent.length === 0 ? (
          <p className="text-xs text-slate-500">No broadcasts sent yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {sent.map((b) => (
              <li key={b.id} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{b.title}</div>
                  <div className="text-[11px] text-slate-500 line-clamp-2 break-words">{b.message}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{new Date(b.sentAt).toLocaleString()}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteBroadcast(b.id)}
                  disabled={deletingId === b.id}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-rose-200 dark:border-rose-900/50 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer disabled:opacity-60"
                >
                  {deletingId === b.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Inbox, Loader2, RefreshCw, ShieldBan, ShieldCheck, XCircle } from 'lucide-react';
import { apiAdminAppeals, apiAdminDecideAppeal, BanAppeal } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { askConfirm } from '../../lib/dialog';

type Filter = 'pending' | 'approved' | 'rejected' | 'all';

const when = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const AdminAppealsView: React.FC = () => {
  const { showToast } = useToast();
  const [items, setItems] = useState<BanAppeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('pending');
  const [replyFor, setReplyFor] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { setItems(await apiAdminAppeals()); }
    catch (e: any) { if (!silent) showToast('Could not load requests', e?.message || 'Server error', 'error'); }
    finally { if (!silent) setLoading(false); }
  }, [showToast]);

  useEffect(() => {
    void load();
    const t = setInterval(() => { void load(true); }, 15000);
    return () => clearInterval(t);
  }, [load]);

  const counts = useMemo(() => ({
    pending: items.filter((a) => a.status === 'pending').length,
    approved: items.filter((a) => a.status === 'approved').length,
    rejected: items.filter((a) => a.status === 'rejected').length,
  }), [items]);
  const shown = items.filter((a) => filter === 'all' || a.status === filter);

  const decide = async (a: BanAppeal, decision: 'approve' | 'reject') => {
    if (busyId) return;
    const ok = await askConfirm(
      decision === 'approve' ? `Unban ${a.userName || a.email} and restore their account?` : `Decline the request from ${a.userName || a.email}? They stay banned.`,
      { title: decision === 'approve' ? 'Approve & unban?' : 'Decline request?', confirmLabel: decision === 'approve' ? 'Yes, unban' : 'Yes, decline', danger: decision === 'reject' }
    );
    if (!ok) return;
    setBusyId(a.id);
    try {
      await apiAdminDecideAppeal(a.id, decision, (replyFor[a.id] || '').trim());
      showToast(decision === 'approve' ? 'User unbanned' : 'Request declined', decision === 'approve' ? `${a.email} can sign in again.` : 'The user will see your reply.', decision === 'approve' ? 'success' : 'info');
      await load(true);
    } catch (e: any) {
      showToast('Action failed', e?.message || 'Server error', 'error');
    } finally { setBusyId(null); }
  };

  const tabs: { id: Filter; label: string; n?: number }[] = [
    { id: 'pending', label: 'Waiting', n: counts.pending },
    { id: 'approved', label: 'Approved', n: counts.approved },
    { id: 'rejected', label: 'Declined', n: counts.rejected },
    { id: 'all', label: 'All', n: items.length },
  ];

  return (
    <div className="space-y-6">
      <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <ShieldBan className="w-5 h-5 text-rose-500 shrink-0" />
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Ban Appeals</h1>
              {counts.pending > 0 && (
                <span className="relative inline-flex">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-60 animate-ping" />
                  <span className="relative px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold">{counts.pending} new</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Requests sent by banned users from their sign-in screen. Approve to unban, or decline with a reply.</p>
          </div>
          <button type="button" onClick={() => load()} aria-label="Refresh" className="shrink-0 p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-teal-600 cursor-pointer">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setFilter(t.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${filter === t.id ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}`}>
              {t.label} <span className="opacity-70">({t.n})</span>
            </button>
          ))}
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-400" /></div>
      ) : shown.length === 0 ? (
        <div className="py-16 text-center text-slate-400 space-y-2">
          <Inbox className="w-10 h-10 mx-auto opacity-60" />
          <p className="text-sm">{filter === 'pending' ? 'No requests waiting 🎉' : 'Nothing here yet.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {shown.map((a) => (
            <div key={a.id} className="p-5 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3 animate-fade-up">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm text-slate-900 dark:text-slate-100 break-words">{a.userName || 'Unknown user'}</p>
                  <p className="font-mono text-[11px] text-slate-400 break-all">{a.email}</p>
                </div>
                <span className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                  a.status === 'pending' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                  : a.status === 'approved' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300'}`}>
                  {a.status === 'pending' ? <Clock className="w-3 h-3" /> : a.status === 'approved' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {a.status === 'pending' ? 'Waiting' : a.status}
                </span>
              </div>
              <div className="text-[11px] text-slate-400">Sent {when(a.createdAt)}{a.banReason ? <> · Ban reason: <span className="text-rose-500">{a.banReason}</span></> : null}</div>
              <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words p-3 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-100 dark:border-slate-800">{a.message}</p>

              {a.status === 'pending' ? (
                <div className="space-y-2">
                  <input type="text" maxLength={500} placeholder="Reply to the user (optional)" value={replyFor[a.id] || ''}
                    onChange={(e) => setReplyFor((r) => ({ ...r, [a.id]: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500" />
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={busyId === a.id} onClick={() => decide(a, 'approve')}
                      className="py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60">
                      {busyId === a.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />} Approve & Unban
                    </button>
                    <button type="button" disabled={busyId === a.id} onClick={() => decide(a, 'reject')}
                      className="py-2 text-xs font-semibold rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60">
                      <XCircle className="w-3.5 h-3.5" /> Decline
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500">
                  {a.status === 'approved' ? 'Approved' : 'Declined'} by <strong>{a.decidedBy || 'Admin'}</strong>{a.decidedAt ? ` · ${when(a.decidedAt)}` : ''}{a.reply ? ` — "${a.reply}"` : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

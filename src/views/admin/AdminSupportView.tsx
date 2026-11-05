import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LifeBuoy, Loader2, RefreshCw, Send, ArrowLeft } from 'lucide-react';
import { apiAdminFetchTickets, apiAdminReplyTicket, apiAdminSetTicketStatus } from '../../services/api';
import { useToast } from '../../components/ui/Toast';

const STATUSES = ['open', 'in_progress', 'pending', 'resolved', 'closed'] as const;
const TONE: Record<string, string> = {
  open: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  in_progress: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  pending: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  resolved: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  closed: 'bg-slate-200 dark:bg-slate-800 text-slate-500',
};
const label = (s: string) => s.replace('_', ' ');

export const AdminSupportView: React.FC = () => {
  const { showToast } = useToast();
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setTickets(await apiAdminFetchTickets()); }
    catch (e: any) { setError(e?.message || 'Could not load tickets.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => tickets.filter((t) => filter === 'all' || t.status === filter), [tickets, filter]);
  const current = tickets.find((t) => t.id === openId) || null;
  const patch = (t: any) => setTickets((prev) => prev.map((x) => (x.id === t.id ? t : x)));

  const send = async () => {
    if (!current || !reply.trim() || busy) return;
    setBusy(true);
    try { patch(await apiAdminReplyTicket(current.userId, current.id, reply.trim())); setReply(''); showToast('Reply sent', 'The user was notified.', 'success'); }
    catch (e: any) { showToast('Reply failed', e?.message || 'Could not send reply.', 'error'); }
    finally { setBusy(false); }
  };
  const setStatus = async (status: string) => {
    if (!current || busy) return;
    setBusy(true);
    try { patch(await apiAdminSetTicketStatus(current.userId, current.id, status)); }
    catch (e: any) { showToast('Update failed', e?.message || 'Could not change status.', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 p-4 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"><LifeBuoy className="w-4 h-4 text-teal-500" /> Support Desk</h2>
        <button onClick={load} disabled={loading} className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer inline-flex items-center gap-1.5">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <div className="p-3 text-xs rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-between">{error}<button onClick={load} className="underline cursor-pointer">Retry</button></div>}

      {!current ? (
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {['all', ...STATUSES].map((s) => (
              <button key={s} onClick={() => setFilter(s)} className={`px-2.5 py-1 text-[11px] font-semibold rounded-full cursor-pointer capitalize ${filter === s ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>{label(s)}</button>
            ))}
          </div>
          {loading ? <div className="py-8 text-center text-xs text-slate-500"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Loading tickets…</div>
            : shown.length === 0 ? <div className="py-8 text-center text-xs text-slate-500">No tickets here.</div>
            : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {shown.map((t) => (
                  <li key={t.id}>
                    <button onClick={() => setOpenId(t.id)} className="w-full text-left py-3 flex items-start justify-between gap-3 cursor-pointer hover:bg-slate-50/60 dark:hover:bg-slate-800/40 px-1 rounded">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">{t.subject}</div>
                        <div className="text-[11px] text-slate-500 truncate">{t.userName} · {t.userEmail}</div>
                        <div className="text-[10px] text-slate-400">#{String(t.id).slice(-8)} · {new Date(t.updatedAt).toLocaleString()}</div>
                      </div>
                      <span className={`shrink-0 px-2 py-0.5 text-[10px] font-bold rounded-full uppercase ${TONE[t.status] || TONE.open}`}>{label(t.status)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
        </div>
      ) : (
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
          <button onClick={() => setOpenId(null)} className="text-xs text-slate-500 inline-flex items-center gap-1 cursor-pointer"><ArrowLeft className="w-3 h-3" /> All tickets</button>
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 break-words">{current.subject}</div>
            <div className="text-[11px] text-slate-500">{current.userName} · {current.userEmail} · #{String(current.id).slice(-8)}</div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button key={s} disabled={busy || current.status === s} onClick={() => setStatus(s)} className={`px-2.5 py-1 text-[11px] font-semibold rounded-full capitalize cursor-pointer disabled:cursor-default ${current.status === s ? TONE[s] : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:opacity-80'}`}>{label(s)}</button>
            ))}
          </div>
          <div className="space-y-2 max-h-[45vh] overflow-y-auto">
            {(current.replies || []).map((r: any) => (
              <div key={r.id} className={`p-2.5 rounded-lg text-xs break-words ${r.from === 'admin' ? 'bg-teal-500/10 ml-6' : 'bg-slate-100 dark:bg-slate-800 mr-6'}`}>
                <div className="text-[10px] font-semibold text-slate-500 mb-0.5">{r.authorName} · {new Date(r.createdAt).toLocaleString()}</div>
                <div className="whitespace-pre-wrap text-slate-800 dark:text-slate-200">{r.message}</div>
              </div>
            ))}
          </div>
          {current.status !== 'closed' && (
            <div className="flex gap-2">
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={2} maxLength={4000} placeholder="Write a reply…"
                className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500" />
              <button onClick={send} disabled={busy || !reply.trim()} className="px-3 text-xs font-semibold rounded-lg bg-teal-600 text-white disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5">
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />} Send
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import {
  CheckSquare,
  Check,
  X,
  Clock,
  ExternalLink,
  Shield,
  DollarSign,
  AlertCircle,
  FileCheck2
} from 'lucide-react';
import { BalanceRequest } from '../../types';
import { askConfirm } from '../../lib/dialog';

interface AdminApprovalsViewProps {
  requests: BalanceRequest[];
  onApprove: (id: string, note?: string) => void | Promise<void>;
  onReject: (id: string, note?: string) => void | Promise<void>;
}

export const AdminApprovalsView: React.FC<AdminApprovalsViewProps> = ({
  requests,
  onApprove,
  onReject
}) => {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [rejectModalReq, setRejectModalReq] = useState<BalanceRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('Invalid TXN or receipt not found in bank ledger');
  const [busyId, setBusyId] = useState<string | null>(null);

  const pendingList = requests.filter(r => r.status === 'pending');
  const historyList = requests.filter(r => r.status !== 'pending');

  const displayed = tab === 'pending' ? pendingList : historyList;

  const handleConfirmReject = async () => {
    if (!rejectModalReq || busyId) return;
    setBusyId(rejectModalReq.id);
    try { await onReject(rejectModalReq.id, rejectReason.trim() || 'Rejected by admin'); }
    finally { setBusyId(null); setRejectModalReq(null); }
  };

  // Approving credits real money — confirm first and block double taps.
  const handleApprove = async (req: BalanceRequest) => {
    if (busyId) return;
    const ok = await askConfirm(
      `Credit $${Number(req.amount || 0).toFixed(2)} to ${req.userName || 'this user'}?\nMethod: ${String(req.method || '').toUpperCase()}\nTXN: ${req.txnId || '—'}`,
      { title: 'Approve this deposit?', confirmLabel: 'Yes, approve', danger: false }
    );
    if (!ok) return;
    setBusyId(req.id);
    try { await onApprove(req.id, 'Verified transaction receipt'); }
    finally { setBusyId(null); }
  };

  const fmtWhen = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Deposit & Balance Approval Queue
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Review user payment proofs (bKash/Nagad/Binance/USDT), verify TXN IDs, and credit publisher wallets.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            onClick={() => setTab('pending')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              tab === 'pending'
                ? 'bg-white dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Pending Queue ({pendingList.length})
          </button>
          <button
            onClick={() => setTab('history')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              tab === 'history'
                ? 'bg-white dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            Approval History ({historyList.length})
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="pn-sticky-actions w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Submitted</th>
                <th className="py-3 px-4">Publisher / Email</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">TXN Identifier</th>
                <th className="py-3 px-4">Sender Phone</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {displayed.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                    No requests found in this queue.
                  </td>
                </tr>
              ) : (
                displayed.map((req) => (
                  <tr key={req.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {fmtWhen(req.createdAt)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{req.userName}</div>
                      <div className="font-mono text-[10px] text-slate-400">{req.userEmail}</div>
                    </td>
                    <td className="py-3 px-4 font-mono uppercase font-semibold text-teal-600 dark:text-teal-400">
                      {req.method}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                      ${Number(req.amount || 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-700 dark:text-slate-300">
                      {req.txnId}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {req.senderNumber || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase ${
                          req.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : req.status === 'rejected'
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                        }`}
                      >
                        {req.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {req.status === 'pending' ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={busyId === req.id}
                            onClick={() => handleApprove(req)}
                            className="disabled:opacity-60 disabled:cursor-wait inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-colors shadow-xs"
                          >
                            <Check className="w-3 h-3" />
                            <span>Approve</span>
                          </button>

                          <button
                            type="button"
                            disabled={busyId === req.id}
                            onClick={() => {
                              setRejectModalReq(req);
                              setRejectReason('Invalid TXN or receipt not found in bank ledger');
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300 cursor-pointer transition-colors"
                          >
                            <X className="w-3 h-3" />
                            <span>Reject</span>
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-400 italic">
                          {req.adminNote || 'Processed'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject Modal */}
      {rejectModalReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto overscroll-contain">
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex items-center gap-2.5 text-rose-600">
              <AlertCircle className="w-5 h-5" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Reject Deposit Request
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              You are rejecting request <strong className="text-slate-800 dark:text-slate-200 font-mono">#{rejectModalReq.id}</strong> for <strong className="text-slate-800 dark:text-slate-200 font-mono">${Number(rejectModalReq.amount || 0).toFixed(2)}</strong> from {rejectModalReq.userName}.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Reason for Rejection (Visible to User)
              </label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full p-2.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRejectModalReq(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-xs"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

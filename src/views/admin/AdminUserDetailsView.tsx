import React, { useState, useEffect } from 'react';
import {
  User as UserIcon,
  Shield,
  ArrowLeft,
  Wallet,
  Zap,
  Globe,
  Link as LinkIcon,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  History,
  AlertTriangle,
  RotateCcw,
  Ban,
  DollarSign
} from 'lucide-react';
import { User } from '../../types';
import { apiAdminFetchUserDetails, AdminUserDetails } from '../../services/api';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { MembershipBadge } from '../../components/ui/MembershipBadge';

interface AdminUserDetailsViewProps {
  user: User;
  onBack: () => void;
  onBanUser: (userId: string, reason: string) => void;
  onUnbanUser: (userId: string) => void;
  onAdjustBalance: (userId: string, amount: number, note: string) => void;
  onImpersonateUser: (user: User) => void;
}

export const AdminUserDetailsView: React.FC<AdminUserDetailsViewProps> = ({
  user,
  onBack,
  onBanUser,
  onUnbanUser,
  onAdjustBalance,
  onImpersonateUser
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'links' | 'smartlinks' | 'transactions' | 'deposits'>('overview');
  const [adjustAmount, setAdjustAmount] = useState('50');
  const [adjustNote, setAdjustNote] = useState('');
  const [banReason, setBanReason] = useState('Terms of service violation');

  // The web client only caches the signed-in admin's OWN links / ledger, so we pull the
  // viewed user's full snapshot from the dedicated admin endpoint. (Previously this view
  // filtered the admin's own local cache by the target id and always rendered empty.)
  const [details, setDetails] = useState<AdminUserDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoadingDetails(true);
    apiAdminFetchUserDetails(user.id)
      .then((d) => { if (alive) setDetails(d); })
      .catch(() => { if (alive) setDetails(null); })
      .finally(() => { if (alive) setLoadingDetails(false); });
    return () => { alive = false; };
  }, [user.id]);

  const allLinks = details?.normalLinks || [];
  const allSmartLinks = details?.smartlinks || [];
  const allTransactions = details?.transactions || [];
  const allRequests = details?.balanceRequests || [];
  // ⭐ FIX: show the VIEWED user's balance / credits (from the admin endpoint, falling back
  // to the admin users list), never the signed-in admin's own wallet.
  const viewedBalance = Number(details?.balance ?? (user as any).balance ?? 0);
  const viewedCredits = Number(details?.impressionBalance ?? (user as any).impressionBalance ?? 0);

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(adjustAmount);
    if (isNaN(amt)) return;
    onAdjustBalance(user.id, amt, adjustNote || 'Admin manual balance adjustment');
    setAdjustNote('');
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <UserAvatar name={user.name} src={user.avatar} size="lg" tone={user.role === 'admin' ? 'amber' : 'teal'} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {user.name}
              </h1>
              <MembershipBadge plan={user.membershipPlanId} expiresAt={user.membershipExpiresAt} size="md" adminRole={user.role === 'admin' ? (user.adminRole === 'super_admin' ? 'super_admin' : 'admin') : undefined} />
              <span
                className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  user.status === 'active'
                    ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                }`}
              >
                {user.status.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              ID: <code>{user.id}</code> · {user.email}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onImpersonateUser(user)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer shadow-xs"
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Impersonate User</span>
          </button>

          {user.status === 'active' ? (
            <button
              onClick={() => onBanUser(user.id, banReason)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer shadow-xs"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>Ban Account</span>
            </button>
          ) : (
            <button
              onClick={() => onUnbanUser(user.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-xs"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Unban Account</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-white dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-200'
          }`}
        >
          Account Overview
        </button>
        <button
          onClick={() => setActiveTab('links')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
            activeTab === 'links'
              ? 'bg-white dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-200'
          }`}
        >
          Normal Links ({allLinks.length})
        </button>
        <button
          onClick={() => setActiveTab('smartlinks')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
            activeTab === 'smartlinks'
              ? 'bg-white dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-200'
          }`}
        >
          SmartLinks ({allSmartLinks.length})
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
            activeTab === 'transactions'
              ? 'bg-white dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-200'
          }`}
        >
          Ledger History ({allTransactions.length})
        </button>
        <button
          onClick={() => setActiveTab('deposits')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
            activeTab === 'deposits'
              ? 'bg-white dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-200'
          }`}
        >
          Deposits ({allRequests.length})
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                User Details & Subscription Information
              </h3>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 text-[11px] block">Membership Plan</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize">
                    {user.membershipPlanId}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Plan Expiry Date</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {new Date(user.membershipExpiresAt).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Registration Date</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Last Known Login</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {new Date(user.lastLoginAt).toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Referral Partner Code</span>
                  <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                    {user.referralCode || user.id}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Free Impression Trial</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {user.trialClaimed ? 'Claimed (+10 credits)' : 'Available to Claim'}
                  </span>
                </div>
              </div>
            </div>

            {/* Financial Ledger adjustments */}
            <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Manual Balance Adjustment (+ / -)
              </h3>
              <form onSubmit={handleAdjustSubmit} className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-36">
                    <label className="text-[11px] text-slate-400 block mb-1">Amount (৳)</label>
                    <input
                      type="number"
                      step="1"
                      required
                      value={adjustAmount}
                      onChange={(e) => setAdjustAmount(e.target.value)}
                      placeholder="+50 or -20"
                      className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[11px] text-slate-400 block mb-1">Audit Ledger Note</label>
                    <input
                      type="text"
                      required
                      value={adjustNote}
                      onChange={(e) => setAdjustNote(e.target.value)}
                      placeholder="e.g. Promotional bonus or manual bank transfer credit"
                      className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer shadow-xs"
                >
                  Apply Balance Adjustment
                </button>
              </form>
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="space-y-4">
            <div className="p-5 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-xs text-slate-400 block">Current Balance</span>
              <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1">
                ৳{viewedBalance.toFixed(2)}
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-xs text-slate-400 block">Impression Credits Available</span>
              <div className="text-2xl font-bold font-mono text-teal-600 dark:text-teal-400 mt-1">
                {viewedCredits} credits
              </div>
            </div>

            <div className="p-5 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
              <span className="text-xs text-slate-400 block">Daily Bursts Quota</span>
              <div className="text-lg font-bold font-mono text-slate-800 dark:text-slate-200 mt-1">
                {user.dailyBurstUsed || 0} / {user.dailyBurstLimit || 100} runs
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Normal Links */}
      {activeTab === 'links' && (
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Campaign Name</th>
                <th className="py-3 px-4">Target URL</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Total Visits</th>
                <th className="py-3 px-4">Success Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono">
              {allLinks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No normal links registered for this user.
                  </td>
                </tr>
              ) : (
                allLinks.map((l) => (
                  <tr key={l.id}>
                    <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">{l.name}</td>
                    <td className="py-3 px-4 text-slate-400 truncate max-w-xs">{l.url}</td>
                    <td className="py-3 px-4 uppercase font-semibold text-emerald-600 dark:text-emerald-400">{l.status}</td>
                    <td className="py-3 px-4 tabular-nums">{l.stats.visits}</td>
                    <td className="py-3 px-4 tabular-nums text-emerald-600 dark:text-emerald-400 font-bold">
                      {l.stats.visits > 0 ? ((l.stats.ok / l.stats.visits) * 100).toFixed(1) : '100'}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table></div>
        </div>
      )}

      {/* Tab 3: SmartLinks */}
      {activeTab === 'smartlinks' && (
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">SmartLink Placement</th>
                <th className="py-3 px-4">Adsterra ID</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Estimated CPM</th>
                <th className="py-3 px-4">Publisher Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono">
              {allSmartLinks.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No smartlinks active for this user.
                  </td>
                </tr>
              ) : (
                allSmartLinks.map((s) => (
                  <tr key={s.id}>
                    <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">{s.name}</td>
                    <td className="py-3 px-4 text-amber-600 dark:text-amber-400">{s.adsterraId || 'ADST-KEY'}</td>
                    <td className="py-3 px-4 uppercase font-semibold text-emerald-600 dark:text-emerald-400">{s.status}</td>
                    <td className="py-3 px-4 tabular-nums">${s.cpm.toFixed(2)}</td>
                    <td className="py-3 px-4 tabular-nums text-emerald-600 dark:text-emerald-400 font-bold">${s.revenue.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table></div>
        </div>
      )}

      {/* Tab 4: Transactions */}
      {activeTab === 'transactions' && (
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Transaction Type</th>
                <th className="py-3 px-4">Description</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Balance After</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono">
              {allTransactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No ledger transactions recorded yet.
                  </td>
                </tr>
              ) : (
                allTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(tx.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 uppercase font-semibold text-amber-600 dark:text-amber-400">{tx.type}</td>
                    <td className="py-3 px-4 text-slate-700 dark:text-slate-300">{tx.description}</td>
                    <td className={`py-3 px-4 font-bold ${tx.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {tx.amount >= 0 ? '+' : ''}৳{tx.amount.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-slate-800 dark:text-slate-200">৳{tx.balanceAfter.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table></div>
        </div>
      )}

      {/* Tab 5: Deposit Requests */}
      {activeTab === 'deposits' && (
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Method</th>
                <th className="py-3 px-4">TXN / Reference</th>
                <th className="py-3 px-4">Amount</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono">
              {allRequests.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    No deposit requests submitted by this user.
                  </td>
                </tr>
              ) : (
                allRequests.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 uppercase font-semibold text-slate-700 dark:text-slate-300">{r.method || '—'}</td>
                    <td className="py-3 px-4 text-slate-500 truncate max-w-[160px]">{r.txnId || r.reference || '—'}</td>
                    <td className="py-3 px-4 font-bold text-emerald-600 dark:text-emerald-400">৳{Number(r.amount || 0).toFixed(2)}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        r.status === 'approved'
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                          : r.status === 'rejected'
                            ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                            : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                      }`}>{r.status || 'pending'}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
};

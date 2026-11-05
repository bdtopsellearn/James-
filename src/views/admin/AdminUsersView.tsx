import React, { useState } from 'react';
import {
  Users,
  Search,
  Shield,
  Ban,
  CheckCircle,
  Edit,
  DollarSign,
  Zap,
  Trash2,
  ExternalLink,
  X,
  UserCheck,
  UserPlus,
  Loader2,
  Plus
} from 'lucide-react';
import { User, Wallet, Credits } from '../../types';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { MembershipBadge } from '../../components/ui/MembershipBadge';
import { AdminUserDetailsView } from './AdminUserDetailsView';
import { askConfirm } from '../../lib/dialog';
import { apiAdminForceLogout } from '../../services/api';
import type { AdminCreateUserParams } from '../../services/api';
import { useToast } from '../../components/ui/Toast';

interface AdminUsersViewProps {
  users: User[];
  currentUserId: string;
  onBanUser: (userId: string, reason: string) => void;
  onUnbanUser: (userId: string) => void;
  onAdjustBalance: (userId: string, amount: number, note: string) => void | Promise<void>;
  onImpersonateUser: (user: User) => void;
  onCreateUser?: (params: AdminCreateUserParams) => Promise<unknown>;
  onDeleteUser?: (userId: string) => Promise<void>;
}

export const AdminUsersView: React.FC<AdminUsersViewProps> = ({
  users,
  currentUserId,
  onBanUser,
  onUnbanUser,
  onAdjustBalance,
  onImpersonateUser,
  onCreateUser,
  onDeleteUser
}) => {
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('25');
  const [adjustNote, setAdjustNote] = useState('');
  const [banReason, setBanReason] = useState('Terms of service violation');

  const filtered = users.filter(u =>
    (u.name || '').toLowerCase().includes(search.trim().toLowerCase()) ||
    (u.email || '').toLowerCase().includes(search.trim().toLowerCase()) ||
    (u.telegram || '').toLowerCase().includes(search.trim().toLowerCase().replace(/^@/, '')) ||
    (u.phone || '').includes(search.trim()) ||
    (u.id || '').toLowerCase().includes(search.trim().toLowerCase())
  );

  const planLabel = (u: User) => String(u.membershipPlanId || 'free').replace('plan_', '').toUpperCase();
  const regDate = (u: User) => (u.createdAt && !isNaN(new Date(u.createdAt).getTime()) ? new Date(u.createdAt).toLocaleDateString() : '—');
  // Never let an admin ban themselves or another admin from this screen.
  const canBan = selectedUser ? selectedUser.role !== 'admin' && selectedUser.id !== currentUserId : false;

  const { showToast: toast } = useToast();
  const [adjusting, setAdjusting] = useState(false);
  // Full-page profile inspector (revived dead code: AdminUserDetailsView).
  const [fullViewUser, setFullViewUser] = useState<User | null>(null);

  // Add / delete user (admin)
  const [showAddUser, setShowAddUser] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    name: '',
    telegram: '',
    membershipPlanId: 'free',
    walletBalance: '',
    impressionCredits: '',
  });

  const submitNewUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateUser || creating) return;
    const email = newUser.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Invalid email', 'Enter a valid email address.', 'error'); return; }
    if (newUser.password.length < 8) { toast('Weak password', 'Password must be at least 8 characters.', 'error'); return; }
    setCreating(true);
    try {
      await onCreateUser({
        email,
        password: newUser.password,
        name: newUser.name.trim() || undefined,
        telegram: newUser.telegram.trim() || undefined,
        membershipPlanId: newUser.membershipPlanId || 'free',
        walletBalance: newUser.walletBalance.trim() ? Number(newUser.walletBalance) : undefined,
        impressionCredits: newUser.impressionCredits.trim() ? Number(newUser.impressionCredits) : undefined,
      });
      setShowAddUser(false);
      setNewUser({ email: '', password: '', name: '', telegram: '', membershipPlanId: 'free', walletBalance: '', impressionCredits: '' });
    } catch (_) {
      /* toast already shown by the parent handler */
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (u: User) => {
    if (!onDeleteUser || deletingId) return;
    if (u.id === currentUserId) { toast('Not allowed', 'You cannot delete your own account.', 'error'); return; }
    const ok = await askConfirm(
      `Permanently delete ${u.name} (${u.email})? This removes the account and ALL of its data. This cannot be undone.`,
      { title: 'Delete this user?', confirmLabel: 'Yes, delete', danger: true }
    );
    if (!ok) return;
    setDeletingId(u.id);
    try {
      await onDeleteUser(u.id);
      if (selectedUser?.id === u.id) setSelectedUser(null);
      if (fullViewUser?.id === u.id) setFullViewUser(null);
    } catch (_) {
      /* toast already shown by the parent handler */
    } finally {
      setDeletingId(null);
    }
  };

  // Add OR remove money — the number is always positive, the button decides the direction.
  const applyAdjust = async (direction: 1 | -1) => {
    if (!selectedUser || adjusting) return;
    const raw = Math.abs(parseFloat(adjustAmount));
    if (!isFinite(raw) || raw <= 0) { toast('Enter an amount', 'Type a number greater than 0.', 'error'); return; }
    const balance = Number((selectedUser as any).balance || 0);
    if (direction === -1 && raw > balance + 0.00001) {
      toast('Not enough balance', `${selectedUser.name} only has ৳${balance.toFixed(2)}.`, 'error');
      return;
    }
    const ok = await askConfirm(
      `${direction === 1 ? 'Add' : 'Remove'} ৳${raw.toFixed(2)} ${direction === 1 ? 'to' : 'from'} ${selectedUser.name}'s wallet?`,
      { title: direction === 1 ? '➕ Add funds?' : '➖ Remove funds?', confirmLabel: direction === 1 ? 'Yes, add' : 'Yes, remove', danger: direction === -1 }
    );
    if (!ok) return;
    setAdjusting(true);
    try {
      await onAdjustBalance(selectedUser.id, direction * raw, adjustNote || (direction === 1 ? 'Manual admin credit' : 'Manual admin deduction'));
      setAdjustAmount('25');
      setAdjustNote('');
      setSelectedUser(null);
    } catch { /* the parent already showed the error toast — keep the modal open */ }
    finally { setAdjusting(false); }
  };

  const handleForceLogout = async () => {
    if (!selectedUser) return;
    const ok = await askConfirm(`Sign ${selectedUser.name} out of every device? They will have to sign in again.`, { title: 'Force sign-out?', confirmLabel: 'Yes, sign out', danger: true });
    if (!ok) return;
    try {
      await apiAdminForceLogout(selectedUser.id);
      toast('Signed out', `${selectedUser.name} was signed out of all devices.`, 'success');
    } catch (e: any) { toast('Failed', e?.message || 'Server error', 'error'); }
  };

  // Full-page profile inspector (revived dead code: AdminUserDetailsView).
  if (fullViewUser) {
    return (
      <AdminUserDetailsView
        user={fullViewUser}
        onBack={() => setFullViewUser(null)}
        onBanUser={(id, reason) => { onBanUser(id, reason); setFullViewUser(null); }}
        onUnbanUser={(id) => { onUnbanUser(id); setFullViewUser(null); }}
        onAdjustBalance={onAdjustBalance}
        onImpersonateUser={(u) => { onImpersonateUser(u); setFullViewUser(null); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            User & Publisher Directory
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Search, inspect, adjust account balances, enforce bans, or test via support impersonation.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by name, email, or user ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>
          {onCreateUser && (
            <button
              type="button"
              onClick={() => setShowAddUser(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 hover:brightness-110 text-white shadow-lg shadow-teal-500/25 active:scale-[0.98] transition-all cursor-pointer shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add User</span>
            </button>
          )}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        {filtered.length === 0 && (
          <div className="py-12 px-4 text-center text-xs text-slate-400">
            {users.length === 0 ? '👥 No users yet.' : '🔍 No users match your search.'}
          </div>
        )}

        {/* Phones: card list (the table hid the action buttons off-screen) */}
        <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800/80">
          {filtered.map((u) => (
            <div key={u.id} className="p-4 space-y-3">
              <div className="flex items-start gap-3 min-w-0">
                <UserAvatar name={u.name} src={u.avatar} size="sm" tone={u.role === 'admin' ? 'amber' : 'teal'} />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm text-slate-900 dark:text-slate-100 break-words flex items-center gap-1 flex-wrap">
                    <span className="break-words">{u.name}</span>
                    <MembershipBadge plan={u.membershipPlanId} expiresAt={u.membershipExpiresAt} size="xs" adminRole={u.role === 'admin' ? (u.adminRole === 'super_admin' ? 'super_admin' : 'admin') : undefined} />
                  </div>
                  <div className="font-mono text-slate-400 text-[11px] break-all">{u.email}</div>
                </div>
                <span
                  className={`shrink-0 px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase ${
                    u.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                      : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                  }`}
                >
                  {u.status}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-mono">
                <span className={u.role === 'admin' ? 'text-amber-500 font-bold uppercase' : 'text-slate-500 uppercase'}>{u.role}</span>
                <span className="text-teal-600 dark:text-teal-400 font-medium">{planLabel(u)}</span>
                {typeof u.balance === 'number' && <span className="text-emerald-500">৳{u.balance.toFixed(2)}</span>}
                {u.telegram && <span className="text-sky-500">@{u.telegram}</span>}
                <span className="text-slate-400">{regDate(u)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedUser(u)}
                  className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                >
                  Inspect & Edit
                </button>
                <button
                  type="button"
                  onClick={() => onImpersonateUser(u)}
                  className="px-3 py-2 text-xs font-semibold rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 hover:bg-teal-100 cursor-pointer flex items-center justify-center gap-1"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>Impersonate</span>
                </button>
                {onDeleteUser && u.id !== currentUserId && (
                  <button
                    type="button"
                    onClick={() => handleDelete(u)}
                    disabled={deletingId === u.id}
                    className="col-span-2 px-3 py-2 text-xs font-semibold rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 disabled:opacity-60 cursor-pointer flex items-center justify-center gap-1"
                  >
                    {deletingId === u.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    <span>{deletingId === u.id ? 'Deleting…' : 'Delete User'}</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="pn-sticky-actions w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Plan</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Registered</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={u.name} src={u.avatar} size="sm" tone={u.role === 'admin' ? 'amber' : 'teal'} />
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                          <span>{u.name}</span>
                          <MembershipBadge plan={u.membershipPlanId} expiresAt={u.membershipExpiresAt} size="xs" />
                        </div>
                        <div className="font-mono text-slate-400 text-[11px]">{u.email}</div>
                        {(u.telegram || typeof u.balance === 'number') && (
                          <div className="flex flex-wrap items-center gap-x-2 text-[10px] mt-0.5">
                            {u.telegram && <span className="text-sky-500 font-mono">@{u.telegram}</span>}
                            {typeof u.balance === 'number' && <span className="text-emerald-500 font-mono">৳{u.balance.toFixed(2)}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 uppercase font-mono text-[10px] font-bold">
                    <span className={u.role === 'admin' ? 'text-amber-500' : 'text-slate-500'}>
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-teal-600 dark:text-teal-400 font-medium">
                    {planLabel(u)}
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase ${
                        u.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                      }`}
                    >
                      {u.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-400">
                    {regDate(u)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => setSelectedUser(u)}
                        className="px-2.5 py-1 text-xs font-medium rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
                      >
                        Inspect & Edit
                      </button>

                      <button
                        onClick={() => onImpersonateUser(u)}
                        className="px-2 py-1 text-xs font-semibold rounded bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 hover:bg-teal-100 cursor-pointer flex items-center gap-1"
                        title="Impersonate User for Debugging"
                      >
                        <UserCheck className="w-3 h-3" />
                        <span>Impersonate</span>
                      </button>

                      {onDeleteUser && u.id !== currentUserId && (
                        <button
                          onClick={() => handleDelete(u)}
                          disabled={deletingId === u.id}
                          className="px-2 py-1 text-xs font-semibold rounded bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 disabled:opacity-60 cursor-pointer flex items-center gap-1"
                          title="Permanently delete this user"
                        >
                          {deletingId === u.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect / Adjust Drawer Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto overscroll-contain">
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-md w-full p-6 space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 min-w-0 break-words">
                User Details: {selectedUser.name}
              </h3>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => { setFullViewUser(selectedUser); setSelectedUser(null); }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer"
                  title="Open the full-page profile inspector"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Full Profile</span>
                </button>
                <button type="button" aria-label="Close" onClick={() => setSelectedUser(null)} className="p-1.5 -mr-1.5 text-slate-400 hover:text-slate-600 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-r from-teal-500/10 to-emerald-500/5 border border-teal-500/20">
              <UserAvatar name={selectedUser.name} src={selectedUser.avatar} size="lg" tone={selectedUser.role === 'admin' ? 'amber' : 'teal'} />
              <div className="min-w-0">
                <div className="font-extrabold text-slate-900 dark:text-white truncate flex items-center gap-1">
                  <span className="truncate">{selectedUser.name}</span>
                  <MembershipBadge plan={selectedUser.membershipPlanId} expiresAt={selectedUser.membershipExpiresAt} size="sm" adminRole={selectedUser.role === 'admin' ? (selectedUser.adminRole === 'super_admin' ? 'super_admin' : 'admin') : undefined} />
                </div>
                <div className="text-[11px] text-slate-500 font-mono truncate">{selectedUser.email}</div>
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full uppercase ${selectedUser.emailVerified ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'bg-amber-500/15 text-amber-600 dark:text-amber-300'}`}>
                    {selectedUser.emailVerified ? 'Email verified' : 'Not verified'}
                  </span>
                  {selectedUser.googleLinked && (
                    <span className="px-2 py-0.5 text-[9px] font-bold rounded-full uppercase bg-sky-500/15 text-sky-600 dark:text-sky-300">Google</span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Wallet Balance</div>
                <div className="text-lg font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                  ৳{(selectedUser.balance ?? 0).toFixed(2)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-teal-500/10 border border-teal-500/20">
                <div className="text-[10px] uppercase tracking-wider text-slate-500">Impression Credits</div>
                <div className="text-lg font-extrabold font-mono text-teal-600 dark:text-teal-400">
                  {(selectedUser.impressionBalance ?? 0).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Account ID:</span>
                <span className="truncate">{selectedUser.id}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">First / Last name:</span>
                <span className="truncate">{[selectedUser.firstName, selectedUser.lastName].filter(Boolean).join(' ') || '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Telegram:</span>
                <span className="truncate text-sky-500">{selectedUser.telegram ? '@' + selectedUser.telegram : '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Phone:</span>
                <span className="truncate">{selectedUser.phone || '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Country:</span>
                <span className="truncate">{selectedUser.country || '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Plan:</span>
                <span className="uppercase">{(selectedUser.membershipPlanId || '').replace('plan_', '') || '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Registered:</span>
                <span>{selectedUser.createdAt ? new Date(selectedUser.createdAt).toLocaleString() : '—'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-400">Last login:</span>
                <span>{selectedUser.lastLoginAt ? new Date(selectedUser.lastLoginAt).toLocaleString() : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Status:</span>
                <span className="uppercase font-bold">{selectedUser.status}</span>
              </div>
              {selectedUser.banReason && (
                <div className="p-2 bg-rose-50 dark:bg-rose-950/40 rounded text-rose-700 dark:text-rose-300 text-[11px]">
                  <strong>Ban Reason:</strong> {selectedUser.banReason}
                </div>
              )}
            </div>

            {/* Adjust Funds Form */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                Wallet funds (৳) — current balance <span className="font-mono text-emerald-500">৳{Number((selectedUser as any).balance || 0).toFixed(2)}</span>
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  inputMode="decimal"
                  placeholder="Amount"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value)}
                  className="w-24 sm:w-28 shrink-0 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <input
                  type="text"
                  placeholder="Audit reason / note"
                  value={adjustNote}
                  onChange={(e) => setAdjustNote(e.target.value)}
                  className="flex-1 min-w-0 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={adjusting} onClick={() => applyAdjust(1)}
                  className="py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-60 active:scale-[0.98] transition-all">
                  ➕ Add funds
                </button>
                <button type="button" disabled={adjusting} onClick={() => applyAdjust(-1)}
                  className="py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white cursor-pointer disabled:opacity-60 active:scale-[0.98] transition-all">
                  ➖ Remove funds
                </button>
              </div>
              {selectedUser.role !== 'admin' && (
                <button type="button" onClick={handleForceLogout}
                  className="w-full py-1.5 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                  🔌 Sign out of all devices
                </button>
              )}
            </div>

            {/* Ban / Unban Actions */}
            {selectedUser.status === 'active' && canBan && (
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block">Ban reason (shown to the user)</label>
                <input
                  type="text"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  maxLength={200}
                  className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
            )}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              {selectedUser.status === 'active' ? (
                canBan ? (
                <button
                  type="button"
                  onClick={async () => {
                    if (!(await askConfirm(`Ban ${selectedUser.name}? They will be signed out of access immediately.`, { title: 'Ban this user?', confirmLabel: 'Yes, ban' }))) return;
                    onBanUser(selectedUser.id, banReason.trim() || 'Terms of service violation');
                    setSelectedUser(null);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                >
                  Ban User Account
                </button>
                ) : (
                  <span className="text-[11px] text-slate-400">🛡️ Admin accounts can't be banned here.</span>
                )
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    onUnbanUser(selectedUser.id);
                    setSelectedUser(null);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                >
                  Unban User Account
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="px-4 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddUser && onCreateUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto overscroll-contain">
          <form
            onSubmit={submitNewUser}
            className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-md w-full p-6 space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-teal-500" />
                Create New User
              </h3>
              <button type="button" aria-label="Close" onClick={() => setShowAddUser(false)} className="p-1.5 -mr-1.5 text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Email <span className="text-rose-500">*</span></label>
                <input
                  type="email"
                  required
                  value={newUser.email}
                  onChange={(e) => setNewUser((s) => ({ ...s, email: e.target.value }))}
                  placeholder="user@example.com"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Password <span className="text-rose-500">*</span></label>
                <input
                  type="text"
                  required
                  value={newUser.password}
                  onChange={(e) => setNewUser((s) => ({ ...s, password: e.target.value }))}
                  placeholder="Min 8 characters"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={newUser.name}
                    onChange={(e) => setNewUser((s) => ({ ...s, name: e.target.value }))}
                    placeholder="John Doe"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Telegram</label>
                  <input
                    type="text"
                    value={newUser.telegram}
                    onChange={(e) => setNewUser((s) => ({ ...s, telegram: e.target.value }))}
                    placeholder="@username"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Membership Plan</label>
                <select
                  value={newUser.membershipPlanId}
                  onChange={(e) => setNewUser((s) => ({ ...s, membershipPlanId: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                >
                  <option value="free">Free</option>
                  <option value="monthly">1 Month</option>
                  <option value="twomonth">2 Months</option>
                  <option value="threemonth">3 Months</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Wallet Balance (৳)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={newUser.walletBalance}
                    onChange={(e) => setNewUser((s) => ({ ...s, walletBalance: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">Impression Credits</label>
                  <input
                    type="number"
                    step="1"
                    value={newUser.impressionCredits}
                    onChange={(e) => setNewUser((s) => ({ ...s, impressionCredits: e.target.value }))}
                    placeholder="0"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowAddUser(false)}
                className="px-4 py-2 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creating}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 hover:brightness-110 disabled:opacity-60 text-white shadow-lg shadow-teal-500/25 cursor-pointer"
              >
                {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>{creating ? 'Creating…' : 'Create User'}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

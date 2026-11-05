import { User, Transaction, BalanceRequest, SupportTicket } from '../types';

export type NotifTone = 'success' | 'info' | 'warning' | 'danger';

export interface AppNotification {
  id: string;
  title: string;
  desc: string;
  at: string; // ISO date
  tone: NotifTone;
  view?: string; // screen to open when tapped
}

interface Source {
  user: User;
  isAdmin: boolean;
  transactions: Transaction[];
  balanceRequests: BalanceRequest[];
  supportTickets: SupportTicket[];
  allUsers: User[];
  broadcasts: { id: string; title: string; message: string; sentAt: string }[];
  userNotifications?: { id: string; title: string; desc: string; at: string; tone?: NotifTone; view?: string }[];
}

const money = (n: number) => `$${Number(n || 0).toFixed(2)}`;
const ts = (s?: string) => {
  const t = s ? new Date(s).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
};

/** Builds the notification list from REAL app data (no placeholder items). */
export function buildNotifications(src: Source): AppNotification[] {
  const out: AppNotification[] = [];

  // Admin announcements are visible to everyone
  for (const b of src.broadcasts.slice(0, 10)) {
    out.push({
      id: `bc_${b.id}`,
      title: b.title || 'Announcement',
      desc: b.message,
      at: b.sentAt,
      tone: 'info',
      view: undefined,
    });
  }

  for (const n of (src.userNotifications || []).slice(0, 10)) {
    out.push({ id: `un_${n.id}`, title: n.title, desc: n.desc, at: n.at, tone: n.tone || 'info', view: n.view });
  }

  if (src.isAdmin) {
    const pending = src.balanceRequests.filter((r) => r.status === 'pending');
    if (pending.length) {
      const newest = pending.reduce((a, b) => (ts(a.createdAt) > ts(b.createdAt) ? a : b));
      out.push({
        id: `pending_${pending.length}_${newest.id}`,
        title: `${pending.length} deposit request${pending.length > 1 ? 's' : ''} waiting`,
        desc: `Latest: ${money(newest.amount)} from ${newest.userName} via ${newest.method}.`,
        at: newest.createdAt,
        tone: 'warning',
        view: 'admin_approvals',
      });
    }
    const open = src.supportTickets.filter((t) => t.status !== 'closed');
    if (open.length) {
      const newest = open.reduce((a, b) => (ts(a.updatedAt) > ts(b.updatedAt) ? a : b));
      out.push({
        id: `tickets_${open.length}_${newest.id}_${newest.updatedAt}`,
        title: `${open.length} open support ticket${open.length > 1 ? 's' : ''}`,
        desc: `Latest: "${newest.subject}" from ${newest.userName}.`,
        at: newest.updatedAt,
        tone: 'info',
        view: 'admin_support',
      });
    }
    const dayAgo = Date.now() - 24 * 3600 * 1000;
    const fresh = src.allUsers.filter((u) => u.role !== 'admin' && ts(u.createdAt) > dayAgo);
    if (fresh.length) {
      out.push({
        id: `newusers_${fresh.map((u) => u.id).join('')}`,
        title: `${fresh.length} new user${fresh.length > 1 ? 's' : ''} in 24h`,
        desc: fresh.slice(0, 3).map((u) => u.name).join(', ') + (fresh.length > 3 ? '…' : ''),
        at: fresh.reduce((a, b) => (ts(a.createdAt) > ts(b.createdAt) ? a : b)).createdAt,
        tone: 'success',
        view: 'admin_users',
      });
    }
  } else {
    for (const r of src.balanceRequests.filter((r) => r.userId === src.user.id && r.status !== 'pending').slice(0, 8)) {
      out.push({
        id: `req_${r.id}_${r.status}`,
        title: r.status === 'approved' ? 'Deposit approved' : 'Deposit rejected',
        desc:
          r.status === 'approved'
            ? `${money(r.amount)} via ${r.method} was added to your wallet.`
            : `${money(r.amount)} via ${r.method} was declined${r.adminNote ? `: ${r.adminNote}` : '.'}`,
        at: r.processedAt || r.createdAt,
        tone: r.status === 'approved' ? 'success' : 'danger',
        view: 'wallet',
      });
    }
    for (const t of src.transactions
      .filter((t) => t.userId === src.user.id && (t.type === 'purchase' || t.type === 'referral' || t.type === 'admin_adjustment') && t.status === 'completed')
      .slice(0, 6)) {
      out.push({
        id: `txn_${t.id}`,
        title:
          t.type === 'purchase' ? 'Purchase completed' : t.type === 'referral' ? 'Referral bonus' : 'Balance adjusted',
        desc: `${t.description} (${t.amount >= 0 ? '+' : ''}${money(t.amount)})`,
        at: t.createdAt,
        tone: t.type === 'purchase' ? 'info' : 'success',
        view: 'wallet',
      });
    }
    for (const tk of src.supportTickets.filter((t) => t.userId === src.user.id)) {
      const last = tk.replies[tk.replies.length - 1] as any;
      if (last && last.from === 'admin') {
        out.push({
          id: `tk_${tk.id}_${last.id}`,
          title: 'Support replied',
          desc: `"${tk.subject}" — ${String(last.message).slice(0, 90)}`,
          at: last.createdAt || tk.updatedAt,
          tone: 'info',
          view: 'support',
        });
      }
    }
  }

  return out.sort((a, b) => ts(b.at) - ts(a.at)).slice(0, 30);
}

const key = (userId: string) => `pn_notif_seen_${userId}`;

export function getLastSeen(userId: string): number {
  try {
    return Number(localStorage.getItem(key(userId)) || 0) || 0;
  } catch {
    return 0;
  }
}

export function markAllSeen(userId: string): number {
  const now = Date.now();
  try {
    localStorage.setItem(key(userId), String(now));
  } catch {
    /* storage blocked — unread state just won't persist */
  }
  return now;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - ts(iso);
  if (!Number.isFinite(diff) || diff < 0) return 'just now';
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export const notifTime = ts;

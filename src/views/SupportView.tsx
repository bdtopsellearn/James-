import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  LifeBuoy,
  Plus,
  Send,
  Clock,
  ArrowLeft,
  Paperclip,
  User,
  Shield,
  Search,
  Inbox,
  Loader2,
  X,
  CheckCheck,
  Headphones,
  Timer,
  MessageSquare,
  Sparkles,
  CircleDot,
  ChevronRight,
} from 'lucide-react';
import { SupportTicket, User as UserType } from '../types';
import { InfoCallout } from '../components/rayobyte/InfoCallout';
import { TelegramIcon, TELEGRAM_GROUP_URL } from '../components/ui/TelegramIcon';

import { useToast } from '../components/ui/Toast';

interface SupportViewProps {
  tickets: SupportTicket[];
  user: UserType;
  onCreateTicket: (subject: string, message: string, priority: 'low' | 'normal' | 'urgent') => boolean | void | Promise<boolean | void>;
  onReplyTicket: (ticketId: string, message: string) => boolean | void | Promise<boolean | void>;
  onCloseTicket: (ticketId: string) => void;
}

type TicketStatus = SupportTicket['status'];
type Priority = SupportTicket['priority'];

const READ_KEY = 'pn_support_read_v1';
const MAX_MESSAGE = 2000;
const MAX_REPLY = 1000;

const STATUS_META: Record<TicketStatus, { label: string; badge: string; dot: string }> = {
  open: {
    label: 'Open',
    badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
    dot: 'bg-amber-500',
  },
  in_progress: {
    label: 'In Progress',
    badge: 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300',
    dot: 'bg-sky-500',
  },
  pending: {
    label: 'Pending',
    badge: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-300',
    dot: 'bg-violet-500',
  },
  resolved: {
    label: 'Resolved',
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300',
    dot: 'bg-emerald-500',
  },
  closed: {
    label: 'Closed',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    dot: 'bg-slate-400',
  },
};

const PRIORITY_META: Record<Priority, { label: string; badge: string }> = {
  low: {
    label: 'Low',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  },
  normal: {
    label: 'Normal',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300',
  },
  urgent: {
    label: 'Urgent',
    badge: 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300',
  },
};

const FILTERS: { key: 'all' | TicketStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'pending', label: 'Pending' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'closed', label: 'Closed' },
];

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!then || Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const s = Math.floor(diff / 1000);
  if (s < 45) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yest)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function initials(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const SupportView: React.FC<SupportViewProps> = ({
  tickets,
  user,
  onCreateTicket,
  onReplyTicket,
  onCloseTicket,
}) => {
  const { showToast } = useToast();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(tickets[0]?.id || null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [replyMessage, setReplyMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [filter, setFilter] = useState<'all' | TicketStatus>('all');
  const [query, setQuery] = useState('');
  const [mobileThread, setMobileThread] = useState(false);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  // ---- Read / unread tracking (persisted) --------------------------------
  const [readMap, setReadMap] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem(READ_KEY) || '{}');
    } catch {
      return {};
    }
  });

  const markRead = (id: string) => {
    setReadMap((prev) => {
      const next = { ...prev, [id]: Date.now() };
      try {
        localStorage.setItem(READ_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  };

  const isUnread = (t: SupportTicket) => {
    const seen = readMap[t.id] || 0;
    const updated = new Date(t.updatedAt || t.createdAt).getTime();
    return updated > seen;
  };

  // Auto-select the first ticket whenever the list loads/changes and the
  // current selection is missing (fixes blank panel when tickets arrive async).
  useEffect(() => {
    if (tickets.length === 0) {
      if (selectedTicketId !== null) setSelectedTicketId(null);
      return;
    }
    if (!selectedTicketId || !tickets.some((t) => t.id === selectedTicketId)) {
      setSelectedTicketId(tickets[0].id);
    }
  }, [tickets, selectedTicketId]);

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId);

  // Mark the active ticket as read.
  useEffect(() => {
    if (selectedTicketId) markRead(selectedTicketId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTicketId, selectedTicket?.updatedAt]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [selectedTicketId, selectedTicket?.replies.length]);

  // Esc closes the create modal.
  useEffect(() => {
    if (!showCreateModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowCreateModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCreateModal]);

  // ---- Derived collections ----------------------------------------------
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets
      .filter((t) => (filter === 'all' ? true : t.status === filter))
      .filter((t) =>
        q
          ? t.subject.toLowerCase().includes(q) ||
            t.id.toLowerCase().includes(q) ||
            (t.replies || []).some((r) => r.message.toLowerCase().includes(q))
          : true
      )
      .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
  }, [tickets, filter, query]);

  const counts = useMemo(() => {
    const base: Record<string, number> = { all: tickets.length };
    (Object.keys(STATUS_META) as TicketStatus[]).forEach((s) => {
      base[s] = tickets.filter((t) => t.status === s).length;
    });
    return base;
  }, [tickets]);

  const stats = useMemo(() => {
    const active = tickets.filter((t) => t.status === 'open' || t.status === 'in_progress' || t.status === 'pending').length;
    const resolved = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length;
    const unread = tickets.filter(isUnread).length;
    const spans: number[] = [];
    tickets.forEach((t) => {
      const firstAdmin = (t.replies || []).find((r) => r.from === 'admin');
      if (firstAdmin) {
        const span = new Date(firstAdmin.createdAt).getTime() - new Date(t.createdAt).getTime();
        if (span > 0) spans.push(span);
      }
    });
    let avg: string | null = null;
    if (spans.length) {
      const avgMs = spans.reduce((a, b) => a + b, 0) / spans.length;
      const mins = Math.round(avgMs / 60000);
      avg = mins < 60 ? `${Math.max(mins, 1)}m` : `${Math.round(mins / 60)}h`;
    }
    return { active, resolved, unread, avg };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets, readMap]);

  // ---- Handlers ----------------------------------------------------------
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim() || sending) return;
    setSending(true);
    try {
      const ok = await onCreateTicket(subject.trim(), message.trim(), priority);
      if (ok === false) return; // failed: keep what the user typed (parent shows error)
      setSubject('');
      setMessage('');
      setPriority('normal');
      setShowCreateModal(false);
    } finally {
      setSending(false);
    }
  };

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyMessage.trim() || !selectedTicketId || sending) return;
    setSending(true);
    try {
      const ok = await onReplyTicket(selectedTicketId, replyMessage.trim());
      if (ok !== false) setReplyMessage('');
    } finally {
      setSending(false);
    }
  };

  const onReplyKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSendReply(e as unknown as React.FormEvent);
    }
  };

  const selectTicket = (id: string) => {
    setSelectedTicketId(id);
    setMobileThread(true);
    markRead(id);
  };

  // ---- Stat card helper --------------------------------------------------
  const StatCard = ({
    icon: Icon,
    label,
    value,
    accent,
  }: {
    icon: React.ElementType;
    label: string;
    value: React.ReactNode;
    accent: string;
  }) => (
    <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 shadow-xs">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${accent}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
        <div className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight">{value}</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs bg-gradient-to-br from-teal-50 via-white to-cyan-50 dark:from-teal-950/40 dark:via-[#0f172a] dark:to-cyan-950/30">
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-teal-600 text-white shadow-sm">
              <Headphones className="w-4 h-4" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Customer Support &amp; Operations Desk
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-xl">
            Open a direct support thread with our CPM booster network engineers and CPM optimization team. Track every
            reply, priority and resolution in one place.
          </p>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-2">
          <a
            href={TELEGRAM_GROUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg bg-[#229ED9] hover:bg-[#1d8dc2] text-white cursor-pointer transition-colors shadow-sm"
          >
            <TelegramIcon className="w-3.5 h-3.5" />
            <span>Join Telegram Group</span>
          </a>
          <button
            onClick={() => setShowCreateModal(true)}
            className="relative z-10 inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Support Ticket</span>
          </button>
        </div>
      </div>

      {/* Community — Telegram group */}
      <div className="relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border border-[#229ED9]/30 bg-gradient-to-r from-[#229ED9]/10 via-sky-500/5 to-cyan-500/10">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-11 h-11 rounded-2xl bg-[#229ED9] text-white shadow-sm shrink-0">
            <TelegramIcon className="w-6 h-6" />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Join our Telegram community</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Get instant help, CPM tips and live updates from the X AD MARKETING team and other publishers.
            </p>
          </div>
        </div>
        <a
          href={TELEGRAM_GROUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs font-bold rounded-lg bg-[#229ED9] hover:bg-[#1d8dc2] text-white cursor-pointer transition-colors shadow-sm shrink-0"
        >
          <TelegramIcon className="w-3.5 h-3.5" />
          <span>Open Telegram Group</span>
        </a>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Inbox}
          label="Total Tickets"
          value={tickets.length}
          accent="bg-teal-100 text-teal-700 dark:bg-teal-900/50 dark:text-teal-300"
        />
        <StatCard
          icon={CircleDot}
          label="Active"
          value={stats.active}
          accent="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
        />
        <StatCard
          icon={CheckCheck}
          label="Resolved"
          value={stats.resolved}
          accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
        />
        <StatCard
          icon={Timer}
          label="Avg First Reply"
          value={stats.avg ?? '—'}
          accent="bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300"
        />
      </div>

      <InfoCallout
        title="24/7 Enterprise Turnaround SLA"
        message="Support tickets from Pro and Elite members are assigned to a priority queue with a guaranteed response within 30 minutes. Urgent tickets jump the queue automatically."
      />

      {/* Main Split: Ticket List (Left) + Conversation Thread (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket List */}
        <div
          className={`bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 space-y-3 ${
            mobileThread ? 'hidden lg:block' : 'block'
          }`}
        >
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Your Inquiries ({filtered.length})
            </span>
            {stats.unread > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
                <Sparkles className="w-2.5 h-2.5" />
                {stats.unread} new
              </span>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tickets…"
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          {/* Filter tabs */}
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => {
              const active = filter === f.key;
              const count = counts[f.key] ?? 0;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-full border transition-colors cursor-pointer ${
                    active
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-transparent text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-teal-400 hover:text-teal-600'
                  }`}
                >
                  {f.label}
                  <span
                    className={`tabular-nums ${active ? 'text-white/80' : 'text-slate-400 dark:text-slate-500'}`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* List */}
          <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <div className="py-12 text-center">
                <LifeBuoy className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                <p className="text-xs text-slate-400 mt-3">
                  {tickets.length === 0
                    ? 'No tickets yet — open one and our engineers will respond.'
                    : 'No tickets match your filters.'}
                </p>
              </div>
            ) : (
              filtered.map((t) => {
                const isSelected = t.id === selectedTicketId;
                const sm = STATUS_META[t.status] || STATUS_META.open;
                const pm = PRIORITY_META[t.priority] || PRIORITY_META.normal;
                const unread = isUnread(t);
                const lastReply = (t.replies || [])[t.replies.length - 1];
                return (
                  <div
                    key={t.id}
                    onClick={() => selectTicket(t.id)}
                    className={`group p-3.5 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-teal-500 bg-teal-50/60 dark:bg-teal-950/40 shadow-xs'
                        : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate flex-1 flex items-center gap-1.5">
                        {unread && <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />}
                        {t.subject}
                      </span>
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded-full uppercase font-semibold whitespace-nowrap ${sm.badge}`}
                      >
                        {sm.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold uppercase ${pm.badge}`}>
                        {pm.label}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate">
                        {lastReply ? lastReply.message.slice(0, 46) : 'No replies yet'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                      <span className="truncate">#{t.id}</span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-2.5 h-2.5" />
                        {(t.replies || []).length}
                        <span className="mx-0.5">·</span>
                        {timeAgo(t.updatedAt || t.createdAt)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Conversation Thread */}
        <div
          className={`lg:col-span-2 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col min-h-[560px] ${
            mobileThread ? 'block' : 'hidden lg:flex'
          }`}
        >
          {selectedTicket ? (
            <>
              {/* Thread Header */}
              <div className="p-5 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      onClick={() => setMobileThread(false)}
                      className="lg:hidden inline-flex items-center gap-1 text-[11px] font-semibold text-teal-600 mb-2 cursor-pointer"
                    >
                      <ArrowLeft className="w-3 h-3" /> Back to list
                    </button>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                      {selectedTicket.subject}
                    </h2>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 mt-1.5">
                      <span className="font-mono">#{selectedTicket.id}</span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase ${
                          (STATUS_META[selectedTicket.status] || STATUS_META.open).badge
                        }`}
                      >
                        {(STATUS_META[selectedTicket.status] || STATUS_META.open).label}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase ${
                          (PRIORITY_META[selectedTicket.priority] || PRIORITY_META.normal).badge
                        }`}
                      >
                        {(PRIORITY_META[selectedTicket.priority] || PRIORITY_META.normal).label}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {timeAgo(selectedTicket.createdAt)}
                      </span>
                    </div>
                  </div>

                  {selectedTicket.status !== 'closed' && (
                    <button
                      onClick={() => {
                        onCloseTicket(selectedTicket.id);
                        showToast('Ticket closed', 'Thank you for reaching out!', 'success');
                      }}
                      className="shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 cursor-pointer transition-colors"
                    >
                      Close Ticket
                    </button>
                  )}
                </div>
              </div>

              {/* Messages Stream */}
              <div className="flex-1 py-5 px-5 space-y-4 overflow-y-auto max-h-[420px]">
                {selectedTicket.replies.length === 0 && (
                  <div className="text-center py-8">
                    <MessageSquare className="w-7 h-7 mx-auto text-slate-300 dark:text-slate-700" />
                    <p className="text-xs text-slate-400 mt-2">
                      Your ticket has been received. A support engineer will reply shortly.
                    </p>
                  </div>
                )}
                {selectedTicket.replies.map((reply, idx) => {
                  const isAdmin = reply.from === 'admin';
                  const prev = selectedTicket.replies[idx - 1];
                  const showDay =
                    !prev || dayLabel(prev.createdAt) !== dayLabel(reply.createdAt);
                  return (
                    <React.Fragment key={reply.id}>
                      {showDay && (
                        <div className="flex items-center gap-3 py-1">
                          <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            {dayLabel(reply.createdAt)}
                          </span>
                          <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
                        </div>
                      )}
                      <div className={`flex gap-2.5 ${isAdmin ? 'flex-row' : 'flex-row-reverse'}`}>
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            isAdmin
                              ? 'bg-teal-600 text-white'
                              : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {isAdmin ? <Shield className="w-3.5 h-3.5" /> : initials(reply.authorName || user?.name || 'You')}
                        </div>
                        <div
                          className={`max-w-[82%] p-3.5 rounded-2xl border text-xs leading-relaxed space-y-1.5 ${
                            isAdmin
                              ? 'bg-teal-50/60 dark:bg-teal-950/30 border-teal-200/80 dark:border-teal-900/60 rounded-tl-sm'
                              : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 rounded-tr-sm'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3 text-[11px]">
                            <span className="font-bold flex items-center gap-1.5 text-slate-900 dark:text-slate-100">
                              {reply.authorName} {isAdmin && <span className="text-teal-600">(Staff)</span>}
                            </span>
                            <span className="font-mono text-slate-400 whitespace-nowrap">
                              {new Date(reply.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                            {reply.message}
                          </p>
                          {reply.attachments && reply.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {reply.attachments.map((a, i) => (
                                <a
                                  key={i}
                                  href={a}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-teal-600"
                                >
                                  <Paperclip className="w-2.5 h-2.5" /> Attachment {i + 1}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
                <div ref={threadEndRef} />
              </div>

              {/* Reply Form */}
              {selectedTicket.status !== 'closed' ? (
                <form
                  onSubmit={handleSendReply}
                  className="p-4 border-t border-slate-100 dark:border-slate-800 space-y-2"
                >
                  <div className="flex items-end gap-2">
                    <textarea
                      required
                      rows={2}
                      maxLength={MAX_REPLY}
                      placeholder="Type your response… (⌘/Ctrl + Enter to send)"
                      value={replyMessage}
                      onChange={(e) => setReplyMessage(e.target.value)}
                      onKeyDown={onReplyKeyDown}
                      className="flex-1 resize-none px-3.5 py-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    />
                    <button
                      type="submit"
                      disabled={sending || !replyMessage.trim()}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white cursor-pointer shadow-xs transition-colors"
                    >
                      {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      <span>Send</span>
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <span className="text-[10px] font-mono text-slate-400">
                      {replyMessage.length}/{MAX_REPLY}
                    </span>
                  </div>
                </form>
              ) : (
                <div className="p-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-center text-xs text-emerald-700 dark:text-emerald-300">
                    <CheckCheck className="w-3.5 h-3.5" />
                    This ticket is resolved and closed. Open a new ticket if you need further help.
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-24 px-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-teal-50 dark:bg-teal-950/40 flex items-center justify-center mb-4">
                <LifeBuoy className="w-7 h-7 text-teal-600" />
              </div>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">No ticket selected</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-xs">
                Select a ticket from the list to view the conversation, or create a new support request.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" /> New Ticket
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Create Ticket Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto overscroll-contain">
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-lg w-full p-6 space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <LifeBuoy className="w-4 h-4 text-teal-600" />
                  Create New Support Ticket
                </h3>
                <p className="text-[11px] text-slate-400 mt-1">
                  Our team typically responds within 30 minutes during peak hours.
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Subject / Category
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  placeholder="e.g. Adsterra SmartLink postback pixel question"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Urgency / Priority
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['low', 'normal', 'urgent'] as Priority[]).map((p) => {
                    const active = priority === p;
                    const pm = PRIORITY_META[p];
                    return (
                      <button
                        type="button"
                        key={p}
                        onClick={() => setPriority(p)}
                        className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                          active
                            ? 'border-teal-500 ring-1 ring-teal-500 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300'
                            : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${pm.badge.split(' ')[0]}`} />
                        {pm.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Message Details
                </label>
                <textarea
                  rows={5}
                  required
                  maxLength={MAX_MESSAGE}
                  placeholder="Provide all relevant details, placement IDs, booster IDs, or screenshots links…"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-none"
                />
                <div className="flex justify-end mt-1">
                  <span className="text-[10px] font-mono text-slate-400">
                    {message.length}/{MAX_MESSAGE}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending || !subject.trim() || !message.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed text-white cursor-pointer shadow-xs"
                >
                  {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  Submit Inquiry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

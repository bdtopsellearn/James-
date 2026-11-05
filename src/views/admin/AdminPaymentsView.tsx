import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CreditCard,
  RefreshCw,
  Search,
  TrendingUp,
  CheckCircle2,
  Clock,
  XCircle,
  Ban,
  RotateCcw,
  AlertTriangle,
  Loader2,
  X,
  Settings2,
  Webhook,
  ExternalLink,
  Copy,
  Check,
  ShieldCheck,
  Receipt,
  User,
  Hash,
  Calendar,
  Server,
  KeyRound,
  Link2,
  Send,
} from 'lucide-react';
import {
  apiAdminPayments,
  apiAdminPaymentDetail,
  apiAdminRefundPayment,
  apiAdminRegisterSuperchatWebhook,
  apiAdminSuperchatWebhooks,
  ApiError,
} from '../../services/api';
import type { AdminPaymentRecord, PaymentEvent, PaymentStats, PaymentConfigInfo, PaymentStatus } from '../../types';
import { useToast } from '../../components/ui/Toast';
import { formatBDT } from '../../lib/currency';

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All Statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'PROCESSING', label: 'Processing' },
  { value: 'PAID', label: 'Paid' },
  { value: 'FAILED', label: 'Failed' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'REFUNDED', label: 'Refunded' },
];

const STATUS_TONE: Record<PaymentStatus, string> = {
  PAID: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 ring-emerald-500/30',
  PROCESSING: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 ring-cyan-500/30',
  PENDING: 'bg-amber-500/10 text-amber-600 dark:text-amber-300 ring-amber-500/30',
  FAILED: 'bg-rose-500/10 text-rose-600 dark:text-rose-300 ring-rose-500/30',
  CANCELLED: 'bg-slate-500/10 text-slate-600 dark:text-slate-300 ring-slate-500/30',
  EXPIRED: 'bg-orange-500/10 text-orange-600 dark:text-orange-300 ring-orange-500/30',
  REFUNDED: 'bg-violet-500/10 text-violet-600 dark:text-violet-300 ring-violet-500/30',
};

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status as PaymentStatus] || 'bg-slate-500/10 text-slate-500 ring-slate-500/30';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${tone}`}>
      {status}
    </span>
  );
}

function fmtWhen(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatTile({ label, value, icon, tone }: { label: string; value: string | number; icon: React.ReactNode; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#0f172a]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone}`}>{icon}</span>
      </div>
      <div className="mt-2 text-xl font-extrabold tabular-nums text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}

export const AdminPaymentsView: React.FC = () => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<AdminPaymentRecord[]>([]);
  const [stats, setStats] = useState<PaymentStats | null>(null);
  const [config, setConfig] = useState<PaymentConfigInfo | null>(null);

  const [statusFilter, setStatusFilter] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');

  const [selected, setSelected] = useState<AdminPaymentRecord | null>(null);
  const [events, setEvents] = useState<PaymentEvent[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [refundTarget, setRefundTarget] = useState<AdminPaymentRecord | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [refunding, setRefunding] = useState(false);

  const [showConfig, setShowConfig] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [webhooks, setWebhooks] = useState<any>(null);
  const [webhooksLoading, setWebhooksLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const out = await apiAdminPayments({
        status: statusFilter || undefined,
        q: debouncedQ || undefined,
        limit: 200,
      });
      setPayments(out.payments || []);
      setStats(out.stats || null);
      setConfig(out.config || null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load payments.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, debouncedQ]);

  useEffect(() => { void load(); }, [load]);

  const openDetail = useCallback(async (p: AdminPaymentRecord) => {
    setSelected(p);
    setEvents([]);
    setDetailLoading(true);
    try {
      const out = await apiAdminPaymentDetail(p.payment_id);
      setSelected(out.payment);
      setEvents(out.events || []);
    } catch (e) {
      showToast('Detail Error', e instanceof ApiError ? e.message : 'Could not load payment detail.', 'error');
    } finally {
      setDetailLoading(false);
    }
  }, [showToast]);

  const doRefund = useCallback(async () => {
    if (!refundTarget || refunding) return;
    setRefunding(true);
    try {
      const out = await apiAdminRefundPayment(refundTarget.payment_id, refundReason.trim() || 'Refunded by admin');
      showToast('Refund Issued', `Payment ${refundTarget.payment_id} marked REFUNDED.`, 'success');
      setRefundTarget(null);
      setRefundReason('');
      setSelected((s) => (s && s.payment_id === out.payment.payment_id ? out.payment : s));
      await load();
    } catch (e) {
      showToast('Refund Failed', e instanceof ApiError ? e.message : 'Could not issue the refund.', 'error');
    } finally {
      setRefunding(false);
    }
  }, [refundTarget, refundReason, refunding, showToast, load]);

  const registerWebhook = useCallback(async () => {
    setRegistering(true);
    try {
      const out = await apiAdminRegisterSuperchatWebhook();
      showToast('Webhook Registered', out?.secret ? 'Secret returned — copy it into SUPERCHAT_WEBHOOK_SECRET.' : 'Webhook subscription created.', 'success');
      setWebhooks(out);
      await load();
    } catch (e) {
      showToast('Registration Failed', e instanceof ApiError ? e.message : 'Could not register the webhook.', 'error');
    } finally {
      setRegistering(false);
    }
  }, [showToast, load]);

  const loadWebhooks = useCallback(async () => {
    setWebhooksLoading(true);
    try {
      const out = await apiAdminSuperchatWebhooks();
      setWebhooks(out);
    } catch (e) {
      showToast('Error', e instanceof ApiError ? e.message : 'Could not list webhooks.', 'error');
    } finally {
      setWebhooksLoading(false);
    }
  }, [showToast]);

  // Robust clipboard write: modern API first, hidden-textarea fallback for
  // non-secure contexts (plain http / embedded webviews) so the admin can
  // always copy the webhook URL.
  const writeClipboard = useCallback(async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* fall through to legacy path */ }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }, []);

  const copyText = async (text: string) => {
    const ok = await writeClipboard(text);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  // Dedicated "copy the payment webhook" action — the admin panel's headline
  // utility. Gives clear success/failure feedback via toast + button state.
  const copyWebhook = useCallback(async () => {
    const url = config?.webhook_url;
    if (!url) {
      showToast('No Webhook', 'The webhook URL is not available yet. Check the gateway configuration.', 'error');
      return;
    }
    const ok = await writeClipboard(url);
    if (ok) {
      setCopiedWebhook(true);
      setTimeout(() => setCopiedWebhook(false), 2000);
      showToast('Webhook Copied', 'The webhook URL is now on your clipboard.', 'success');
    } else {
      showToast('Copy Failed', 'Clipboard is blocked — select the URL and copy it manually.', 'error');
    }
  }, [config?.webhook_url, writeClipboard, showToast]);

  const statTiles = useMemo(() => {
    const s = stats;
    return [
      { label: 'Total Payments', value: s?.total ?? 0, icon: <CreditCard className="h-4 w-4 text-slate-500" />, tone: 'bg-slate-500/10' },
      { label: 'Successful', value: s?.paid ?? 0, icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />, tone: 'bg-emerald-500/10' },
      { label: 'Pending', value: (s?.pending ?? 0) + (s?.processing ?? 0), icon: <Clock className="h-4 w-4 text-amber-500" />, tone: 'bg-amber-500/10' },
      { label: 'Failed', value: s?.failed ?? 0, icon: <XCircle className="h-4 w-4 text-rose-500" />, tone: 'bg-rose-500/10' },
      { label: 'Cancelled', value: s?.cancelled ?? 0, icon: <Ban className="h-4 w-4 text-slate-500" />, tone: 'bg-slate-500/10' },
      { label: 'Refunded', value: s?.refunded ?? 0, icon: <RotateCcw className="h-4 w-4 text-violet-500" />, tone: 'bg-violet-500/10' },
      { label: 'Total Volume', value: formatBDT(s?.totalAmount ?? 0, { decimals: 0 }), icon: <TrendingUp className="h-4 w-4 text-teal-500" />, tone: 'bg-teal-500/10' },
      { label: 'Paid Volume', value: formatBDT(s?.paidAmount ?? 0, { decimals: 0 }), icon: <ShieldCheck className="h-4 w-4 text-emerald-500" />, tone: 'bg-emerald-500/10' },
    ];
  }, [stats]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#0f172a] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">SuperChat BD Payments</h1>
            {config && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${config.is_live ? 'bg-rose-500/10 text-rose-600 ring-rose-500/30 dark:text-rose-300' : 'bg-amber-500/10 text-amber-600 ring-amber-500/30 dark:text-amber-300'}`}>
                {config.is_live ? 'Live' : 'Test'}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Monitor hosted-checkout payments, verify webhooks, and issue refunds. API keys are never shown here.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowConfig((v) => !v); if (!webhooks) void loadWebhooks(); }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <Settings2 className="h-3.5 w-3.5" /> Gateway Config
          </button>
          <button
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-700"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {statTiles.map((t) => <StatTile key={t.label} {...t} />)}
      </div>

      {/* Webhook — dedicated, always-visible copy option */}
      {config && (
        <div className="lg-glass-strong relative overflow-hidden rounded-xl border border-teal-500/25 p-5 shadow-xs sm:p-6">
          <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-teal-500/10 blur-2xl" aria-hidden="true" />
          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 text-teal-600 ring-1 ring-teal-500/25 dark:text-teal-300">
                <Webhook className="h-5 w-5" />
              </span>
              <div>
                <h2 className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                  Payment Webhook
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${config.webhook_secret_set ? 'bg-emerald-500/10 text-emerald-600 ring-emerald-500/30 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-600 ring-amber-500/30 dark:text-amber-300'}`}>
                    {config.webhook_secret_set ? 'Secured' : 'Secret not set'}
                  </span>
                </h2>
                <p className="mt-1 max-w-xl text-xs text-slate-500 dark:text-slate-400">
                  Copy this URL and paste it into your SuperChat BD dashboard (Webhook / Callback URL field) so payment events reach this server.
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                onClick={() => void copyWebhook()}
                className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-teal-700 active:scale-[0.98]"
              >
                {copiedWebhook ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiedWebhook ? 'Copied!' : 'Copy Webhook'}
              </button>
              <button
                onClick={registerWebhook}
                disabled={registering || !config.api_key_set}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {registering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Webhook className="h-3.5 w-3.5" />} Register
              </button>
            </div>
          </div>

          <div className="relative mt-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white/70 px-3 py-2.5 backdrop-blur dark:border-slate-700 dark:bg-slate-900/60">
            <code className="min-w-0 flex-1 select-all break-all font-mono text-[12px] leading-relaxed text-slate-700 dark:text-slate-200">{config.webhook_url}</code>
            <button
              onClick={() => void copyWebhook()}
              title="Copy webhook URL"
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-semibold text-teal-600 transition hover:bg-teal-50 dark:border-slate-700 dark:text-teal-400 dark:hover:bg-slate-800"
            >
              {copiedWebhook ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedWebhook ? 'Copied' : 'Copy'}
            </button>
          </div>

          {!config.webhook_secret_set && (
            <div className="relative mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Set <code className="font-mono">SUPERCHAT_WEBHOOK_SECRET</code> in the server <code className="font-mono">.env</code> to verify incoming webhook signatures.</span>
            </div>
          )}
        </div>
      )}

      {/* Config panel */}
      {showConfig && config && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#0f172a]">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <Server className="h-4 w-4 text-teal-500" /> Gateway Configuration
            </h2>
            <button onClick={() => setShowConfig(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="h-4 w-4" /></button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <ConfigRow icon={<Server className="h-3.5 w-3.5" />} label="Provider" value="SuperChat BD" />
            <ConfigRow icon={<Server className="h-3.5 w-3.5" />} label="Environment" value={config.environment} />
            <ConfigRow icon={<Link2 className="h-3.5 w-3.5" />} label="Base URL" value={config.base_url} mono />
            <ConfigRow icon={<KeyRound className="h-3.5 w-3.5" />} label="API Key" value={config.api_key_set ? `Set (${config.api_key_hint || '••••'})` : 'NOT SET'} ok={config.api_key_set} />
            <ConfigRow icon={<KeyRound className="h-3.5 w-3.5" />} label="Webhook Secret" value={config.webhook_secret_set ? 'Set' : 'NOT SET'} ok={config.webhook_secret_set} />
            <ConfigRow icon={<Receipt className="h-3.5 w-3.5" />} label="Currency" value={config.currency} />
            <ConfigRow icon={<Receipt className="h-3.5 w-3.5" />} label="Amount Range" value={`${config.min_amount} – ${config.max_amount > 0 ? config.max_amount : '∞'}`} />
            <ConfigRow icon={<Clock className="h-3.5 w-3.5" />} label="Expiration" value={`${config.expiration_minutes} min`} />
            <ConfigRow icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Webhook Tolerance" value={`${config.webhook_tolerance_sec}s`} />
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/50">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Webhook URL</span>
              <button onClick={() => copyText(config.webhook_url)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-600 hover:text-teal-700 dark:text-teal-400">
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />} Copy
              </button>
            </div>
            <code className="mt-1 block break-all font-mono text-[11px] text-slate-700 dark:text-slate-300">{config.webhook_url}</code>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={registerWebhook}
              disabled={registering || !config.api_key_set}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {registering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Webhook className="h-3.5 w-3.5" />} Register / Re-register Webhook
            </button>
            <button
              onClick={() => void loadWebhooks()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${webhooksLoading ? 'animate-spin' : ''}`} /> List Webhooks
            </button>
          </div>

          {webhooks && (
            <pre className="mt-3 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 text-[11px] leading-relaxed text-emerald-300 dark:border-slate-800">
{JSON.stringify(webhooks, null, 2)}
            </pre>
          )}

          {!config.configured && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Gateway is not fully configured. Set <code className="font-mono">SUPERCHAT_API_KEY</code> and <code className="font-mono">SUPERCHAT_WEBHOOK_SECRET</code> in the server <code className="font-mono">.env</code> and restart the API.</span>
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#0f172a] sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by Payment ID, Order ID, customer…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs dark:border-slate-800 dark:bg-[#0f172a]">
        {loading ? (
          <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-teal-500" /> Loading payments…
          </div>
        ) : error ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-rose-500">
            <AlertTriangle className="h-4 w-4" /> {error}
          </div>
        ) : payments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <Receipt className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm font-medium text-slate-500">No payments found</p>
            <p className="text-xs text-slate-400">Payments created through the wallet top-up will appear here.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="px-4 py-3 font-semibold">Payment ID</th>
                    <th className="px-4 py-3 font-semibold">Order ID</th>
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Amount</th>
                    <th className="px-4 py-3 font-semibold">Provider ID</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Created</th>
                    <th className="px-4 py-3 font-semibold">Paid At</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr
                      key={p.payment_id}
                      onClick={() => void openDetail(p)}
                      className="cursor-pointer border-b border-slate-50 transition hover:bg-slate-50 dark:border-slate-800/60 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">{p.payment_id}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.order_id || '—'}</td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{p.customer_name || '—'}</td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatBDT(p.amount, { decimals: 2 })}</td>
                      <td className="px-4 py-3 font-mono text-[11px] text-slate-400">{p.provider_payment_id || '—'}</td>
                      <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3 text-xs text-slate-500">{fmtWhen(p.created_at)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{fmtWhen(p.paid_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800 lg:hidden">
              {payments.map((p) => (
                <button
                  key={p.payment_id}
                  onClick={() => void openDetail(p)}
                  className="flex w-full flex-col gap-2 p-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100">{p.payment_id}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{p.customer_name || '—'}</span>
                    <span className="text-sm font-extrabold tabular-nums text-slate-900 dark:text-slate-100">{formatBDT(p.amount, { decimals: 2 })}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span>{p.order_id || '—'}</span>
                    <span>{fmtWhen(p.created_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 backdrop-blur-sm sm:items-center" onClick={() => setSelected(null)}>
          <div
            className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#0f172a] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur dark:border-slate-800 dark:bg-[#0f172a]/95">
              <div className="flex items-center gap-2.5">
                <Receipt className="h-5 w-5 text-teal-500" />
                <div>
                  <h3 className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">{selected.payment_id}</h3>
                  <p className="text-[11px] text-slate-500">{selected.order_id || '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={selected.status} />
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="space-y-5 p-5">
              {/* Amount */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-center dark:border-slate-800 dark:bg-slate-900/50">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Amount</p>
                <p className="mt-1 text-2xl font-extrabold tabular-nums text-slate-900 dark:text-slate-100">{formatBDT(selected.amount, { decimals: 2 })}</p>
                <p className="text-[11px] text-slate-500">{selected.currency} · {selected.description || 'Wallet top-up'}</p>
              </div>

              <Section title="Customer" icon={<User className="h-3.5 w-3.5" />}>
                <DetailRow label="Name" value={selected.customer_name || '—'} />
                <DetailRow label="Email" value={selected.customer_email || '—'} mono />
                <DetailRow label="Phone" value={selected.customer_phone || '—'} mono />
                <DetailRow label="User ID" value={selected.user_id || '—'} mono />
              </Section>

              <Section title="Gateway" icon={<Server className="h-3.5 w-3.5" />}>
                <DetailRow label="SuperChat Payment ID" value={selected.provider_payment_id || '—'} mono />
                <DetailRow label="Provider Status" value={selected.provider_status || '—'} />
                <DetailRow label="Raw Status" value={selected.provider_raw_status || '—'} />
                <DetailRow label="Paid Source" value={selected.paid_source || '—'} />
                <DetailRow label="Environment" value={selected.is_live ? 'live' : 'test'} />
              </Section>

              <Section title="Ledger" icon={<Hash className="h-3.5 w-3.5" />}>
                <DetailRow label="Idempotency Key" value={selected.idempotency_key || '—'} mono />
                <DetailRow label="Balance After" value={selected.balance_after != null ? formatBDT(selected.balance_after, { decimals: 2 }) : '—'} />
                <DetailRow label="Credited Txn" value={selected.credited_transaction_id || '—'} mono />
                <DetailRow label="Fulfilled" value={selected.fulfilled ? `Yes${selected.fulfilled_at ? ` · ${fmtWhen(selected.fulfilled_at)}` : ''}` : 'No'} />
                {selected.last_fulfillment_error && <DetailRow label="Last Error" value={selected.last_fulfillment_error} danger />}
              </Section>

              <Section title="Timestamps" icon={<Calendar className="h-3.5 w-3.5" />}>
                <DetailRow label="Created" value={fmtWhen(selected.created_at)} />
                <DetailRow label="Updated" value={fmtWhen(selected.updated_at)} />
                <DetailRow label="Expires" value={fmtWhen(selected.expires_at)} />
                <DetailRow label="Paid At" value={fmtWhen(selected.paid_at)} />
                <DetailRow label="Refunded At" value={fmtWhen(selected.refunded_at)} />
                <DetailRow label="IP" value={selected.ip || '—'} mono />
              </Section>

              {selected.metadata && Object.keys(selected.metadata).length > 0 && (
                <Section title="Metadata" icon={<Hash className="h-3.5 w-3.5" />}>
                  {Object.entries(selected.metadata).map(([k, v]) => (
                    <DetailRow key={k} label={k} value={String(v)} mono />
                  ))}
                </Section>
              )}

              {/* Event history */}
              <div>
                <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  <Clock className="h-3.5 w-3.5" /> Event History
                </h4>
                {detailLoading ? (
                  <div className="flex items-center gap-2 py-4 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading events…</div>
                ) : events.length === 0 ? (
                  <p className="py-3 text-xs text-slate-400">No events recorded yet.</p>
                ) : (
                  <ol className="relative space-y-3 border-l border-slate-200 pl-4 dark:border-slate-700">
                    {events.map((ev) => (
                      <li key={ev.id} className="relative">
                        <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-teal-500 ring-4 ring-teal-500/10" />
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{ev.eventType}</span>
                          {ev.oldStatus && ev.newStatus && (
                            <span className="text-[10px] font-semibold text-slate-400">{ev.oldStatus} → {ev.newStatus}</span>
                          )}
                          <span className="text-[10px] text-slate-400">{fmtWhen(ev.createdAt)}</span>
                        </div>
                        {ev.note && <p className="mt-0.5 text-[11px] text-slate-500">{ev.note}</p>}
                        {ev.providerTransactionId && <p className="mt-0.5 font-mono text-[10px] text-slate-400">{ev.providerTransactionId}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                {selected.checkout_url && (
                  <a
                    href={selected.checkout_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open Checkout
                  </a>
                )}
                <a
                  href={`/checkout/${encodeURIComponent(selected.payment_id)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Link2 className="h-3.5 w-3.5" /> Public Checkout Page
                </a>
                {selected.status === 'PAID' && (
                  <button
                    onClick={() => { setRefundTarget(selected); setRefundReason(''); }}
                    className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-700"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Issue Refund
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Refund modal */}
      {refundTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={() => !refunding && setRefundTarget(null)}>
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-800 dark:bg-[#0f172a]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/15 ring-1 ring-violet-500/30">
                <RotateCcw className="h-5 w-5 text-violet-500" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Issue Refund</h3>
                <p className="font-mono text-[11px] text-slate-500">{refundTarget.payment_id}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
              This calls SuperChat BD's refund API for {formatBDT(refundTarget.amount, { decimals: 2 })}. The wallet balance is <strong>not</strong> automatically debited — reconcile manually if required.
            </p>
            <label className="mt-4 block text-xs font-semibold text-slate-700 dark:text-slate-300">Refund reason</label>
            <textarea
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              rows={3}
              maxLength={300}
              placeholder="e.g. Customer requested cancellation"
              className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500/40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setRefundTarget(null)}
                disabled={refunding}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={doRefund}
                disabled={refunding}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
              >
                {refunding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Confirm Refund
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
  <div>
    <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">{icon} {title}</h4>
    <div className="space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40">{children}</div>
  </div>
);

const DetailRow: React.FC<{ label: string; value: string; mono?: boolean; danger?: boolean }> = ({ label, value, mono, danger }) => (
  <div className="flex items-start justify-between gap-4 text-xs">
    <span className="shrink-0 text-slate-500">{label}</span>
    <span className={`text-right ${mono ? 'font-mono' : ''} ${danger ? 'text-rose-500' : 'text-slate-800 dark:text-slate-200'} break-all`}>{value}</span>
  </div>
);

const ConfigRow: React.FC<{ icon: React.ReactNode; label: string; value: string; mono?: boolean; ok?: boolean }> = ({ icon, label, value, mono, ok }) => (
  <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-900/40">
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
      {icon} {label}
    </div>
    <div className={`mt-1 text-xs font-semibold ${mono ? 'font-mono' : ''} ${ok === false ? 'text-rose-500' : ok === true ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'} break-all`}>
      {value}
    </div>
  </div>
);

export default AdminPaymentsView;

import React, { useCallback, useEffect, useState } from 'react';
import {
  Webhook,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Server,
  Link2,
  KeyRound,
  Clock,
  Send,
  ExternalLink,
  ListChecks,
  Sparkles,
} from 'lucide-react';
import {
  apiAdminSuperchatConfig,
  apiAdminRegisterSuperchatWebhook,
  apiAdminSuperchatWebhooks,
  ApiError,
} from '../../services/api';
import type { PaymentConfigInfo } from '../../types';
import { useToast } from '../../components/ui/Toast';

/**
 * Dedicated Admin → Webhook console.
 *
 * A single, obvious place where the operator can copy the payment webhook URL,
 * re-register it with the gateway, and inspect the registered subscriptions.
 * Built so the URL can be copied in one click even on non-secure origins.
 */
export const AdminWebhookView: React.FC = () => {
  const { showToast } = useToast();
  const [config, setConfig] = useState<PaymentConfigInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [copied, setCopied] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [webhooks, setWebhooks] = useState<any>(null);
  const [webhooksLoading, setWebhooksLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const cfg = await apiAdminSuperchatConfig();
      setConfig(cfg);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the webhook configuration.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const writeClipboard = useCallback(async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch { /* fall through */ }
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

  const copyWebhook = useCallback(async () => {
    const url = config?.webhook_url;
    if (!url) {
      showToast('No Webhook', 'The webhook URL is not available yet.', 'error');
      return;
    }
    const ok = await writeClipboard(url);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      showToast('Webhook Copied', 'The webhook URL is now on your clipboard.', 'success');
    } else {
      showToast('Copy Failed', 'Clipboard is blocked — select the URL and copy it manually.', 'error');
    }
  }, [config?.webhook_url, writeClipboard, showToast]);

  const registerWebhook = useCallback(async () => {
    setRegistering(true);
    try {
      const out = await apiAdminRegisterSuperchatWebhook();
      showToast(
        'Webhook Registered',
        out?.secret ? 'Secret returned — store it in SUPERCHAT_WEBHOOK_SECRET.' : 'Webhook subscription created.',
        'success',
      );
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
      if (!out) showToast('No Webhooks', 'The gateway returned no registered webhooks.', 'info');
    } catch (e) {
      showToast('Error', e instanceof ApiError ? e.message : 'Could not list webhooks.', 'error');
    } finally {
      setWebhooksLoading(false);
    }
  }, [showToast]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#0f172a] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-500/15 text-teal-600 ring-1 ring-teal-500/25 dark:text-teal-300">
            <Webhook className="h-5 w-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Payment Webhook</h1>
              {config && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ${config.is_live ? 'bg-rose-500/10 text-rose-600 ring-rose-500/30 dark:text-rose-300' : 'bg-amber-500/10 text-amber-600 ring-amber-500/30 dark:text-amber-300'}`}>
                  {config.is_live ? 'Live' : 'Test'}
                </span>
              )}
            </div>
            <p className="mt-1 max-w-2xl text-xs text-slate-500 dark:text-slate-400">
              Copy the webhook URL below and paste it into your SuperChat BD dashboard so payment events reach this server. One click — always available here.
            </p>
          </div>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !config && (
        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 dark:border-slate-800 dark:bg-[#0f172a]">
          <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
        </div>
      )}

      {config && (
        <>
          {/* Copy card */}
          <div className="lg-glass-strong relative overflow-hidden rounded-xl border border-teal-500/25 p-6 shadow-xs">
            <div className="pointer-events-none absolute -right-20 -top-20 h-52 w-52 rounded-full bg-teal-500/10 blur-3xl" aria-hidden="true" />
            <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                  <Sparkles className="h-4 w-4 text-teal-500" /> Your Webhook URL
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  This is the callback endpoint the gateway calls on every payment event.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <button
                  onClick={() => void copyWebhook()}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-700 active:scale-[0.98]"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copied!' : 'Copy Webhook'}
                </button>
                <button
                  onClick={registerWebhook}
                  disabled={registering || !config.api_key_set}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {registering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Register
                </button>
                <button
                  onClick={() => void loadWebhooks()}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${webhooksLoading ? 'animate-spin' : ''}`} /> List
                </button>
              </div>
            </div>

            <div className="relative mt-5 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white/70 p-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/60 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 select-all break-all font-mono text-[13px] leading-relaxed text-slate-800 dark:text-slate-100">{config.webhook_url}</code>
              <button
                onClick={() => void copyWebhook()}
                title="Copy webhook URL"
                className="inline-flex shrink-0 items-center justify-center gap-1 rounded-md border border-slate-200 px-3 py-2 text-[11px] font-semibold text-teal-600 transition hover:bg-teal-50 dark:border-slate-700 dark:text-teal-400 dark:hover:bg-slate-800"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>

            {!config.webhook_secret_set && (
              <div className="relative mt-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>Set <code className="font-mono">SUPERCHAT_WEBHOOK_SECRET</code> in the server <code className="font-mono">.env</code> and restart the API to verify incoming webhook signatures.</span>
              </div>
            )}
          </div>

          {/* Config summary */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InfoTile icon={<Server className="h-4 w-4" />} label="Provider" value={config.provider} />
            <InfoTile icon={<Server className="h-4 w-4" />} label="Environment" value={config.environment} />
            <InfoTile
              icon={<KeyRound className="h-4 w-4" />}
              label="API Key"
              value={config.api_key_set ? `Set (${config.api_key_hint || '••••'})` : 'NOT SET'}
              tone={config.api_key_set ? 'ok' : 'warn'}
            />
            <InfoTile
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Webhook Secret"
              value={config.webhook_secret_set ? 'Set' : 'NOT SET'}
              tone={config.webhook_secret_set ? 'ok' : 'warn'}
            />
            <InfoTile icon={<Link2 className="h-4 w-4" />} label="Base URL" value={config.base_url} mono />
            <InfoTile icon={<Clock className="h-4 w-4" />} label="Tolerance" value={`${config.webhook_tolerance_sec}s`} />
            <InfoTile icon={<Send className="h-4 w-4" />} label="Events" value={(config.events || []).length ? config.events.join(', ') : '—'} />
            <InfoTile
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Status"
              value={config.configured ? 'Configured' : 'Incomplete'}
              tone={config.configured ? 'ok' : 'warn'}
            />
          </div>

          {/* How-to */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#0f172a]">
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
              <ListChecks className="h-4 w-4 text-teal-500" /> How to connect
            </h2>
            <ol className="mt-4 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              {[
                'Click “Copy Webhook” above to put the URL on your clipboard.',
                'Open your SuperChat BD dashboard → Settings → Webhooks / Callback URL.',
                'Paste the URL, enable the payment events you need, and save.',
                'Use “Register” to auto-subscribe here, then “List” to confirm it appears.',
              ].map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-500/15 text-[11px] font-bold text-teal-600 dark:text-teal-300">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>Keep this URL private — anyone with it can post fake payment events. The signature secret protects you.</span>
            </div>
          </div>

          {/* Registered webhooks */}
          {webhooks && (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs dark:border-slate-800 dark:bg-[#0f172a]">
              <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
                <Webhook className="h-4 w-4 text-teal-500" /> Registered Webhooks
              </h2>
              <pre className="mt-3 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-950 p-3 text-[11px] leading-relaxed text-emerald-300 dark:border-slate-800">
{JSON.stringify(webhooks, null, 2)}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
};

function InfoTile({
  icon,
  label,
  value,
  mono,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  tone?: 'ok' | 'warn';
}) {
  const toneCls =
    tone === 'ok'
      ? 'text-emerald-600 dark:text-emerald-300'
      : tone === 'warn'
        ? 'text-amber-600 dark:text-amber-300'
        : 'text-slate-900 dark:text-slate-100';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-[#0f172a]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-500/10 text-slate-500">{icon}</span>
      </div>
      <div className={`mt-2 truncate text-sm font-bold ${mono ? 'font-mono text-xs' : ''} ${toneCls}`} title={value}>{value}</div>
    </div>
  );
}

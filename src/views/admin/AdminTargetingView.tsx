import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Target,
  Save,
  RefreshCw,
  Globe2,
  Smartphone,
  Monitor,
  Tablet,
  Chrome,
  Compass,
  Apple,
  Layers,
  Activity,
  TrendingUp,
  Zap,
  ShieldCheck,
  Clock,
  Gauge,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Flame,
  Wifi,
  Sparkles,
  MousePointerClick,
} from 'lucide-react';
import { CountryFlag } from '../../components/ui/CountryFlag';
import { InfoCallout } from '../../components/rayobyte/InfoCallout';
import { useToast } from '../../components/ui/Toast';
import { apiAdminGetTargeting, apiAdminSaveTargeting, apiAdminFetchProxies } from '../../services/api';

/* ──────────────────────────────────────────────────────────────────────────
   V36 — Global Targeting Engine control surface
   Country / Device / Browser / OS pick-rates + on/off toggles + live stats.
   ────────────────────────────────────────────────────────────────────────── */

type Dim = 'country' | 'device' | 'browser' | 'os';

interface DimMeta { key: string; label: string }

interface TargetRow {
  key: string;
  label: string;
  weight: number;
  enabled: boolean;
  stat?: { total: number; ok: number; fail: number };
  flag?: string;
  icon?: React.ReactNode;
  highCpm?: boolean;
}

interface TargetingData {
  settings: any;
  stats: any;
  countries: Record<string, { name: string; flag: string }>;
  dimensions: { device: DimMeta[]; browser: DimMeta[]; os: DimMeta[] };
  highCpmCountries: string[];
}

const DIM_TABS: { id: Dim; label: string; icon: React.ReactNode; hint: string }[] = [
  { id: 'country', label: 'Countries', icon: <Globe2 className="w-4 h-4" />, hint: 'Where your impressions land' },
  { id: 'device', label: 'Devices', icon: <Smartphone className="w-4 h-4" />, hint: 'Mobile · Desktop · Tablet' },
  { id: 'browser', label: 'Browsers', icon: <Chrome className="w-4 h-4" />, hint: 'Chrome · Safari · Edge · Yandex · Firefox' },
  { id: 'os', label: 'Operating Systems', icon: <Layers className="w-4 h-4" />, hint: 'Android · Windows · macOS · iOS · iPadOS' },
];

const DEVICE_ICON: Record<string, React.ReactNode> = {
  mobile: <Smartphone className="w-4 h-4" />,
  desktop: <Monitor className="w-4 h-4" />,
  tablet: <Tablet className="w-4 h-4" />,
};

const OS_ICON: Record<string, React.ReactNode> = {
  android: <Smartphone className="w-4 h-4" />,
  windows: <Monitor className="w-4 h-4" />,
  macos: <Apple className="w-4 h-4" />,
  ios: <Apple className="w-4 h-4" />,
  ipados: <Tablet className="w-4 h-4" />,
};

const BROWSER_ICON: Record<string, React.ReactNode> = {
  chrome: <Chrome className="w-4 h-4" />,
  chrome_mobile: <Chrome className="w-4 h-4" />,
  safari: <Compass className="w-4 h-4" />,
  mobile_safari: <Compass className="w-4 h-4" />,
  yandex: <Globe2 className="w-4 h-4" />,
  edge: <Globe2 className="w-4 h-4" />,
  firefox: <Flame className="w-4 h-4" />,
};

/** Human label for a dimension key (falls back to a title-cased key). */
function prettyKey(dim: Dim, key: string, data: TargetingData | null): string {
  if (dim === 'country') {
    const c = data?.countries?.[key] || data?.countries?.[String(key).toUpperCase()];
    return c?.name ? `${c.name}` : String(key).toUpperCase();
  }
  const list = (data?.dimensions?.[dim as 'device' | 'browser' | 'os'] || []) as DimMeta[];
  const found = list.find((d) => d.key === key);
  if (found) return found.label;
  return key.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

/** Emoji flag for a country key. */
function codeToEmoji(code: string): string {
  const cc = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  try { return String.fromCodePoint(...[...cc].map((c) => 127397 + c.charCodeAt(0))); } catch { return ''; }
}
function countryFlag(data: TargetingData | null, code: string): string {
  const cc = String(code || '').toUpperCase();
  return data?.countries?.[cc]?.flag || data?.countries?.[code]?.flag || codeToEmoji(cc);
}

/* ── A single animated pick-rate row ─────────────────────────────────────── */
const RateRow: React.FC<{
  dim: Dim;
  itemKey: string;
  label: string;
  flag?: string;
  icon?: React.ReactNode;
  weight: number;
  enabled: boolean;
  stat?: { total: number; ok: number; fail: number };
  highCpm?: boolean;
  index: number;
  onWeight: (k: string, v: number) => void;
  onToggle: (k: string, v: boolean) => void;
}> = ({ dim, itemKey, label, flag, icon, weight, enabled, stat, highCpm, index, onWeight, onToggle }) => {
  const total = stat?.total || 0;
  const ok = stat?.ok || 0;
  const rate = total > 0 ? Math.round((ok / total) * 100) : 0;

  return (
    <div
      className={`pn-row-in group rounded-xl border p-3 transition-all ${
        enabled
          ? 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:border-teal-300 dark:hover:border-teal-700/70'
          : 'border-slate-200/60 dark:border-slate-800/60 bg-slate-50/60 dark:bg-slate-900/20 opacity-70'
      }`}
      style={{ animationDelay: `${Math.min(index * 24, 480)}ms` }}
    >
      <div className="flex items-center gap-3">
        {/* Identity */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg ${enabled ? 'bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
            {flag ? <CountryFlag code={itemKey} flag={flag} size="sm" animated={enabled} /> : (icon || <Globe2 className="w-4 h-4" />)}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{label}</span>
              {highCpm && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300" title="High-CPM country — boosted automatically">
                  <Flame className="w-2.5 h-2.5" /> HIGH CPM
                </span>
              )}
            </div>
            <span className="text-[10px] font-mono text-slate-400">{itemKey}</span>
          </div>
        </div>

        {/* Live stats */}
        <div className="hidden sm:flex items-center gap-3 shrink-0">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Impressions</div>
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums pn-stat-pop" key={`t-${itemKey}-${total}`}>{total.toLocaleString()}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Success</div>
            <div className={`text-sm font-bold tabular-nums ${rate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : rate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-500'}`}>{rate}%</div>
          </div>
          <div className="w-16">
            <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full pn-bar-grow ${rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${rate}%` }}
              />
            </div>
            <div className="text-[9px] text-slate-400 text-center mt-0.5 tabular-nums">{ok.toLocaleString()} ok</div>
          </div>
        </div>

        {/* On/off toggle */}
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onToggle(itemKey, !enabled)}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors cursor-pointer ${enabled ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-700'}`}
          title={enabled ? 'Enabled — click to pause' : 'Disabled — click to enable'}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-5' : ''}`} />
        </button>
      </div>

      {/* Pick-rate slider */}
      <div className="mt-2.5 flex items-center gap-3">
        <span className="text-[10px] font-semibold text-slate-400 w-16 shrink-0">Pick-rate</span>
        <input
          type="range"
          min={0}
          max={100}
          value={weight}
          disabled={!enabled}
          onChange={(e) => onWeight(itemKey, Number(e.target.value))}
          className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-teal-500 disabled:opacity-40"
          style={{
            background: `linear-gradient(to right, #14b8a6 ${weight}%, rgba(148,163,184,0.28) ${weight}%)`,
          }}
        />
        <div className="flex items-center gap-1 shrink-0">
          <input
            type="number"
            min={0}
            max={100}
            value={weight}
            disabled={!enabled}
            onChange={(e) => onWeight(itemKey, Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            className="w-14 px-1.5 py-1 text-[11px] font-mono text-center rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 disabled:opacity-40"
          />
          <span className="text-[10px] text-slate-400">%</span>
        </div>
      </div>
    </div>
  );
};

/* ── Small animated stat pill ────────────────────────────────────────────── */
const StatPill: React.FC<{ icon: React.ReactNode; label: string; value: string; tone?: string }> = ({ icon, label, value, tone = 'text-slate-800 dark:text-slate-100' }) => (
  <div className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40">
    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-600 dark:text-teal-400">{icon}</span>
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${tone}`}>{value}</div>
    </div>
  </div>
);

export const AdminTargetingView: React.FC = () => {
  const { showToast } = useToast();
  const [data, setData] = useState<TargetingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<Dim>('country');
  const [dirty, setDirty] = useState(false);
  const [live, setLive] = useState(true);
  const [lastSync, setLastSync] = useState<number>(0);
  // Country codes that actually have a proxy added. Country pick-rates are limited
  // to these so the admin only ever tunes geo the engine can really deliver.
  const [proxyCountries, setProxyCountries] = useState<Set<string>>(new Set());
  const [proxyCount, setProxyCount] = useState<number>(0);

  // Working copy of the settings (edited locally, persisted on Save)
  const [form, setForm] = useState<any>(null);
  const formRef = useRef<any>(null);
  useEffect(() => { formRef.current = form; }, [form]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [res, proxyRes] = await Promise.all([
        apiAdminGetTargeting(),
        apiAdminFetchProxies().catch(() => ({ proxies: [] as any[] })),
      ]);
      setData(res);
      const pc = new Set<string>();
      const list = (proxyRes?.proxies || []) as any[];
      for (const p of list) {
        const raw = p?.country || p?.country_meta?.code || p?.countryCode || '';
        const c = String(raw).trim().toUpperCase();
        if (/^[A-Z]{2}$/.test(c)) pc.add(c);
      }
      setProxyCountries(pc);
      setProxyCount(list.length);
      // Only overwrite the editable form when the user has no unsaved edits
      if (!silent || !formRef.current || !dirty) {
        const next = JSON.parse(JSON.stringify(res.settings || {}));
        // Keep every proxy country ON by default (an explicit admin disable is respected).
        const ce = { ...(next.country_enabled || {}) };
        for (const c of pc) if (ce[c] === undefined) ce[c] = true;
        next.country_enabled = ce;
        setForm(next);
        if (!silent) setDirty(false);
      }
      setLastSync(Date.now());
    } catch (e: any) {
      if (!silent) showToast('Load Failed', e?.message || 'Could not load targeting engine.', 'error');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [dirty, showToast]);

  useEffect(() => { void load(false); /* eslint-disable-next-line */ }, []);

  // Live stats polling (silent)
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => { void load(true); }, 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line
  }, [live, load]);

  const setField = (k: string, v: any) => { setForm((f: any) => ({ ...f, [k]: v })); setDirty(true); };
  const setWeight = (dim: Dim, k: string, v: number) => {
    const wKey = `${dim}_weights`;
    setForm((f: any) => ({ ...f, [wKey]: { ...(f[wKey] || {}), [k]: v } }));
    setDirty(true);
  };
  const setEnabled = (dim: Dim, k: string, v: boolean) => {
    const eKey = `${dim}_enabled`;
    setForm((f: any) => ({ ...f, [eKey]: { ...(f[eKey] || {}), [k]: v } }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!form || saving) return;
    setSaving(true);
    try {
      const saved = await apiAdminSaveTargeting(form);
      setData((d) => (d ? { ...d, settings: saved } : d));
      setForm(JSON.parse(JSON.stringify(saved)));
      setDirty(false);
      showToast('Targeting Saved', 'Pick-rates & toggles are now live in the traffic worker.', 'success');
    } catch (e: any) {
      showToast('Save Failed', e?.message || 'Could not save targeting settings.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!data) return;
    setForm(JSON.parse(JSON.stringify(data.settings || {})));
    setDirty(false);
    showToast('Reverted', 'Unsaved changes discarded.', 'info');
  };

  /* ── Derived: the list of rows for the active dimension ──────────────── */
  const rows = useMemo<TargetRow[]>(() => {
    if (!form) return [];
    const wKey = `${tab}_weights`;
    const eKey = `${tab}_enabled`;
    const weights: Record<string, number> = form[wKey] || {};
    const enabledMap: Record<string, boolean> = form[eKey] || {};
    const stats = data?.stats?.[tab] || {};
    const highCpm = new Set(data?.highCpmCountries || []);

    if (tab === 'country') {
      const all = data?.countries || {};
      // ONLY show countries that actually have a proxy added — everything else is
      // hidden so the pick-rate list matches what the engine can truly deliver.
      const keys = Array.from(new Set([...proxyCountries, ...Object.keys(all), ...Object.keys(weights), ...Object.keys(stats)]))
        .filter((k) => proxyCountries.has(String(k).toUpperCase()));
      return keys
        .map((k) => ({
          key: k,
          label: prettyKey('country', k, data),
          flag: countryFlag(data, k),
          weight: weights[k] != null ? Number(weights[k]) : 1,
          enabled: enabledMap[k] !== false,
          stat: stats[k],
          highCpm: highCpm.has(k),
        }))
        .sort((a, b) => (b.weight - a.weight) || a.label.localeCompare(b.label));
    }

    const dimList = (data?.dimensions?.[tab as 'device' | 'browser' | 'os'] || []) as DimMeta[];
    const iconMap = tab === 'device' ? DEVICE_ICON : tab === 'os' ? OS_ICON : BROWSER_ICON;
    return dimList.map((d) => ({
      key: d.key,
      label: d.label,
      icon: iconMap[d.key] || <Globe2 className="w-4 h-4" />,
      weight: weights[d.key] != null ? Number(weights[d.key]) : 1,
      enabled: enabledMap[d.key] !== false,
      stat: stats[d.key],
    }));
  }, [form, tab, data, proxyCountries]);

  /* ── Aggregate live totals ───────────────────────────────────────────── */
  const totals = useMemo(() => {
    const s: any = data?.stats || {};
    const sum = (dim: string): { total: number; ok: number; fail: number } => {
      const bucket: any = s[dim] || {};
      return Object.keys(bucket).reduce(
        (acc: { total: number; ok: number; fail: number }, k: string) => {
          const v: any = bucket[k] || {};
          acc.total += Number(v.total) || 0;
          acc.ok += Number(v.ok) || 0;
          acc.fail += Number(v.fail) || 0;
          return acc;
        },
        { total: 0, ok: 0, fail: 0 }
      );
    };
    const c = sum('country');
    const d = sum('device');
    const b = sum('browser');
    const o = sum('os');
    const grandTotal = Math.max(c.total, d.total, b.total, o.total);
    const grandOk = Math.max(c.ok, d.ok, b.ok, o.ok);
    const rate = grandTotal > 0 ? Math.round((grandOk / grandTotal) * 100) : 0;
    return { c, d, b, o, grandTotal, grandOk, rate };
  }, [data]);

  const dwellMinSec = form ? Math.round((Number(form.dwell_min_ms) || 30000) / 1000) : 30;
  const dwellMaxSec = form ? Math.round((Number(form.dwell_max_ms) || 45000) / 1000) : 45;

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
          <span className="text-xs font-semibold text-slate-500">Loading targeting engine…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-xs">
        <div className="absolute inset-0 opacity-[0.05] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, #14b8a6 0, transparent 45%), radial-gradient(circle at 80% 60%, #0ea5e9 0, transparent 45%)' }} />
        <div className="relative">
          <div className="flex items-center gap-2">
            <span className="relative inline-flex items-center justify-center w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400 pn-target-pulse">
              <Target className="w-4 h-4" />
            </span>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Global Targeting Engine</h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
            Control exactly where and how your impressions are delivered. Pick-rates bias the worker toward the
            countries, devices, browsers and operating systems you want — higher rate = more traffic.
          </p>
        </div>

        <div className="relative flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setLive((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${live ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}
            title="Toggle live stats polling"
          >
            <span className={`w-2 h-2 rounded-full ${live ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            {live ? 'Live' : 'Paused'}
          </button>

          <button
            type="button"
            onClick={() => void load(false)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>

          {dirty && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Revert
            </button>
          )}

          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !dirty}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg text-white transition-all cursor-pointer shadow-xs ${dirty ? 'bg-teal-600 hover:bg-teal-700' : 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed'} ${saving ? 'opacity-70' : ''}`}
          >
            {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}
          </button>
        </div>
      </div>

      {/* ── Live aggregate stats ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatPill icon={<MousePointerClick className="w-4 h-4" />} label="Total Impressions" value={totals.grandTotal.toLocaleString()} />
        <StatPill icon={<CheckCircle2 className="w-4 h-4" />} label="Successful Visits" value={totals.grandOk.toLocaleString()} tone="text-emerald-600 dark:text-emerald-400" />
        <StatPill icon={<Gauge className="w-4 h-4" />} label="Success Rate" value={`${totals.rate}%`} tone={totals.rate >= 80 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'} />
        <StatPill icon={<Clock className="w-4 h-4" />} label="Visit Window" value={`${dwellMinSec}–${dwellMaxSec}s`} tone="text-sky-600 dark:text-sky-400" />
      </div>

      <InfoCallout
        type="success"
        title="CPM $2–3 guardrail is ON"
        message="The worker biases delivery toward high-CPM countries (US, GB, CA, AU, DE…) and premium desktop/Chrome/Safari identities. Smart Data Saver + the upgraded human-behaviour engine keep every visit Adsterra-safe and 30–45s long."
      />

      {/* ── Global controls ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-xs overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <Zap className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">Global Engine Controls</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
          {/* Toggles */}
          <div className="space-y-3">
            {[
              { k: 'enabled', label: 'Targeting engine master switch', desc: 'Turn the whole weighted-targeting system on/off', icon: <Target className="w-4 h-4" /> },
              { k: 'proxy_country_match', label: 'Match geo to CPM booster country', desc: 'Impressions land in the CPM booster’s exit country', icon: <Globe2 className="w-4 h-4" /> },
              { k: 'cpm_optimize', label: 'CPM $2–3 optimizer', desc: 'Bias toward high-CPM countries & premium identities', icon: <TrendingUp className="w-4 h-4" /> },
              { k: 'smart_data_saver', label: 'Smart Data Saver', desc: 'Block heavy assets so visits are fast & cheap', icon: <Wifi className="w-4 h-4" /> },
            ].map((row) => (
              <label key={row.k} className="flex items-center gap-3 cursor-pointer group">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 group-hover:text-teal-600 transition-colors">{row.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">{row.label}</span>
                  <span className="block text-[10px] text-slate-400">{row.desc}</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!form?.[row.k]}
                  onClick={() => setField(row.k, !form?.[row.k])}
                  className={`relative shrink-0 w-11 h-6 rounded-full transition-colors cursor-pointer ${form?.[row.k] ? 'bg-teal-500' : 'bg-slate-300 dark:bg-slate-700'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${form?.[row.k] ? 'translate-x-5' : ''}`} />
                </button>
              </label>
            ))}
          </div>

          {/* Numbers */}
          <div className="space-y-4">
            {/* Dwell window */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200"><Clock className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" /> Visit duration window</span>
                <span className="text-[11px] font-mono font-bold text-teal-600 dark:text-teal-400">{dwellMinSec}s – {dwellMaxSec}s</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Min (sec)</label>
                  <input type="number" min={15} max={120} value={dwellMinSec}
                    onChange={(e) => setField('dwell_min_ms', Math.max(15, Math.min(120, Number(e.target.value) || 30)) * 1000)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Max (sec)</label>
                  <input type="number" min={15} max={180} value={dwellMaxSec}
                    onChange={(e) => setField('dwell_max_ms', Math.max(15, Math.min(180, Number(e.target.value) || 45)) * 1000)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" />
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Recommended: 30–45 seconds — the sweet spot for a successful, Adsterra-safe visit.</p>
            </div>

            {/* CPM target */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200"><TrendingUp className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" /> CPM target range ($)</span>
                <span className="text-[11px] font-mono font-bold text-teal-600 dark:text-teal-400">${Number(form?.cpm_target_min ?? 2).toFixed(2)} – ${Number(form?.cpm_target_max ?? 3).toFixed(2)}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" step="0.1" min={0} max={50} value={form?.cpm_target_min ?? 2}
                  onChange={(e) => setField('cpm_target_min', Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" />
                <input type="number" step="0.1" min={0} max={50} value={form?.cpm_target_max ?? 3}
                  onChange={(e) => setField('cpm_target_max', Number(e.target.value) || 0)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100" />
              </div>
            </div>

            {/* Human level */}
            <div>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5"><Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" /> Human-behaviour level</span>
              <div className="grid grid-cols-4 gap-2">
                {['off', 'normal', 'high', 'ultra'].map((lvl) => (
                  <button key={lvl} type="button" onClick={() => setField('human_level', lvl)}
                    className={`px-2 py-2 text-[11px] font-semibold rounded-lg capitalize transition-all cursor-pointer ${form?.human_level === lvl ? 'bg-teal-600 text-white shadow-xs' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                    {lvl}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Dimension tabs ─────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-xs overflow-hidden">
        <div className="flex flex-wrap items-center gap-1.5 p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
          {DIM_TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer ${tab === t.id ? 'bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-xs' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              {t.icon}
              {t.label}
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">
                {tab === t.id ? rows.length : ''}
              </span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 pr-1">
            {tab === 'country' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-900/60">
                <Globe2 className="w-3 h-3" /> {proxyCountries.size} CPM booster {proxyCountries.size === 1 ? 'country' : 'countries'}
              </span>
            )}
            <span className="hidden sm:inline text-[10px] text-slate-400">{DIM_TABS.find((t) => t.id === tab)?.hint}</span>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 lg:grid-cols-2 gap-3 max-h-[70vh] overflow-y-auto">
          {rows.length === 0 && (
            <div className="col-span-full text-center py-10 text-xs text-slate-400">No items in this dimension yet.</div>
          )}
          {rows.map((r, i) => (
            <RateRow
              key={`${tab}-${r.key}`}
              dim={tab}
              itemKey={r.key}
              label={r.label}
              flag={r.flag}
              icon={r.icon}
              weight={r.weight}
              enabled={r.enabled}
              stat={r.stat}
              highCpm={r.highCpm}
              index={i}
              onWeight={(k, v) => setWeight(tab, k, v)}
              onToggle={(k, v) => setEnabled(tab, k, v)}
            />
          ))}
        </div>

        {/* Footer summary */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            Weighted pick-rates — higher % means the worker chooses it more often. Disabled items never receive traffic.
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-teal-500" />
            {lastSync ? `Stats synced ${new Date(lastSync).toLocaleTimeString()}` : 'Waiting for stats…'}
          </span>
        </div>
      </div>

      {/* ── Per-dimension live breakdown ───────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(['country', 'device', 'browser', 'os'] as Dim[]).map((dim) => {
          const s = data?.stats?.[dim] || {};
          const entries = Object.entries(s).sort((a: any, b: any) => (b[1]?.total || 0) - (a[1]?.total || 0)).slice(0, 6);
          const meta = DIM_TABS.find((t) => t.id === dim)!;
          return (
            <div key={dim} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-teal-600 dark:text-teal-400">{meta.icon}</span>
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100">{meta.label} — Top performers</h3>
              </div>
              {entries.length === 0 ? (
                <p className="text-[11px] text-slate-400 py-3">No impressions recorded yet.</p>
              ) : (
                <div className="space-y-2">
                  {entries.map(([k, v]: any) => {
                    const tot = v?.total || 0;
                    const ok = v?.ok || 0;
                    const rate = tot > 0 ? Math.round((ok / tot) * 100) : 0;
                    return (
                      <div key={k} className="flex items-center gap-2.5">
                        <span className="w-6 shrink-0 inline-flex items-center justify-center">
                          {dim === 'country' ? <CountryFlag code={k} flag={countryFlag(data, k)} size="sm" /> : (DEVICE_ICON[k] || OS_ICON[k] || BROWSER_ICON[k] || <Globe2 className="w-3.5 h-3.5 text-slate-400" />)}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200 w-24 truncate">{prettyKey(dim, k, data)}</span>
                        <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div className={`h-full rounded-full pn-bar-grow ${rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${rate}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 w-20 text-right tabular-nums">{ok.toLocaleString()}/{tot.toLocaleString()}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky save bar when dirty */}
      {dirty && (
        <div className="sticky bottom-4 z-30 flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-teal-200 dark:border-teal-900/60 bg-teal-50/95 dark:bg-teal-950/80 backdrop-blur shadow-lg pn-row-in">
          <span className="inline-flex items-center gap-2 text-xs font-semibold text-teal-800 dark:text-teal-200">
            <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" /> You have unsaved targeting changes.
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleReset} className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer">Revert</button>
            <button type="button" onClick={() => void handleSave()} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer">
              {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} Save now
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminTargetingView;

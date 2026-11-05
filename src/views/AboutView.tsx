import React from 'react';
import {
  Sparkles,
  Rocket,
  ShieldCheck,
  Globe2,
  Zap,
  Gauge,
  Layers,
  Activity,
  Target,
  BadgeCheck,
  Server,
  HeartHandshake,
  TrendingUp,
  Lock,
  Cpu,
} from 'lucide-react';
import { BrandLogo } from '../components/brand/BrandLogo';
import { DevCredit } from '../components/brand/DevCredit';
import { TelegramIcon, TELEGRAM_GROUP_URL } from '../components/ui/TelegramIcon';

interface AboutViewProps {
  onNavigate?: (view: string) => void;
}

const APP_VERSION = 'v2.0 · Liquid Glass Edition';

const FEATURES: { icon: React.FC<{ className?: string }>; title: string; body: string; tint: string }[] = [
  {
    icon: Zap,
    title: 'SmartLink Engine',
    body: 'Direct Adsterra placements delivered through pixel-confirmed sessions, with strict referral safety so your account trust score stays protected.',
    tint: 'text-amber-500',
  },
  {
    icon: Globe2,
    title: 'Normal Link Delivery',
    body: 'Any landing page gets organic, search-referred visits that look like real human curiosity — no shortcuts, no footprints.',
    tint: 'text-teal-500',
  },
  {
    icon: Cpu,
    title: 'CPM Booster Network',
    body: 'A rotating pool of CPM boosters keeps every visit clean, unique and geographically diverse, so delivery stays healthy around the clock.',
    tint: 'text-indigo-500',
  },
  {
    icon: Gauge,
    title: 'Real-Time Monitoring',
    body: 'Watch every delivery land live — dwell time, region, funnel stage and credit usage — updated the moment an impression is confirmed.',
    tint: 'text-cyan-500',
  },
  {
    icon: ShieldCheck,
    title: 'Safety First',
    body: 'Fingerprint isolation, human-like behaviour and domain whitelisting work together to keep campaigns stable and ban-free.',
    tint: 'text-emerald-500',
  },
  {
    icon: TrendingUp,
    title: 'High CPM Focus',
    body: 'Traffic is weighted toward premium geographies and high-value devices so your effective CPM stays in the strongest band.',
    tint: 'text-rose-500',
  },
];

const STEPS: { icon: React.FC<{ className?: string }>; step: string; title: string; body: string }[] = [
  {
    icon: Layers,
    step: '01',
    title: 'Add your links',
    body: 'Drop in a normal landing page or a SmartLink placement. The system validates reachability before it ever goes live.',
  },
  {
    icon: Target,
    step: '02',
    title: 'Set a campaign',
    body: 'Choose a delivery limit, pick your traffic mode, and start. The engine auto-stops the moment your target is reached.',
  },
  {
    icon: Activity,
    step: '03',
    title: 'Watch it deliver',
    body: 'Confirmed impressions stream into your live monitor and history — newest first, with full funnel detail on every row.',
  },
  {
    icon: BadgeCheck,
    step: '04',
    title: 'Get paid & grow',
    body: 'Track earnings, climb the daily leaderboard, invite partners with your referral code, and scale what works.',
  },
];

export const AboutView: React.FC<AboutViewProps> = ({ onNavigate }) => {
  return (
    <div className="space-y-6">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 lg-glass-strong p-6 sm:p-10">
        <div className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 w-72 h-72 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="relative flex flex-col items-center text-center gap-4">
          <BrandLogo size="xl" />
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300 text-[11px] font-semibold tracking-wide">
              <Sparkles className="w-3.5 h-3.5" />
              {APP_VERSION}
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
            X AD MARKETING
          </h1>
          <p className="max-w-2xl text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            A complete traffic network and SmartLink monetization platform. We help publishers and
            marketers deliver real, human-quality visits to any link — powered by our CPM booster
            network, organic funnel simulation and a pixel-confirmed delivery engine built for high
            CPM and long-term account safety.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              onClick={() => onNavigate?.('overview')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors cursor-pointer shadow-xs"
            >
              <Rocket className="w-3.5 h-3.5" />
              Go to Dashboard
            </button>
            <button
              onClick={() => onNavigate?.('support')}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 text-slate-700 dark:text-slate-200 hover:border-teal-400 transition-colors cursor-pointer"
            >
              <HeartHandshake className="w-3.5 h-3.5" />
              Contact Support
            </button>
            <a
              href={TELEGRAM_GROUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-[#229ED9] hover:bg-[#1d8dc2] text-white transition-colors cursor-pointer shadow-xs"
            >
              <TelegramIcon className="w-3.5 h-3.5" />
              Join Telegram Group
            </a>
          </div>
        </div>
      </div>

      {/* ── Feature grid ─────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-teal-500" />
          What makes the network different
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 shadow-xs hover:border-teal-400/60 transition-colors"
            >
              <span className={`inline-flex w-9 h-9 rounded-lg items-center justify-center bg-slate-100 dark:bg-slate-800 ${f.tint}`}>
                <f.icon className="w-4.5 h-4.5" />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{f.title}</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── How it works ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 sm:p-7 shadow-xs">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-5 flex items-center gap-2">
          <Layers className="w-4 h-4 text-teal-500" />
          How it works — four simple steps
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STEPS.map((s) => (
            <div key={s.step} className="relative rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-4">
              <span className="absolute top-3 right-3 font-mono text-2xl font-extrabold text-slate-200 dark:text-slate-700">
                {s.step}
              </span>
              <span className="inline-flex w-8 h-8 rounded-lg items-center justify-center bg-teal-500/10 text-teal-600 dark:text-teal-400">
                <s.icon className="w-4 h-4" />
              </span>
              <h3 className="mt-2.5 text-xs font-bold text-slate-900 dark:text-slate-100">{s.title}</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{s.body}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Trust strip ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: Server, label: 'Always-on delivery', value: '24 / 7' },
          { icon: Globe2, label: 'CPM booster pool', value: 'Multi-region' },
          { icon: Lock, label: 'Account safety', value: 'Ban-free' },
          { icon: Gauge, label: 'Delivery latency', value: '< 5s' },
        ].map((t) => (
          <div key={t.label} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-4 shadow-xs flex items-center gap-3">
            <span className="inline-flex w-9 h-9 rounded-lg items-center justify-center bg-teal-500/10 text-teal-600 dark:text-teal-400 shrink-0">
              <t.icon className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{t.value}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">{t.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Community (Telegram) ─────────────────────────────── */}
      <div className="relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 sm:p-6 rounded-2xl border border-[#229ED9]/30 bg-gradient-to-r from-[#229ED9]/10 via-sky-500/5 to-cyan-500/10">
        <div className="pointer-events-none absolute -top-16 -right-10 w-48 h-48 rounded-full bg-[#229ED9]/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#229ED9] text-white shadow-sm shrink-0">
            <TelegramIcon className="w-7 h-7" />
          </span>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Join our Telegram community</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Live help, CPM tips, feature updates and a direct line to the team — all in one group.
            </p>
          </div>
        </div>
        <a
          href={TELEGRAM_GROUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="relative inline-flex items-center justify-center gap-1.5 px-5 py-2.5 text-xs font-bold rounded-lg bg-[#229ED9] hover:bg-[#1d8dc2] text-white transition-colors cursor-pointer shadow-sm shrink-0"
        >
          <TelegramIcon className="w-3.5 h-3.5" />
          <span>Open Telegram Group</span>
        </a>
      </div>

      {/* ── Mission + developer ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 sm:p-6 shadow-xs">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Target className="w-4 h-4 text-teal-500" />
            Our mission
          </h2>
          <p className="mt-2 text-[12px] leading-relaxed text-slate-600 dark:text-slate-300">
            We believe great traffic should be simple, safe and measurable. X AD MARKETING exists to
            give every publisher — from a solo blogger to an agency — a reliable way to grow reach
            without risking their ad accounts. Every impression you see is real, verified and
            delivered by a human-quality engine that respects the rules of the networks it works
            with. No guesswork, no black boxes: just transparent delivery, live numbers and tools
            that help you scale what actually works.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {['Transparent delivery', 'Human-quality visits', 'Real-time analytics', 'Referral rewards'].map((tag) => (
              <span key={tag} className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
                {tag}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 sm:p-6 shadow-xs flex flex-col items-center justify-center text-center">
          <DevCredit variant="pill" />
          <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Designed, engineered and maintained end-to-end by our lead developer.
          </p>
          <div className="mt-3 text-[10px] font-mono text-slate-400">{APP_VERSION}</div>
        </div>
      </div>
    </div>
  );
};

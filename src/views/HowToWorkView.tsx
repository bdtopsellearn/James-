import React, { useEffect, useMemo, useState } from 'react';
import {
  PlayCircle,
  Youtube,
  ExternalLink,
  X,
  Sparkles,
  GraduationCap,
  Search,
  LifeBuoy,
  Rocket,
  Link as LinkIcon,
  Wallet,
  Zap,
  ChevronRight,
} from 'lucide-react';
import { HowToVideo } from '../types';
import { apiGetHowToVideos } from '../services/api';
import { TelegramIcon } from '../components/ui/TelegramIcon';

interface HowToWorkViewProps {
  videos: HowToVideo[];
  onNavigate?: (view: string) => void;
}

/* ── Platform helpers ─────────────────────────────────────────────────────── */
function youTubeId(url: string): string | null {
  const u = String(url || '').trim();
  if (!u) return null;
  const m = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{6,})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(u)) return u;
  return null;
}

function isTelegram(url: string): boolean {
  return /(?:^https?:\/\/)?(?:t\.me|telegram\.me|telegram\.org)\//i.test(String(url || '').trim());
}

function youTubeThumb(url: string): string | null {
  const id = youTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

type Platform = 'youtube' | 'telegram' | 'other' | 'empty';
function platformOf(url: string): Platform {
  const u = String(url || '').trim();
  if (!u) return 'empty';
  if (youTubeId(u)) return 'youtube';
  if (isTelegram(u)) return 'telegram';
  return 'other';
}

/* ── Quick-start steps (static, always useful) ────────────────────────────── */
const QUICK_STEPS: { icon: React.FC<{ className?: string }>; title: string; body: string }[] = [
  { icon: Rocket, title: 'Create your account', body: 'Sign up, verify your email and claim your free welcome credits.' },
  { icon: LinkIcon, title: 'Add a link', body: 'Add a Normal Link or connect your Adsterra SmartLink.' },
  { icon: Zap, title: 'Set a target & start', body: 'Choose how many impressions you want, then start the stream.' },
  { icon: Wallet, title: 'Watch & earn', body: 'Track live delivery and earnings from your dashboard.' },
];

export const HowToWorkView: React.FC<HowToWorkViewProps> = ({ videos, onNavigate }) => {
  const [items, setItems] = useState<HowToVideo[]>(() => (Array.isArray(videos) ? videos : []));
  const [activeCat, setActiveCat] = useState<string>('All');
  const [query, setQuery] = useState('');
  const [playing, setPlaying] = useState<HowToVideo | null>(null);

  // Mirror parent state (server-driven) whenever it changes.
  useEffect(() => {
    if (Array.isArray(videos)) setItems(videos);
  }, [videos]);

  // Fallback: if the parent has nothing yet (e.g. a fresh session), pull the
  // public list once so the screen is never mysteriously empty.
  useEffect(() => {
    if (items.length > 0) return;
    let alive = true;
    apiGetHowToVideos()
      .then((list) => { if (alive && list.length) setItems(list); })
      .catch(() => { /* ignore */ });
    return () => { alive = false; };
  }, [items.length]);

  // Close the lightbox on Escape.
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlaying(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing]);

  const enabled = useMemo(() => items.filter((v) => v.enabled !== false), [items]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    enabled.forEach((v) => set.add((v.category || 'General').trim() || 'General'));
    return ['All', ...Array.from(set)];
  }, [enabled]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enabled
      .filter((v) => activeCat === 'All' || ((v.category || 'General').trim() || 'General') === activeCat)
      .filter((v) => !q || `${v.title} ${v.description || ''} ${v.category || ''}`.toLowerCase().includes(q))
      .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  }, [enabled, activeCat, query]);

  const open = (v: HowToVideo) => {
    const p = platformOf(v.url);
    if (p === 'empty') return;
    if (p === 'youtube') { setPlaying(v); return; }
    // Telegram / other → open in a new tab.
    try { window.open(v.url, '_blank', 'noopener,noreferrer'); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      {/* ── Hero ── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-teal-500/10 via-emerald-500/5 to-cyan-500/10 dark:from-teal-500/10 dark:via-emerald-500/5 dark:to-cyan-500/10 p-6 sm:p-8">
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-teal-500/25 shrink-0">
            <GraduationCap className="w-7 h-7 text-white" />
          </div>
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400 mb-1">
              <Sparkles className="w-3 h-3" />
              <span>Video Guides</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-slate-50">
              How to Work
            </h1>
            <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1.5 max-w-2xl">
              Watch step-by-step guides on how everything works — from getting started to opening your Adsterra account and starting your first stream.
            </p>
          </div>
        </div>
      </div>

      {/* ── Quick-start steps ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {QUICK_STEPS.map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-4 shadow-xs">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-7 h-7 rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4" />
                </span>
                <span className="text-[10px] font-mono font-bold text-slate-400">STEP {i + 1}</span>
              </div>
              <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">{s.title}</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{s.body}</p>
            </div>
          );
        })}
      </div>

      {/* ── Toolbar: search + category filter ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search guides…"
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
        {categories.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setActiveCat(c)}
                className={`px-3 py-1.5 text-[11px] font-semibold rounded-full border transition-colors cursor-pointer ${
                  activeCat === c
                    ? 'bg-teal-600 border-teal-600 text-white'
                    : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Video grid ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
          <PlayCircle className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-3">No guides available yet</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {enabled.length === 0
              ? 'The team is preparing video guides. Please check back soon.'
              : 'No guide matches your search. Try a different keyword or category.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((v) => {
            const p = platformOf(v.url);
            const thumb = youTubeThumb(v.url);
            const clickable = p !== 'empty';
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => open(v)}
                disabled={!clickable}
                className={`group text-left rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-xs transition-all ${
                  clickable ? 'hover:-translate-y-0.5 hover:shadow-lg hover:border-teal-400/60 cursor-pointer' : 'opacity-80 cursor-default'
                }`}
              >
                {/* Thumbnail */}
                <div className="relative aspect-video bg-slate-100 dark:bg-slate-900 overflow-hidden">
                  {thumb ? (
                    <img src={thumb} alt={v.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  ) : (
                    <div className={`w-full h-full flex items-center justify-center ${p === 'telegram' ? 'bg-gradient-to-br from-sky-500/15 to-cyan-500/10' : 'bg-gradient-to-br from-slate-500/10 to-slate-700/10'}`}>
                      {p === 'telegram' ? <TelegramIcon className="w-10 h-10 text-sky-500" /> : p === 'other' ? <LinkIcon className="w-10 h-10 text-slate-400" /> : <PlayCircle className="w-10 h-10 text-slate-300 dark:text-slate-600" />}
                    </div>
                  )}

                  {/* Play overlay for YouTube */}
                  {p === 'youtube' && (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="w-12 h-12 rounded-full bg-black/55 backdrop-blur-xs flex items-center justify-center group-hover:bg-rose-600 transition-colors">
                        <PlayCircle className="w-7 h-7 text-white" />
                      </span>
                    </span>
                  )}

                  {/* Platform badge */}
                  <span className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide text-white ${
                    p === 'youtube' ? 'bg-rose-600' : p === 'telegram' ? 'bg-sky-500' : 'bg-slate-600'
                  }`}>
                    {p === 'youtube' ? <Youtube className="w-3 h-3" /> : p === 'telegram' ? <TelegramIcon className="w-3 h-3" /> : <LinkIcon className="w-3 h-3" />}
                    {p === 'youtube' ? 'YouTube' : p === 'telegram' ? 'Telegram' : p === 'empty' ? 'Soon' : 'Link'}
                  </span>

                  {v.category && (
                    <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-semibold bg-black/50 text-white backdrop-blur-xs">
                      {v.category}
                    </span>
                  )}
                </div>

                {/* Body */}
                <div className="p-4">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug line-clamp-2">
                    {v.title || 'Untitled guide'}
                  </h3>
                  {v.description && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">{v.description}</p>
                  )}
                  <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-teal-600 dark:text-teal-400">
                    {p === 'empty' ? (
                      <span className="text-slate-400 dark:text-slate-500">Awaiting link…</span>
                    ) : p === 'youtube' ? (
                      <><PlayCircle className="w-3.5 h-3.5" /> Watch now</>
                    ) : (
                      <><ExternalLink className="w-3.5 h-3.5" /> Open guide</>
                    )}
                    {clickable && <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Help CTA ── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <LifeBuoy className="w-5 h-5" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Still stuck?</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Our support desk is one tap away — open a ticket and we’ll help you out.</p>
          </div>
        </div>
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('support')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer shrink-0"
          >
            <LifeBuoy className="w-3.5 h-3.5" />
            <span>Contact Support</span>
          </button>
        )}
      </div>

      {/* ── YouTube lightbox ── */}
      {playing && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setPlaying(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="relative w-full max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPlaying(null)}
              aria-label="Close video"
              className="absolute -top-10 right-0 inline-flex items-center gap-1.5 text-white/80 hover:text-white text-xs font-semibold cursor-pointer"
            >
              <X className="w-4 h-4" /> Close
            </button>
            <div className="aspect-video w-full rounded-xl overflow-hidden bg-black shadow-2xl">
              <iframe
                title={playing.title}
                src={`https://www.youtube.com/embed/${youTubeId(playing.url)}?autoplay=1&rel=0&modestbranding=1`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </div>
            <div className="mt-3 text-white">
              <h3 className="text-sm font-bold">{playing.title}</h3>
              {playing.description && <p className="text-xs text-white/70 mt-0.5">{playing.description}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

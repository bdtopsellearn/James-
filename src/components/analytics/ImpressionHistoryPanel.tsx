import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownWideNarrow,
  CheckCircle,
  XCircle,
  Globe2,
  Clock,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Inbox,
} from 'lucide-react';
import { LiveImpression } from '../../types';
import { dhakaDateKey } from '../../lib/timezone';
import { CountryFlag } from '../ui/CountryFlag';

interface ImpressionHistoryPanelProps {
  /** Every impression the member has, across both channels. */
  impressions: LiveImpression[];
  /** Only show rows for this channel. */
  linkType: 'normal' | 'smartlink';
  /** Optional heading override. */
  title?: string;
  /** Optional subtitle override. */
  subtitle?: string;
  /** How many rows to show before the "show all" toggle. Defaults to 8. */
  initialRows?: number;
}

const fmt = (n: number) => Number(n || 0).toLocaleString('en-US');

/** Human friendly "x min ago" label in Dhaka time, falling back to a clock time. */
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!t || Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  if (diff < 0) return 'just now';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day > 1 ? 's' : ''} ago`;
  return dhakaDateKey(iso);
}

/**
 * A live, newest-first impression feed scoped to ONE channel (normal links OR
 * SmartLinks). It is intentionally self-contained so both link views can drop it
 * in without duplicating markup. Rows always render newest → oldest so the most
 * recent delivery is the first thing a member sees.
 */
export const ImpressionHistoryPanel: React.FC<ImpressionHistoryPanelProps> = ({
  impressions,
  linkType,
  title,
  subtitle,
  initialRows = 8,
}) => {
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Newest-first: sort a copy so we never mutate the shared array.
  const rows = useMemo(() => {
    return impressions
      .filter((i) => i.linkType === linkType)
      .slice()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [impressions, linkType]);

  const successCount = useMemo(() => rows.filter((r) => r.status === 'success').length, [rows]);
  const successRate = rows.length > 0 ? Math.round((successCount / rows.length) * 100) : null;
  const visible = showAll ? rows : rows.slice(0, initialRows);

  const isSmart = linkType === 'smartlink';
  const accent = isSmart ? 'amber' : 'teal';

  const heading =
    title || (isSmart ? 'SmartLink Impression History' : 'Normal Link Impression History');
  const sub =
    subtitle ||
    (isSmart
      ? 'Every SmartLink delivery, newest first — pixel-confirmed impressions only.'
      : 'Every normal-link delivery, newest first — organic funnel visits only.');

  return (
    <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Activity className={`w-4 h-4 ${isSmart ? 'text-amber-500' : 'text-teal-500'}`} />
            {heading}
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{sub}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-mono tabular-nums">
            {fmt(rows.length)} total
          </span>
          {successRate !== null && (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 font-mono tabular-nums">
              {successRate}% OK
            </span>
          )}
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400">
            <ArrowDownWideNarrow className="w-3 h-3" />
            Newest first
          </span>
        </div>
      </div>

      {/* Body */}
      {rows.length === 0 ? (
        <div className="p-10 flex flex-col items-center justify-center text-center">
          <Inbox className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            No {isSmart ? 'SmartLink' : 'normal-link'} impressions yet
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
            Start a campaign and confirmed deliveries will stream in here, newest on top.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {visible.map((item, idx) => {
            const isOk = item.status === 'success';
            const isExpanded = expandedId === item.id;
            const isFresh = idx === 0 && !showAll;
            return (
              <li key={item.id} className="group">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  className="w-full text-left px-4 py-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    {/* status dot */}
                    <span
                      className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                        isOk
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-50 dark:bg-rose-950/40 text-rose-500'
                      }`}
                    >
                      {isOk ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    </span>

                    {/* url + meta */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate">
                          {item.url.replace(/^https?:\/\//, '')}
                        </span>
                        {isFresh && (
                          <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${isSmart ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300'}`}>
                            Latest
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {relativeTime(item.timestamp)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Globe2 className="w-3 h-3" />
                          <CountryFlag code={item.proxyRegion} flag={item.proxyFlag} name={item.proxyCountry} size="sm" />
                          {item.proxyCountry || item.proxyRegion || '—'}
                        </span>
                        <span className="hidden sm:inline">{Math.round((item.dwellMs || 0) / 1000)}s dwell</span>
                        <span className={`${isSmart ? 'text-amber-600 dark:text-amber-400' : 'text-teal-600 dark:text-teal-400'}`}>
                          -{item.creditsDeducted} credit{item.creditsDeducted === 1 ? '' : 's'}
                        </span>
                      </div>
                    </div>

                    <span className="shrink-0 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-3 -mt-1">
                    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 p-3 space-y-1.5 text-[11px] font-mono">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-600 dark:text-slate-300">
                        <span><strong className="text-slate-400">Impression ID:</strong> {item.id}</span>
                        <span>
                          <strong className="text-slate-400">CPM Booster:</strong> {item.proxyUsed || '—'}
                          {item.proxyRegion ? (
                            <span className="inline-flex items-center gap-1 ml-1">
                              <CountryFlag code={item.proxyRegion} flag={item.proxyFlag} name={item.proxyCountry} size="sm" />
                              {item.proxyCountry || item.proxyRegion}
                            </span>
                          ) : null}
                        </span>
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        <strong className="text-slate-400">Funnel:</strong> {item.phaseCompleted || '—'}
                      </div>
                      <div className="text-slate-500 dark:text-slate-400">
                        <strong className="text-slate-400">Delivered:</strong> {new Date(item.timestamp).toLocaleString()}
                      </div>
                      {item.details && (
                        <div className="text-teal-700 dark:text-teal-300 pt-0.5 break-words">
                          <strong className="text-slate-400">Log:</strong> {item.details}
                        </div>
                      )}
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`inline-flex items-center gap-1 pt-1 font-sans font-semibold ${isSmart ? 'text-amber-600 dark:text-amber-400' : 'text-teal-600 dark:text-teal-400'} hover:underline`}
                      >
                        Open target <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Footer toggle */}
      {rows.length > initialRows && (
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex justify-center">
          <button
            type="button"
            onClick={() => setShowAll((s) => !s)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors cursor-pointer ${
              isSmart
                ? 'border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                : 'border-teal-200 dark:border-teal-900/60 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40'
            }`}
          >
            {showAll ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showAll ? 'Show recent only' : `Show all ${fmt(rows.length)} impressions`}
          </button>
        </div>
      )}
    </div>
  );
};

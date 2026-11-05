import React, { useState } from 'react';
import {
  History,
  Download,
  Filter,
  CheckCircle,
  XCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { LiveImpression } from '../types';
import { dhakaDateKey } from '../lib/timezone';
import { CountryFlag } from '../components/ui/CountryFlag';

import { useToast } from '../components/ui/Toast';
interface HistoryViewProps {
  impressions: LiveImpression[];
  totalImpressions?: number;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ impressions, totalImpressions = 0 }) => {
  const { showToast } = useToast();
  const [typeFilter, setTypeFilter] = useState<'all' | 'normal' | 'smartlink'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const lifetimeImpressions = Math.max(0, Math.floor(Number(totalImpressions) || 0));

  // Always newest-first: the most recent delivery is the first row on screen.
  const filtered = impressions
    .filter((imp) => {
      if (typeFilter !== 'all' && imp.linkType !== typeFilter) return false;
      if (statusFilter !== 'all' && imp.status !== statusFilter) return false;
      return true;
    })
    .slice()
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const exportCsv = () => {
    if (impressions.length === 0) {
      showToast('Nothing to export', 'There are no impressions in your history yet.', 'info');
      return;
    }

    const headers = ['ID', 'Timestamp', 'Type', 'URL', 'Status', 'DwellMs', 'CPM Booster', 'CreditsDeducted', 'Details'];
    const rows = filtered.map(i => [
      i.id,
      i.timestamp,
      i.linkType,
      `"${i.url.replace(/"/g, '""')}"`,
      i.status,
      i.dwellMs,
      i.proxyRegion,
      i.creditsDeducted,
      `"${(i.details || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pn_traffic_history_${dhakaDateKey()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header & Export Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Traffic Impression History
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Complete audit trail of delivered impressions, dwell times, and CPM booster regions — newest first.
          </p>
        </div>

        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors cursor-pointer shadow-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-3 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Type:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as any)}
              className="text-xs font-medium rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 px-2 py-1"
            >
              <option value="all">All Targets</option>
              <option value="normal">Normal Links</option>
              <option value="smartlink">SmartLinks</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-xs font-medium rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 px-2 py-1"
            >
              <option value="all">All Statuses</option>
              <option value="success">Success OK</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        <span className="text-xs font-mono text-slate-400">
          Showing {filtered.length} of {impressions.length} recent · {lifetimeImpressions.toLocaleString()} lifetime impressions
        </span>
      </div>

      {/* Paginated Table with Expandable Rows */}
      <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Target URL</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Dwell</th>
                <th className="py-3 px-4">Credits</th>
                <th className="py-3 px-4 text-right">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                    No impressions match the selected criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => {
                  const isExpanded = expandedId === item.id;
                  const isOk = item.status === 'success';

                  return (
                    <React.Fragment key={item.id}>
                      <tr
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                      >
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {new Date(item.timestamp).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded uppercase ${
                              item.linkType === 'smartlink'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                                : 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300'
                            }`}
                          >
                            {item.linkType}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200 max-w-[200px] truncate">
                          {item.url}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 font-semibold ${
                              isOk ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                            }`}
                          >
                            {isOk ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                            <span className="capitalize">{item.status}</span>
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {Math.round(item.dwellMs / 1000)}s
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums font-semibold text-teal-600 dark:text-teal-400">
                          -{item.creditsDeducted}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            aria-label={isExpanded ? 'Collapse details' : 'Expand details'}
                            onClick={(e) => { e.stopPropagation(); setExpandedId(isExpanded ? null : item.id); }}
                            className="text-slate-400 hover:text-slate-600"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Row Details */}
                      {isExpanded && (
                        <tr className="bg-slate-50/80 dark:bg-slate-800/60 font-mono text-[11px]">
                          <td colSpan={7} className="p-4 space-y-1.5 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-4 text-slate-600 dark:text-slate-300">
                              <span><strong>Impression ID:</strong> {item.id}</span>
                              <span className="inline-flex items-center gap-1"><strong>CPM Booster Region:</strong> <CountryFlag code={item.proxyRegion} flag={item.proxyFlag} name={item.proxyCountry} size="sm" />{item.proxyRegion}{item.proxyCountry ? ` (${item.proxyCountry})` : ''}</span>
                              <span><strong>CPM Booster:</strong> {item.proxyUsed}</span>
                            </div>
                            <div className="text-slate-500 dark:text-slate-400">
                              <strong>Funnel Sequence:</strong> {item.phaseCompleted}
                            </div>
                            {item.details && (
                              <div className="text-teal-700 dark:text-teal-300 pt-1">
                                <strong>Log Trace:</strong> {item.details}
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

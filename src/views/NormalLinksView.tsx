import React, { useState } from 'react';
import {
  Plus,
  Play,
  Pause,
  Trash2,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  Search,
  Globe,
  Sliders,
  Check,
  X,
  History,
  Link2
} from 'lucide-react';
import { NormalLink, MembershipPlanItem, LiveImpression } from '../types';
import { InfoCallout } from '../components/rayobyte/InfoCallout';
import { askConfirm } from '../lib/dialog';
import { StartLimitModal } from '../components/ui/StartLimitModal';
import { ImpressionHistoryPanel } from '../components/analytics/ImpressionHistoryPanel';

interface NormalLinksViewProps {
  links: NormalLink[];
  plan?: MembershipPlanItem;
  onAddLink: (name: string, url: string) => void;
  onToggleStatus: (id: string) => void;
  onToggleAll: (status: 'active' | 'paused') => void;
  onDeleteLink: (id: string) => void;
  onCheckStatus: (id: string) => void;
  /** Start a normal-link campaign with a visit limit (auto-stops when reached). */
  onStartWithLimit?: (id: string | 'all', amount: number) => void | Promise<void>;
  /** Available impression balance, used to validate the chosen limit. */
  balance?: number;
  /** Every impression the member has — filtered to normal-link rows inside the panel. */
  impressions?: LiveImpression[];
}

export const NormalLinksView: React.FC<NormalLinksViewProps> = ({
  links,
  plan,
  onAddLink,
  onToggleStatus,
  onToggleAll,
  onDeleteLink,
  onCheckStatus,
  onStartWithLimit,
  balance = 0,
  impressions = []
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [checkingId, setCheckingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'links' | 'history'>('links');
  const [startModal, setStartModal] = useState<{ open: boolean; id: string | 'all'; label: string }>({
    open: false,
    id: 'all',
    label: ''
  });

  const maxLinks = plan?.linkLimit || 15;
  const filteredLinks = links.filter(l =>
    l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    l.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUrl || !newName) return;
    onAddLink(newName, newUrl);
    setNewUrl('');
    setNewName('');
    setShowAddModal(false);
  };

  const handleManualCheck = (id: string) => {
    setCheckingId(id);
    setTimeout(() => {
      onCheckStatus(id);
      setCheckingId(null);
    }, 800);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Link Quota */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Normal Links Management
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200/60 dark:border-teal-800 font-mono">
              {links.length} / {maxLinks} Used
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Direct target URLs routed through organic multi-referrer funnels with HTTP HEAD uptime monitoring.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setStartModal({ open: true, id: 'all', label: 'All normal links' })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-50 dark:bg-teal-950/40 hover:bg-teal-100 dark:hover:bg-teal-900/50 text-teal-700 dark:text-teal-300 transition-colors cursor-pointer"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Start All</span>
          </button>
          <button
            onClick={() => onToggleAll('paused')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <Pause className="w-3 h-3 fill-current" />
            <span>Pause All</span>
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            disabled={links.length >= maxLinks}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg text-white transition-colors shadow-xs ${
              links.length >= maxLinks
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-teal-600 hover:bg-teal-700 cursor-pointer'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add New Link</span>
          </button>
        </div>
      </div>

      <InfoCallout
        title="Automated Organic Traffic Routing"
        message="Each normal link receives visits via Gaussian simulated search clicks from Google, Bing, and DuckDuckGo with random dwell times between 20 to 60 seconds."
      />

      {/* Tabs: Links vs Impression History (same system as SmartLinks) */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('links')}
          className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold cursor-pointer border-b-2 transition-colors ${
            activeTab === 'links'
              ? 'border-teal-500 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Link2 className="w-3.5 h-3.5" />
          Normal Links ({links.length})
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold cursor-pointer border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-teal-500 text-teal-600 dark:text-teal-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          Impression History
        </button>
      </div>

      {activeTab === 'links' && (
      <>
      {/* Filter / Search Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search links by name or URL..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
      </div>

      {/* Links Grid / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredLinks.map((link) => {
          const totalVisits = link.stats.visits || 0;
          const okVisits = link.stats.ok || 0;
          const successRate = totalVisits > 0 ? Math.round((okVisits / totalVisits) * 100) : 100;
          const isPaused = link.status === 'paused';

          return (
            <div
              key={link.id}
              className={`p-5 rounded-xl border bg-white dark:bg-[#0f172a] transition-all shadow-xs flex flex-col justify-between ${
                isPaused
                  ? 'border-slate-200 dark:border-slate-800 opacity-75'
                  : 'border-slate-200 dark:border-slate-800 hover:border-teal-500/50'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="truncate flex-1">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {link.name}
                    </h3>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-teal-600 dark:text-teal-400 hover:underline flex items-center gap-1 truncate mt-0.5"
                    >
                      <span className="truncate">{link.url.replace(/^https?:\/\//, '')}</span>
                      <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                    </a>
                  </div>

                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                      link.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {link.status}
                  </span>
                </div>

                {/* HTTP Status and Last Check */}
                <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
                  <span className="inline-flex items-center gap-1 font-mono">
                    <CheckCircle className="w-3 h-3 text-emerald-500" />
                    HTTP {link.lastCheckStatus} OK
                  </span>
                  <span>·</span>
                  <span>Checked {new Date(link.lastChecked).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                {/* Visits Stats */}
                <div className="grid grid-cols-3 gap-2 py-3 mt-2 text-center bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Visits</span>
                    <span className="font-mono tabular-nums text-xs font-bold text-slate-800 dark:text-slate-200">
                      {totalVisits.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Success</span>
                    <span className="font-mono tabular-nums text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      {okVisits.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase">Rate</span>
                    <span className="font-mono tabular-nums text-xs font-bold text-slate-800 dark:text-slate-200">
                      {successRate}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-4 mt-3 border-t border-slate-100 dark:border-slate-800/80">
                <button
                  onClick={() => handleManualCheck(link.id)}
                  disabled={checkingId === link.id}
                  className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${checkingId === link.id ? 'animate-spin' : ''}`} />
                  <span>Test HEAD</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (link.status === 'active') {
                        onToggleStatus(link.id);
                      } else {
                        setStartModal({ open: true, id: link.id, label: link.name });
                      }
                    }}
                    className={`p-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                      link.status === 'active'
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100'
                        : 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 hover:bg-teal-100'
                    }`}
                    title={link.status === 'active' ? 'Pause Traffic' : 'Start with visit limit'}
                  >
                    {link.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>

                  <button
                    onClick={() => {
                      void askConfirm(`Are you sure you want to delete "${link.name}"?`, { confirmLabel: 'Yes, Delete' }).then((ok) => {
                        if (ok) onDeleteLink(link.id);
                      });
                    }}
                    className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                    title="Delete Link"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      </>
      )}

      {/* Impression History tab — normal-link deliveries only, newest first */}
      {activeTab === 'history' && (
        <ImpressionHistoryPanel impressions={impressions} linkType="normal" />
      )}

      {/* Add Link Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150 overflow-y-auto overscroll-contain">
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-md w-full p-6 space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Add Normal Link
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Link Label / Campaign Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. My Tech Blog Direct Article"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Target Destination URL (HTTP / HTTPS)
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://example.com/target-landing-page"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  System executes an automated HTTP HEAD check upon creation to confirm reachability.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-medium rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer shadow-xs"
                >
                  Validate & Save Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Start-with-limit modal (A3/D1) */}
      <StartLimitModal
        open={startModal.open}
        type="normal"
        scopeLabel={startModal.label}
        balance={balance}
        onClose={() => setStartModal((s) => ({ ...s, open: false }))}
        onConfirm={async (amount) => {
          await onStartWithLimit?.(startModal.id, amount);
          setStartModal((s) => ({ ...s, open: false }));
        }}
      />
    </div>
  );
};

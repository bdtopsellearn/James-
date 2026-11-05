import React, { useState } from 'react';
import {
  RotateCcw,
  Search,
  Trash2,
  FileCode,
  CheckCircle,
  Clock,
  User,
  ShieldAlert,
  ArrowRight,
  Database,
  History,
  Archive
} from 'lucide-react';
import { AppStorage } from '../../services/storage';
import { apiAdminRecoveryRestore } from '../../services/api';
import { useToast } from '../../components/ui/Toast';
import { DataRecoveryItem, User as CurrentUser } from '../../types';

interface AdminDataRecoveryViewProps {
  currentUser: CurrentUser;
  onRefresh: () => void | Promise<void>;
}

export const AdminDataRecoveryView: React.FC<AdminDataRecoveryViewProps> = ({
  currentUser,
  onRefresh
}) => {
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [filterCollection, setFilterCollection] = useState<string>('all');
  const [inspectItem, setInspectItem] = useState<DataRecoveryItem | null>(null);

  const items = AppStorage.getRecoveryItems();

  const filtered = items.filter((item) => {
    const matchesColl = filterCollection === 'all' || item.collectionName === filterCollection;
    const str = `${item.collectionName} ${item.recordId} ${item.deletedBy} ${JSON.stringify(item.recordData)}`.toLowerCase();
    const matchesSearch = str.includes(search.toLowerCase());
    return matchesColl && matchesSearch;
  });

  const [restoring, setRestoring] = useState<string | null>(null);

  const handleRestore = async (recoveryId: string) => {
    if (restoring) return;
    setRestoring(recoveryId);
    try {
      await apiAdminRecoveryRestore(recoveryId); // real restore on the server
      await onRefresh();
      setInspectItem(null);
      showToast('Restored', 'The record is back in its table.', 'success');
    } catch (e: any) {
      showToast('Restore Failed', e?.message || 'Server error', 'error');
    } finally {
      setRestoring(null);
    }
  };

  const collections = ['all', ...Array.from(new Set(items.map((i) => i.collectionName)))];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-amber-500" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Data Recovery & Soft-Delete Ledger
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Audit deletion logs, inspect previous values and recovery metadata, and restore records back to production collections.
          </p>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
          <span>{items.filter((i) => !i.restored).length} Unrestored</span>
          <span>·</span>
          <span className="text-emerald-600 dark:text-emerald-400">{items.filter((i) => i.restored).length} Restored</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search deleted records by ID, actor, or payload..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-400 whitespace-nowrap">Filter Collection:</span>
          <select
            value={filterCollection}
            onChange={(e) => setFilterCollection(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer"
          >
            {collections.map((c) => (
              <option key={c} value={c}>
                {c.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Recovery Items Table */}
      <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="pn-sticky-actions w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Deleted At</th>
                <th className="py-3 px-4">Collection</th>
                <th className="py-3 px-4">Original Record ID</th>
                <th className="py-3 px-4">Deleted By</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 font-mono">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 text-xs">
                    No deleted records found matching criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 text-slate-400">
                      {new Date(item.deletedAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </td>
                    <td className="py-3 px-4 font-bold text-amber-600 dark:text-amber-400">
                      {item.collectionName}
                    </td>
                    <td className="py-3 px-4 text-slate-800 dark:text-slate-200 font-semibold">
                      {item.recordId}
                    </td>
                    <td className="py-3 px-4 text-slate-400">
                      {item.deletedBy} ({item.deletedByRole})
                    </td>
                    <td className="py-3 px-4">
                      {item.restored ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                          <CheckCircle className="w-3 h-3" /> RESTORED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30">
                          <Trash2 className="w-3 h-3" /> DELETED
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setInspectItem(item)}
                          className="px-2 py-1 text-xs font-semibold rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 cursor-pointer"
                        >
                          Inspect JSON
                        </button>
                        {!item.restored && (
                          <button
                            onClick={() => handleRestore(item.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-xs"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restore</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Inspect / Restore Modal */}
      {inspectItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono">
                  Deleted Record Snapshot: {inspectItem.recordId}
                </h3>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                  Collection: {inspectItem.collectionName} · Deleted by {inspectItem.deletedBy} at {inspectItem.deletedAt}
                </p>
              </div>
            </div>

            <pre className="flex-1 overflow-auto p-4 bg-white dark:bg-[#090d16] text-amber-700 dark:text-amber-300 font-mono text-xs rounded-lg border border-slate-200 dark:border-slate-800">
              {JSON.stringify(inspectItem.recordData, null, 2)}
            </pre>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setInspectItem(null)}
                className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
              >
                Close
              </button>
              {!inspectItem.restored && (
                <button
                  onClick={() => handleRestore(inspectItem.id)}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-xs"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Restore Record to Active Database</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

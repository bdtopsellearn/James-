import React, { useState } from 'react';
import {
  Database,
  Search,
  Plus,
  Trash2,
  Edit,
  Eye,
  RefreshCw,
  FileCode,
  Check,
  X,
  AlertTriangle,
  FolderOpen
} from 'lucide-react';
import { AppStorage } from '../../services/storage';
import { apiAdminDbDelete, apiAdminDbSave, apiAdminDbCreate } from '../../services/api';
import { askConfirm } from '../../lib/dialog';
import { useToast } from '../../components/ui/Toast';
import { User } from '../../types';

interface AdminDatabaseViewProps {
  currentUser: User;
  onRefresh: () => void | Promise<void>;
}

type CollectionKey =
  | 'users'
  | 'normal_links'
  | 'smartlinks'
  | 'proxies'
  | 'balance_requests'
  | 'transactions'
  | 'membership_plans'
  | 'shop_packages'
  | 'payment_methods'
  | 'promo_codes'
  | 'support_tickets'
  | 'audit_logs'
  | 'admins';

export const AdminDatabaseView: React.FC<AdminDatabaseViewProps> = ({
  currentUser,
  onRefresh
}) => {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<CollectionKey>('users');
  const [search, setSearch] = useState('');
  const [inspectDoc, setInspectDoc] = useState<any | null>(null);
  const [editingDoc, setEditingDoc] = useState<{ id: string; rawJson: string } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newDocJson, setNewDocJson] = useState('{\n  "id": "item_' + Date.now() + '",\n  "status": "active"\n}');
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Retrieve records for current collection from AppStorage
  const getCollectionData = (): any[] => {
    switch (selectedCollection) {
      case 'users':
        return AppStorage.getAllUsers();
      case 'normal_links':
        return AppStorage.getNormalLinks();
      case 'smartlinks':
        return AppStorage.getSmartLinks();
      case 'proxies':
        return AppStorage.getProxies();
      case 'balance_requests':
        return AppStorage.getBalanceRequests();
      case 'transactions':
        return AppStorage.getTransactions();
      case 'membership_plans':
        return AppStorage.getMembershipPlans();
      case 'shop_packages':
        return AppStorage.getShopPackages();
      case 'payment_methods':
        return AppStorage.getPaymentMethods();
      case 'promo_codes':
        return AppStorage.getPromoCodes();
      case 'support_tickets':
        return AppStorage.getSupportTickets();
      case 'audit_logs':
        return AppStorage.getAuditLogs();
      case 'admins':
        return AppStorage.getAdmins();
      default:
        return [];
    }
  };

  const saveCollectionData = (items: any[]) => {
    switch (selectedCollection) {
      case 'users':
        AppStorage.saveAllUsers(items);
        break;
      case 'normal_links':
        AppStorage.saveNormalLinks(items);
        break;
      case 'smartlinks':
        AppStorage.saveSmartLinks(items);
        break;
      case 'proxies':
        AppStorage.saveProxies(items);
        break;
      case 'balance_requests':
        AppStorage.saveBalanceRequests(items);
        break;
      case 'membership_plans':
        AppStorage.saveMembershipPlans(items);
        break;
      case 'shop_packages':
        AppStorage.saveShopPackages(items);
        break;
      case 'payment_methods':
        AppStorage.savePaymentMethods(items);
        break;
      case 'promo_codes':
        AppStorage.savePromoCodes(items);
        break;
      case 'support_tickets':
        AppStorage.saveSupportTickets(items);
        break;
      case 'admins':
        AppStorage.saveAdmins(items);
        break;
      default:
        break;
    }
    onRefresh();
  };

  const data = getCollectionData();
  const filtered = data.filter((item) => {
    const str = JSON.stringify(item).toLowerCase();
    return str.includes(search.toLowerCase());
  });

  const handleDelete = async (docId: string) => {
    if (busy) return;
    const docToDelete = data.find((d) => (d.id || d.key || d.code) === docId);
    if (!docToDelete) return;

    if (selectedCollection === 'admins' && docToDelete.isRootSuperAdmin) {
      showToast('Protected', 'The Root Super Admin record cannot be deleted.', 'error');
      return;
    }
    const ok = await askConfirm(
      `Delete "${docId}" from ${selectedCollection}? It is removed from the database and kept in Data Recovery so you can restore it.`,
      { title: 'Delete this document?', confirmLabel: 'Yes, delete', danger: true }
    );
    if (!ok) return;

    setBusy(true);
    try {
      // Real delete on the server (it used to only edit the browser cache, so the record came back on refresh)
      await apiAdminDbDelete(selectedCollection, String(docId));
      await onRefresh();
      showToast('Deleted', 'Moved to Data Recovery.', 'success');
    } catch (e: any) {
      showToast('Delete Failed', e?.message || 'Server error', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc || busy) return;
    setJsonError(null);

    let parsed: any;
    try {
      parsed = JSON.parse(editingDoc.rawJson);
    } catch (err: any) {
      setJsonError(`Invalid JSON: ${err.message}`);
      return;
    }
    setBusy(true);
    try {
      await apiAdminDbSave(selectedCollection, String(editingDoc.id), parsed);
      await onRefresh();
      setEditingDoc(null);
      showToast('Saved', 'Document updated.', 'success');
    } catch (err: any) {
      setJsonError(err?.message || 'Could not save the document.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setJsonError(null);

    let parsed: any;
    try {
      parsed = JSON.parse(newDocJson);
    } catch (err: any) {
      setJsonError(`Invalid JSON: ${err.message}`);
      return;
    }
    setBusy(true);
    try {
      // Real insert on the server (it used to only touch the browser cache, so the new
      // row disappeared the moment the page refreshed).
      await apiAdminDbCreate(selectedCollection, parsed);
      await onRefresh();
      setIsCreating(false);
      showToast('Created', 'Document added to the collection.', 'success');
    } catch (err: any) {
      setJsonError(err?.message || 'Could not create the document.');
    } finally {
      setBusy(false);
    }
  };

  const collections: { key: CollectionKey; label: string; count: number }[] = [
    { key: 'users', label: 'users', count: AppStorage.getAllUsers().length },
    { key: 'normal_links', label: 'normal_links', count: AppStorage.getNormalLinks().length },
    { key: 'smartlinks', label: 'user_smartlinks', count: AppStorage.getSmartLinks().length },
    { key: 'proxies', label: 'proxies', count: AppStorage.getProxies().length },
    { key: 'balance_requests', label: 'balance_requests', count: AppStorage.getBalanceRequests().length },
    { key: 'transactions', label: 'transactions', count: AppStorage.getTransactions().length },
    { key: 'membership_plans', label: 'membership_plans', count: AppStorage.getMembershipPlans().length },
    { key: 'shop_packages', label: 'shop_packages', count: AppStorage.getShopPackages().length },
    { key: 'payment_methods', label: 'payment_methods', count: AppStorage.getPaymentMethods().length },
    { key: 'promo_codes', label: 'promo_codes', count: AppStorage.getPromoCodes().length },
    { key: 'support_tickets', label: 'support_tickets', count: AppStorage.getSupportTickets().length },
    { key: 'audit_logs', label: 'audit_logs', count: AppStorage.getAuditLogs().length },
    { key: 'admins', label: 'admins', count: AppStorage.getAdmins().length }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-amber-500" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Firebase & Database Collections Console
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Direct schema inspection, document editing, live search, and managed CRUD operations with soft-delete safety.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setNewDocJson('{\n  "id": "doc_' + Date.now() + '",\n  "createdAt": "' + new Date().toISOString() + '"\n}');
              setIsCreating(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Document</span>
          </button>
        </div>
      </div>

      {/* Main Layout: Collection Sidebar + Document Browser */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Collections List */}
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 space-y-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-3 py-1 mb-2">
            Firestore Collections ({collections.length})
          </span>
          {collections.map((col) => {
            const active = selectedCollection === col.key;
            return (
              <button
                key={col.key}
                onClick={() => {
                  setSelectedCollection(col.key);
                  setSearch('');
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg font-mono transition-colors cursor-pointer ${
                  active
                    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 font-bold border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <FolderOpen className={`w-3.5 h-3.5 ${active ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500'}`} />
                  <span className="truncate">{col.label}</span>
                </div>
                <span className="text-[10px] tabular-nums px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
                  {col.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Documents Table & Inspector */}
        <div className="lg:col-span-3 space-y-4">
          {/* Search bar */}
          <div className="flex items-center justify-between gap-4 p-4 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search documents in ${selectedCollection}...`}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>
            <span className="text-xs font-mono text-slate-400">
              Showing {filtered.length} of {data.length} docs
            </span>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="pn-sticky-actions w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Document ID</th>
                    <th className="py-3 px-4">Summary Preview</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-12 text-center text-slate-400 text-xs">
                        No documents found in {selectedCollection}.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((item, idx) => {
                      const docId = String(item.id || item.key || item.code || `doc_${idx}`);
                      const summary = Object.entries(item)
                        .filter(([k]) => k !== 'id')
                        .slice(0, 3)
                        .map(([k, v]) => `${k}: ${typeof v === 'object' ? '{...}' : String(v)}`)
                        .join(' · ');

                      return (
                        <tr key={docId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 font-mono">
                          <td className="py-3 px-4 font-bold text-amber-600 dark:text-amber-400">
                            {docId}
                          </td>
                          <td className="py-3 px-4 text-slate-400 text-[11px] truncate max-w-md">
                            {summary}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setInspectDoc(item)}
                                className="p-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-white cursor-pointer"
                                title="Inspect JSON"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() =>
                                  setEditingDoc({
                                    id: docId,
                                    rawJson: JSON.stringify(item, null, 2)
                                  })
                                }
                                className="p-1 rounded bg-slate-100 dark:bg-slate-800 text-amber-600 dark:text-amber-400 hover:text-amber-300 cursor-pointer"
                                title="Edit Document"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(docId)}
                                className="p-1 rounded bg-rose-950/40 text-rose-600 dark:text-rose-400 hover:text-rose-200 cursor-pointer"
                                title="Soft Delete to Recovery"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Inspect JSON Modal */}
      {inspectDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono">
                  Document: {inspectDoc.id || inspectDoc.key || 'Record'}
                </h3>
              </div>
              <button
                onClick={() => setInspectDoc(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <pre className="flex-1 overflow-auto p-4 bg-white dark:bg-[#090d16] text-emerald-700 dark:text-emerald-400 font-mono text-xs rounded-lg border border-slate-200 dark:border-slate-800">
              {JSON.stringify(inspectDoc, null, 2)}
            </pre>

            <div className="flex justify-end">
              <button
                onClick={() => setInspectDoc(null)}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-white cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Document Modal */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono">
                Edit Record: {editingDoc.id}
              </h3>
              <button
                onClick={() => setEditingDoc(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {jsonError && (
              <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/40 text-xs text-rose-700 dark:text-rose-300">
                {jsonError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="flex-1 flex flex-col space-y-4">
              <textarea
                value={editingDoc.rawJson}
                onChange={(e) => setEditingDoc({ ...editingDoc, rawJson: e.target.value })}
                className="flex-1 w-full min-h-[300px] p-4 bg-white dark:bg-[#090d16] text-amber-700 dark:text-amber-300 font-mono text-xs rounded-lg border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingDoc(null)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer shadow-xs"
                >
                  Save Document
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Document Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 font-mono">
                Create New Document in {selectedCollection}
              </h3>
              <button
                onClick={() => setIsCreating(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {jsonError && (
              <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-500/40 text-xs text-rose-700 dark:text-rose-300">
                {jsonError}
              </div>
            )}

            <form onSubmit={handleCreateDocument} className="flex-1 flex flex-col space-y-4">
              <textarea
                value={newDocJson}
                onChange={(e) => setNewDocJson(e.target.value)}
                className="flex-1 w-full min-h-[300px] p-4 bg-white dark:bg-[#090d16] text-emerald-700 dark:text-emerald-300 font-mono text-xs rounded-lg border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer shadow-xs"
                >
                  Insert Document
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

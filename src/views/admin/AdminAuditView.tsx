import React, { useState } from 'react';
import {
  FileText,
  Search,
  Filter,
  Shield,
  Download
} from 'lucide-react';
import { AuditLog } from '../../types';

interface AdminAuditViewProps {
  logs: AuditLog[];
}

export const AdminAuditView: React.FC<AdminAuditViewProps> = ({ logs }) => {
  const [search, setSearch] = useState('');

  const filtered = logs.filter(l =>
    l.actorName.toLowerCase().includes(search.toLowerCase()) ||
    l.action.toLowerCase().includes(search.toLowerCase()) ||
    l.details.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Security & Operations Audit Trail
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Immutable system logs documenting all administrative adjustments, wallet credits, and booster actions.
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search action or actor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Actor</th>
                <th className="py-3 px-4">Action Code</th>
                <th className="py-3 px-4">Target Ref</th>
                <th className="py-3 px-4">Details Trace</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {filtered.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-mono text-slate-500">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{log.actorName}</span>
                    <span className="text-[10px] text-slate-400 font-mono ml-1.5 uppercase">({log.actorRole})</span>
                  </td>
                  <td className="py-3 px-4 font-mono font-bold text-teal-600 dark:text-teal-400">
                    {log.action}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-500">
                    {log.targetId || 'SYSTEM'}
                  </td>
                  <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                    {log.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

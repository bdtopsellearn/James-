import React from 'react';
import {
  ShieldCheck,
  Shield,
  Key,
  Lock,
  Users,
  Database,
  Archive,
  Settings,
  BarChart3,
  FileText,
  Send,
  ShoppingBag
} from 'lucide-react';
import { ALL_ADMIN_PERMISSIONS, AppStorage } from '../../services/storage';
import { AdminPermission, User } from '../../types';

interface AdminRolesViewProps {
  currentUser: User;
}

export const AdminRolesView: React.FC<AdminRolesViewProps> = ({ currentUser }) => {
  const admins = AppStorage.getAdmins();

  const permissionCategories: {
    category: string;
    description: string;
    icon: React.ReactNode;
    permissions: { key: AdminPermission; label: string; desc: string }[];
  }[] = [
    {
      category: 'User Management',
      description: 'Permissions governing publisher user records and access restrictions.',
      icon: <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />,
      permissions: [
        { key: 'users.view', label: 'View Users', desc: 'Read user profiles, registration metadata, and links' },
        { key: 'users.edit', label: 'Edit Users', desc: 'Modify membership plans and manual wallet balances' },
        { key: 'users.ban', label: 'Ban/Unban', desc: 'Enforce fraud bans and restore accounts' },
        { key: 'users.delete', label: 'Delete Users', desc: 'Soft-delete user accounts to data recovery' }
      ]
    },
    {
      category: 'Administrator Governance',
      description: 'Highest security scope strictly reserved for Super Admin.',
      icon: <Lock className="w-4 h-4 text-amber-500" />,
      permissions: [
        { key: 'admins.view', label: 'View Admins', desc: 'List administrative personnel and role statuses' },
        { key: 'admins.create', label: 'Create Normal Admin', desc: 'Provision new delegated normal admin accounts' },
        { key: 'admins.edit', label: 'Edit Admin Privileges', desc: 'Update granular permission grants' },
        { key: 'admins.delete', label: 'Remove Admin', desc: 'Decommission normal administrator accounts' }
      ]
    },
    {
      category: 'Database & Data Recovery',
      description: 'Direct schema access, collection browsing, and deletion recovery.',
      icon: <Database className="w-4 h-4 text-teal-600 dark:text-teal-400" />,
      permissions: [
        { key: 'database.view', label: 'View Database', desc: 'Browse Firestore collections and document records' },
        { key: 'database.edit', label: 'Edit Database', desc: 'Directly modify document payloads' },
        { key: 'database.delete', label: 'Delete Records', desc: 'Remove records with soft-delete logging' },
        { key: 'database.recovery', label: 'Data Recovery', desc: 'Restore soft-deleted records back to active collections' }
      ]
    },
    {
      category: 'System & Engine Controls',
      description: 'Infrastructure parameters, maintenance toggles, and traffic configuration.',
      icon: <Settings className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />,
      permissions: [
        { key: 'settings.view', label: 'View Settings', desc: 'Read engine parameters and booster pools' },
        { key: 'settings.edit', label: 'Modify Settings', desc: 'Adjust dwell times, concurrency, and booster configuration' },
        { key: 'analytics.view', label: 'View Analytics', desc: 'Read network-wide impression statistics' },
        { key: 'logs.view', label: 'View Audit Logs', desc: 'Inspect administrative audit trails' },
        { key: 'broadcasts.manage', label: 'Broadcasts & Maintenance', desc: 'Send announcements and toggle maintenance mode' },
        { key: 'content.manage', label: 'Content & CMS', desc: 'Edit membership pricing, packages, and payment methods' }
      ]
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-amber-500" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
            Role-Based Access Control (RBAC) & Permission Matrix
          </h1>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Granular permission matrix enforced server-side. Root Super Admin holds unrestricted authority while Normal Admins are strictly scoped.
        </p>
      </div>

      {/* Role Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-5 bg-white dark:bg-[#0f172a] rounded-xl border border-amber-500/40 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 font-mono">ROLE: SUPER ADMIN (ROOT)</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold">
              SINGLE INSTANCE
            </span>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300">
            Absolute root privileges. Manages normal administrator accounts, configures system architecture, performs emergency recovery, and audits all cluster nodes. Exactly one Super Admin account exists.
          </p>
          <div className="pt-2 text-[11px] text-slate-400 font-mono">
            Active Super Admin: <strong>alif.yasin@pnnetwork.io</strong>
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 font-mono">ROLE: NORMAL ADMIN</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 font-bold">
              DELEGATED SCOPE
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Delegated operations personnel. Assigned specific permissions by Super Admin. Cannot manage super admin, cannot self-escalate privileges, and cannot create additional administrative accounts.
          </p>
          <div className="pt-2 text-[11px] text-slate-400 font-mono">
            Active Normal Admins: <strong>{admins.filter((a) => !a.isRootSuperAdmin && a.role !== 'super_admin').length} accounts</strong>
          </div>
        </div>
      </div>

      {/* Permission Categories Matrix */}
      <div className="space-y-4">
        {permissionCategories.map((cat, idx) => (
          <div
            key={idx}
            className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {cat.icon}
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {cat.category}
                </h3>
              </div>
              <span className="text-xs text-slate-400 hidden sm:inline">
                {cat.description}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {cat.permissions.map((p) => (
                <div
                  key={p.key}
                  className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 flex items-start justify-between gap-3 text-xs"
                >
                  <div>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200 block">
                      {p.key}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mt-0.5">
                      {p.desc}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold shrink-0">
                    ENFORCED
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

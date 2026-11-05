import React, { useState } from 'react';
import {
  ShieldAlert,
  Shield,
  UserPlus,
  Trash2,
  Edit,
  Key,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Lock,
  Mail,
  UserCheck
} from 'lucide-react';
import { AdminAccount, AdminPermission, User } from '../../types';
import { ALL_ADMIN_PERMISSIONS } from '../../services/storage';
import { AdminBadge } from '../../components/ui/AdminBadge';

interface AdminAdminsViewProps {
  currentUser: User;
  admins: AdminAccount[];
  onCreateAdmin: (adminData: Omit<AdminAccount, 'id' | 'role' | 'createdAt' | 'lastLoginAt' | 'isRootSuperAdmin'> & { password: string }) => void;
  onUpdateAdmin: (adminId: string, updates: Partial<AdminAccount>) => void;
  onDeleteAdmin: (adminId: string) => void;
}

export const AdminAdminsView: React.FC<AdminAdminsViewProps> = ({
  currentUser,
  admins,
  onCreateAdmin,
  onUpdateAdmin,
  onDeleteAdmin
}) => {
  const isSuperAdmin = currentUser.role === 'admin' && (currentUser.adminRole === 'super_admin' || currentUser.email === 'alif.yasin@pnnetwork.io');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminAccount | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedPermissions, setSelectedPermissions] = useState<AdminPermission[]>([
    'users.view',
    'database.view',
    'settings.view',
    'analytics.view',
    'logs.view'
  ]);

  const handleOpenCreate = () => {
    setName('');
    setEmail('');
    setPassword('');
    setSelectedPermissions([
      'users.view',
      'database.view',
      'settings.view',
      'analytics.view',
      'logs.view'
    ]);
    setShowCreateModal(true);
  };

  const handleTogglePermission = (perm: AdminPermission) => {
    if (selectedPermissions.includes(perm)) {
      setSelectedPermissions(selectedPermissions.filter((p) => p !== perm));
    } else {
      setSelectedPermissions([...selectedPermissions, perm]);
    }
  };

  const handleSubmitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || password.length < 10) return;

    onCreateAdmin({ name, email, password, status: 'active', permissions: selectedPermissions });

    setShowCreateModal(false);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAdmin) return;

    onUpdateAdmin(editingAdmin.id, {
      name: editingAdmin.name,
      status: editingAdmin.status,
      permissions: editingAdmin.permissions
    });

    setEditingAdmin(null);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Administrator Accounts & Governance
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Root Super Admin and delegated Normal Admin accounts with granular role-based permissions (RBAC).
          </p>
        </div>

        {isSuperAdmin && (
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold shadow-xs transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create Normal Admin</span>
          </button>
        )}
      </div>

      {/* Super Admin Architecture Notice */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 space-y-1">
        <div className="flex items-center gap-2 font-bold text-amber-600 dark:text-amber-400">
          <Lock className="w-4 h-4" />
          <span>Strict Two-Tier Administrator Hierarchy Enforced</span>
        </div>
        <p className="text-slate-400 text-[11px] leading-relaxed">
          The system permits <strong>exactly one Root Super Admin</strong> with absolute permissions. Normal Admins receive explicitly assigned privileges and cannot create, modify, or elevate accounts to Super Admin. Public self-registration for administrative roles is prohibited.
        </p>
      </div>

      {/* Admins Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {admins.map((admin) => {
          const isRoot = admin.role === 'super_admin' || admin.isRootSuperAdmin;
          return (
            <div
              key={admin.id}
              className={`p-6 bg-white dark:bg-[#0f172a] rounded-xl border transition-all ${
                isRoot
                  ? 'border-amber-500/50 shadow-md shadow-amber-950/20'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                      isRoot
                        ? 'bg-amber-500 text-slate-950 shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {isRoot ? <ShieldAlert className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {admin.name}
                      </h3>
                      <AdminBadge role={isRoot ? 'super_admin' : 'admin'} size="sm" />
                      {isRoot ? (
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/40">
                          ROOT SUPER ADMIN
                        </span>
                      ) : (
                        <span
                          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                            admin.status === 'active'
                              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                          }`}
                        >
                          {admin.status.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                      {admin.email}
                    </p>
                  </div>
                </div>

                {isSuperAdmin && !isRoot && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setEditingAdmin(admin)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      title="Edit Permissions"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onDeleteAdmin(admin.id)}
                      className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:text-rose-200 hover:bg-rose-950/40 cursor-pointer"
                      title="Remove Admin Account"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Account Meta */}
              <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-400 text-[11px] block">Role Authority</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {isRoot ? 'Unrestricted (Level 4)' : 'Delegated (Level 2)'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 text-[11px] block">Last Login</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {new Date(admin.lastLoginAt).toLocaleDateString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>

              {/* Permissions Pills / Summary */}
              <div className="mt-4">
                <span className="text-[11px] font-semibold text-slate-400 block mb-2">
                  Active Permissions ({admin.permissions.length} Assigned)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {isRoot ? (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                      ALL_PERMISSIONS_UNRESTRICTED
                    </span>
                  ) : (
                    admin.permissions.map((p) => (
                      <span
                        key={p}
                        className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                      >
                        {p}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Admin Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-amber-500" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Create Normal Administrator Account
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Normal admins can access selected operations but cannot manage super admin or create additional administrative accounts.
            </p>

            <form onSubmit={handleSubmitCreate} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Full Name / Operator Title
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ops Team Member"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Admin Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin.ops@pnnetwork.io"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Initial Password (10+ characters)
                </label>
                <input
                  type="password"
                  required
                  minLength={10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a strong password"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Granular RBAC Permissions
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                  {ALL_ADMIN_PERMISSIONS.filter((p) => !p.startsWith('admins.')).map((perm) => (
                    <label
                      key={perm}
                      className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <input
                        type="checkbox"
                        checked={selectedPermissions.includes(perm)}
                        onChange={() => handleTogglePermission(perm)}
                        className="rounded text-amber-500 focus:ring-amber-500 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                      />
                      <span className="font-mono text-[11px] truncate">{perm}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer shadow-xs"
                >
                  Create Admin Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Admin Modal */}
      {editingAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2">
              <Edit className="w-5 h-5 text-amber-500" />
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Edit Administrator: {editingAdmin.name}
              </h2>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4 pt-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editingAdmin.name}
                  onChange={(e) => setEditingAdmin({ ...editingAdmin, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Account Status
                </label>
                <select
                  value={editingAdmin.status}
                  onChange={(e) =>
                    setEditingAdmin({ ...editingAdmin, status: e.target.value as 'active' | 'disabled' })
                  }
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="active">Active (Access Allowed)</option>
                  <option value="disabled">Disabled (Suspended Access)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Assigned Permissions
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                  {ALL_ADMIN_PERMISSIONS.filter((p) => !p.startsWith('admins.')).map((perm) => (
                    <label
                      key={perm}
                      className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <input
                        type="checkbox"
                        checked={editingAdmin.permissions.includes(perm)}
                        onChange={() => {
                          const perms = editingAdmin.permissions.includes(perm)
                            ? editingAdmin.permissions.filter((p) => p !== perm)
                            : [...editingAdmin.permissions, perm];
                          setEditingAdmin({ ...editingAdmin, permissions: perms });
                        }}
                        className="rounded text-amber-500 focus:ring-amber-500 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
                      />
                      <span className="font-mono text-[11px] truncate">{perm}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingAdmin(null)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

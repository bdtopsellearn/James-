import React, { useState } from 'react';
import {
  Settings,
  Bell,
  Sun,
  Moon,
  RotateCcw,
  Shield,
  Check,
  PlayCircle,
  ExternalLink,
  ShieldAlert,
  Sparkles
} from 'lucide-react';
import { User } from '../types';
import { useTheme } from '../theme';

interface SettingsViewProps {
  user: User;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  onUpdateSettings: (settings: { notifications: boolean; promoAlerts: boolean }) => void;
  onResetData: () => void;
  onReplaySplash?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  theme: themeProp,
  onToggleTheme: onToggleThemeProp,
  onUpdateSettings,
  onResetData,
  onReplaySplash
}) => {
  const [storeTheme, storeToggleTheme] = useTheme();
  const theme = themeProp ?? storeTheme;
  const onToggleTheme = onToggleThemeProp ?? storeToggleTheme;
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [glass, setGlass] = useState<boolean>(() => {
    try { return localStorage.getItem('pn_glass') !== 'off'; } catch { return true; }
  });
  const toggleGlass = () => {
    const next = !glass;
    setGlass(next);
    try { localStorage.setItem('pn_glass', next ? 'on' : 'off'); } catch { /* ignore */ }
    try { document.documentElement.setAttribute('data-glass', next ? 'on' : 'off'); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          System Preferences & Configuration
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Customize UI aesthetics, notification alerts, and application state.
        </p>
      </div>

      {/* Preferences List */}
      <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800/80">
        {/* Replay Loading Screen */}
        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 block">
              Intro Animated Loading Screen
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Replay the branded neon loading screen featuring the custom X AD MARKETING logo & 5-phase cluster status.
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              if (onReplaySplash) {
                onReplaySplash();
              }
            }}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0 transition-colors"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            <span>Replay Loading Intro</span>
          </button>
        </div>

        {/* Theme Preference */}
        <div className="p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 block">
              Color Palette Theme
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Rayobyte minimal contrast aesthetic (Currently {theme.toUpperCase()})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onToggleTheme}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center gap-1.5 cursor-pointer text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-700" />}
              <span>Toggle to {theme === 'dark' ? 'Light' : 'Dark'} Mode</span>
            </button>
          </div>
        </div>

        {/* Liquid Glass Effect */}
        <div className="p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 block">
              Liquid Glass Effect
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Frosted-glass surfaces, animated aurora backdrop and depth shadows. Turn off for a crisp, flat look on low-end devices.
            </span>
          </div>

          <label className="relative inline-flex items-center cursor-pointer shrink-0">
            <input
              type="checkbox"
              checked={glass}
              onChange={toggleGlass}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
          </label>
        </div>

        {/* Notifications */}
        <div className="p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 block">
              Traffic Completion Alerts
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Receive in-app and email notifications when a traffic target finishes delivery.
            </span>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={user.settings.notifications}
              onChange={(e) =>
                onUpdateSettings({
                  ...user.settings,
                  notifications: e.target.checked
                })
              }
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
          </label>
        </div>

        {/* Promotional Alerts */}
        <div className="p-5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 block">
              Bonus Credit & Discount Alerts
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Notify me about limited-time discount codes, high-CPM placements, and CPM booster upgrades.
            </span>
          </div>

          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={user.settings.promoAlerts}
              onChange={(e) =>
                onUpdateSettings({
                  ...user.settings,
                  promoAlerts: e.target.checked
                })
              }
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600"></div>
          </label>
        </div>

{/* Reset State */}
        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 block">
              Reset Sandbox State
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Clear the cached data stored in this browser. Your account and server data are not affected.
            </span>
          </div>

          {showResetConfirm ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-rose-500 font-semibold">Are you sure?</span>
              <button
                type="button"
                onClick={() => {
                  setShowResetConfirm(false);
                  onResetData();
                }}
                className="px-3 py-1.5 text-xs font-bold rounded-lg bg-rose-600 text-white cursor-pointer hover:bg-rose-700 transition-colors"
              >
                Yes, Reset Everything
              </button>
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg border border-rose-200 dark:border-rose-900 cursor-pointer flex items-center gap-1.5 transition-colors shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear Local Cache</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

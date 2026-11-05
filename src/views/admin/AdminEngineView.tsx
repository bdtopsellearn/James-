import React, { useState } from 'react';
import {
  Terminal,
  ShieldCheck,
  Sliders,
  Cpu,
  Save,
  RotateCcw,
  Check,
  MousePointer,
  Clock,
  EyeOff,
  Globe
} from 'lucide-react';
import { EngineSettings } from '../../types';
import { InfoCallout } from '../../components/rayobyte/InfoCallout';

interface AdminEngineViewProps {
  settings: EngineSettings;
  onSaveSettings: (settings: EngineSettings) => void | Promise<void>;
  onResetHourlyCounters: () => void | Promise<void>;
}

export const AdminEngineView: React.FC<AdminEngineViewProps> = ({
  settings,
  onSaveSettings,
  onResetHourlyCounters
}) => {
  const [formData, setFormData] = useState<EngineSettings>(settings);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void onSaveSettings(formData); // the result (success / error) is shown as a toast by the parent
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Traffic Engine & Human Simulation Configuration
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Fine-tune Gaussian delays, Bezier mouse trajectories, Adsterra safety whitelists, and Data Saver rules.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { void onResetHourlyCounters(); }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Hourly Counters</span>
          </button>
        </div>
      </div>

      <InfoCallout
        title="Zero Bot Flag Guarantee"
        message="The 5-phase organic engine simulates natural human entropy: cubic Bezier curves with mouse overshoot, Gaussian typing cadences between 140-260 CPM, and cookie persistence."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Algorithmic Mode */}
        <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Engine Operation Mode
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[
              { id: 'h4ck_organic', label: 'H4CK Organic', desc: '5-phase multi-referrer preloads & search click.' },
              { id: 'hybrid_smart', label: 'Hybrid Smart', desc: '50% Search + 50% Social referrers.' },
              { id: 'pure_search', label: 'Pure Search', desc: 'Google/Bing SERP click only.' },
              { id: 'pure_direct', label: 'Pure Direct', desc: 'Direct URL hit without referrer.' }
            ].map((m) => (
              <div
                key={m.id}
                onClick={() => setFormData({ ...formData, mode: m.id as any })}
                className={`p-3.5 rounded-lg border cursor-pointer transition-all ${
                  formData.mode === m.id
                    ? 'border-teal-600 bg-teal-50/50 dark:bg-teal-950/40 shadow-xs'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block">
                  {m.label}
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 block">
                  {m.desc}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Section 2: Human Behavior Toggles */}
        <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <MousePointer className="w-4 h-4 text-teal-600" />
            Human Behavior & Mouse Simulation
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs cursor-pointer">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                    Cubic Bezier Mouse Movement
                  </span>
                  <span className="text-[11px] text-slate-500">Generates natural human curvature & hand micro-jitter.</span>
                </div>
                <input
                  type="checkbox"
                  checked={formData.bezierMouseMovement}
                  onChange={(e) => setFormData({ ...formData, bezierMouseMovement: e.target.checked })}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs cursor-pointer">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                    Reading Pauses (35% probability)
                  </span>
                  <span className="text-[11px] text-slate-500">Stops scrolling to simulate human article reading.</span>
                </div>
                <input
                  type="checkbox"
                  checked={formData.readingPauseChance > 0}
                  onChange={(e) => setFormData({ ...formData, readingPauseChance: e.target.checked ? 0.35 : 0 })}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs cursor-pointer">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                    Keyboard Navigation Simulation
                  </span>
                  <span className="text-[11px] text-slate-500">Triggers Spacebar, PageDown, and ArrowDown events.</span>
                </div>
                <input
                  type="checkbox"
                  checked={formData.keyboardNav}
                  onChange={(e) => setFormData({ ...formData, keyboardNav: e.target.checked })}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
              </label>
            </div>

            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs cursor-pointer">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                    High CPM Optimization Mode
                  </span>
                  <span className="text-[11px] text-slate-500">Extends dwell times on high-paying placements.</span>
                </div>
                <input
                  type="checkbox"
                  checked={formData.highCpmMode}
                  onChange={(e) => setFormData({ ...formData, highCpmMode: e.target.checked })}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs cursor-pointer">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                    US-Only Strict Exit IP Enforcement
                  </span>
                  <span className="text-[11px] text-slate-500">Drops proxies that resolve outside Tier-1 United States.</span>
                </div>
                <input
                  type="checkbox"
                  checked={formData.usOnlyStrict}
                  onChange={(e) => setFormData({ ...formData, usOnlyStrict: e.target.checked })}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
              </label>

              <label className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs cursor-pointer">
                <div>
                  <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                    Viewport Zoom Interaction
                  </span>
                  <span className="text-[11px] text-slate-500">Occasional 90%-110% zoom event triggers.</span>
                </div>
                <input
                  type="checkbox"
                  checked={formData.zoomEvents}
                  onChange={(e) => setFormData({ ...formData, zoomEvents: e.target.checked })}
                  className="rounded text-teal-600 focus:ring-teal-500"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Section 3: Data Saver & Safety Whitelist */}
        <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <EyeOff className="w-4 h-4 text-teal-600" />
            Data Saver & Resource Interception
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 text-xs cursor-pointer">
              <span>Block Heavy Images (PNG/JPG)</span>
              <input
                type="checkbox"
                checked={formData.dataSaver.blockImages}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    dataSaver: { ...formData.dataSaver, blockImages: e.target.checked }
                  })
                }
                className="rounded text-teal-600 focus:ring-teal-500"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 text-xs cursor-pointer">
              <span>Block Media / Video Streams</span>
              <input
                type="checkbox"
                checked={formData.dataSaver.blockMedia}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    dataSaver: { ...formData.dataSaver, blockMedia: e.target.checked }
                  })
                }
                className="rounded text-teal-600 focus:ring-teal-500"
              />
            </label>

            <label className="flex items-center justify-between p-3 rounded-lg border border-slate-100 dark:border-slate-800 text-xs cursor-pointer">
              <span>Block 3rd-Party Analytics</span>
              <input
                type="checkbox"
                checked={formData.dataSaver.blockAnalytics}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    dataSaver: { ...formData.dataSaver, blockAnalytics: e.target.checked }
                  })
                }
                className="rounded text-teal-600 focus:ring-teal-500"
              />
            </label>
          </div>

          <div className="p-3 rounded-lg bg-teal-50/50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-900 text-xs font-mono text-teal-800 dark:text-teal-300">
            <strong>Adsterra Whitelist (v39):</strong> 65+ real Adsterra domains (adsterra.com, whomeeno.com, recallscarce.com, highcpmgate.com, propush.me, highperformanceformat.com, effectivegatecpm.com, topdisplaynetwork.com, highrevenuenetwork.com …) plus <strong>runtime learning</strong> — every user&apos;s own SmartLink domain is auto-trusted, and impression pixels (<code>impr.gif</code> / <code>/pixel/</code> / <code>invoke.js</code>) are detected on any domain. Scripts and postback pixels are NEVER intercepted.
          </div>
        </div>

        {/* Section 4: Ad Click & CTR Safety (V36) */}
        <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <MousePointer className="w-4 h-4 text-teal-600" />
            Ad Click &amp; CTR Safety
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 -mt-2">
            Clicks are simulated with full human behaviour (scroll &rarr; hover &rarr; curved mouse travel &rarr; click).
            The effective CTR is always clamped to the safety cap so the Adsterra account stays safe.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs space-y-1.5">
              <span className="font-semibold text-slate-900 dark:text-slate-100 block">Target CTR (%)</span>
              <input
                type="number" min={0} max={5} step={0.1}
                value={Number((formData.clickProbability * 100).toFixed(2))}
                onChange={(e) => setFormData({ ...formData, clickProbability: Math.max(0, Math.min(5, Number(e.target.value) || 0)) / 100 })}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs"
              />
              <span className="text-[10px] text-slate-500 block">Chance a visit clicks an ad (Normal links).</span>
            </label>

            <label className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs space-y-1.5">
              <span className="font-semibold text-slate-900 dark:text-slate-100 block">CTR Safety Cap (%)</span>
              <input
                type="number" min={0} max={5} step={0.1}
                value={Number((formData.ctrSafetyCap * 100).toFixed(2))}
                onChange={(e) => setFormData({ ...formData, ctrSafetyCap: Math.max(0, Math.min(5, Number(e.target.value) || 0)) / 100 })}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs"
              />
              <span className="text-[10px] text-slate-500 block">Hard ceiling &mdash; the CTR can never exceed this.</span>
            </label>

            <label className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs space-y-1.5">
              <span className="font-semibold text-slate-900 dark:text-slate-100 block">Max Clicks / Session</span>
              <input
                type="number" min={0} max={3} step={1}
                value={formData.maxClicksPerSession}
                onChange={(e) => setFormData({ ...formData, maxClicksPerSession: Math.max(0, Math.min(3, Math.round(Number(e.target.value) || 0))) })}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs"
              />
              <span className="text-[10px] text-slate-500 block">Caps clicks per single visit (1 is safest).</span>
            </label>

            <label className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs space-y-1.5">
              <span className="font-semibold text-slate-900 dark:text-slate-100 block">Min Gap Between Clicks (s)</span>
              <input
                type="number" min={5} max={600} step={5}
                value={Math.round(formData.minClickDelayMs / 1000)}
                onChange={(e) => setFormData({ ...formData, minClickDelayMs: Math.max(5, Math.min(600, Math.round(Number(e.target.value) || 0))) * 1000 })}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs"
              />
              <span className="text-[10px] text-slate-500 block">Cool-down so clicks never burst.</span>
            </label>
          </div>

          <div className="p-3 rounded-lg bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
            <strong>Adsterra-safe by design:</strong> SmartLink visits never click ads (impressions only). Normal-link
            clicks are rare, human-paced, and hard-capped &mdash; keeping the account&apos;s CTR realistic.
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="inline-flex items-center gap-2 px-6 py-2.5 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer shadow-xs transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save & Deploy Engine Parameters</span>
          </button>
        </div>
      </form>
    </div>
  );
};

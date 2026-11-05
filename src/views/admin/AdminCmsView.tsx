import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Plus,
  Trash2,
  Edit2,
  Check,
  Crown,
  ShoppingBag,
  CreditCard,
  Tag,
  Save,
  Gift,
  FileText,
  Loader2,
  PlayCircle,
  Youtube,
  Send as SendIcon,
  Link as LinkIcon
} from 'lucide-react';
import { MembershipPlanItem, ShopPackageItem, PaymentMethodItem, PromoCodeItem, HowToVideo } from '../../types';
import { TabNavigation } from '../../components/rayobyte/TabNavigation';
import {
  apiAdminGetTrialSettings,
  apiAdminSaveTrialSettings,
  apiGetTerms,
  apiAdminSaveTerms,
} from '../../services/api';
import { useToast } from '../../components/ui/Toast';

interface AdminCmsViewProps {
  plans: MembershipPlanItem[];
  packages: ShopPackageItem[];
  paymentMethods: PaymentMethodItem[];
  promoCodes: PromoCodeItem[];
  howtoVideos: HowToVideo[];
  onSavePlans: (plans: MembershipPlanItem[]) => void;
  onSavePackages: (packages: ShopPackageItem[]) => void;
  onSavePaymentMethods: (methods: PaymentMethodItem[]) => void;
  onSavePromoCodes: (codes: PromoCodeItem[]) => void;
  onSaveHowToVideos: (videos: HowToVideo[]) => void;
}

export const AdminCmsView: React.FC<AdminCmsViewProps> = ({
  plans,
  packages,
  paymentMethods,
  promoCodes,
  howtoVideos,
  onSavePlans,
  onSavePackages,
  onSavePaymentMethods,
  onSavePromoCodes,
  onSaveHowToVideos
}) => {
  const [activeTab, setActiveTab] = useState<'plans' | 'packages' | 'methods' | 'promos' | 'trial' | 'terms' | 'howto'>('plans');

  const { showToast: toast } = useToast();

  // ── Free trial settings ────────────────────────────────────────────────
  const [trialEnabled, setTrialEnabled] = useState(true);
  const [trialAmount, setTrialAmount] = useState('10');
  const [trialLoading, setTrialLoading] = useState(false);
  const [trialSaving, setTrialSaving] = useState(false);

  // ── Terms & Conditions ─────────────────────────────────────────────────
  const [termsContent, setTermsContent] = useState('');
  const [termsVersion, setTermsVersion] = useState('1.0');
  const [termsLoading, setTermsLoading] = useState(false);
  const [termsSaving, setTermsSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setTrialLoading(true);
    apiAdminGetTrialSettings()
      .then((s) => { if (alive && s) { setTrialEnabled(!!s.enabled); setTrialAmount(String(s.amount ?? 10)); } })
      .catch(() => { /* keep defaults */ })
      .finally(() => { if (alive) setTrialLoading(false); });
    setTermsLoading(true);
    apiGetTerms()
      .then((t) => { if (alive && t) { setTermsContent(t.content || ''); setTermsVersion(t.version || '1.0'); } })
      .catch(() => { /* keep defaults */ })
      .finally(() => { if (alive) setTermsLoading(false); });
    return () => { alive = false; };
  }, []);

  const saveTrial = async () => {
    if (trialSaving) return;
    setTrialSaving(true);
    try {
      const s = await apiAdminSaveTrialSettings({ enabled: trialEnabled, amount: Math.max(0, Math.floor(Number(trialAmount) || 0)) });
      setTrialEnabled(!!s.enabled);
      setTrialAmount(String(s.amount ?? 0));
      toast('Trial Saved', 'Free-trial settings updated.', 'success');
    } catch (e: any) {
      toast('Save Failed', e?.message || 'Could not save trial settings.', 'error');
    } finally {
      setTrialSaving(false);
    }
  };

  const saveTerms = async () => {
    if (termsSaving) return;
    setTermsSaving(true);
    try {
      const t = await apiAdminSaveTerms(termsContent, termsVersion.trim() || '1.0');
      setTermsContent(t.content || termsContent);
      setTermsVersion(t.version || termsVersion);
      toast('Terms Saved', 'Terms & Conditions updated.', 'success');
    } catch (e: any) {
      toast('Save Failed', e?.message || 'Could not save terms.', 'error');
    } finally {
      setTermsSaving(false);
    }
  };

  // Local state copies
  const [localPlans, _setLocalPlans] = useState(plans);
  const [localPackages, _setLocalPackages] = useState(packages);
  const [localMethods, _setLocalMethods] = useState(paymentMethods);
  const [localPromos, _setLocalPromos] = useState(promoCodes);
  const [localHowto, _setLocalHowto] = useState<HowToVideo[]>(howtoVideos || []);

  // The parent pushes a fresh server snapshot every ~30s. We only mirror it into the edit
  // buffers while the admin has no unsaved edits, so a background refresh can never wipe
  // what they are typing. This also fixes the empty table on the very first load (the
  // plans arrive from the server AFTER this component mounts).
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) _setLocalPlans(plans); }, [plans, dirty]);
  useEffect(() => { if (!dirty) _setLocalPackages(packages); }, [packages, dirty]);
  useEffect(() => { if (!dirty) _setLocalMethods(paymentMethods); }, [paymentMethods, dirty]);
  useEffect(() => { if (!dirty) _setLocalPromos(promoCodes); }, [promoCodes, dirty]);
  useEffect(() => { if (!dirty) _setLocalHowto(howtoVideos || []); }, [howtoVideos, dirty]);

  // Wrapper setters: any admin edit marks the buffer dirty so the sync effects above pause.
  const setLocalPlans = (v: MembershipPlanItem[]) => { _setLocalPlans(v); setDirty(true); };
  const setLocalPackages = (v: ShopPackageItem[]) => { _setLocalPackages(v); setDirty(true); };
  const setLocalMethods = (v: PaymentMethodItem[]) => { _setLocalMethods(v); setDirty(true); };
  const setLocalPromos = (v: PromoCodeItem[]) => { _setLocalPromos(v); setDirty(true); };
  const setLocalHowto = (v: HowToVideo[]) => { _setLocalHowto(v); setDirty(true); };

  // New promo code form
  const [newPromoCode, setNewPromoCode] = useState('');
  const [newPromoDiscount, setNewPromoDiscount] = useState('20');
  const [newPromoBonus, setNewPromoBonus] = useState('100');

  const handleSaveAll = () => {
    onSavePlans(localPlans);
    onSavePackages(localPackages);
    onSavePaymentMethods(localMethods);
    onSavePromoCodes(localPromos);
    onSaveHowToVideos(localHowto.map((v, i) => ({ ...v, order: i + 1 })));
    setDirty(false); // saved -> let the next server snapshot flow back into the buffers
    // each save shows its own success / error toast from the parent (the old alert claimed success even on failure)
  };

  const handleAddPromo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPromoCode.trim()) return;
    const item: PromoCodeItem = {
      id: `pc_${Date.now()}`,
      code: newPromoCode.trim().toUpperCase(),
      discountPercent: parseInt(newPromoDiscount, 10) || 0,
      bonusCredits: parseInt(newPromoBonus, 10) || 0,
      maxUses: 100,
      usedCount: 0,
      // was a hard-coded 2026-12-31 date, so every new promo silently expired at year end
      expiresAt: new Date(Date.now() + 365 * 864e5).toISOString(),
      enabled: true
    };
    const updated = [item, ...localPromos];
    setLocalPromos(updated);
    onSavePromoCodes(updated);
    setNewPromoCode('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              Pricing, CMS & Payment Configuration
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Dynamic control over membership tiers, credit packages, mobile wallet numbers, and promo vouchers.
          </p>
        </div>

        <button
          onClick={handleSaveAll}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer shadow-xs transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save Changes</span>
        </button>
      </div>

      {/* Tabs */}
      <TabNavigation
        tabs={[
          { id: 'plans', label: 'Membership Tiers', icon: <Crown className="w-3.5 h-3.5" /> },
          { id: 'packages', label: 'Shop Packages', icon: <ShoppingBag className="w-3.5 h-3.5" /> },
          { id: 'methods', label: 'Payment Numbers', icon: <CreditCard className="w-3.5 h-3.5" /> },
          { id: 'promos', label: 'Promo Vouchers', icon: <Tag className="w-3.5 h-3.5" /> },
          { id: 'trial', label: 'Free Trial', icon: <Gift className="w-3.5 h-3.5" /> },
          { id: 'howto', label: 'How to Work', icon: <PlayCircle className="w-3.5 h-3.5" /> },
          { id: 'terms', label: 'Terms & Conditions', icon: <FileText className="w-3.5 h-3.5" /> }
        ]}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id as any)}
      />

      {/* Tab 1: Membership Plans */}
      {activeTab === 'plans' && (
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Plan Name</th>
                  <th className="py-3 px-4">Days</th>
                  <th className="py-3 px-4">Price ($)</th>
                  <th className="py-3 px-4">Link Limit</th>
                  <th className="py-3 px-4">Visits / Link</th>
                  <th className="py-3 px-4">Daily Burst</th>
                  <th className="py-3 px-4">Bonus Credits</th>
                  <th className="py-3 px-4 text-right">Enabled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {localPlans.map((p, idx) => (
                  <tr key={p.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <input
                        type="text"
                        value={p.label}
                        onChange={(e) => {
                          const copy = [...localPlans];
                          copy[idx].label = e.target.value;
                          setLocalPlans(copy);
                        }}
                        className="w-28 px-2 py-1 text-xs font-semibold rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        value={p.days}
                        onChange={(e) => {
                          const copy = [...localPlans];
                          copy[idx].days = parseInt(e.target.value, 10) || 0;
                          setLocalPlans(copy);
                        }}
                        className="w-16 px-2 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        value={p.price}
                        onChange={(e) => {
                          const copy = [...localPlans];
                          copy[idx].price = parseFloat(e.target.value) || 0;
                          setLocalPlans(copy);
                        }}
                        className="w-16 px-2 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        value={p.linkLimit}
                        onChange={(e) => {
                          const copy = [...localPlans];
                          copy[idx].linkLimit = parseInt(e.target.value, 10) || 0;
                          setLocalPlans(copy);
                        }}
                        className="w-16 px-2 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        value={p.visitsPerLink}
                        onChange={(e) => {
                          const copy = [...localPlans];
                          copy[idx].visitsPerLink = parseInt(e.target.value, 10) || 0;
                          setLocalPlans(copy);
                        }}
                        className="w-16 px-2 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        value={p.dailyBurstLimit}
                        onChange={(e) => {
                          const copy = [...localPlans];
                          copy[idx].dailyBurstLimit = parseInt(e.target.value, 10) || 0;
                          setLocalPlans(copy);
                        }}
                        className="w-20 px-2 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        value={p.bonusCredits}
                        onChange={(e) => {
                          const copy = [...localPlans];
                          copy[idx].bonusCredits = parseInt(e.target.value, 10) || 0;
                          setLocalPlans(copy);
                        }}
                        className="w-20 px-2 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400"
                      />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <input
                        type="checkbox"
                        checked={p.enabled}
                        onChange={(e) => {
                          const copy = [...localPlans];
                          copy[idx].enabled = e.target.checked;
                          setLocalPlans(copy);
                        }}
                        className="rounded text-teal-600 focus:ring-teal-500"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Shop Packages */}
      {activeTab === 'packages' && (
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Impression Credit Packages</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Set how much money (৳) buys how many impressions, tune the bonus credits and the highlight badge. Changes apply to the live shop instantly after saving.
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Credits (Impressions)</th>
                  <th className="py-3 px-4">Price (৳)</th>
                  <th className="py-3 px-4">Bonus Visits</th>
                  <th className="py-3 px-4">Highlight Badge</th>
                  <th className="py-3 px-4 text-right">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {localPackages.map((pkg, idx) => (
                  <tr key={pkg.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        value={pkg.credits}
                        onChange={(e) => {
                          const copy = [...localPackages];
                          copy[idx].credits = Math.max(0, Math.floor(parseInt(e.target.value, 10) || 0));
                          setLocalPackages(copy);
                        }}
                        className="w-28 px-2 py-1 text-xs font-mono font-bold rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={pkg.price}
                        onChange={(e) => {
                          const copy = [...localPackages];
                          copy[idx].price = Math.max(0, parseFloat(e.target.value) || 0);
                          setLocalPackages(copy);
                        }}
                        className="w-24 px-2 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <span className="text-emerald-600 font-mono">+</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={pkg.bonus}
                          onChange={(e) => {
                            const copy = [...localPackages];
                            copy[idx].bonus = Math.max(0, Math.floor(parseInt(e.target.value, 10) || 0));
                            setLocalPackages(copy);
                          }}
                          className="w-24 px-2 py-1 text-xs font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <input
                        type="text"
                        value={pkg.badge || ''}
                        placeholder="—"
                        onChange={(e) => {
                          const copy = [...localPackages];
                          copy[idx].badge = e.target.value;
                          setLocalPackages(copy);
                        }}
                        className="w-28 px-2 py-1 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                    </td>
                    <td className="py-3 px-4 text-right">
                      <input
                        type="checkbox"
                        checked={pkg.enabled}
                        onChange={(e) => {
                          const copy = [...localPackages];
                          copy[idx].enabled = e.target.checked;
                          setLocalPackages(copy);
                        }}
                        className="rounded text-teal-600"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                const nextId = `p${localPackages.length + 1}_${Date.now().toString(36)}`;
                setLocalPackages([
                  ...localPackages,
                  { id: nextId, credits: 1000, price: 100, bonus: 100, badge: '', enabled: true },
                ]);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-teal-300 dark:border-teal-800 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Package</span>
            </button>
            <span className="text-[11px] text-slate-400">{localPackages.length} package(s)</span>
          </div>
        </div>
      )}

      {/* Tab 3: Payment Methods */}
      {activeTab === 'methods' && (
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800/80">
          {localMethods.map((m, idx) => (
            <div key={m.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 dark:text-slate-100 text-xs">
                  {m.name} ({m.type})
                </span>
                <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                  <span>Enabled</span>
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    onChange={(e) => {
                      const copy = [...localMethods];
                      copy[idx].enabled = e.target.checked;
                      setLocalMethods(copy);
                    }}
                    className="rounded text-teal-600"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Phone / Wallet / Crypto Address
                  </label>
                  <input
                    type="text"
                    value={m.number}
                    onChange={(e) => {
                      const copy = [...localMethods];
                      copy[idx].number = e.target.value;
                      setLocalMethods(copy);
                    }}
                    className="w-full px-3 py-1.5 font-mono text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">
                    Deposit Instructions
                  </label>
                  <input
                    type="text"
                    value={m.instructions}
                    onChange={(e) => {
                      const copy = [...localMethods];
                      copy[idx].instructions = e.target.value;
                      setLocalMethods(copy);
                    }}
                    className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                  />
                  <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Account Type / Label</label>
                  <input type="text" value={m.accountType || ''} onChange={(e) => { const copy=[...localMethods]; copy[idx].accountType=e.target.value; setLocalMethods(copy); }} className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" placeholder="Personal / Agent / Pay ID" />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Additional Payment Note</label>
                  <input type="text" value={m.note || ''} onChange={(e) => { const copy=[...localMethods]; copy[idx].note=e.target.value; setLocalMethods(copy); }} className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" placeholder="Optional instructions" />
                </div>
              </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tab 4: Promo Codes */}
      {activeTab === 'promos' && (
        <div className="space-y-4">
          <form onSubmit={handleAddPromo} className="p-4 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center gap-3 text-xs">
            <input
              type="text"
              required
              placeholder="Promo Code (e.g. FLASH50)"
              value={newPromoCode}
              onChange={(e) => setNewPromoCode(e.target.value)}
              className="px-3 py-1.5 font-mono uppercase rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
            <input
              type="number"
              placeholder="Discount %"
              value={newPromoDiscount}
              onChange={(e) => setNewPromoDiscount(e.target.value)}
              className="w-24 px-3 py-1.5 font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
            <input
              type="number"
              placeholder="Bonus Credits"
              value={newPromoBonus}
              onChange={(e) => setNewPromoBonus(e.target.value)}
              className="w-28 px-3 py-1.5 font-mono rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
            <button
              type="submit"
              className="px-4 py-1.5 font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded cursor-pointer"
            >
              + Create Voucher
            </button>
          </form>

          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto"><table className="w-full text-xs text-left">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Discount</th>
                  <th className="py-3 px-4">Bonus Credits</th>
                  <th className="py-3 px-4">Redeemed</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {localPromos.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 font-mono font-bold text-teal-600 dark:text-teal-400">{c.code}</td>
                    <td className="py-3 px-4 font-mono">{c.discountPercent}%</td>
                    <td className="py-3 px-4 font-mono text-emerald-600">+{c.bonusCredits}</td>
                    <td className="py-3 px-4 font-mono">{c.usedCount} / {c.maxUses}</td>
                    <td className="py-3 px-4 text-right">
                      <span className="px-2 py-0.5 text-[10px] font-semibold rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 uppercase">
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </div>
      )}

      {/* Tab 5: Free Trial */}
      {activeTab === 'trial' && (
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Free Welcome Trial</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Grant new users a one-time welcome bonus of impression credits (added to their impression balance, never to wallet cash).
              </p>
            </div>
          </div>

          {trialLoading ? (
            <div className="flex items-center gap-2 text-slate-400 text-xs"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : (
            <div className="space-y-4 max-w-lg">
              <label className="flex items-center justify-between gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <span>
                  <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200">Enable free trial</span>
                  <span className="block text-[11px] text-slate-500 dark:text-slate-400">When off, new users cannot claim the welcome credits.</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={trialEnabled}
                  onClick={() => setTrialEnabled((v) => !v)}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${trialEnabled ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${trialEnabled ? 'translate-x-5' : ''}`} />
                </button>
              </label>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">Trial impression credits</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={trialAmount}
                  onChange={(e) => setTrialAmount(e.target.value)}
                  className="w-40 px-3 py-2 text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">e.g. 10 credits = 10 free delivered visits for each new account.</p>
              </div>

              <button
                type="button"
                onClick={saveTrial}
                disabled={trialSaving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white cursor-pointer"
              >
                {trialSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>{trialSaving ? 'Saving…' : 'Save Trial Settings'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab: How to Work (tutorial videos) */}
      {activeTab === 'howto' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-5">
            <div className="flex items-start gap-2">
              <PlayCircle className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">How to Work — Video Guides</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Add any number of tutorial videos. Each entry accepts a <span className="font-semibold text-rose-500">YouTube</span> or <span className="font-semibold text-sky-500">Telegram</span> link. Users open them from the “How to Work” screen. An entry with no link shows an “awaiting link” placeholder.
                </p>
              </div>
            </div>
          </div>

          {localHowto.length === 0 && (
            <div className="text-center py-10 text-xs text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
              No videos yet — click “Add Video” to create your first guide.
            </div>
          )}

          <div className="space-y-3">
            {localHowto.map((v, idx) => (
              <div key={v.id} className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-[11px] font-mono font-bold text-slate-400">
                    <span className="w-6 h-6 inline-flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">{idx + 1}</span>
                    {/youtu/.test(v.url) ? <Youtube className="w-3.5 h-3.5 text-rose-500" /> : /t\.me|telegram/i.test(v.url) ? <SendIcon className="w-3.5 h-3.5 text-sky-500" /> : <LinkIcon className="w-3.5 h-3.5 text-slate-400" />}
                  </span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-[11px] text-slate-500 cursor-pointer">
                      <span>Enabled</span>
                      <input type="checkbox" checked={v.enabled} onChange={(e) => { const c = [...localHowto]; c[idx] = { ...c[idx], enabled: e.target.checked }; setLocalHowto(c); }} className="rounded text-teal-600" />
                    </label>
                    <button type="button" onClick={() => setLocalHowto(localHowto.filter((_, i) => i !== idx))} className="p-1.5 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer" title="Delete video">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Title</label>
                    <input type="text" value={v.title} placeholder="How to Work — Full Walkthrough" onChange={(e) => { const c = [...localHowto]; c[idx] = { ...c[idx], title: e.target.value }; setLocalHowto(c); }} className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Category</label>
                    <input type="text" list="howto-categories" value={v.category || ''} placeholder="Getting Started" onChange={(e) => { const c = [...localHowto]; c[idx] = { ...c[idx], category: e.target.value }; setLocalHowto(c); }} className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] text-slate-400 mb-1">Video link (YouTube or Telegram)</label>
                    <input type="url" value={v.url} placeholder="https://youtu.be/…  ·  https://t.me/…" onChange={(e) => { const c = [...localHowto]; c[idx] = { ...c[idx], url: e.target.value }; setLocalHowto(c); }} className="w-full px-3 py-1.5 font-mono text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[11px] text-slate-400 mb-1">Description (optional)</label>
                    <input type="text" value={v.description || ''} placeholder="Short summary shown under the title" onChange={(e) => { const c = [...localHowto]; c[idx] = { ...c[idx], description: e.target.value }; setLocalHowto(c); }} className="w-full px-3 py-1.5 text-xs rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <datalist id="howto-categories">
            <option value="Getting Started" />
            <option value="Adsterra Setup" />
            <option value="Monetization" />
            <option value="Payments & Wallet" />
            <option value="Troubleshooting" />
          </datalist>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={() => setLocalHowto([...localHowto, { id: `howto_${Date.now().toString(36)}`, title: '', description: '', url: '', category: 'Getting Started', enabled: true, order: localHowto.length + 1 }])} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-teal-300 dark:border-teal-800 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40 cursor-pointer">
              <Plus className="w-3.5 h-3.5" />
              <span>Add Video</span>
            </button>
            <button type="button" onClick={() => { onSaveHowToVideos(localHowto.map((v, i) => ({ ...v, order: i + 1 }))); setDirty(false); }} className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 text-white cursor-pointer">
              <Save className="w-3.5 h-3.5" />
              <span>Save Videos</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab 6: Terms & Conditions */}
      {activeTab === 'terms' && (
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs p-6 space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-teal-600 dark:text-teal-400" />
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Terms &amp; Conditions</h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                This text is shown on the sign-up page and must be accepted before an account can be created. Editing it here updates the live site instantly.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 max-w-xs">
            <label className="text-[11px] font-semibold text-slate-500 shrink-0">Version</label>
            <input
              type="text"
              value={termsVersion}
              onChange={(e) => setTermsVersion(e.target.value)}
              placeholder="1.0"
              className="w-28 px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          {termsLoading ? (
            <div className="flex items-center gap-2 text-slate-400 text-xs"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : (
            <textarea
              value={termsContent}
              onChange={(e) => setTermsContent(e.target.value)}
              rows={18}
              className="w-full px-4 py-3 text-xs leading-relaxed font-sans rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500 resize-y"
              placeholder="Write your Terms & Conditions here…"
            />
          )}

          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-slate-400">{termsContent.length.toLocaleString()} characters</span>
            <button
              type="button"
              onClick={saveTerms}
              disabled={termsSaving || termsLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white cursor-pointer"
            >
              {termsSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{termsSaving ? 'Saving…' : 'Save Terms'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

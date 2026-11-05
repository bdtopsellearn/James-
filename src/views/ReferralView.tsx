import React, { useEffect, useState } from 'react';
import {
  Users,
  Copy,
  Check,
  Share2,
  DollarSign,
  Send,
  MessageCircle,
  Mail,
  ArrowUpRight,
  Gift,
  Loader2,
  BadgeCheck,
  Link2,
  Sparkles
} from 'lucide-react';
import { User } from '../types';
import { InfoCallout } from '../components/rayobyte/InfoCallout';
import { MembershipBadge } from '../components/ui/MembershipBadge';
import { apiFetchReferral, apiApplyReferralCode } from '../services/api';

interface ReferralViewProps {
  user: User;
}

export const ReferralView: React.FC<ReferralViewProps> = ({ user }) => {
  const [copied, setCopied] = useState(false);
  const [referralData, setReferralData] = useState<any>(null);
  const [loadingReferral, setLoadingReferral] = useState(true);
  const [applyCode, setApplyCode] = useState('');
  const [applying, setApplying] = useState(false);
  const [applyMsg, setApplyMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const referralCode = String(referralData?.code || user.referralCode || user.id);
  const referralUrl = `${window.location.origin}/?ref=${encodeURIComponent(referralCode)}`;

  const loadReferral = () => {
    setLoadingReferral(true);
    apiFetchReferral().then(setReferralData).catch(() => setReferralData(null)).finally(() => setLoadingReferral(false));
  };

  useEffect(() => {
    loadReferral();
  }, []);

  const handleApplyCode = async () => {
    const code = applyCode.trim().toUpperCase();
    if (!code) { setApplyMsg({ ok: false, text: 'Please enter a referral code.' }); return; }
    setApplying(true); setApplyMsg(null);
    try {
      const res = await apiApplyReferralCode(code);
      setApplyMsg({ ok: true, text: `Linked to ${res.referrer?.name || 'your referrer'} successfully.` });
      setApplyCode('');
      loadReferral();
    } catch (e: any) {
      setApplyMsg({ ok: false, text: e?.message || 'Could not apply this code.' });
    } finally {
      setApplying(false);
    }
  };

  const referredUsers = Array.isArray(referralData?.referredUsers) ? referralData.referredUsers : [];
  const totalEarned = Number(referralData?.totalEarned ?? 0);
  const commissionEarned = Number(referralData?.commissionEarned ?? 0);
  const canApplyCode = referralData?.canApplyCode === true;
  const referredBy = referralData?.referredBy;
  const events = Array.isArray(referralData?.events) ? referralData.events : [];

  const handleCopy = () => {
    navigator.clipboard.writeText(referralCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = (channel: string) => {
    const text = encodeURIComponent(`Join X AD MARKETING — the high-CPM traffic engine! Use my referral code ${referralCode} when you sign up: ${referralUrl}`);
    if (channel === 'telegram') {
      window.open(`https://t.me/share/url?url=${encodeURIComponent(referralUrl)}&text=${text}`, '_blank');
    } else if (channel === 'whatsapp') {
      window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
    } else if (channel === 'email') {
      window.open(`mailto:?subject=Join%20CC&body=${text}`, '_blank');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
          Affiliate & Referral Partner Program
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Earn 10% lifetime commission on every wallet deposit made by publishers and advertisers you refer.
        </p>
      </div>

      <InfoCallout
        title="Automated Instant Commission Payouts"
        message="Affiliate commissions are credited to your active wallet balance in real time whenever an invited user's deposit is approved."
      />

      {/* Referral code linking (one-time) */}
      {referredBy ? (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30">
          <BadgeCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div className="text-xs">
            <span className="font-semibold text-emerald-800 dark:text-emerald-300 block">Referral code linked</span>
            <span className="text-emerald-700/80 dark:text-emerald-400/80">
              You joined with <span className="font-mono font-semibold">{referredBy.code}</span> ({referredBy.name}). This link is permanent and cannot be changed.
            </span>
          </div>
        </div>
      ) : canApplyCode ? (
        <div className="p-5 rounded-xl border border-teal-200 dark:border-teal-900/60 bg-gradient-to-br from-teal-50 to-white dark:from-teal-950/30 dark:to-[#0f172a] shadow-xs">
          <div className="flex items-center gap-2 mb-1">
            <Gift className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Have a referral code?</h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            If you signed up without a referral code, you can attach one — exactly once. It cannot be changed afterwards.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 max-w-md">
            <input
              value={applyCode}
              onChange={(e) => setApplyCode(e.target.value.toUpperCase().slice(0, 12))}
              placeholder="e.g. AB12CD"
              className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono tracking-widest uppercase text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
            />
            <button
              onClick={handleApplyCode}
              disabled={applying}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white cursor-pointer transition-colors"
            >
              {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
              <span>{applying ? 'Applying…' : 'Apply Code'}</span>
            </button>
          </div>
          {applyMsg && (
            <p className={`mt-2 text-xs font-medium ${applyMsg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
              {applyMsg.text}
            </p>
          )}
        </div>
      ) : null}

      {/* 2-Column: Link & QR Box + Earnings Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Link Box and Share Actions */}
        <div className="lg:col-span-2 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Your Referral Code
          </h3>

          <div className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900">
            <span className="font-mono text-lg sm:text-xl font-extrabold tracking-[0.35em] text-teal-600 dark:text-teal-400 truncate flex-1 select-all">
              {referralCode}
            </span>
            <button
              onClick={handleCopy}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded bg-teal-600 hover:bg-teal-700 text-white cursor-pointer transition-colors shrink-0"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy Code'}</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Share this code with new publishers — they enter it when creating their account.
          </p>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-2">
              Share Direct to Publishers
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleShare('telegram')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800 hover:bg-sky-100 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Telegram</span>
              </button>
              <button
                onClick={() => handleShare('whatsapp')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 cursor-pointer"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </button>
              <button
                onClick={() => handleShare('email')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 cursor-pointer"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Email Invitation</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Col: Earnings Card */}
        <div className="p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900">
              <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 block">Referral Earnings</span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">Paid instantly to your wallet</span>
            </div>
          </div>

          <div className="w-full pt-4 border-t border-slate-100 dark:border-slate-800 mt-4 space-y-2">
            <div>
              <span className="text-[11px] text-slate-500 block">Total Affiliate Earnings</span>
              <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                ${totalEarned.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-teal-600 dark:text-teal-400">
              <Sparkles className="w-3 h-3" />
              <span>${commissionEarned.toFixed(2)} from 10% lifetime commission</span>
            </div>
          </div>
        </div>
      </div>

      {/* Referred Users Table */}
      <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Referred Publishers & Advertisers ({loadingReferral ? '…' : referredUsers.length})
          </h3>
          <span className="text-[11px] text-teal-600 font-mono">10% Tier Active</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">Publisher Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Join Date</th>
                <th className="py-3 px-4">Total Top-ups</th>
                <th className="py-3 px-4 text-right">Your 10% Commission</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {referredUsers.map((u: any, i: number) => (
                <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                  <td className="py-3 px-4 font-semibold text-slate-900 dark:text-slate-100">
                    <span className="inline-flex items-center gap-1">
                      <span>{u.name}</span>
                      <MembershipBadge plan={u.plan} expiresAt={u.membershipExpiresAt} size="xs" />
                    </span>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-500">{u.email}</td>
                  <td className="py-3 px-4 font-mono text-slate-500">{u.date}</td>
                  <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300 tabular-nums">{u.spent}</td>
                  <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400 text-right tabular-nums">{typeof u.earned === 'number' ? `$${u.earned.toFixed(2)}` : u.earned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent commission payouts */}
      {events.length > 0 && (
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-500" /> Recent Commission Payouts
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">10% lifetime</span>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {events.slice(0, 8).map((ev: any, i: number) => (
              <li key={i} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <span className="text-slate-500 dark:text-slate-400">
                  Top-up of <span className="font-mono text-slate-700 dark:text-slate-300">${Number(ev.topup || 0).toFixed(2)}</span>
                  {ev.at ? ` • ${new Date(ev.at).toLocaleDateString()}` : ''}
                </span>
                <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  +${Number(ev.commission || 0).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

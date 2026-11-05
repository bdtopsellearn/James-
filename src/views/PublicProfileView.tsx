import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Loader2,
  Calendar,
  Eye,
  Crown,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { UserAvatar } from '../components/ui/UserAvatar';
import { MembershipBadge } from '../components/ui/MembershipBadge';
import { apiPublicProfile, PublicProfile } from '../services/api';

interface PublicProfileViewProps {
  userId: string;
  onNavigate: (view: string) => void;
}

// ── Brand logos (inline SVG so no extra dependency) ──────────────────────────
const FacebookLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.5-3.91 3.78-3.91 1.1 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.87h2.78l-.44 2.9h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94Z" />
  </svg>
);
const TikTokLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M16.5 3c.3 2.1 1.6 3.7 3.7 3.9v2.5c-1.3.1-2.6-.3-3.7-1v6.4a5.4 5.4 0 1 1-5.4-5.4c.3 0 .5 0 .8.1v2.6a2.8 2.8 0 1 0 2 2.7V3h2.6Z" />
  </svg>
);
const WhatsAppLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 1 1 12 20Zm4.4-6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1-.2.2-.6.8-.8 1-.1.1-.3.2-.5 0a6.5 6.5 0 0 1-3.2-2.8c-.2-.4.2-.4.6-1.2.1-.2 0-.4 0-.5l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.4a.9.9 0 0 0-.7.3c-.2.2-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.2.7 3 .6.5-.1 1.4-.6 1.6-1.2.2-.6.2-1.1.1-1.2 0-.1-.2-.2-.4-.3Z" />
  </svg>
);

function normalizeUrl(kind: 'facebook' | 'tiktok' | 'whatsapp', raw?: string): string {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  if (kind === 'facebook') return `https://facebook.com/${v.replace(/^@/, '')}`;
  if (kind === 'tiktok') return `https://tiktok.com/@${v.replace(/^@/, '')}`;
  if (kind === 'whatsapp') {
    const digits = v.replace(/[^\d]/g, '');
    return `https://wa.me/${digits}`;
  }
  return v;
}

export const PublicProfileView: React.FC<PublicProfileViewProps> = ({ userId, onNavigate }) => {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    apiPublicProfile(userId)
      .then((p) => { setProfile(p); setError(null); })
      .catch((e) => setError(e?.message || 'Could not load this profile.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [userId]);

  const banner = profile?.bannerColor?.trim() || 'linear-gradient(135deg,#0d9488,#059669,#0891b2)';
  const bannerStyle: React.CSSProperties = banner.includes('gradient')
    ? { backgroundImage: banner }
    : { backgroundColor: banner };

  const socials = profile?.socials || {};
  const socialLinks = [
    { kind: 'facebook' as const, url: normalizeUrl('facebook', socials.facebook), label: 'Facebook', Logo: FacebookLogo, cls: 'bg-[#1877F2] hover:bg-[#1466d6]' },
    { kind: 'tiktok' as const, url: normalizeUrl('tiktok', socials.tiktok), label: 'TikTok', Logo: TikTokLogo, cls: 'bg-black hover:bg-slate-800' },
    { kind: 'whatsapp' as const, url: normalizeUrl('whatsapp', socials.whatsapp), label: 'WhatsApp', Logo: WhatsAppLogo, cls: 'bg-[#25D366] hover:bg-[#1eb85a]' },
  ].filter((s) => s.url);

  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '—';

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={() => onNavigate('leaderboard')}
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-teal-600 dark:hover:text-teal-400 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Leaderboard
      </button>

      {loading ? (
        <div className="py-24 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-teal-500" />
          <p className="text-xs text-slate-400">Loading profile…</p>
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 p-6 text-center">
          <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
        </div>
      ) : profile ? (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-sm overflow-hidden animate-fade-up">
          {/* Banner */}
          <div className="relative h-40 sm:h-48" style={bannerStyle}>
            <div className="absolute inset-0 bg-black/10" />
            <div className="absolute inset-0 opacity-30" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(255,255,255,.5), transparent 40%), radial-gradient(circle at 80% 60%, rgba(255,255,255,.35), transparent 45%)' }} />
          </div>

          <div className="px-5 sm:px-8 pb-8">
            <div className="-mt-14 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div className="flex items-end gap-4">
                <span className="p-1 rounded-full bg-white dark:bg-[#0f172a] shadow-lg">
                  <UserAvatar name={profile.name} src={profile.avatar} size="xl" />
                </span>
                <div className="pb-1">
                  <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-50 flex items-center gap-2 flex-wrap">
                    {profile.name}
                    <MembershipBadge plan={profile.plan} expiresAt={profile.membershipExpiresAt} size="md" />
                  </h1>
                  <p className="text-xs text-slate-400">@{profile.username}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pb-1">
                {profile.plan && profile.plan !== 'free' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold bg-gradient-to-r from-amber-400 to-orange-500 text-white shadow">
                    <Crown className="w-3.5 h-3.5" /> {profile.planLabel}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    🆓 Free member
                  </span>
                )}
                {profile.country && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                    <MapPin className="w-3.5 h-3.5" /> {profile.country}
                  </span>
                )}
              </div>
            </div>

            {profile.bio && (
              <p className="mt-5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">{profile.bio}</p>
            )}

            {/* Stats */}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <Eye className="w-3.5 h-3.5" /> Total Impressions
                </div>
                <div className="mt-1 text-xl font-extrabold tabular-nums text-slate-900 dark:text-slate-50">
                  {profile.totalImpressions.toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <Crown className="w-3.5 h-3.5" /> Membership
                </div>
                <div className="mt-1 text-xl font-extrabold text-slate-900 dark:text-slate-50">
                  {profile.planLabel}
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 col-span-2 sm:col-span-1">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <Calendar className="w-3.5 h-3.5" /> Member Since
                </div>
                <div className="mt-1 text-xl font-extrabold text-slate-900 dark:text-slate-50">{memberSince}</div>
              </div>
            </div>

            {/* Social links — tap the app logo to open the saved URL */}
            {socialLinks.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Connect</h3>
                <div className="flex flex-wrap gap-3">
                  {socialLinks.map(({ kind, url, label, Logo, cls }) => (
                    <a
                      key={kind}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${cls}`}
                    >
                      <Logo className="w-5 h-5" />
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

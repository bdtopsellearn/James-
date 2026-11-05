import React, { useRef, useState } from 'react';
import {
  Camera,
  Lock,
  Trash2,
  Check,
  Loader2,
  Mail,
  Phone,
  Globe2,
  Calendar,
  Fingerprint,
  Wallet as WalletIcon,
  Coins,
  AlertCircle,
  Laptop,
  Copy,
  Crown,
  Sparkles,
  ShieldCheck,
  Palette,
  Share2,
  ExternalLink
} from 'lucide-react';
import { User as UserType, UserSession, Credits, Wallet } from '../types';
import { MembershipBadge } from '../components/ui/MembershipBadge';

export interface ProfileExtra {
  bio?: string;
  phone?: string;
  country?: string;
  firstName?: string;
  lastName?: string;
  telegram?: string;
  bannerColor?: string;
  socials?: { facebook?: string; tiktok?: string; whatsapp?: string };
}

/** Inline brand logos (no external assets, no extra deps). */
const FacebookLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5 3.66 9.15 8.44 9.94v-7.03H7.9v-2.9h2.54V9.85c0-2.52 1.49-3.91 3.78-3.91 1.09 0 2.24.2 2.24.2v2.47h-1.26c-1.24 0-1.63.78-1.63 1.57v1.88h2.78l-.44 2.9h-2.34V22c4.78-.79 8.44-4.94 8.44-9.94Z" />
  </svg>
);
const TikTokLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 0 1-2.59-2.59 2.59 2.59 0 0 1 3.36-2.46V9.7a5.66 5.66 0 0 0-.77-.05A5.66 5.66 0 0 0 4.2 15.3a5.66 5.66 0 0 0 5.66 5.66 5.66 5.66 0 0 0 5.66-5.66V9.01a7.34 7.34 0 0 0 4.28 1.37V7.29a4.28 4.28 0 0 1-3.2-1.47Z" />
  </svg>
);
const WhatsAppLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
    <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.19 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35Z" />
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.15h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23Z" />
  </svg>
);

/** Preset banner colours (solid + gradient tokens rendered via inline style). */
const BANNER_PRESETS: { id: string; label: string; css: string }[] = [
  { id: 'teal', label: 'Teal', css: 'linear-gradient(135deg,#0d9488,#059669,#0891b2)' },
  { id: 'violet', label: 'Violet', css: 'linear-gradient(135deg,#7c3aed,#6366f1,#d946ef)' },
  { id: 'sunset', label: 'Sunset', css: 'linear-gradient(135deg,#f97316,#ef4444,#ec4899)' },
  { id: 'ocean', label: 'Ocean', css: 'linear-gradient(135deg,#0ea5e9,#2563eb,#1e3a8a)' },
  { id: 'forest', label: 'Forest', css: 'linear-gradient(135deg,#16a34a,#15803d,#065f46)' },
  { id: 'gold', label: 'Gold', css: 'linear-gradient(135deg,#f59e0b,#f97316,#b45309)' },
  { id: 'rose', label: 'Rose', css: 'linear-gradient(135deg,#fb7185,#e11d48,#9f1239)' },
  { id: 'midnight', label: 'Midnight', css: 'linear-gradient(135deg,#1e293b,#0f172a,#334155)' },
  { id: 'candy', label: 'Candy', css: 'linear-gradient(135deg,#22d3ee,#a78bfa,#f472b6)' },
  { id: 'lime', label: 'Lime', css: 'linear-gradient(135deg,#84cc16,#22c55e,#14b8a6)' },
];

/** Build a fully-qualified URL from a loose handle/link the user typed. */
function normalizeSocialUrl(kind: 'facebook' | 'tiktok' | 'whatsapp', raw: string): string {
  const v = (raw || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, '').replace(/^\/+/, '');
  if (kind === 'facebook') return `https://facebook.com/${handle}`;
  if (kind === 'tiktok') return `https://tiktok.com/@${handle}`;
  return `https://wa.me/${handle.replace(/[^\d+]/g, '')}`;
}

interface ProfileViewProps {
  user: UserType;
  wallet: Wallet;
  credits: Credits;
  sessions: UserSession[];
  onUpdateProfile: (name: string, email: string, avatar?: string, extra?: ProfileExtra) => void | Promise<void>;
  onChangePassword: (oldPass: string, newPass: string) => Promise<boolean>;
  onRevokeSession: (sessionId: string) => void;
}

/** Resize + compress a picked image to a small square JPEG data URL (keeps the DB light). */
/** Re-encode a canvas as JPEG, lowering quality until it fits maxChars (data-URL length). */
function canvasToJpegUnder(canvas: HTMLCanvasElement, maxChars: number, startQ: number, minQ = 0.5): string {
  let q = startQ;
  let out = canvas.toDataURL('image/jpeg', q);
  while (out.length > maxChars && q > minQ) {
    q = Math.max(minQ, q - 0.08);
    out = canvas.toDataURL('image/jpeg', q);
  }
  return out;
}

/** Admin photos are stored as-is (original size & quality) whenever they fit the server limit. */
function fileToAdminAvatarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.onload = () => {
      const raw = String(reader.result || '');
      if (raw.length <= 600 * 1024) return resolve(raw); // original, untouched
      const img = new Image();
      img.onerror = () => reject(new Error('This file is not a valid image.'));
      img.onload = () => {
        const scale = Math.min(1, 1200 / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Image processing is not supported on this device.'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvasToJpegUnder(canvas, 650 * 1024, 0.95, 0.6));
      };
      img.src = raw;
    };
    reader.readAsDataURL(file);
  });
}

function fileToAvatarDataUrl(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('This file is not a valid image.'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Image processing is not supported on this device.'));
        // center-crop to a square
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        // users: small square, compressed (typically 10-30 KB) so Firebase storage stays tiny
        resolve(canvasToJpegUnder(canvas, 45 * 1024, 0.8, 0.45));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

const inputCls =
  'w-full px-3 py-2.5 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/60 focus:border-teal-500 transition-shadow';

export const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  wallet,
  credits,
  sessions,
  onUpdateProfile,
  onChangePassword,
  onRevokeSession
}) => {
  const [name, setName] = useState(user.name);
  const [bio, setBio] = useState(user.bio || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [country, setCountry] = useState(user.country || '');
  const [firstName, setFirstName] = useState(user.firstName || '');
  const [lastName, setLastName] = useState(user.lastName || '');
  const [telegram, setTelegram] = useState(user.telegram || '');
  const [bannerColor, setBannerColor] = useState(user.bannerColor || '');
  const [facebook, setFacebook] = useState(user.socials?.facebook || '');
  const [tiktok, setTiktok] = useState(user.socials?.tiktok || '');
  const [whatsapp, setWhatsapp] = useState(user.socials?.whatsapp || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatar, setAvatar] = useState(user.avatar || '');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty =
    name !== user.name ||
    bio !== (user.bio || '') ||
    phone !== (user.phone || '') ||
    country !== (user.country || '') ||
    firstName !== (user.firstName || '') ||
    lastName !== (user.lastName || '') ||
    telegram !== (user.telegram || '') ||
    bannerColor !== (user.bannerColor || '') ||
    facebook !== (user.socials?.facebook || '') ||
    tiktok !== (user.socials?.tiktok || '') ||
    whatsapp !== (user.socials?.whatsapp || '') ||
    avatar !== (user.avatar || '');

  const handlePickAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) {
      setNotice({ type: 'err', text: 'Please choose a PNG, JPG or WEBP image.' });
      return;
    }
    if (f.size > 2 * 1024 * 1024) {
      setNotice({ type: 'err', text: 'Image must be 2MB or smaller.' });
      return;
    }
    try {
      setAvatar(user.role === 'admin' ? await fileToAdminAvatarDataUrl(f) : await fileToAvatarDataUrl(f));
      setNotice({ type: 'ok', text: 'Photo ready — press "Save Profile" to apply it.' });
    } catch (err) {
      setNotice({ type: 'err', text: err instanceof Error ? err.message : 'Image failed to load.' });
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setNotice({ type: 'err', text: 'Display name cannot be empty.' });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      // email is always the original sign-up email — it is locked and never editable
      await onUpdateProfile(name.trim(), user.email, avatar, {
        bio: bio.trim(),
        phone: phone.trim(),
        country: country.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        telegram: telegram.trim().replace(/^@/, ''),
        bannerColor: bannerColor.trim(),
        socials: {
          facebook: facebook.trim(),
          tiktok: tiktok.trim(),
          whatsapp: whatsapp.trim()
        }
      });
      setNotice({ type: 'ok', text: 'Profile saved.' });
    } catch {
      setNotice({ type: 'err', text: 'Could not save profile. Try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      alert('New password and confirmation do not match.');
      return;
    }
    const ok = await onChangePassword(oldPassword, newPassword);
    if (!ok) return;
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    alert('Password updated successfully. All other active sessions rotated.');
  };

  const initial = (name || user.name || '?').charAt(0).toUpperCase();

  const isAdminUser = user.role === 'admin';
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copyText = async (text: string, key: string) => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      try { const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); }
      catch { return; }
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1600);
  };

  // Profile completeness (live — follows what is typed in the form below)
  const completeness = (() => {
    const checks = [!!avatar, !!name.trim(), !!firstName.trim(), !!lastName.trim(), !!phone.trim(), !!country.trim(), !!telegram.trim(), !!bio.trim()];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  })();
  const RING = 2 * Math.PI * 26;

  const createdAtMs = new Date(user.createdAt).getTime();
  const memberSince = isNaN(createdAtMs) ? '—' : new Date(createdAtMs).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  const expiresMs = new Date(user.membershipExpiresAt).getTime();
  const planDaysLeft = isNaN(expiresMs) ? null : Math.max(0, Math.ceil((expiresMs - Date.now()) / 86400000));
  const planName = String(user.membershipPlanId || 'free').replace('plan_', '').replace(/^\w/, (c) => c.toUpperCase());
  const accent = isAdminUser
    ? { cover: 'from-violet-600 via-indigo-600 to-fuchsia-600', ring: 'from-amber-300 via-fuchsia-400 to-violet-500', chip: 'bg-amber-400/15 text-amber-500 border-amber-400/30' }
    : { cover: 'from-teal-500 via-emerald-500 to-cyan-500', ring: 'from-teal-300 via-emerald-400 to-cyan-400', chip: 'bg-teal-500/10 text-teal-600 dark:text-teal-300 border-teal-500/30' };

  return (
    <div className="space-y-6 animate-fade-up">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0f172a] shadow-sm">
        {/* animated cover */}
        <div
          className={`relative h-28 sm:h-36 ${bannerColor ? '' : `bg-gradient-to-r ${accent.cover}`} animate-gradient overflow-hidden`}
          style={bannerColor ? { background: bannerColor } : undefined}
        >
          <span className="absolute -top-10 -left-6 w-44 h-44 rounded-full bg-white/20 blur-2xl animate-float" aria-hidden="true" />
          <span className="absolute -bottom-16 right-8 w-56 h-56 rounded-full bg-black/20 blur-3xl" aria-hidden="true" />
          <span className="absolute inset-0 opacity-[0.12]" aria-hidden="true" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />
        </div>

        <div className="px-5 sm:px-7 pb-6 -mt-14 sm:-mt-16 flex flex-col sm:flex-row sm:items-end gap-5">
          {/* Avatar with animated ring + upload */}
          <div className="relative shrink-0 self-start">
            <span className={`absolute -inset-1.5 rounded-full bg-gradient-to-tr ${accent.ring} opacity-90 blur-[1px] animate-spin`} style={{ animationDuration: '9s' }} aria-hidden="true" />
            {avatar ? (
              <img src={avatar} alt={user.name} className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full object-cover ring-4 ring-white dark:ring-[#0f172a] shadow-xl" />
            ) : (
              <div className={`relative w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-br ${isAdminUser ? 'from-violet-500 to-fuchsia-600' : 'from-teal-500 to-emerald-600'} text-white flex items-center justify-center font-extrabold text-4xl ring-4 ring-white dark:ring-[#0f172a] shadow-xl`}>
                {initial}
              </div>
            )}
            <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#0f172a]" title="Online" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Upload profile picture"
              className="absolute bottom-0 right-0 p-2 rounded-full bg-slate-900 hover:bg-slate-700 dark:bg-white dark:hover:bg-slate-200 text-white dark:text-slate-900 shadow-lg ring-2 ring-white dark:ring-[#0f172a] cursor-pointer transition-transform active:scale-90"
            >
              <Camera className="w-4 h-4" />
            </button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handlePickAvatar} />
          </div>

          <div className="flex-1 min-w-0 sm:pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight break-words min-w-0">{user.name}</h1>
              <MembershipBadge plan={user.membershipPlanId} expiresAt={user.membershipExpiresAt} size="lg" adminRole={user.role === 'admin' ? (user.adminRole === 'super_admin' ? 'super_admin' : 'admin') : undefined} />
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-full border ${accent.chip}`}>
                {isAdminUser ? <Crown className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
                {isAdminUser ? 'Platform Administrator' : `${planName} plan`}
              </span>
              {!isAdminUser && planDaysLeft !== null && (
                <span className="px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                  {planDaysLeft > 0 ? `${planDaysLeft} day${planDaysLeft === 1 ? '' : 's'} left` : 'Expired'}
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                <ShieldCheck className="w-3 h-3" /> Secured
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1.5 min-w-0">
              <Mail className="w-3 h-3 shrink-0" />
              <span className="font-mono truncate">{user.email}</span>
              <button type="button" onClick={() => copyText(user.email, 'email')} aria-label="Copy email" className="shrink-0 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                {copiedKey === 'email' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              </button>
            </p>
            {avatar && (
              <button type="button" onClick={() => setAvatar('')} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-rose-500 hover:text-rose-400 cursor-pointer">
                <Trash2 className="w-3 h-3" /> Remove photo
              </button>
            )}
          </div>

          {/* completeness ring */}
          <div className="shrink-0 flex items-center gap-3 self-start sm:self-end sm:pb-1">
            <div className="relative w-16 h-16">
              <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90" aria-hidden="true">
                <circle cx="32" cy="32" r="26" fill="none" strokeWidth="6" className="stroke-slate-200 dark:stroke-slate-800" />
                <circle cx="32" cy="32" r="26" fill="none" strokeWidth="6" strokeLinecap="round"
                  className={isAdminUser ? 'stroke-violet-500' : 'stroke-teal-500'}
                  style={{ strokeDasharray: RING, strokeDashoffset: RING * (1 - completeness / 100), transition: 'stroke-dashoffset .8s cubic-bezier(.22,1,.36,1)' }} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-sm font-extrabold text-slate-900 dark:text-slate-100">{completeness}%</span>
            </div>
            <div className="text-[11px] leading-tight text-slate-500 dark:text-slate-400">
              <p className="font-bold text-slate-700 dark:text-slate-200">Profile</p>
              <p>{completeness === 100 ? 'Complete 🎉' : 'completeness'}</p>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-800">
          {[
            { icon: Calendar, label: 'Member since', value: memberSince, cls: 'text-teal-500' },
            { icon: Fingerprint, label: 'User ID (tap to copy)', value: (user as any).publicId || user.id, cls: 'text-cyan-500', mono: true, copy: (user as any).publicId || user.id },
            { icon: Coins, label: 'Credits left', value: Number(credits?.balance || 0).toLocaleString(), cls: 'text-amber-500' },
            { icon: WalletIcon, label: 'Wallet balance', value: `৳${Number(wallet?.balance || 0).toFixed(2)}`, cls: 'text-emerald-500' }
          ].map((st) => (
            <button
              type="button"
              key={st.label}
              disabled={!st.copy}
              onClick={() => st.copy && copyText(st.copy, st.label)}
              className={`text-left bg-white dark:bg-[#0f172a] p-4 flex items-center gap-3 min-w-0 transition-colors ${st.copy ? 'hover:bg-slate-50 dark:hover:bg-slate-900 cursor-pointer' : 'cursor-default'}`}
            >
              <span className="shrink-0 w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center">
                {st.copy && copiedKey === st.label ? <Check className="w-4 h-4 text-emerald-500" /> : <st.icon className={`w-4 h-4 ${st.cls}`} />}
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] uppercase tracking-wider text-slate-400 truncate">{st.label}</span>
                <span className={`block text-xs font-bold text-slate-900 dark:text-slate-100 truncate ${st.mono ? 'font-mono' : ''}`}>{st.value}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Jump chips */}
      <div className="flex flex-wrap gap-2 -mt-2">
        {[['profile-details', 'Personal details'], ['profile-security', 'Password & security'], ['profile-devices', 'Devices']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-teal-400 hover:text-teal-600 dark:hover:text-teal-300 transition-colors cursor-pointer">
            {label}
          </button>
        ))}
      </div>

      {/* 2-Column: Edit Profile & Change Password */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profile Details Form */}
        <div id="profile-details" className="scroll-mt-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Profile & Identity
          </h3>

          {notice && (
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border ${
                notice.type === 'ok'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300'
              }`}
            >
              {notice.type === 'ok' ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
              {notice.text}
            </div>
          )}

          <form onSubmit={handleProfileSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Full Display Name
              </label>
              <input
                type="text"
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputCls}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">First Name</label>
                <input type="text" maxLength={50} value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Last Name</label>
                <input type="text" maxLength={50} value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputCls} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Telegram Username</label>
              <input
                type="text"
                maxLength={33}
                value={telegram}
                onChange={(e) => setTelegram(e.target.value)}
                placeholder="@username"
                autoCapitalize="none"
                className={inputCls}
              />
            </div>

            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                <Palette className="w-3.5 h-3.5" /> Profile Banner Colour
              </label>
              <div className="flex flex-wrap gap-2">
                {BANNER_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    title={p.label}
                    aria-label={`Banner ${p.label}`}
                    onClick={() => setBannerColor(p.css)}
                    className={`relative w-9 h-9 rounded-lg ring-2 transition-transform active:scale-90 cursor-pointer ${bannerColor === p.css ? 'ring-teal-500 scale-105' : 'ring-transparent hover:ring-slate-300 dark:hover:ring-slate-600'}`}
                    style={{ background: p.css }}
                  >
                    {bannerColor === p.css && (
                      <Check className="absolute inset-0 m-auto w-4 h-4 text-white drop-shadow" />
                    )}
                  </button>
                ))}
                <label className="relative w-9 h-9 rounded-lg ring-2 ring-transparent hover:ring-slate-300 dark:hover:ring-slate-600 overflow-hidden cursor-pointer bg-[conic-gradient(from_0deg,red,orange,yellow,green,cyan,blue,violet,red)]" title="Custom colour">
                  <input
                    type="color"
                    value={/^#[0-9a-f]{6}$/i.test(bannerColor) ? bannerColor : '#0d9488'}
                    onChange={(e) => setBannerColor(e.target.value)}
                    className="absolute -inset-2 w-[150%] h-[150%] opacity-0 cursor-pointer"
                    aria-label="Custom banner colour"
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white drop-shadow">+</span>
                </label>
                {bannerColor && (
                  <button
                    type="button"
                    onClick={() => setBannerColor('')}
                    className="w-9 h-9 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 hover:text-rose-500 hover:border-rose-400 flex items-center justify-center cursor-pointer transition-colors"
                    title="Reset to default"
                    aria-label="Reset banner colour"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                Pick a preset or tap the rainbow swatch for any custom colour. The banner updates instantly on your profile &amp; public page.
              </p>
            </div>

            <div>
              <label className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email Address</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  <Lock className="w-3 h-3" /> LOCKED
                </span>
              </label>
              <input
                type="email"
                value={user.email}
                readOnly
                disabled
                aria-readonly="true"
                className={`${inputCls} font-mono opacity-70 cursor-not-allowed select-all`}
              />
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                Your sign-up Gmail is permanent and cannot be changed.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Bio
              </label>
              <textarea
                rows={3}
                maxLength={300}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell us a little about yourself or your business"
                className={`${inputCls} resize-none`}
              />
              <span className="block text-right text-[10px] text-slate-400">{bio.length}/300</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  <Phone className="w-3.5 h-3.5" /> Phone
                </label>
                <input
                  type="tel"
                  maxLength={30}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+880 1XXX-XXXXXX"
                  className={inputCls}
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  <Globe2 className="w-3.5 h-3.5" /> Country
                </label>
                <input
                  type="text"
                  maxLength={60}
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Bangladesh"
                  className={inputCls}
                />
              </div>
            </div>

            {/* Social links — saved to profile & shown on the public page */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/60 dark:bg-slate-900/40">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-teal-500" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Social Links</span>
                <span className="ml-auto text-[10px] font-semibold text-slate-400">shown on your public profile</span>
              </div>

              {([
                { key: 'facebook', label: 'Facebook', icon: FacebookLogo, value: facebook, set: setFacebook, ph: 'facebook.com/yourpage', color: '#1877F2' },
                { key: 'tiktok', label: 'TikTok', icon: TikTokLogo, value: tiktok, set: setTiktok, ph: '@yourhandle', color: '#010101' },
                { key: 'whatsapp', label: 'WhatsApp', icon: WhatsAppLogo, value: whatsapp, set: setWhatsapp, ph: '+8801XXXXXXXXX', color: '#25D366' }
              ] as const).map((s) => {
                const url = normalizeSocialUrl(s.key, s.value);
                return (
                  <div key={s.key} className="flex items-center gap-2">
                    <a
                      href={url || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => { if (!url) e.preventDefault(); }}
                      title={url ? `Open ${s.label}` : 'Add a link first'}
                      className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-white shadow-sm transition-transform ${url ? 'cursor-pointer hover:scale-110 active:scale-95' : 'opacity-45 cursor-not-allowed'}`}
                      style={{ background: s.color }}
                    >
                      <s.icon className="w-5 h-5" />
                    </a>
                    <input
                      type="text"
                      value={s.value}
                      onChange={(e) => s.set(e.target.value)}
                      placeholder={s.ph}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className={inputCls}
                    />
                    {url && (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-teal-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Open link">
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                );
              })}
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Paste a full link or just your handle — we'll build the URL. Tap a coloured app icon to open the saved page.
              </p>
            </div>

            <button
              type="submit"
              disabled={saving || !dirty}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white cursor-pointer shadow-md shadow-teal-500/20 transition-all active:scale-95"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              {saving ? 'Saving…' : 'Save Profile'}
            </button>
          </form>
        </div>

        {/* Change Password Form */}
        <div id="profile-security" className="scroll-mt-4 p-6 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Security & Password Rotation
          </h3>

          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Current Password
              </label>
              <input
                type="password"
                required
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                New Password (Bcrypt Salt 12)
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-type new password"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
              />
            </div>

            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:opacity-90 transition-opacity cursor-pointer"
            >
              Update Password
            </button>
          </form>
        </div>
      </div>

      {/* Active Sessions Manager */}
      <div id="profile-devices" className="scroll-mt-4 bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Active Hardware Sessions & Devices
          </h3>
          <span className="text-[11px] text-teal-600 font-mono">
            JWT Rotation Active
          </span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
          {sessions.map((sess) => (
            <div key={sess.id} className="p-4 flex items-center justify-between text-xs">
              <div className="flex items-center gap-3">
                <Laptop className="w-5 h-5 text-slate-400" />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {sess.device}
                    </span>
                    {sess.isCurrent && (
                      <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300 uppercase">
                        Current Session
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                    {sess.browser} · IP: {sess.ip} · {sess.lastActive}
                  </span>
                </div>
              </div>

              {!sess.isCurrent && (
                <button
                  onClick={() => onRevokeSession(sess.id)}
                  className="px-3 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded cursor-pointer transition-colors"
                >
                  Revoke Device
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

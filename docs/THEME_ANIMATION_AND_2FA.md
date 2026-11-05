# Theme Animation + Admin Authenticator (2FA)

This release adds two features on top of the existing PROFIT NEXA platform:

1. **Animated Light ⇄ Dark theme switching** (no more instant flip).
2. **Admin Authenticator (TOTP 2FA)** for admin sign-in — beautiful UI, fully working, with an ON/OFF toggle.

---

## 1. Animated theme switch

**Files:** `src/theme.ts`, `src/index.css`

The theme store (`useSyncExternalStore`) now performs an animated transition using the
browser **View Transitions API**:

- On toggle, the pointer position is captured and a **circular reveal** expands from the
  click point across the viewport (`clip-path: circle(...)`), revealing the new theme.
- The animation is driven by CSS custom properties `--pn-theme-x`, `--pn-theme-y`,
  `--pn-theme-r` set on `<html>`, with the keyframes `pn-theme-reveal` in `src/index.css`.
- The `.pn-theme-switching` class temporarily locks all CSS transitions so the theme swap
  itself is a clean reveal (no half-animated colors).
- **Graceful fallback:** browsers without View Transitions (or users with
  `prefers-reduced-motion: reduce`) get an instant, jank-free switch.

No dependencies were added — it is pure CSS + a few lines of TypeScript.

---

## 2. Admin Authenticator (TOTP 2FA)

A zero-dependency, RFC 6238-compliant Time-based One-Time Password system for admin login.

### Server (`api-server.cjs`)

- **Crypto core (no npm packages):** base32 encode/decode, HMAC-SHA1 HOTP/TOTP,
  ±1 time-step drift window, `timingSafeEqual` comparison, `otpauth://` URI builder,
  and 8 recovery codes (SHA-256 hashed at rest). Verified against the RFC 6238 test
  vectors (6/6 pass).
- **Login gate:** when an admin has 2FA enabled, `POST /api/auth/login` does **not**
  return a session token. It returns `{ twoFactorRequired: true, challengeToken, email }`
  where `challengeToken` is a short-lived (5 min) signed token with `purpose: '2fa'`.
- **Endpoints added:**
  | Method | Path | Purpose |
  |---|---|---|
  | POST | `/api/auth/login/2fa` | Verify TOTP **or** recovery code, then issue the real session token |
  | GET  | `/api/admin/2fa/status` | Current state (enabled, enabledAt, recovery codes left, policy) |
  | POST | `/api/admin/2fa/setup` | Generate a new secret + `otpauth://` URI (not yet active) |
  | POST | `/api/admin/2fa/enable` | Confirm a code and turn 2FA **on** |
  | POST | `/api/admin/2fa/disable` | Confirm a code and turn 2FA **off** |
  | POST | `/api/admin/2fa/recovery/regenerate` | Issue a fresh set of recovery codes |
  | GET/PUT | `/api/admin/settings/2fa` | Super-Admin global policy (require 2FA for all admins) |
- **Auditing:** `ADMIN_2FA_LOGIN`, `ADMIN_2FA_FAILED`, enable/disable events are written to
  the audit log. The 2FA verify endpoint is rate-limited (10 attempts / 10 min).
- **Data model:** new Firestore roots `admin_2fa` (map keyed by uid) and
  `admin_2fa_policy`.

### Client

- `src/services/api.ts` — typed wrappers for every endpoint above, plus an
  `isTwoFactorChallenge()` type guard.
- `src/views/auth/AdminLoginView.tsx` — **two-step login**: credentials → segmented
  6-digit code (with a "Use a recovery code" toggle). Invalid/expired challenge returns
  the user to the credentials step.
- `src/components/ui/OtpInput.tsx` — shared segmented OTP input (auto-advance, paste,
  backspace/arrow navigation, autofocus).
- `src/views/admin/AdminTwoFactorCard.tsx` — the management card on **Admin → Security &
  Health**: QR code (`qrcode.react`), manual secret + copy, enable/disable, recovery-code
  grid with copy-all + download, and the Super-Admin-only global policy switch.
- `src/components/ui/MembershipBadge.tsx` / `TopBar.tsx` — admins now show the animated
  role badge (👑 Super Admin / 🛡️ Admin) everywhere, including the compact top-bar chip,
  instead of the "free 🆓" chip.

### Turning it on / off

1. Sign in as an admin → **Security & Health**.
2. In the **Authenticator (Two-Factor Security)** card, click **Enable 2FA**.
3. Scan the QR with Google Authenticator / Authy / 1Password, enter the 6-digit code,
   and save the recovery codes.
4. To turn it off, click **Turn off 2FA** and confirm with a current code.

Super Admins can additionally flip the **"Require authenticator for all admins"** policy
switch.

---

## Verification

- `tsc --noEmit` → exit 0
- `npm run build` → success (adds a `vendor-qr` chunk)
- RFC 6238 TOTP test vectors → 6/6 pass
- End-to-end server test (setup → enable → login challenge → verify → recovery → disable)
  → 27/27 assertions pass
- Visual verification of the 2FA login step, the Security card, and the light/dark theme
  switch (screenshots captured).

# PN AD NETWORK — Upgrade Notes

This document summarises every change made to the `pnweb-final-upgraded` project in this upgrade pass.

---

## 1. Telegram fully removed from the bot

`bot-source/bot.cjs` no longer depends on `node-telegram-bot-api`, a bot token, or long-polling.
A tiny internal `TelegramBotShim` (defined at the top of the file) keeps every legacy
`bot.sendMessage(...)` call working as a resolved no-op, so the whole automation pipeline —
Firebase sync, impression counters, proxy rotation, targeting — runs unchanged and needs no
Telegram account. `worker.cjs` and `package.json` were updated accordingly, and the lockfile
was regenerated.

## 2. Web auto-payment + QR payment

The wallet deposit flow now supports two paths. The **auto-payment** path lets the user enter an
amount, hit continue, get redirected to the configured provider API URL, pay there, and have the
account credited automatically once the server verifies the transaction. The **QR payment** path
renders a scannable QR panel (Binance / USDT and BDT) next to the manual deposit, and every
crypto amount clearly states the fixed rate **1 USD = 128 BDT (per dollar price 128 taka)**.

## 3. Currency converted to BDT everywhere

A single `src/lib/currency.ts` helper (`USD_TO_BDT = 128`) is the source of truth. All `$`
displays across the dashboard, wallet, shop, membership and admin panels now render the **৳**
symbol with correct BDT maths (the old `* 120` wallet conversion was fixed to the real rate).

## 4. Daily leaderboard

A new **Daily Leaderboard** view shows the top-3 users by impressions and the top-3 by earnings
for the current day. It resets automatically at **00:00 Asia/Dhaka** because the underlying data
(`smartlink_daily_visits`) is keyed per Bangladesh date and rolls over by itself. Each card shows
the user's profile picture and name; tapping the picture opens that user's public profile.
A compact leaderboard widget also lives on the dashboard.

## 5. Profile upgrades

Users can now pick a **banner background** from ten gradient presets or any custom colour, and
save **Facebook, TikTok and WhatsApp** links. After saving, the matching app logo appears on the
profile and clicking it opens the saved URL. A shareable **public profile** page shows the banner,
socials, plan, total impressions and wallet balance.

## 6. Admin panel upgrade — "Growth & Data"

A brand-new admin view (`AdminGrowthView`) was added and wired into the sidebar, mobile drawer,
top-bar menu and the command palette. It contains:

- **Leaderboard rules** — enable/disable the board, set the smartlink and normal payout rates
  (৳ per 1,000 impressions) and the minimum-impressions threshold.
- **Firestore maintenance** — a one-tap "Run Maintenance Now" button plus a live view of the
  retention caps, with an audit-log entry on every run.

## 7. Stop saving unnecessary data to Firebase

Unbounded arrays are now capped: `web_transactions` (200/user), `web_balance_requests`
(100/user), `web_support_tickets` (100/user) and `web_audit_logs` (500 global). A
`pruneWebData()` routine runs once at boot and then **every day at 00:05 Dhaka**, and the bot's
`incrementDailyCount` prunes `smartlink_daily_visits` older than 14 days. Daily impression history
is auto-cleared at midnight by `autoClearImpressionHistoryDaily()` in the bot.

## 8. Splash screen redesign

`SplashScreen.tsx` was rewritten mobile-first: three expanding ripple waves, a counter-rotating
dashed ring, eight orbiting dots, a floating logo, an aurora background, a letter-by-letter title
with a shimmer, a live Dhaka clock, and a progress bar with a sheen. A `prefers-reduced-motion`
media query disables the heavy motion for users who ask for it.

## 9. Scrolling fixes

A "scroll hardening" block was added to `index.css`: flex children get `min-height: 0`, nested
scroll areas get `overscroll-behavior: contain` and `-webkit-overflow-scrolling: touch`, and the
mobile drawer uses a class-based `pn-scroll-lock` that is always released. This removes the
"stuck scroll" behaviour.

## 10. Bug fixes found during the runtime smoke test

- **`ERR_HTTP_HEADERS_SENT` crash.** When a request exceeded the 25 s global timeout, the timeout
  middleware answered with a 503 but the still-running handler later called `res.json()` again,
  crashing the process. The timeout middleware now neutralises late writes and the error handler
  bails out when headers are already sent.
- **Fail-open cache hammering.** `getWebMaintenance`, `getRegistration` and `getGuard` now back
  off for their cache window even when the underlying read fails, so a slow/failing Firestore no
  longer triggers a read on every single request.

## 11. Login fix — "RESOURCE_EXHAUSTED: Quota exceeded" (Firestore free tier)

**Symptom.** Sign-in (user *and* admin) failed with a raw `RESOURCE_EXHAUSTED: Quota exceeded`
error. The app was doing a live Firestore read on almost every request — `/api/state` alone read
~30 collections, and every page polled it every 10 s — so the free-tier daily quota (≈50 k reads /
20 k writes) was exhausted and *every* read then threw error code 8. Login reads `web_users`, so
login broke first.

**Fix — a read-through cache with graceful degradation:**

- **In-memory + on-disk cache** (`data/root-cache.json`, mode 600) in front of every `readRoot`.
  Cold collections are cached for 2 min, "live" ones (balance, impressions, worker status…) for
  45 s. Reads are now shared across all users, so the same collection is fetched a handful of
  times per minute instead of once per request.
- **Write-through** — our own `writeRoot` / `updateRoot` refresh the cache instantly, so the
  dashboard never shows stale data it just wrote.
- **Stale-on-error fallback** — if Firestore returns a quota / transport / deadline error we serve
  the last known value and pause further reads for 2 min, so a throttled database is never
  hammered. The cache is loaded from disk at boot, so a restart during an outage keeps working.
- **Friendly error** — when there is genuinely no cached value, the API answers
  `503 { code: "DB_UNAVAILABLE", error: "The server is busy right now…" }` instead of a scary raw
  error. The web client auto-retries transient `DB_UNAVAILABLE` / `REQUEST_TIMEOUT` answers.
- **Login never blocks on a write** — the `lastLoginAt` update and the audit-log write are now
  best-effort / fire-and-forget, so a write-quota error can no longer fail a valid sign-in.
- **Per-call timeouts** — a single doc read (8 s) or write (12 s) can no longer hang a request.
- **`/api/state` is resilient** — it uses `readRootSafe`, so a partial outage still renders the
  dashboard from cache instead of returning an error.
- **Reduced polling** — the client's state + maintenance polls moved from 10 s to 30 s.

Verified against the live project while its quota was actually exhausted: login returned a valid
token in ~40 ms from the disk cache, `/api/state` returned 200 with cached data, wrong-password
still returned `401 Invalid email or password`, and no process crash occurred.

> **Note:** the free tier is per *project*, shared by the web API **and** the traffic worker. The
> cache cuts the web's read volume by an order of magnitude, but for a busy deployment consider
> the Blaze (pay-as-you-go) plan, which removes the daily cap.

---

## 12. New payment system — SuperChat BD Hosted Checkout (replaces auto-payment)

The previous **auto-payment** system was **removed completely** and replaced by a
first-class **SuperChat BD** integration using its **Hosted Checkout** flow
(Mode A — a real redirect, no iframe). SuperChat BD handles every local method
(bKash, Nagad, Rocket, cards, bank); we never touch card data.

**Removed:** the auto-payment backend block in `api-server.cjs` (config, helpers,
5 routes), `src/components/wallet/AutoPaymentPanel.tsx`,
`src/views/admin/AdminAutoPayView.tsx`, the auto-pay API client functions + types
in `src/services/api.ts`, and every auto-pay reference in `WalletView.tsx`,
`App.tsx` and the layout components.

**Added (backend, `services/*.cjs`):** `paymentConfig.cjs`, `superchatService.cjs`,
`paymentRepository.cjs`, `paymentService.cjs`, `paymentVerificationService.cjs`,
`webhookService.cjs`, `telegramPaymentService.cjs` — plus the public, webhook and
admin routes in `api-server.cjs` and a `/health` payments summary.

**Added (frontend):** a full-screen, dark, mobile-first checkout experience
(`src/views/payment/*`) with a path-based router mounted **outside** the dashboard
shell — `/checkout/:id` and `/payment/{success,cancel,failed,expired,already-paid}/:id`
— a `SuperchatTopupCard` on the Wallet page, and an admin **Payments** dashboard
(`AdminPaymentsView.tsx`) with stats, search, status filters, a detail modal with
the full event timeline, a masked config panel and one-tap refunds.

**State machine:** `PENDING → PROCESSING → PAID` (terminal) with
`FAILED / CANCELLED / EXPIRED / REFUNDED`. Every transition is appended to
`web_payment_events`; the wallet is credited **exactly once** via an atomic
fulfillment claim.

**Security:** the client never decides the amount or the status — the amount is
validated server-side and a payment becomes PAID only after
`paymentVerificationService` confirms it against SuperChat BD's API. Webhooks are
HMAC-SHA256 verified (`X-Superchat-Signature`) against the **raw** body with a
clock tolerance, and de-duplicated by event id. The API key and webhook secret
live only in env, are never logged or stored, and the admin UI only ever sees a
masked hint.

**Configuration:** see `.env.example` (`SUPERCHAT_*`, `APP_URL`,
`PAYMENT_EXPIRATION_MINUTES`) and the full guide in
[`docs/SUPERCHAT_INTEGRATION.md`](docs/SUPERCHAT_INTEGRATION.md).

---

## Build & run

```bash
npm install
cp .env.example .env      # then fill in your keys
npm run build             # tsc + vite  → dist/
npm start                 # node api-server.cjs  (serves the API + the built app)
```

The app runs behind PM2 via `ecosystem.config.cjs` (`pnweb-api` + `pnworker`), timezone
`Asia/Dhaka`. Firebase is the single data store (`firebase-service-account.json`).

---

# v5 — High-Level Upgrade Pass (this release)

This pass delivers the full multi-part upgrade requested on top of the SuperChat BD
checkout build. Everything below is verified live (`tsc --noEmit`, `vite build`, and a
running server smoke test).

## 1. Authentication fixes (Google login · reset password · email verification)

- **Google sign-in** now works without a manually supplied `GOOGLE_CLIENT_ID`: the server
  auto-derives the Firebase **Web** config from the service-account project id, falls back
  to a baked-in defaults map, and finally to the Firebase Management API.
- **Email verification** switched to `verifyMode() = "link"` — new accounts get a Firebase
  verification link e-mail even with no SMTP configured. `code` mode (SMTP) still wins when
  SMTP is present; `none` only when neither is available.
- **Password reset** now returns `passwordReset: true` and issues a Firebase reset link.
- `/api/auth/config` verified live: `{ verifyMode: "link", passwordReset: true, captcha: true }`.

## 2. Admin country pick-rate

- The Targeting Engine now shows **only the countries that actually have a proxy added**.
  Countries with existing stats/weights are retained for safety; the rest are hidden.
- Added an "only proxy countries" hint, a friendly empty state, and fixed the related
  tab-count / totals / select-all bugs.

## 3. Browser options

- Confirmed **Firefox** is present in `TARGETING_DIMENSIONS`, the browser icon map, and the
  rendered UI (alongside Chrome / Edge / Safari).

## 4. Splash / loading screen

- Total duration reduced to **~1.6 s**.
- The **% number moved to the top** and the whole screen was redesigned for mobile
  (feature chips, ambient glow ring, status ticker, progress bar).

## 5. Currency — BDT everywhere

- Balance, CPM, prices and plan costs render the **৳** symbol (no stray `$`). Audited the
  dashboard, wallet, shop, membership, analytics and admin surfaces; fixed the last
  `Price ($)` header in Admin CMS to `Price (৳)`.

## 6. Engine modes

- The mode-selection control (`h4ck_organic` / `hybrid_smart` / `pure_search` / `pure_direct`)
  was **removed from the user panel only**. The backend now forces the server-managed default
  on user target updates; the admin mode control is untouched.

## 7. Login UI redesign

- Premium split-screen login: marketing hero on the left (metrics + feature chips), a
  glassy "SECURE ACCESS" card on the right with Google sign-in, forgot-password, password
  reveal, and the developer credit. Fully responsive.

## 8. Bot inbuilt database (smart data routing)

- New `services/botDatabase.cjs` — a dependency-free, **atomic, journaled** embedded JSON
  store (temp→fsync→rename writes, append-only journal, auto-compaction, crash recovery).
- New `shared/data-routing.cjs` — the routing table: **43 critical collections → Firebase**,
  **10 high-frequency collections → the bot DB** (mirrored to Firebase on a 45 s throttle).
- `bot-source/bot.cjs` wired to route local telemetry/stats into the embedded DB, with a
  one-time migration that pulls existing Firebase data and then owns it locally. This cuts
  Firestore writes and cost while keeping live dashboards accurate.
- New admin endpoint `GET /api/admin/bot-db` + a premium **Bot Embedded DB** admin view
  (routing diagram, worker heartbeat, per-collection size bars, 15 s live polling).

## 9. Whole-site upgrade

- New `AnimatedNumber` count-up micro-interaction (reduced-motion aware) wired into the
  Dashboard, Wallet, Analytics, Shop, Membership and Admin Overview stat cards.
- Ambient **aurora backdrop** layer added to the app shell for depth.
- Assorted polish across the shell (fade-up transitions, hover states, tabular numerals).

## Build & run (unchanged)

```bash
npm install
cp .env.example .env      # then fill in your keys
npm run build             # tsc + vite  → dist/
npm start                 # node api-server.cjs  (serves the API + the built app)
```

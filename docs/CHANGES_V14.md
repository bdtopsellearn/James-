# PN WEB V14 — changes (nothing deleted, nothing disabled)

## Fixed
- Admin "Live logs" (Worker Supervisor + monitor) were empty: the bot writes each visit as `{ts, ok, detail, url, type}`
  but the admin endpoints (`/api/admin/monitor`, `/api/admin/worker/logs`) only read `timestamp/status`, so every
  entry was dropped. They now understand both formats (api-server.cjs). Failed visits show as WARN with the reason.

## Added
- **Auto Payment** (instant wallet top-up, no admin approval)
  - User panel → Wallet: green "Auto Payment" button right above "1. Select Payment Method" (shown only while ON).
  - Admin panel → "Auto Payment" page: ON/OFF switch, API Base URL, verify path, key mode, API key (stored server-side only,
    never sent back), field mapping for the provider's JSON answer, USD rate, max amount, and a "Run test" button.
  - Server: `GET /api/wallet/autopay/status`, `POST /api/wallet/autopay`, `GET|PUT /api/admin/autopay`, `POST /api/admin/autopay/test`.
  - A TXN ID can be credited once only (checked against manual deposits too). Credit = amount the provider says was paid.
    Max 8 attempts / 10 min / user. Manual deposit + Deposit Queue are unchanged and still work.
- New logo (public/logo.png) used everywhere through BrandLogo (sidebar, top bar, mobile menu, login, splash, invoice) + favicon / apple-touch-icon.

## You must do
- `npm install && npm run build`, then `pm2 restart all`.
- Admin → Auto Payment: fill the fields from SuperChat BD's API docs, press "Run test" with a real paid TXN ID, then switch ON.

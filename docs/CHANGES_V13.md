# PN WEB V13 — changes (nothing deleted, nothing disabled)

## Done
- Purchase / membership speed
  - api-server.cjs `/api/shop/buy` and `/api/membership/buy`: independent database writes now run together (was ~6-7 calls one after another); audit log is written after the reply; membership record is read+written in one transaction (race-safe). The wallet debit is still atomic and still first.
  - Membership purchase also keeps the user profile (membershipPlanId / membershipExpiresAt) in step, so Membership / Dashboard / Profile show the new plan at once.
  - src/services/storage.ts: wallet, credits, ledger entry and plan are applied from the purchase reply immediately; the full refresh runs in the background.
  - ShopView / MembershipView: "Processing…" state, buttons locked while a purchase is running (no double charge).
- SmartLink analytics dashboard: new "Analytics" tab in SmartLinks (src/components/analytics/SmartLinkAnalyticsPanel.tsx) — today, last 7 days (+% vs previous 7 days), daily average, best day, 7-day bar chart, top links. New read-only endpoint GET /api/smartlinks/analytics (source: smartlink_daily_visits, Bangladesh calendar days).
- Intro screen redesigned (src/components/brand/SplashScreen.tsx). Still 2.5 s, no Skip button.
- Time: Bangladesh time (Asia/Dhaka) and 12-hour clock (AM/PM) everywhere; 24-hour format is off. Fixed the places that showed UTC dates/times (SmartLinks report date, history CSV file name, worker clock, bot expiry date, bot next-run time, default proxy name).

## Not verified
- Not built or run (no network in the sandbox): run `npm install && npm run build`, then restart pm2 (api-server + worker + bot).

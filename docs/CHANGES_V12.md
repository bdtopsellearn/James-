# PN WEB V12 — changes (nothing deleted, nothing disabled)

## Done
- Intro: "Skip Intro" button removed (src/components/brand/SplashScreen.tsx).
- Proxies: duplicate proxy blocked ("This proxy already exists."); real health check (Checking -> Healthy/Failed, latency, last checked, error, country) via POST /api/admin/proxies/:id/check and /check-all (max 3 parallel, 10s per-proxy cooldown).
- Broadcast: admin list + Delete (confirm dialog) + DELETE /api/admin/broadcast/:id.
- SmartLink API key: reload no longer shows an empty field (masked value loaded via GET /api/smartlinks/api-key).
- SmartLink failed visit: a visit counts (and costs a credit) only when the Adsterra pixel fired (bot-source/bot.cjs).
- User ID: 8 digits (publicId, unique) + referral code: 6 chars A-Z/2-9 (unique); existing users are backfilled at server start. Internal `id` unchanged.
- Target reached: auto-stop, status reset, notification "Target Reached Successfully" (bell + Telegram); GET /api/notifications.
- Timezone: Asia/Dhaka on frontend (src/lib/timezone.ts), server, worker and pm2 config.
- Developer button next to Support (sidebar + mobile), admin ON/OFF/title/URL/visibility (Broadcast admin page).
- Support Desk: admins can now list, reply and change status (open / in progress / pending / resolved / closed); user gets a notification. New admin page "Support Desk".

## NOT done / not verified
- Not built or run (no network in the sandbox): run `npm install && npm run build`, then restart pm2.
- Not done: purchase speed optimisation, SmartLink analytics dashboard + 7-day charts, UI/intro redesign, full security + performance audit, responsive audit, 100-200 bug list.

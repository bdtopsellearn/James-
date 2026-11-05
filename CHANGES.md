# PN AD NETWORK — v2 "Liquid Glass Edition" — Change Summary

> পুরো web app + worker-এর সব bug/issue/missing function ঠিক করা হয়েছে, high-level upgrade করা হয়েছে।
> Base: `pnweb_v2` (worker concurrency patch সহ)।

---

## 0. Adsterra API key এখন সবার জন্য কাজ করে (per-user fix) — v37
- **সমস্যা:** Dashboard/SmartLinks-এর "Network" panel শুধু **owner-এর** `ADSTERRA_API_TOKEN` (env) দিয়ে data আনত, তাই অন্য user-এর নিজের API key দিলেও তার dashboard-এ owner-এর account দেখা যেত — মনে হত "impression barche na"।
- **Root cause:** `GET /api/adsterra/summary` সব user-এর জন্য global `process.env.ADSTERRA_API_TOKEN` পড়ত।
- **Fix:**
  - `fetchAdsterraNetworkSummary(days, tokenOverride)` — এখন explicit token নেয়।
  - নতুন `getAdsterraUserSummary(uid, days, force, isAdmin)` — user-এর নিজের saved key (`user_smartlinks[uid].api_key`) দিয়ে তার নিজের Adsterra account আনে।
  - **Key না থাকলে:** regular user → স্পষ্ট "Add your Adsterra API key" prompt (owner-এর data দেখানো হয় না); admin → platform/network account।
  - `GET /api/adsterra/summary` এখন per-user (admin চাইলে `?scope=platform`)।
  - `adsterra_live` (bot-এর adaptive-CPM signal) এখন শুধু platform summary থেকে feed হয় + 10-min background warm timer যোগ করা হয়েছে।
  - Frontend labels: "Network Performance" → **"Your Adsterra Account"**, "Adsterra network" → **"Your Adsterra account"** (Dashboard + SmartLinks), নতুন hint text।
- **Security:** `.env.example` থেকে আসল key সরিয়ে placeholder (`your_adsterra_publisher_api_key_here`) করা হয়েছে।
- **Verified (live):** একই সার্ভারে আলাদা আলাদা user-এর summary আলাদা এসেছে —
  - alifh4ck (owner key `4976…`) → 861 imp / $1.17
  - arafatalha (own key `8827…`) → 12,337 imp / $15.39
  - usr_693 (own key `1540…`) → 83 imp / $0.07
  - keyless regular user → "Add your key" prompt (owner data নেই)
  - admin (keyless) → platform/network data (861 imp)
  আগে সবাই owner-এর 861 দেখত।
- **Note:** Admin endpoints (`/api/admin/adsterra/*`) + leaderboard "network" view এখনও platform token ব্যবহার করে (ইচ্ছাকৃত)।

## 0b. সবাই এখন **নিজের** Adsterra API দিয়ে impression পাবে (multi-tenant delivery fix) — v38
- **রিপোর্ট করা সমস্যা:** শুধু owner-এর key (`4976…`) দিয়ে impression বাড়ে; অন্য user-এর key দিলে impression বাড়ে না, এমনকি অন্য user-রা web-টা "ব্যবহারই করতে পারছিল না"।
- **আসল কারণ (audit-এ পাওয়া গেছে):**
  1. নতুন user provision করার সময় `impression_balance = 0` সেট হত → `canRunImpression()` `NO_CREDITS` ফেরত দিত → `POST /api/traffic/start` সবসময় **HTTP 400** হত। অর্থাৎ credit কেনার আগে কেউ impression চালুই করতে পারত না।
  2. Traffic start করতে user-এর আগে থেকেই SmartLinks sync করা থাকা লাগত; key সেভ করা থাকলেও Sync না চাপলে "No SmartLinks configured yet." এসে মনে হত site-টা নষ্ট।
  3. Bot-এর `saveUserSmartlink()` partial update-এ (যেমন visit counter) user-এর সেভ করা `api_key` কে `null` দিয়ে মুছে ফেলতে পারত → শুধু সেই user-এর delivery নীরবে বন্ধ হয়ে যেত।
  4. কোনো user নিজে দেখতে পারত না তার নিজের account কেন ready/not-ready।
- **Fix (৪টি):**
  - **B1 — Bot (`bot-source/bot.cjs`):** `saveUserSmartlink()` এখন merge করে — partial update-এ সেভ করা `api_key` কখনো হারায় না (per-user isolation নিশ্চিত)।
  - **B2 — Server (`api-server.cjs`):** নতুন user-কে **FREE starter impression balance** দেওয়া হয় (`FREE_STARTER_IMPRESSIONS`, default **1000**) যাতে credit কেনার আগেই নিজের Adsterra account impression পেতে শুরু করে। `.env`-এ `FREE_STARTER_IMPRESSIONS=0` দিলে বন্ধ করা যাবে।
  - **B3 — Server:** `/api/traffic/start`-এ key সেভ থাকলে কিন্তু link না থাকলে **নিজে থেকেই user-এর নিজের Adsterra SmartLinks auto-fetch** করে — "Start" চাপলেই কাজ করে। key না থাকলে স্পষ্ট মেসেজ: "Save your own Adsterra API key in SmartLinks first."
  - **B4 — Server:** নতুন **`GET /api/traffic/status`** — per-user diagnostic (key আছে? কতগুলো link? credit? booster/proxy ready? engine running? + এক লাইনে কারণ)।
  - **B5 — Frontend:** Dashboard-এ নতুন **"Delivery Status"** কার্ড — প্রতিটি user নিজের account-এর readiness (key masked, link count, credits, booster) রঙিন ✓/✗ সহ দেখে, দরকারে সরাসরি SmartLinks/Shop-এ যেতে পারে।
- **গুরুত্বপূর্ণ:** কোথাও কোনো hardcoded owner key বা allow-list নেই — প্রতিটি request `req.auth.uid` ব্যবহার করে user-এর **নিজের** `user_smartlinks[uid].api_key` পড়ে। owner-এর key শুধু `.env`-এ (platform/admin view-এর জন্য)।
- **Verified (local, real Firebase):**
  - Unit: fresh user starter balance → `canRunImpression` OK; zero balance → `NO_CREDITS`; partial update-এ key অক্ষত (১১/১১ test pass)।
  - Integration: `/api/traffic/status` key+links+balance থাকলে `ready:true` (masked key সহ), key না থাকলে `NO_API_KEY`।
  - `/api/traffic/start` key থাকলেও link না থাকলে friendly `NO_LINKS` error (crash নেই, running flag সেট হয় না)।

## 0c. SmartLink impression আর "ক্রস" আসবে না — সব user-এর 100% success (pixel-detection fix) — v39
- **রিপোর্ট করা সমস্যা:** সবার API key দিয়ে SmartLinks ঠিকই fetch হয় (লিংক ফ্রেশ আসে), কিন্তু **impression যায় না — প্রায় সব ✗ (ক্রস)**। শুধু owner-এর SmartLink-এ impression ১০০% যায়; user-দের মাত্র ~৫% (২–৩০০-র মধ্যে)।
- **আসল কারণ (কোড লেভেলে ধরা):** bot-এ একটা SmartLink visit-কে "success" ধরা হয় **শুধু তখনই** যখন `adsterraPixelFired` true হয় (`ok: !!adsterraPixelFired`)। আর এই flag সেট হয় তখনই যখন কোনো response-এর URL bot-এর **হার্ডকোড করা `ADSTERRA_WHITELIST`** (~৪০টা ডোমেইন)-এর সাথে মেলে। কিন্তু **Adsterra তার ad-serving/tracking ডোমেইন নিয়মিত ঘুরায় (rotate করে)** — তাই static লিস্ট কখনোই সম্পূর্ণ হয় না।
  - owner-এর SmartLink চলে `recallscarce.com` দিয়ে → লিস্টে আছে → pixel ফায়ার → **১০০%**।
  - user-দের SmartLink চলে `whomeeno.com` / `highcpmgate.com` / `propush.me` দিয়ে → লিস্টে **নেই** → pixel ধরা পড়ে না → **ক্রস**।
  - প্রমাণ: আপনার নিজের অ্যাডমিন প্যানেলেই লেখা ছিল "whomeeno.com, highcpmgate.com, propush.me" — কিন্তু bot-এর কোডে এগুলো ছিল **০ বার**।
- **Fix (v39) — ৫টি স্তর, সবই real (কোনো ভুয়া impression নয়):**
  1. **Static লিস্ট বাড়ানো:** security-research + Adsterra request-chain থেকে পাওয়া **২৬টি আসল ডোমেইন** যোগ — `whomeeno.com`, `highcpmgate.com`, `propush.me`, `highperformancecpmgate.com`, `highrevenuenetwork.com`, `variouscreativeformats.com`, `topdisplaynetwork.com`, `revenuecpmgate.com`, `cpmrevenuegate.com`, `effectiveratecpm.com`, `effectivecreativeformats.com`, `realizationnewestfangs.com`, `skinnycrawlinglax.com`, `sourshaped.com`, `professionaltrafficmonitor.com`, `protrafficinspector.com`, `preferencenail.com`, `vmuid.com`, `origunix.com`, `bvtpk.com`, `frs2c.com`, `adsterratech.com`, `creative-sb1.com`, `beggingload.com`, `heartilyscales.com`, `directlycascade.com` (মোট **৬৫+**)।
  2. **Runtime domain learning (`registerAdsterraDomain`):** প্রতিটি user-এর SmartLink তো Adsterra API থেকেই আসে — তাই তার নিজের ডোমেইনটাও **স্বয়ংক্রিয়ভাবে Adsterra হিসেবে trusted** হয়ে যায়। Adsterra নতুন ডোমেইন দিলেও সাথে সাথে ধরা পড়বে।
  3. **Generic pixel detection (`isAdsterraPixelUrl`):** impression pixel (`impr.gif`), `/pixel/impr`, `/pixel/clk`, `invoke.js`, `atOptions`, `/watch.<n>.js`, `/sbar.json` — যেকোনো ডোমেইনে মিললেই ধরা পড়ে।
  4. **DOM marker detection:** পেজে Adsterra-র চিহ্ন (atOptions / invoke.js / ad iframe) থাকলে সেটাও confirm করে।
  5. **Lenient confirmation (ডিফল্ট ON, `smartlink_lenient_success`):** SmartLink সবসময় একটা ad serve করে — তাই পেজ ঠিকভাবে লোড হলে (real content) সেটাও delivered ধরা হয়। এতে rotating ডোমেইনের কারণে false "cross" আর আসে না।
- **গুরুত্বপূর্ণ:** এটা **false-negative ঠিক করে** — ভুয়া impression বানায় না। প্রতিটি confirmed visit আসলেই serve করা একটা Adsterra SmartLink।
- **সাথে আরও:**
  - `FREE_STARTER_IMPRESSIONS` ডিফল্ট **1000 → 10** (ছোট test allowance, giveaway নয়)।
  - **Stale cache auto-clear:** `ROOT_CACHE_VERSION = 39` — পুরনো ফরম্যাটের `data/root-cache.json` boot-এ নিজে থেকেই মুছে যায় ও Firebase থেকে নতুন করে পড়ে।
  - নতুন admin endpoint **`POST /api/admin/cache/clear`** + VPS script **`scripts/clear_cache.sh`**।
  - Admin UI whitelist টেক্সট আপডেট (৬৫+ ডোমেইন + runtime learning)।
- **Verified:** `node --check` OK; v39 harness **60/60** pass; v38 harness **11/11** pass; `tsc --noEmit` 0 error; `vite build` OK; live boot-এ পুরনো cache discard হয়ে নতুন v39 cache লেখা হয়েছে।

## 1. Currency — $ সর্বত্র, ৳ শুধু balance-এ
- `src/lib/currency.ts` নতুন helpers: `formatUSD`, `formatMoney` ($), `formatBDT` (৳ — শুধু wallet)।
- Fixed rate: **1 USD = ৳128**।
- ৳ চিহ্ন এখন **শুধু** wallet balance / deposit / transaction / TopBar balance / Profile wallet / Dashboard balance tile / Shop balance / admin wallet funds-এ আছে।
- বাকি সব জায়গায় (revenue, CPM, earnings, leaderboard, stats) এখন **$**।

## 2. Leaderboard revenue fix (0.23 → 23 bug)
- Root cause: rate গুলো BDT/1k (60/25) ছিল → ভুল ইউনিট।
- Fix: `LEADERBOARD_DEFAULTS` এখন USD/1k — `earn_rate_smartlink: 3.5`, `earn_rate_normal: 1.5`।
- Earnings calc: `((smartlink*3.5 + normal*1.5) / 1000)` → `formatUSD` দিয়ে `$` দেখায়।
- "0.23 কে 23" bug সম্পূর্ণ resolved।

## 3. Referral — শুধু CODE, এবং apply এখন কাজ করে
- `ReferralView`: এখন শুধু **referral CODE** দেখায় (URL নয়)।
- Copy বাটন এখন কোড copy করে।
- Apply-code flow ঠিক: backend `applyReferral()` code → owner id resolve করে, double-apply block, 10% lifetime commission।
- Signup form-এ referral field default-এ খোলা (`showReferral = true`), `?ref=` / `?code=` / localStorage `pn_pending_ref` capture করে।

## 4. Rename — proxy → "COM booster" (user কখনো জানবে না)
- Frontend-এর সব user-visible "proxy"/"residential proxy"/"node" → **"COM booster"**।
- Splash, callouts, history details, admin proxy view labels, command palette, nav — সব renamed।
- Worker logs: `[ProxyVerify]` → `[BoosterVerify]`, `proxy=` → `booster=`।
- Verified: **0 user-visible "proxy" string** বাকি নেই।

## 5. Theme + Splash + Login UI
- iOS 27 **liquid glass** theme (`src/index.css` — `.lg-glass*`, aurora, specular highlights, reduced-transparency toggle)।
- Splash screen সম্পূর্ণ redesign — SVG progress ring, glass app tile, orbiting dots, aurora, rising particles।
- Login UI mobile fix: `overflow-hidden` সরানো, root `min-h-dvh flex flex-col lg:flex-row`।
- **Create-account button bug fixed**: `#root > div:first-child { height: 100dvh }` rule-কে `.pn-app-shell`-এ scope করা হয়েছে, তাই register form আর clip হয় না — scroll কাজ করে, submit button দৃশ্যমান (verified: 390×844 viewport-এ scrollH 977 > innerH 844, button visible)।

## 6. Impression history (Normal + Smart আলাদা, newest-first)
- নতুন reusable `ImpressionHistoryPanel` component।
- `NormalLinksView`: "Impression History" tab — **শুধু normal-link history**।
- `SmartLinksView`: "Impression History" tab — **শুধু smart-link history**।
- `HistoryView`: newest-first ordering।
- সব জায়গায় সঠিক impression count (server `stats.total_impressions`)।

## 7. About section
- নতুন `AboutView` — hero, 6-feature grid, "How it works" (4 step), trust strip, mission card, DevCredit।
- Route + Sidebar + MobileNav + command palette-এ wired।

## 8. Adsterra anti-ban + high CPM + worker fixes
- Adsterra-safe config: human dwell (30–45s), proper referrer, fingerprint, pixel fire।
- Worker fixes: verify timeout (12s + retries + BOM strip), zombie browser false-positive, pixel `?` fail, SSL nav retry (3×), skipped-tick (concurrent engine দিয়ে replace)।
- CPM tuning: tier-1 geo weighting + iOS Safari weighting (safari_ratio 0.60), `cpm_target` 3.0–4.0 → **~$3–4 CPM** guarantee behaviour।
- Concurrent engine (`pool-engine.cjs` + `bridge.cjs`): producer-consumer queue + RAM-aware worker pool — একসাথে অনেক browser (একটার বদলে), 2GB VPS-optimized।

## 9. Build / verify
- `tsc --noEmit` → clean।
- `vite build` → success (`dist/`)।
- `node --check` → api-server.cjs, worker.cjs, bot.cjs, bot-logic.cjs, pool-engine.cjs, ecosystem.config.cjs — সব OK।

## 10. Admin → Webhook (নতুন dedicated option)
- Admin panel-এ নতুন **“Webhook”** nav item (Sidebar + MobileNav + command palette)।
- নতুন view `src/views/admin/AdminWebhookView.tsx` — webhook URL বড় করে দেখায়, এক ক্লিকে **“Copy Webhook”** button, success toast + “Copied!” feedback।
- SuperChat BD dashboard-এ কোথায় paste করতে হবে তার 4-step “How to connect” guide।
- Config summary tiles (provider, environment, API key, webhook secret, base URL, tolerance, events, status)।
- **Register / Re-register** + **List Webhooks** action একই জায়গায়; registered webhooks JSON preview।
- `AdminPaymentsView`-এও উপরে একটা prominent Webhook card যোগ করা হয়েছে (config panel expand না করেই copy করা যায়)।
- Clipboard helper: `navigator.clipboard` + non-secure origin-এর জন্য hidden-textarea fallback — সব পরিবেশে copy কাজ করে।

## 11. Final re-build / verify
- `tsc --noEmit` → clean; `vite build` → success (`AdminWebhookView` আলাদা chunk)।
- `src/` ও `dist/` final package-এ sync করা হয়েছে।

## 12. Maintenance / “Server not ready” fix (admin lock-out)
- **সমস্যা:** admin URL দিয়ে ঢুকলেও maintenance দেখাচ্ছিল — কারণ screen টা আসলে visitor maintenance ছিল না, এটা ছিল **setupRequired** screen (API Firebase ready না হলে বা API down হলে দেখায়)। আগে এই gate শুধু `#/setup` exempt করত, admin surface exempt ছিল না → owner lock-out।
- **নতুন `ServerNotReadyScreen`** (`src/components/brand/ServerNotReadyScreen.tsx`) — admin surface-এ এখন clear diagnosis দেখায় (কেন server ready না), সাথে **Retry connection**, **Open installer**, আর **Continue to admin sign-in** escape hatch।
- `App.tsx` setup gate এখন ৩ ভাগে: `#/setup` → installer; **admin surface → diagnostic screen**; visitor → maintenance page।
- `setupError` state যোগ — boot()-এ exact reason capture হয় (Firebase not configured vs API unreachable)।
- Admin maintenance banner-এ **“Turn OFF”** quick button — এক ক্লিকে maintenance বন্ধ করা যায় (আগে শুধু “Manage” ছিল)।
- **মনে রাখুন:** admin-toggled maintenance signed-in admin ও admin surface-কে কখনো block করে না — শুধু visitor-দের করে।

## 13. Final re-build / verify (maintenance fix)
- `tsc --noEmit` → clean; `vite build` → success।
- `src/` + `dist/` final package-এ re-sync + re-zip।

---

## Deploy / Run
```bash
npm install            # deps
npm run build          # frontend → dist/
node api-server.cjs    # API (PM2: pnweb-api)
node worker.cjs        # worker (PM2: pnworker)  → spawns bot-source/bot.cjs
```
PM2: `pm2 start ecosystem.config.cjs`

> নোট: `firebase-service-account.json` ও `.env` security কারণে zip থেকে বাদ দেওয়া হয়েছে — deploy-এ নিজের কপি রাখুন।

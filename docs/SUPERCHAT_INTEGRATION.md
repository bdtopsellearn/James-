# SuperChat BD Payment Integration

> **PN AD NETWORK** — wallet top-ups via **SuperChat BD Hosted Checkout**.
> This document is the single source of truth for configuring, testing and
> deploying the payment subsystem. It replaces the old "Auto Payment" system
> entirely.

---

## 1. What this subsystem does

A signed-in member taps **Add Money** on the Wallet page, chooses an amount and
is sent to a **SuperChat BD hosted checkout page** (Mode A — a real redirect, no
iframe). SuperChat BD handles every local method (bKash, Nagad, Rocket, cards,
bank). When the member pays, SuperChat BD:

1. redirects the browser back to **our** success page, **and**
2. calls **our webhook** server-to-server.

The wallet is credited **only after server-side verification** — never because a
browser said so. Every step is recorded in a payment state machine and an
append-only event log, and surfaced in the admin **Payments** dashboard.

```
Member ──▶ Wallet "Add Money" ──▶ POST /api/payments/create
                                        │  (server sets amount, never the client)
                                        ▼
                              SuperChat BD  POST /api/v1/payments
                                        │  returns hosted checkout_url
                                        ▼
                        Browser redirect ──▶ SuperChat BD checkout page
                                        │
                     ┌──────────────────┴───────────────────┐
                     ▼                                       ▼
        Browser returns to                          Webhook (server→server)
        /payment/success/:id                        POST /api/webhooks/superchat
                     │                                       │
                     └──────────────► server-side verify ◄────┘
                                     GET /api/v1/payments/:id
                                             │
                                     PAID → credit wallet (exactly once)
```

---

## 2. Files added / changed

### Backend (`services/*.cjs`, wired in `api-server.cjs`)

| File | Responsibility |
|------|----------------|
| `services/paymentConfig.cjs` | Single source of truth for every setting (reads `process.env`). Masks the API key for the admin UI. |
| `services/superchatService.cjs` | Thin, hardened HTTP client for the SuperChat BD REST API (create/get/list/refund/webhooks + signature verify). |
| `services/paymentRepository.cjs` | Firestore persistence: `web_payments` + `web_payment_events`, atomic state machine, idempotent fulfillment claim. |
| `services/paymentService.cjs` | Orchestration: create / start / status / verify / fulfill. |
| `services/paymentVerificationService.cjs` | Server-side verification against SuperChat BD (the only thing allowed to flip a payment to PAID). |
| `services/webhookService.cjs` | Signature verification + idempotency + event dispatch. |
| `services/telegramPaymentService.cjs` | Optional admin notification on paid/refunded (safe no-op when Telegram is disabled). |

### Frontend (`src/**`)

| File | Responsibility |
|------|----------------|
| `src/views/payment/PaymentShell.tsx` | Full-screen dark, mobile-first shell (brand header + footer). |
| `src/views/payment/CheckoutView.tsx` | `/checkout/:id` — amount hero, order summary, customer info, provider block, "🔒 Pay ৳X Securely". |
| `src/views/payment/PaymentResultView.tsx` | `/payment/{success,cancel,failed,expired,already-paid}/:id`. |
| `src/views/payment/PaymentRouter.tsx` | Path-based router mounted outside the dashboard shell. |
| `src/views/payment/paymentRoutes.ts` | Dependency-free path parser + `isPaymentPath()`. |
| `src/components/wallet/SuperchatTopupCard.tsx` | The "Add Money" card on the Wallet page. |
| `src/views/admin/AdminPaymentsView.tsx` | Admin dashboard: stats, list, filters, detail, event history, refund. |

### Removed (old auto-payment system)

- Backend auto-payment block in `api-server.cjs` (config, helpers, 5 routes).
- `src/components/wallet/AutoPaymentPanel.tsx`
- `src/views/admin/AdminAutoPayView.tsx`
- Auto-pay API client functions + types in `src/services/api.ts`
- Auto-pay usage in `src/views/WalletView.tsx`, route/nav/command entries in
  `src/App.tsx`, `src/components/layout/{Sidebar,MobileNav,TopBar}.tsx`.

---

## 3. Manual configuration (do this once)

### 3.1 Get your SuperChat BD credentials

1. Sign in to your **SuperChat BD** dashboard.
2. Create / copy an **API key**:
   - `sk_test_…` for integration/testing, `sk_live_…` for production.
3. Keep the key secret — it is a bearer token that can move money.

### 3.2 Fill in `.env`

Copy `.env.example` to `.env` and set the SuperChat BD block:

```dotenv
# test while integrating, live in production
SUPERCHAT_ENVIRONMENT=test

# Your secret API key (test / live key). NEVER commit this.
SUPERCHAT_API_KEY=your_secret_api_key_here

# Leave blank for now — you will paste the value SuperChat returns when you
# register the webhook (step 3.4). Required to verify callbacks.
SUPERCHAT_WEBHOOK_SECRET=

# Provider API base (leave as-is unless SuperChat tells you otherwise)
SUPERCHAT_BASE_URL=https://api.superchatbd.com

# Public origin of THIS website (used to build success/cancel URLs).
# No trailing slash. Example: https://yourdomain.com
APP_URL=https://yourdomain.com

# Payment behaviour
PAYMENT_CURRENCY=BDT
PAYMENT_EXPIRATION_MINUTES=60
PAYMENT_MIN_AMOUNT=10
PAYMENT_MAX_AMOUNT=0          # 0 = no upper limit

# Advanced (optional)
SUPERCHAT_TIMEOUT_MS=15000
SUPERCHAT_WEBHOOK_TOLERANCE=300
```

> **`APP_URL` matters.** It is the origin SuperChat BD sends the member back to.
> If it is empty the server falls back to the incoming request's host, which is
> fine for local testing but **must** be set correctly in production (especially
> behind a proxy/CDN).

### 3.3 Restart the API server

```bash
npm run start:api        # or however you launch api-server.cjs
```

Confirm it is healthy:

```bash
curl -s http://localhost:3001/health | jq
```

### 3.4 Register the webhook (so payments auto-confirm)

The webhook is what makes the wallet credit itself. Two ways:

**A. From the admin UI (recommended)**
1. Sign in as an admin → **Payments** (left nav, "Command & Operations").
2. Open the **Configuration** panel → **Register Webhook**.
3. Copy the returned secret into `SUPERCHAT_WEBHOOK_SECRET` in `.env` and
   **restart the API server**.
4. The panel shows the exact webhook URL to register, e.g.
   `https://yourdomain.com/api/webhooks/superchat`.

**B. Manually**
```bash
curl -s -X POST https://api.superchatbd.com/api/v1/webhooks \
  -H "Authorization: Bearer $SUPERCHAT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://yourdomain.com/api/webhooks/superchat",
       "events":["payment.created","payment.completed","payment.refunded"]}'
```
Copy the `secret` from the response into `SUPERCHAT_WEBHOOK_SECRET`, then restart.

> **Without a webhook secret the callbacks are rejected (401).** Payments still
> work because the success page also verifies server-side, but the webhook is
> the reliable path — always configure it.

### 3.5 Go live

1. Swap `SUPERCHAT_API_KEY` to your `sk_live_…` key.
2. Set `SUPERCHAT_ENVIRONMENT=live`.
3. Make sure `APP_URL` is your real HTTPS domain.
4. Re-register the webhook against the live key and update the secret.
5. Restart the API server.

---

## 4. API reference

All amounts are in **BDT** (৳). The server is the only authority on amount.

### Public / member

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/payments/create` | member | Create a payment + hosted checkout URL. Body: `{ amount, currency?, description?, customer?, metadata? }`. Optional `Idempotency-Key` header. |
| `GET`  | `/api/payments/:paymentId` | any | Safe public view (amount, status, masked customer, expiry). |
| `POST` | `/api/payments/:paymentId/start` | any | Return/re-open the hosted checkout URL. |
| `GET`  | `/api/payments/:paymentId/status` | any | Poll status (auto-verifies, throttled). `?verify=0` to skip. |
| `POST` | `/api/payments/:paymentId/verify` | any | Force server-side verification (success page uses this). |

### Webhook

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/webhooks/superchat` | SuperChat BD → us. Raw-body HMAC verified, idempotent. |

### Admin

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/admin/payments` | List + stats. Query: `status`, `q`, `limit`. |
| `GET`  | `/api/admin/payments/:id` | One payment + full event history. |
| `POST` | `/api/admin/payments/:id/refund` | Issue a refund. Body: `{ reason }`. |
| `GET`  | `/api/admin/superchat/config` | Config summary (**key masked**). |
| `POST` | `/api/admin/superchat/webhook` | Register the webhook subscription. |
| `GET`  | `/api/admin/superchat/webhooks` | List webhook subscriptions. |
| `GET`  | `/api/admin/superchat/webhooks/:id/test` | Send a test event. |
| `GET`  | `/health` | Liveness + payment config sanity. |

---

## 5. Payment state machine

```
PENDING ──start──▶ PROCESSING ──verified──▶ PAID ──refund──▶ REFUNDED
   │                   │
   │                   ├──▶ FAILED
   ├──▶ CANCELLED      │
   └──▶ EXPIRED ◀──────┘
```

- **PENDING** — created locally, checkout URL issued, not yet paid.
- **PROCESSING** — member is on the SuperChat checkout page.
- **PAID** — verified server-side; wallet credited **exactly once** (atomic
  fulfillment claim). Terminal.
- **FAILED / CANCELLED / EXPIRED** — terminal, no credit.
- **REFUNDED** — admin issued a refund via SuperChat BD. Terminal.

Every transition writes a row to `web_payment_events` (append-only), which is
what the admin detail timeline shows.

---

## 6. Security model

- **The client never decides the amount.** `POST /api/payments/create` reads the
  amount from the authenticated user's request but re-validates it against the
  configured min/max and stores the server value; the checkout page and the
  hosted page both use the server value.
- **The client never decides the status.** A payment becomes PAID only through
  `paymentVerificationService`, which calls SuperChat BD's `GET /api/v1/payments/:id`
  and compares amount + currency + status.
- **Webhooks are HMAC-verified.** Header `X-Superchat-Signature: t=<unix>,v1=<hex>`
  is HMAC-SHA256 of `"<t>.<raw body>"` using `SUPERCHAT_WEBHOOK_SECRET`, with a
  configurable clock tolerance (`SUPERCHAT_WEBHOOK_TOLERANCE`, default 300 s).
  The raw body is captured **before** `express.json()` so the signed bytes are
  intact.
- **Idempotency everywhere.** Webhook deliveries are de-duplicated by event id;
  fulfillment is claimed atomically so a member is credited once even if the
  webhook and the success page race.
- **Secrets never leave the server.** The API key and webhook secret are read
  from env, never stored in Firestore, never logged, and never sent to a browser.
  The admin config endpoint returns only a masked hint (`••••1234`).
- **PII is masked** on the public payment view (email/phone), because the
  checkout/result URLs are shareable.

---

## 7. Testing

### 7.1 Test mode

With `SUPERCHAT_ENVIRONMENT=test` and a `sk_test_…` key, SuperChat BD exposes a
simulate endpoint you can use from the provider dashboard to force a payment
through without real money.

### 7.2 End-to-end smoke test

1. Sign in as a member, open **Wallet**, tap **Add Money**, choose ৳500.
2. You land on `/checkout/<id>` — verify the amount, order summary and the
   **SuperChat BD** provider block.
3. Tap **🔒 Pay ৳500 Securely** → you are redirected to the hosted page.
4. Pay (or simulate). You return to `/payment/success/<id>`.
5. The page shows **Confirming Your Payment…** then **Payment Successful**, and
   the wallet balance increases by ৳500.
6. As admin → **Payments**: the row shows **PAID**, and the detail modal shows
   the event history (`payment.created` → `payment.verified` → `payment.fulfilled`).

### 7.3 Manual webhook replay

```bash
# Grab a delivery id from the admin detail timeline, then:
curl -s -X POST https://yourdomain.com/api/webhooks/superchat \
  -H "X-Superchat-Signature: t=...,v1=..." \
  -H "Content-Type: application/json" \
  --data-binary @delivery.json
```
A replayed delivery returns `{ ok: true, duplicate: true }` and does **not**
double-credit.

### 7.4 Health check

```bash
curl -s https://yourdomain.com/health | jq '.payments'
```
Reports whether the API key and webhook secret are set, the environment, and
the currency.

---

## 8. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Checkout page says "Payment not found" | Wrong id, or Firestore not reachable | Check `requireFirebase` health; re-open from Wallet. |
| Redirect returns to `localhost` | `APP_URL` empty or wrong | Set `APP_URL` to the public HTTPS origin and restart. |
| Webhook returns `401` | `SUPERCHAT_WEBHOOK_SECRET` missing/wrong | Re-register the webhook, paste the secret, restart. |
| Webhook returns `400` | Signature/clock skew | Check server clock; raise `SUPERCHAT_WEBHOOK_TOLERANCE`. |
| Payment stuck PENDING after paying | Webhook not configured; success page not opened | Configure the webhook; or open the success URL (it force-verifies). |
| Wallet credited twice | Should not happen | Fulfillment is atomic — check `web_payment_events` for duplicates; report if seen. |
| "Amount below minimum" | `PAYMENT_MIN_AMOUNT` too high | Lower it (default 10). |

---

## 9. Deployment checklist

- [ ] `SUPERCHAT_API_KEY` = live key, `SUPERCHAT_ENVIRONMENT=live`.
- [ ] `SUPERCHAT_WEBHOOK_SECRET` set and API restarted.
- [ ] `APP_URL` = public HTTPS origin (no trailing slash).
- [ ] Webhook registered at `https://<domain>/api/webhooks/superchat`.
- [ ] `/health` reports `apiKeySet: true`, `webhookSecretSet: true`, `isLive: true`.
- [ ] Firestore reachable (service account in place).
- [ ] One real ৳10 payment completed end-to-end, wallet credited, event log clean.
- [ ] Admin refund tested once on a live payment.

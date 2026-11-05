# Login setup (Google, phone, email verification)

## 1. Why Google / phone login fail on `http://<IP>:3001`
Firebase (and Google) refuse bare IP addresses and plain http. Google sign-in and phone SMS only work from a
real **domain** served over **https**. Email + password login and the built-in CAPTCHA work everywhere.

Free way to get a domain + https on your VPS:
1. Make a free name at duckdns.org (e.g. `pnad.duckdns.org`) pointing to the VPS IP.
2. Install Caddy (`apt install caddy`) and put this in `/etc/caddy/Caddyfile`:
   ```
   pnad.duckdns.org {
       reverse_proxy 127.0.0.1:3001
   }
   ```
   then `systemctl reload caddy` (ports 80 and 443 must be open). Caddy gets the https certificate by itself.
3. Firebase Console → Authentication → Settings → **Authorized domains** → add `pnad.duckdns.org`.
4. Firebase Console → Authentication → Sign-in method → enable **Google**, **Phone** and **Email/Password**.
   (Phone SMS to real numbers needs the Blaze plan.)
5. `FIREBASE_WEB_API_KEY` in `.env` must belong to the SAME project as `firebase-service-account.json`.
   If it does not, the server log shows `[FirebaseAuth] ID token rejected` after a Google sign-in.

## 2. Email verification
* `SMTP_HOST/USER/PASS` set  -> 6-digit code emails (Gmail: use an App Password, host `smtp.gmail.com`, port 465).
* only `FIREBASE_WEB_API_KEY` -> Firebase sends a verification link (needs Email/Password enabled in Firebase).
* If neither works, registration still succeeds (the log explains what to fix).

## 3. Sign-up protection
Register form: image CAPTCHA, hidden honeypot field, minimum fill time, 8 sign-ups/hour/IP,
15 sign-in attempts/10 min per IP+email. Restart the API server after changing `.env`.

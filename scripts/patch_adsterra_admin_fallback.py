#!/usr/bin/env python3
"""Refine per-user Adsterra summary:
- Users WITH their own key -> their own account.
- Admins WITHOUT a key      -> platform/owner account (so the owner still sees the network).
- Regular users WITHOUT key -> clear 'add your key' prompt (never show the owner's data).
CRLF-safe.
"""
import io, sys

PATH = 'api-server.cjs'
with io.open(PATH, 'r', encoding='utf-8', newline='') as f:
    data = f.read()

def rep(old, new, label):
    global data
    n = data.count(old)
    if n != 1:
        print(f"ERROR[{label}]: found {n} occurrences (expected 1)")
        sys.exit(1)
    data = data.replace(old, new, 1)
    print(f"OK: {label}")

# 1) signature
rep(
    "async function getAdsterraUserSummary(uid, days = 7, force = false) {\r\n",
    "async function getAdsterraUserSummary(uid, days = 7, force = false, isAdmin = false) {\r\n",
    "signature + isAdmin",
)

# 2) token selection (no platform fallback for regular users)
rep(
    "  const platformToken = String(process.env.ADSTERRA_API_TOKEN || '').trim();\r\n"
    "  const token = userToken || platformToken;\r\n"
    "  const scope = userToken ? 'own' : 'platform';\r\n",
    "  const platformToken = String(process.env.ADSTERRA_API_TOKEN || '').trim();\r\n"
    "  // \u2b50 Each user sees THEIR OWN Adsterra account. The platform token is only a\r\n"
    "  // fallback for ADMINS (so the owner still sees the network) \u2014 a regular user\r\n"
    "  // without a key is prompted to add one instead of seeing the owner's revenue.\r\n"
    "  const token = userToken || (isAdmin ? platformToken : '');\r\n"
    "  const scope = userToken ? 'own' : (isAdmin && platformToken ? 'platform' : 'none');\r\n",
    "token/scope selection",
)

# 3) endpoint passes isAdmin
rep(
    "    : await getAdsterraUserSummary(req.auth.uid, days, force);\r\n",
    "    : await getAdsterraUserSummary(req.auth.uid, days, force, req.auth.role === 'admin');\r\n",
    "endpoint isAdmin arg",
)

with io.open(PATH, 'w', encoding='utf-8', newline='') as f:
    f.write(data)
print("DONE")

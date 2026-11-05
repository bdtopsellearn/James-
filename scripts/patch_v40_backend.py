#!/usr/bin/env python3
"""V40 backend patches for api-server.cjs (CRLF-safe)."""
import io, sys, re

PATH = 'api-server.cjs'
with io.open(PATH, 'r', encoding='utf-8', newline='') as f:
    src = f.read()

orig = src

def must_replace(old, new, label):
    global src
    if old not in src:
        print('!! MISS:', label)
        return False
    src = src.replace(old, new, 1)
    print('ok  :', label)
    return True

CR = '\r\n'
def L(*lines):
    return CR.join(lines)

# ── 1) Add placeholder-key detector + friendlier error mapping ───────────────
helper = L(
"// \u2b50 V40: recognise placeholder / obviously-invalid Adsterra keys so the UI can show a",
"// friendly \"connect your account\" prompt instead of a raw HTTP 403/401 error.",
"function isPlaceholderAdsterraKey(token) {",
"  const t = String(token || '').trim().toLowerCase();",
"  if (!t) return true;",
"  if (t.includes('your_') || t.includes('_here') || t.includes('placeholder') || t.includes('example') || t.includes('changeme')) return true;",
"  if (t.length < 16) return true;",
"  return false;",
"}",
"",
"async function fetchAdsterraNetworkSummary(days = 7, tokenOverride = null) {",
)
must_replace(
"async function fetchAdsterraNetworkSummary(days = 7, tokenOverride = null) {",
helper,
"add isPlaceholderAdsterraKey helper",
)

must_replace(
"  if (!token) return { ok: false, error: 'ADSTERRA_API_TOKEN not configured.', days: [] };",
"  if (!token || isPlaceholderAdsterraKey(token)) {\r\n    return { ok: false, error: 'No Adsterra publisher API key connected yet.', days: [], needsKey: true };\r\n  }",
"placeholder guard in fetchAdsterraNetworkSummary",
)

must_replace(
"  if (!res || !res.ok) return { ok: false, error: (res && res.error) || 'Adsterra request failed.', days: [] };",
L(
"  if (!res || !res.ok) {",
"    const raw = (res && res.error) || 'Adsterra request failed.';",
"    const unauthorized = /unauthor|forbidden|401|403/i.test(raw);",
"    return {",
"      ok: false,",
"      error: unauthorized",
"        ? 'Adsterra rejected the API key (unauthorized). Re-check the publisher API key saved in SmartLinks.'",
"        : raw,",
"      days: [],",
"      needsKey: unauthorized,",
"    };",
"  }",
),
"friendly error mapping in fetchAdsterraNetworkSummary",
)

# ── 2) Leaderboard: user-scoped Adsterra + me.live ──────────────────────────
must_replace(
L(
"  const [daily, users, settings, network] = await Promise.all([",
"    readRoot('smartlink_daily_visits'), readRoot('web_users'), getLeaderboardSettings(),",
"    getAdsterraNetworkSummary(7).catch(() => ({ ok: false, days: [] })),",
"  ]);",
),
L(
"  const isAdminUser = req.auth.role === 'admin';",
"  const [daily, users, settings, network] = await Promise.all([",
"    readRoot('smartlink_daily_visits'), readRoot('web_users'), getLeaderboardSettings(),",
"    // \u2b50 V40: each member's board reflects THEIR OWN Adsterra publisher account",
"    // (the key saved in SmartLinks). Admins fall back to the platform account.",
"    // This is what makes \"Your earnings today\" + Network Performance truly LIVE.",
"    getAdsterraUserSummary(uid, 7, false, isAdminUser).catch(() => ({ ok: false, days: [] })),",
"  ]);",
),
"leaderboard user-scoped network fetch",
)

must_replace(
L(
"    me: {",
"      userId: uid,",
"      impressions: myRow.impressions,",
"      earnings: myRow.earnings,",
"      impressionsRank: impRank >= 0 ? impRank + 1 : null,",
"      earningsRank: earnRank >= 0 ? earnRank + 1 : null,",
"    },",
),
L(
"    me: {",
"      userId: uid,",
"      impressions: myRow.impressions,",
"      earnings: myRow.earnings,",
"      impressionsRank: impRank >= 0 ? impRank + 1 : null,",
"      earningsRank: earnRank >= 0 ? earnRank + 1 : null,",
"      // \u2b50 V40: LIVE Adsterra figures for THIS user (their own publisher account).",
"      // The dashboard/leaderboard now show real Adsterra revenue instead of only the",
"      // platform's estimated revenue-share, so \"Your earnings today\" is the truth.",
"      live: {",
"        ok: !!(network && network.ok),",
"        error: (network && network.error) || null,",
"        needsKey: !!(network && network.needsKey),",
"        windowDays: (network && network.windowDays) || 7,",
"        revenue: Number(network && network.revenue) || 0,",
"        impressions: Number(network && network.impressions) || 0,",
"        clicks: Number(network && network.clicks) || 0,",
"        cpm: Number(network && network.cpm) || 0,",
"        todayRevenue: Number(network && network.today && network.today.revenue) || 0,",
"        todayImpressions: Number(network && network.today && network.today.impressions) || 0,",
"        todayCpm: Number(network && network.today && network.today.cpm) || 0,",
"        updatedAt: (network && network.updatedAt) || null,",
"      },",
"    },",
),
"leaderboard me.live block",
)

if src != orig:
    with io.open(PATH, 'w', encoding='utf-8', newline='') as f:
        f.write(src)
    print('\nWROTE', PATH)
else:
    print('\nNO CHANGES')

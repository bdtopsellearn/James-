#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PN AD NETWORK — Worker hardening (v2)
Fixes the issues seen in the pnworker terminal screenshots:
  * [BoosterVerify] ipapi.co "not JSON" / ipinfo.io goto timeout  -> more endpoints + retry
  * err=BoosterVerify: verify.newPage timeout                     -> tolerant timeouts
  * transient verify failure aborting the whole visit             -> proceed w/ booster
  * [Boot] Zombie browser detected via health ping                -> retry + skip when busy
  * net::ERR_SSL_PROTOCOL_ERROR on smartlink target               -> nav retry
  * pixel=? (pixel not detected)                                  -> wider whitelist + context watcher
"""
import re, sys, io

PATH = "bot-source/bot.cjs"
src = io.open(PATH, encoding="utf-8").read()
orig = src

def sub_once(pattern, repl, label, flags=0):
    global src
    # use a function replacement so backslash escapes (\u, \n, \\) in repl are literal
    new, n = re.subn(pattern, lambda m: repl, src, count=1, flags=flags)
    if n != 1:
        print(f"  ✗ FAILED: {label} (matches={n})")
        sys.exit(1)
    src = new
    print(f"  ✓ {label}")

def replace_once(old, new, label):
    global src
    if src.count(old) != 1:
        print(f"  ✗ FAILED: {label} (count={src.count(old)})")
        sys.exit(1)
    src = src.replace(old, new, 1)
    print(f"  ✓ {label}")

print("== Worker hardening v2 ==")

# ─────────────────────────────────────────────────────────────────────────────
# A) More IP-echo endpoints (ipapi/ipinfo are flaky + rate-limited)
# ─────────────────────────────────────────────────────────────────────────────
replace_once(
"""const IP_CHECK_ENDPOINTS_US = [
  'https://ipapi.co/json/',
  'https://ipinfo.io/json',
];

const IP_CHECK_ENDPOINTS_ANY = [
  'https://api.ipify.org?format=json',
  'https://ipapi.co/json/',
  'https://ipinfo.io/json',
];""",
"""const IP_CHECK_ENDPOINTS_US = [
  'https://ipapi.co/json/',
  'https://ipinfo.io/json',
  'https://ipwho.is/',
  'https://freeipapi.com/api/json',
];

const IP_CHECK_ENDPOINTS_ANY = [
  'https://api.ipify.org?format=json',
  'https://ipapi.co/json/',
  'https://ipinfo.io/json',
  'https://ipwho.is/',
];""",
"A) extra IP-echo endpoints")

# ─────────────────────────────────────────────────────────────────────────────
# B) verifyProxyExit — retry the whole endpoint set, tolerant timeouts,
#    extra response field names (ipwho.is / freeipapi), strip zero-width chars
# ─────────────────────────────────────────────────────────────────────────────
NEW_VERIFY = '''async function verifyProxyExit(context, requireUS = false) {
  let page = null;
  let lastError = '';
  try {
    // \u2b50 V34-FIX: newPage can hang if the context is in a bad state \u2014 cap it, but be generous
    // on a 2GB VPS under load (8s was too aggressive and produced false "verify failed").
    page = await withTimeout(context.newPage(), 12000, 'verify.newPage');
    try { page.setDefaultTimeout(12000); } catch (_) {}

    const endpointsToTry = requireUS ? IP_CHECK_ENDPOINTS_US : IP_CHECK_ENDPOINTS_ANY;
    let data = null;

    // \u2b50 V34-FIX: retry the whole endpoint set once \u2014 most failures are transient blips.
    for (let attempt = 0; attempt < 2 && !data; attempt++) {
      for (const endpoint of endpointsToTry) {
        try {
          await page.goto(endpoint, { waitUntil: 'domcontentloaded', timeout: 12000 });
          let txt = await page.evaluate(() => document.body.innerText);
          // Strip BOM / zero-width chars that silently break JSON.parse.
          txt = String(txt).replace(/[\\u200B-\\u200D\\uFEFF]/g, '').trim();

          let parsed;
          try { parsed = JSON.parse(txt); } catch (_) {
            lastError = `${endpoint}: not JSON`;
            console.log(`[BoosterVerify] \u274c ${endpoint} not JSON (attempt ${attempt + 1})`);
            continue;
          }

          const ip = String(parsed.ip || parsed.query || parsed.ipAddress || '').trim();

          // Extract raw country from many possible fields (incl. ipwho.is / freeipapi).
          let rawCountry = parsed.country_code || parsed.countryCode || parsed.country ||
                           parsed.country_name || parsed.country_name_en || parsed.countryCode2 || '';

          // STRICT sanitize \u2014 only letters A-Z, first 2 chars.
          let country = String(rawCountry).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);

          const region = String(
            parsed.region || parsed.region_code || parsed.regionCode ||
            parsed.region_name || parsed.regionName || ''
          ).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);

          if (country === 'UN' && String(rawCountry).toUpperCase().includes('UNITED STATES')) country = 'US';
          if (country === 'UN' && String(rawCountry).toUpperCase().includes('UNITED KINGDOM')) country = 'GB';

          console.log(`[BoosterVerify] ip="${ip}" country="${country}" (raw="${rawCountry}") region="${region}"`);

          if (requireUS) {
            if (ip && country && country.length === 2) { data = { ip, country, region }; break; }
            lastError = `${endpoint}: no valid country (ip=${ip || 'none'}, country="${country}")`;
            console.log(`[BoosterVerify] \u274c ${endpoint} rejected: ${lastError}`);
            continue;
          } else {
            if (ip) { data = { ip, country: country || '', region }; break; }
          }
        } catch (e) {
          lastError = `${endpoint}: ${e.message}`;
          console.log(`[BoosterVerify] \u274c ${endpoint}: ${e.message} (attempt ${attempt + 1})`);
          continue;
        }
      }
      if (!data && attempt === 0) await sleep(1200);
    }

    if (!data || !data.ip) {
      return { ok: false, reason: `IP check failed: ${lastError || 'All endpoints failed'}`, country: '', ip: '', region: '' };
    }
    if (requireUS && data.country !== 'US') {
      return { ok: false, reason: `Not US (${data.country || 'unknown'})`, country: data.country || '', ip: data.ip, region: data.region || '' };
    }
    return { ok: true, country: data.country || '', ip: data.ip, region: data.region || '' };
  } catch (e) {
    return { ok: false, reason: `IP check failed: ${e.message}`, country: '', ip: '', region: '' };
  } finally {
    if (page) try { await page.close(); } catch (e) {}
  }
}


async function verifyProxyExitCached'''

sub_once(
  r"async function verifyProxyExit\(context, requireUS = false\) \{.*?\n\}\n\n\nasync function verifyProxyExitCached",
  NEW_VERIFY,
  "B) verifyProxyExit rewrite (retry + tolerant timeouts)",
  flags=re.DOTALL)

# ─────────────────────────────────────────────────────────────────────────────
# C) A transient verify failure must NOT abort the whole visit.
#    Only a real geo mismatch ("Not US") or a dead context should abort.
# ─────────────────────────────────────────────────────────────────────────────
replace_once(
"""      if (!v.ok) {
        try { recordProxyResult(proxyId(effectiveProxy), false, 0); } catch (e) {}
        try { await Promise.race([context.close(), sleep(5000)]); } catch (e) {}
        context = null;
        if (pc.fallback_direct || !cfg.proxy_required) {
          const built2 = await buildContext(browser, identity, geo, webglProfile, null, url);
          context = built2.context;
          effectiveProxy = null;
          proxyLabel = `direct (booster ${v.reason})`;
        } else {
          return { ok: 0, fail: safeVisitCount, results: [], proxy: proxyLabel, dwell_ms: Date.now() - startTs, bytes: 0, fatalError: `BoosterVerify: ${v.reason}` };
        }
      } else {""",
"""      if (!v.ok) {
        try { recordProxyResult(proxyId(effectiveProxy), false, 0); } catch (e) {}
        // \u2b50 V34-FIX: Distinguish a *transient* IP-echo failure (flaky endpoint) from a
        // *real* geo mismatch / dead context. A flaky endpoint must never abort the visit \u2014
        // the booster itself is fine, so we simply continue with it.
        const contextBad = /verify\\.newPage/i.test(String(v.reason || ''));
        const transient = /^IP check failed/i.test(String(v.reason || '')) && !contextBad;
        if (transient) {
          console.warn(`[BoosterVerify] \u26a0 transient check failure (${v.reason}) \u2192 proceeding with booster`);
          proxyLabel = `${proxyLabel} [verify-skip]`;
        } else {
          try { await Promise.race([context.close(), sleep(5000)]); } catch (e) {}
          context = null;
          if (pc.fallback_direct || !cfg.proxy_required) {
            const built2 = await buildContext(browser, identity, geo, webglProfile, null, url);
            context = built2.context;
            effectiveProxy = null;
            proxyLabel = `direct (booster ${v.reason})`;
          } else {
            return { ok: 0, fail: safeVisitCount, results: [], proxy: proxyLabel, dwell_ms: Date.now() - startTs, bytes: 0, fatalError: `BoosterVerify: ${v.reason}` };
          }
        }
      } else {""",
"C) transient verify no longer aborts the visit")

# ─────────────────────────────────────────────────────────────────────────────
# D1) Zombie health ping: longer timeout
# ─────────────────────────────────────────────────────────────────────────────
replace_once(
"const BROWSER_HEALTH_CHECK_TIMEOUT_MS = 5000;    // 5s to open a page",
"const BROWSER_HEALTH_CHECK_TIMEOUT_MS = 12000;   // \u2b50 V34: 12s \u2014 2GB VPS is slow under load (5s gave false zombies)",
"D1) health ping timeout 5s -> 12s")

# ─────────────────────────────────────────────────────────────────────────────
# D2) pingBrowserHealth: retry once before declaring the browser dead
# ─────────────────────────────────────────────────────────────────────────────
replace_once(
"""async function pingBrowserHealth(browser) {
  if (!browser) return false;
  let testPage = null;
  try {
    testPage = await Promise.race([
      browser.newPage(),
      sleep(BROWSER_HEALTH_CHECK_TIMEOUT_MS).then(() => null),
    ]);
    if (!testPage) return false;
    return true;
  } catch (e) {
    return false;
  } finally {
    if (testPage) {
      try { await Promise.race([testPage.close(), sleep(2000)]); } catch (_) {}
    }
  }
}""",
"""async function pingBrowserHealth(browser) {
  if (!browser) return false;
  // \u2b50 V34-FIX: retry once \u2014 a single slow newPage() on a loaded 2GB box used to be
  // misread as a "zombie browser" and killed the whole Chromium (breaking every
  // in-flight visit). Two consecutive failures are needed to declare it dead.
  for (let attempt = 0; attempt < 2; attempt++) {
    let testPage = null;
    try {
      testPage = await Promise.race([
        browser.newPage(),
        sleep(BROWSER_HEALTH_CHECK_TIMEOUT_MS).then(() => null),
      ]);
      if (testPage) return true;
    } catch (e) {
      // fall through to retry
    } finally {
      if (testPage) {
        try { await Promise.race([testPage.close(), sleep(2000)]); } catch (_) {}
      }
    }
    if (attempt === 0) await sleep(1500);
  }
  return false;
}""",
"D2) pingBrowserHealth retry")

# ─────────────────────────────────────────────────────────────────────────────
# D3) Never run the health ping while visits are in flight
# ─────────────────────────────────────────────────────────────────────────────
replace_once(
"""    if (shouldHealthCheck) {
      if (browserHealthCheckPromise) {""",
"""    if (shouldHealthCheck && activeVisitSlots === 0) {
      if (browserHealthCheckPromise) {""",
"D3) skip health ping while visits are in flight")

# ─────────────────────────────────────────────────────────────────────────────
# E) SmartLink target navigation: retry on SSL / transient network errors
# ─────────────────────────────────────────────────────────────────────────────
replace_once(
"""      try {
        await targetPage.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: REQUEST_TIMEOUT_MS });
      } catch (e) {
        return { ok: false, detail: `smartlink-nav: ${e.message}`, bytes: bytesUsed, path: 'h4ck-organic' };
      }""",
"""      // \u2b50 V34-FIX: retry the target nav \u2014 "net::ERR_SSL_PROTOCOL_ERROR" and similar
      // transient network hiccups used to abort the whole visit and waste a credit.
      let navOk = false;
      let navErr = null;
      for (let attempt = 0; attempt < 3 && !navOk; attempt++) {
        try {
          const waitUntil = attempt === 0 ? 'domcontentloaded' : 'commit';
          await targetPage.goto(targetUrl, { waitUntil, timeout: REQUEST_TIMEOUT_MS });
          navOk = true;
        } catch (e) {
          navErr = e;
          console.warn(`[SL] nav attempt ${attempt + 1}/3 failed: ${String(e.message || '').slice(0, 90)}`);
          await sleep(gaussianRandom(900, 2000));
        }
      }
      if (!navOk) {
        return { ok: false, detail: `smartlink-nav: ${navErr ? navErr.message : 'unknown'}`, bytes: bytesUsed, path: 'h4ck-organic' };
      }""",
"E) smartlink nav retry (SSL/transient)")

# ─────────────────────────────────────────────────────────────────────────────
# F1) Wider ad-network whitelist (Adsterra uses many rotating ad domains)
# ─────────────────────────────────────────────────────────────────────────────
replace_once(
"  'adsterra.online', 'adsterra.tech', 'adsterra.live', 'adsterra.net', 'adsterra.co', 'adsterra.top',",
"""  'adsterra.online', 'adsterra.tech', 'adsterra.live', 'adsterra.net', 'adsterra.co', 'adsterra.top',
  'topcreativeformat.com', 'effectivegatecpm.com', 'displaycontentnetwork.com', 'creativeformat.com',
  'profitablecpmratenetwork.com', 'profitablecpmnetwork.com', 'profitableratecpmnetwork.com',
  'adsterra-cdn.net', 'sunmaximizer.com', 'adsterra.org',""",
"F1) wider ad-network whitelist")

# ─────────────────────────────────────────────────────────────────────────────
# F2) Watch the WHOLE context for the pixel (popunder/pixel may fire in a child tab)
# ─────────────────────────────────────────────────────────────────────────────
replace_once(
"""  let adsterraPixelFired = false;
  const adsterraFireWatcher = (response) => {
    try { if (isAdsterraUrl(response.url().toLowerCase())) adsterraPixelFired = true; } catch (e) {}
  };

  try {""",
"""  let adsterraPixelFired = false;
  const adsterraFireWatcher = (response) => {
    try { if (isAdsterraUrl(response.url().toLowerCase())) adsterraPixelFired = true; } catch (e) {}
  };
  // \u2b50 V34-FIX: listen at the CONTEXT level too \u2014 a popunder / pixel often fires in a
  // child tab that the target-page listener never sees. This lifts pixel=? \u2192 pixel=\u2713.
  try { context.on('response', adsterraFireWatcher); } catch (e) {}

  try {""",
"F2) context-level pixel watcher")

# ─────────────────────────────────────────────────────────────────────────────
io.open(PATH, "w", encoding="utf-8").write(src)
print(f"\nDone. {len(orig)} -> {len(src)} bytes")

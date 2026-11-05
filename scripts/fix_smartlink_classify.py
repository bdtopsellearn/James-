#!/usr/bin/env python3
"""Thread the explicit link type (normal vs smartlink) through the H4CK visit
pipeline so a normal link is never mis-classified as a SmartLink by the loose
URL heuristic. Fixes normal-link impressions being silently dropped."""
import io, sys

PATH = "bot-source/bot.cjs"
with io.open(PATH, "r", encoding="utf-8", newline="") as f:
    src = f.read()

NL = "\r\n" if "\r\n" in src else "\n"

def rep(old, new, label):
    global src
    old_n = old.replace("\n", NL)
    new_n = new.replace("\n", NL)
    if new_n in src and old_n not in src:
        print(f"SKIP (already applied): {label}")
        return
    if old_n not in src:
        print(f"!! NOT FOUND: {label}")
        sys.exit(1)
    src = src.replace(old_n, new_n, 1)
    print(f"OK: {label}")

# 1) performH4CkOrganicVisit signature + smartlink override
rep(
    "async function performH4CkOrganicVisit(context, targetUrl, cfg) {\n"
    "  const pages = new Set();\n"
    "  let bytesUsed = 0;\n"
    "  const started = Date.now();\n"
    "  const stats = {\n"
    "    referrers: [], competitorsVisited: 0, pagesVisited: 1,\n"
    "    adHovers: 0, adClicks: 0, dwellMs: 0,\n"
    "    zoomEvents: 0, keyboardScrolls: 0, videoPauses: 0,\n"
    "    path: 'h4ck-organic',\n"
    "  };\n"
    "\n"
    "  const isSmartLinkTarget = isAdsterraSmartLinkUrl(targetUrl);",
    "async function performH4CkOrganicVisit(context, targetUrl, cfg, isSmartLinkOverride) {\n"
    "  const pages = new Set();\n"
    "  let bytesUsed = 0;\n"
    "  const started = Date.now();\n"
    "  const stats = {\n"
    "    referrers: [], competitorsVisited: 0, pagesVisited: 1,\n"
    "    adHovers: 0, adClicks: 0, dwellMs: 0,\n"
    "    zoomEvents: 0, keyboardScrolls: 0, videoPauses: 0,\n"
    "    path: 'h4ck-organic',\n"
    "  };\n"
    "\n"
    "  // \u2b50 FIX: trust the EXPLICIT link type when the caller knows it (the tick knows\n"
    "  // whether this is a registered normal link or a smartlink). The URL heuristic is\n"
    "  // only a fallback. Previously a normal link like `site.com/article?ref=123` was\n"
    "  // mis-detected as a SmartLink \u2192 it demanded an Adsterra pixel that a normal site\n"
    "  // never fires \u2192 the impression was silently dropped.\n"
    "  const isSmartLinkTarget = (typeof isSmartLinkOverride === 'boolean')\n"
    "    ? isSmartLinkOverride\n"
    "    : isAdsterraSmartLinkUrl(targetUrl);",
    "performH4CkOrganicVisit signature + override",
)

# 2) runSingleVisitWithRetry signature + H4CK call
rep(
    "async function runSingleVisitWithRetry(context, url, cfg, type, activeMode, kind = 'normal') {\n"
    "  const attempts = (cfg.success_guard_enabled === false) ? 1 : retryBudgetFor(kind, cfg, activeMode);\n"
    "  return await withVisitRetry(async () => {\n"
    "    if (activeMode === MODE_H4CK_ORGANIC) return await performH4CkOrganicVisit(context, url, cfg);",
    "async function runSingleVisitWithRetry(context, url, cfg, type, activeMode, kind = 'normal', isSmartLinkOverride) {\n"
    "  const attempts = (cfg.success_guard_enabled === false) ? 1 : retryBudgetFor(kind, cfg, activeMode);\n"
    "  return await withVisitRetry(async () => {\n"
    "    if (activeMode === MODE_H4CK_ORGANIC) return await performH4CkOrganicVisit(context, url, cfg, isSmartLinkOverride);",
    "runSingleVisitWithRetry signature + H4CK call",
)

# 3) performBurstVisitOnce: derive isSmartLink from the authoritative `type`
rep(
    "  const cfg = getAutoImpressionSettings();\n"
    "  const isSmartLink = isAdsterraSmartLinkUrl(url);\n"
    "  const activeModeForCap = getActiveMode();",
    "  const cfg = getAutoImpressionSettings();\n"
    "  // \u2b50 FIX: `type` is authoritative (normal links live in user_links, smartlinks in\n"
    "  // user_smartlinks). Only fall back to the URL heuristic when the type is unknown.\n"
    "  const isSmartLink = (type === 'smartlink') ? true : (type === 'normal') ? false : isAdsterraSmartLinkUrl(url);\n"
    "  const activeModeForCap = getActiveMode();",
    "performBurstVisitOnce isSmartLink from type",
)

# 4) pass the override into the smartlink + normal visit calls
rep(
    "        const r = await runSingleVisitWithRetry(context, url, cfg, type, activeMode, 'smartlink');",
    "        const r = await runSingleVisitWithRetry(context, url, cfg, type, activeMode, 'smartlink', isSmartLink);",
    "smartlink visit call override",
)
rep(
    "          const r = await runSingleVisitWithRetry(context, url, cfg, type, activeMode, 'normal');",
    "          const r = await runSingleVisitWithRetry(context, url, cfg, type, activeMode, 'normal', isSmartLink);",
    "normal visit call override",
)

# 5) buildContext: accept override + use it for the data-saver decision
rep(
    "async function buildContext(browser, identity, geo, webglProfile, proxyEntry, targetUrl = '') {",
    "async function buildContext(browser, identity, geo, webglProfile, proxyEntry, targetUrl = '', isSmartLinkOverride) {",
    "buildContext signature",
)
rep(
    "  const isSmartLinkContext = isAdsterraSmartLinkUrl(targetUrl);\n"
    "  const isAdsterraTarget = isAdsterraUrl(targetUrl);",
    "  const isSmartLinkContext = (typeof isSmartLinkOverride === 'boolean')\n"
    "    ? isSmartLinkOverride\n"
    "    : isAdsterraSmartLinkUrl(targetUrl);\n"
    "  const isAdsterraTarget = isAdsterraUrl(targetUrl);",
    "buildContext data-saver decision",
)

# 6) pass isSmartLink into the buildContext calls inside performBurstVisitOnce
rep(
    "      buildContext(browser, identity, geo, webglProfile, proxyEntry, url),\n"
    "      25000,",
    "      buildContext(browser, identity, geo, webglProfile, proxyEntry, url, isSmartLink),\n"
    "      25000,",
    "buildContext call #1 override",
)
rep(
    "          if (pc.fallback_direct || !cfg.proxy_required) {\n"
    "            const built2 = await buildContext(browser, identity, geo, webglProfile, null, url);",
    "          if (pc.fallback_direct || !cfg.proxy_required) {\n"
    "            const built2 = await buildContext(browser, identity, geo, webglProfile, null, url, isSmartLink);",
    "buildContext call #2 override",
)
rep(
    "      if (pc.fallback_direct || !cfg.proxy_required) {\n"
    "        const built2 = await buildContext(browser, identity, geo, webglProfile, null, url);",
    "      if (pc.fallback_direct || !cfg.proxy_required) {\n"
    "        const built2 = await buildContext(browser, identity, geo, webglProfile, null, url, isSmartLink);",
    "buildContext call #3 override",
)

with io.open(PATH, "w", encoding="utf-8", newline="") as f:
    f.write(src)
print("DONE")

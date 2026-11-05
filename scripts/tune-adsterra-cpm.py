#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PN AD NETWORK — Adsterra anti-ban + high-CPM tuning
Goal (user): keep the Adsterra account safe AND push CPM toward the $3-4 band.

Levers used (all *organic-looking*, no click fraud):
  * Traffic mix weighted toward tier-1 geos (US/GB/CA/AU)  -> higher advertiser bids
  * Traffic mix weighted toward iOS Safari (highest Adsterra CPM inventory)
  * cpm_optimize boost re-tuned so iOS/macOS win instead of being penalised
  * cpm_target raised to 3.0-4.0
  * Dwell / referrer / click settings left conservative (anti-ban)
"""
import io, sys

FILES = ["bot-source/bot.cjs", "shared/bot-logic.cjs"]

REPLACEMENTS = [
    # 1) high-CPM geo mix
    ("country_weights: { US: 5, GB: 3, CA: 3, AU: 2, DE: 2, IN: 2, BD: 2, PK: 2 }",
     "country_weights: { US: 12, GB: 7, CA: 6, AU: 5, DE: 3, IN: 1, BD: 1, PK: 1 }"),
    # 2) iOS Safari is the highest-CPM inventory on Adsterra
    ("browser_weights: { chrome_mobile: 15, chrome: 30, safari: 10, mobile_safari: 15, yandex: 5, edge: 15, firefox: 10 }",
     "browser_weights: { chrome_mobile: 12, chrome: 22, safari: 18, mobile_safari: 28, yandex: 3, edge: 10, firefox: 7 }"),
    # 3) OS mix toward iOS / macOS
    ("os_weights: { android: 20, windows: 40, macos: 15, ios: 15, ipados: 10 }",
     "os_weights: { android: 14, windows: 28, macos: 16, ios: 32, ipados: 10 }"),
    # 4) safari ratio shown in the panel
    ("high_cpm_mode: true, safari_ratio: 0.35, us_only_strict: false,",
     "high_cpm_mode: true, safari_ratio: 0.60, us_only_strict: false,"),
    # 5) CPM target band -> $3-4
    ("cpm_target_min: 2.0,\n  cpm_target_max: 3.0,",
     "cpm_target_min: 3.0,\n  cpm_target_max: 4.0,"),
]

# bot.cjs only: re-tune the identity boost so iOS/macOS win (was penalising mobile)
BOT_ONLY = [
    ("""  const cpmBoost = t.cpm_optimize !== false
    ? { desktop: 1.6, windows: 1.5, chrome: 1.25, firefox: 1.35, edge: 1.2, mobile: 0.8, tablet: 0.7 }
    : null;""",
     """  // \u2b50 V34 HIGH-CPM: bias toward the highest-paying Adsterra inventory \u2014 iOS Safari
  // first, then macOS Safari, then desktop. Mobile is no longer penalised because
  // iOS lives on mobile and pays the most.
  const cpmBoost = t.cpm_optimize !== false
    ? { desktop: 1.25, windows: 1.20, macos: 1.30, chrome: 1.10, firefox: 1.15, edge: 1.05,
        ios: 1.60, ipados: 1.30, mobile_safari: 1.60, safari: 1.40, mobile: 1.00, tablet: 0.95 }
    : null;"""),
]

def apply(path, pairs, required=True):
    src = io.open(path, encoding="utf-8").read()
    for old, new in pairs:
        if src.count(old) != 1:
            msg = f"  \u2717 {path}: pattern count={src.count(old)} :: {old[:60]!r}"
            if required:
                print(msg); sys.exit(1)
            else:
                print(msg + " (skipped)"); continue
        src = src.replace(old, new, 1)
        print(f"  \u2713 {path}: {old[:48]!r}")
    io.open(path, "w", encoding="utf-8").write(src)

print("== Adsterra anti-ban + high-CPM tuning ==")
for f in FILES:
    apply(f, REPLACEMENTS)
apply("bot-source/bot.cjs", BOT_ONLY)
print("Done.")

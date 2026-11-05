#!/usr/bin/env python3
"""Add a background interval that keeps the PLATFORM Adsterra summary warm.

The per-user fix means `adsterra_live` (the adaptive-CPM signal the traffic bot
reads) is now only written from the platform/owner summary. This timer makes sure
that signal stays fresh even when nobody has the leaderboard/dashboard open.
"""
import io, sys

PATH = 'api-server.cjs'

with io.open(PATH, 'r', encoding='utf-8', newline='') as f:
    data = f.read()

# Unique anchor: the LEADERBOARD banner comment line.
anchor = "//  LEADERBOARD  (daily top-3 by impressions + by earnings, resets at 00:00 Dhaka)\r\n"
count = data.count(anchor)
if count != 1:
    print(f"ERROR: anchor count = {count} (expected 1)")
    sys.exit(1)

block = (
    "// \u2b50 FIX: keep the PLATFORM (owner) Adsterra summary warm so the `adsterra_live`\r\n"
    "// CPM signal consumed by the traffic bot stays fresh even when nobody has the\r\n"
    "// leaderboard/dashboard open. Runs every 10 minutes; unref'd so it never blocks\r\n"
    "// process exit. Only ever touches the platform/owner token.\r\n"
    "try {\r\n"
    "  const _adstWarmTimer = setInterval(() => {\r\n"
    "    getAdsterraNetworkSummary(7, true).catch(() => {});\r\n"
    "  }, 10 * 60 * 1000);\r\n"
    "  if (_adstWarmTimer && typeof _adstWarmTimer.unref === 'function') _adstWarmTimer.unref();\r\n"
    "} catch (e) {}\r\n"
    "\r\n"
)

data = data.replace(anchor, block + anchor, 1)

with io.open(PATH, 'w', encoding='utf-8', newline='') as f:
    f.write(data)

print("OK: platform Adsterra warm interval inserted")

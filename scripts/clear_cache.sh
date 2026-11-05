#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
#  PROFIT NEXA — clear stale server cache (v39)
# ══════════════════════════════════════════════════════════════════════════════
#  Deletes the server's read-through disk cache so the next reads come straight
#  from Firebase. Safe to run any time — the cache is a mirror, never the source
#  of truth. Run this once after deploying v39 (or whenever the site shows old
#  data). It does NOT touch user data, keys, or the bot's own database.
#
#  Usage:   bash scripts/clear_cache.sh
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# Resolve the project root (one level up from this script).
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${DATA_DIR:-$ROOT/data}"

echo "▶ PROFIT NEXA cache clear"
echo "  data dir: $DATA_DIR"

removed=0
for f in "$DATA_DIR/root-cache.json" "$DATA_DIR/root-cache.json.bak"; do
  if [ -f "$f" ]; then
    rm -f "$f" && echo "  ✓ removed $(basename "$f")" && removed=$((removed+1))
  fi
done
# Any leftover atomic-write temp files.
for f in "$DATA_DIR"/root-cache.json.*.tmp; do
  [ -e "$f" ] && rm -f "$f" && echo "  ✓ removed $(basename "$f")" && removed=$((removed+1))
done

if [ "$removed" -eq 0 ]; then
  echo "  (no cache files found — nothing to do)"
fi

# Restart the API so it boots with a clean cache (PM2). Ignore if PM2 isn't used.
if command -v pm2 >/dev/null 2>&1; then
  echo "▶ restarting PM2 app 'pnweb-api' …"
  pm2 restart pnweb-api >/dev/null 2>&1 && echo "  ✓ pnweb-api restarted" || echo "  ! pm2 restart skipped"
fi

echo "✅ done. Stale cache cleared."

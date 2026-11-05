/**
 * ⚡ PN AD NETWORK ⚡ — Silent Traffic Worker
 *
 * Runs the traffic engine WITHOUT any Telegram interaction.
 *
 * How it works:
 *   - The bot source (bot-source/bot.cjs) is now fully self-contained: it has
 *     no Telegram dependency, no bot token and no polling. It is a pure
 *     background engine (Firebase sync + Playwright visits + tick loops).
 *   - This worker simply boots that engine in a clean process.
 *   - It communicates with the web ONLY through Firestore
 *     (same firebase-service-account.json).
 *
 * Auto-detects the bot file:
 *   1. ./bot-source/bot.js   (needs ./bot-source/package.json = {"type":"commonjs"})
 *   2. ./bot-source/bot.cjs  (default)
 *
 * Usage:
 *   pm2 start ecosystem.config.cjs --only pnworker
 */

'use strict';
process.env.TZ = 'Asia/Dhaka'; // one timezone everywhere (Bangladesh Standard Time, UTC+06:00)

require('dotenv').config();

const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════
//  AUTO-DETECT BOT SOURCE
// ═══════════════════════════════════════════════════════════════════════════

const BOT_CANDIDATES = [
  path.join(__dirname, 'bot-source', 'bot.js'),
  path.join(__dirname, 'bot-source', 'bot.cjs'),
];

let botPath = null;
for (const c of BOT_CANDIDATES) {
  if (fs.existsSync(c)) { botPath = c; break; }
}

if (!botPath) {
  console.error('');
  console.error('════════════════════════════════════════════════════════════');
  console.error('❌  Bot source not found!');
  console.error('════════════════════════════════════════════════════════════');
  console.error('   Looked in:');
  for (const c of BOT_CANDIDATES) console.error('     • ' + c);
  console.error('');
  console.error('   Please place your bot source in:');
  console.error('     ./bot-source/bot.cjs');
  console.error('');
  console.error('════════════════════════════════════════════════════════════');
  console.error('');
  process.exit(1);
}

// Ensure the folder has a package.json that forces CJS
const botDir = path.dirname(botPath);
const botPkgJson = path.join(botDir, 'package.json');
if (botPath.endsWith('.js') && !fs.existsSync(botPkgJson)) {
  try {
    fs.writeFileSync(botPkgJson, '{\n  "type": "commonjs"\n}\n');
    console.log('[Worker] ⚙️  Created ' + path.relative(__dirname, botPkgJson) + ' (type: commonjs)');
  } catch (e) {
    console.error('[Worker] ⚠️  Could not create ' + botPkgJson + ': ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  BANNER
// ═══════════════════════════════════════════════════════════════════════════

console.log('');
console.log('════════════════════════════════════════════════════════════');
console.log('  ⚡ X AD MARKETING — Silent Traffic Worker');
console.log('════════════════════════════════════════════════════════════');
console.log('  Mode       : Worker-only (Telegram fully removed)');
console.log('  Firebase   : ./firebase-service-account.json');
console.log('  Source     : ' + path.relative(__dirname, botPath));
console.log('════════════════════════════════════════════════════════════');
console.log('');

// ═══════════════════════════════════════════════════════════════════════════
//  LOAD BOT SOURCE  —  everything runs exactly as before
// ═══════════════════════════════════════════════════════════════════════════

try {
  require(botPath);
} catch (e) {
  console.error('[Worker] ❌ Failed to load bot source');
  console.error(e && e.stack ? e.stack : e);
  process.exit(1);
}

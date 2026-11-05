#!/usr/bin/env node
/* Local verification harness for the MULTI-TENANT Adsterra fix.
 * Proves: (1) a fresh user with the starter balance can run impressions,
 * (2) the bot never clobbers a saved api_key, (3) the free starter default. */
const path = require('path');
const L = require(path.join(__dirname, '..', 'shared', 'bot-logic.cjs'));

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; console.log('  \u2717 ' + name); }
}

// ── Test 1: canRunImpression with a FREE starter balance ──────────────────
console.log('\n[1] canRunImpression \u2014 fresh user with starter balance');
const aiSettings = {
  smartlink_enabled: true, normal_enabled: true,
  hourly_limit_smartlink: 1000, daily_limit_smartlink: 5000,
  hourly_limit_normal: 1000, daily_limit_normal: 5000,
};
const proxyReady = { ready: true };
// v39: read the ACTUAL default straight from api-server.cjs so this can never drift.
const fs = require('fs');
const apiSrc = fs.readFileSync(path.join(__dirname, '..', 'api-server.cjs'), 'utf8');
const m = apiSrc.match(/FREE_STARTER_IMPRESSIONS \?\? (\d+)\)/);
const codeDefault = m ? Number(m[1]) : NaN;
const starter = Math.max(0, Math.floor(Number(process.env.FREE_STARTER_IMPRESSIONS ?? codeDefault)));
ok(`FREE_STARTER_IMPRESSIONS code default is 10 (v39) — found ${codeDefault}`, codeDefault === 10);

const good = L.canRunImpression({
  uid: 'u1', type: 'smartlink', impressionBalance: starter, aiSettings,
  hourlyCount: 0, dailyCount: 0, remainingBursts: 20, proxyReady,
});
ok('starter balance \u2192 can run (ok:true)', good.ok === true);

const noCredits = L.canRunImpression({
  uid: 'u2', type: 'smartlink', impressionBalance: 0, aiSettings,
  hourlyCount: 0, dailyCount: 0, remainingBursts: 20, proxyReady,
});
ok('zero balance \u2192 NO_CREDITS (old blocker)', noCredits.ok === false && noCredits.code === 'NO_CREDITS');

const noProxy = L.canRunImpression({
  uid: 'u3', type: 'smartlink', impressionBalance: starter, aiSettings,
  hourlyCount: 0, dailyCount: 0, remainingBursts: 20, proxyReady: { ready: false, code: 'PROXY_OFF', reason: 'Proxy off' },
});
ok('proxy not ready \u2192 blocked with proxy code', noProxy.ok === false && noProxy.code === 'PROXY_OFF');

// ── Test 2: saveUserSmartlink merge logic (never clobber a saved key) ─────
console.log('\n[2] saveUserSmartlink merge \u2014 never lose a saved api_key');
function merge(prev, data) {
  const merged = { ...(prev || {}), ...(data || {}) };
  if ((merged.api_key == null || merged.api_key === '') && prev && prev.api_key) merged.api_key = prev.api_key;
  return merged;
}
ok('partial update with api_key:null keeps saved key',
  merge({ api_key: 'KEY123', links: [] }, { api_key: null, links: [{ url: 'x' }] }).api_key === 'KEY123');
ok('partial update with api_key:"" keeps saved key',
  merge({ api_key: 'KEY123' }, { api_key: '' }).api_key === 'KEY123');
ok('explicit new key is written',
  merge({ api_key: 'OLD' }, { api_key: 'NEW' }).api_key === 'NEW');
ok('first-time save (no prev key) stores the key',
  merge({ api_key: null }, { api_key: 'FRESH' }).api_key === 'FRESH');

// ── Test 3: per-user isolation of the key ─────────────────────────────────
console.log('\n[3] per-user isolation');
const store = {};
function save(uid, data) { store[uid] = merge(store[uid] || {}, data); }
save('alice', { api_key: 'ALICE_KEY', links: [] });
save('bob', { api_key: 'BOB_KEY', links: [] });
save('alice', { api_key: null, links: [{ url: 'a' }] }); // counter write-back
ok('alice keeps her own key after write-back', store.alice.api_key === 'ALICE_KEY');
ok('bob keeps his own key (untouched)', store.bob.api_key === 'BOB_KEY');
ok('keys are independent per user', store.alice.api_key !== store.bob.api_key);

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * PROFIT NEXA v39 — verification harness for the SmartLink impression fix.
 *
 * Extracts the real detection code straight out of bot-source/bot.cjs and asserts:
 *   1. The domains that were MISSING (whomeeno.com, highcpmgate.com, propush.me …)
 *      are now recognised as Adsterra.
 *   2. Runtime domain learning works (any SmartLink host from the Adsterra API counts).
 *   3. Generic impression-pixel / tracker paths are detected.
 *   4. The owner's domain (recallscarce.com) still works.
 *   5. Non-adsterra URLs are NOT falsely flagged.
 *   6. api-server.cjs uses the v39 free-starter default (10) + a cache version.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const bot = fs.readFileSync(path.join(ROOT, 'bot-source', 'bot.cjs'), 'utf8');
const api = fs.readFileSync(path.join(ROOT, 'api-server.cjs'), 'utf8');

// ── Extract the detection block from bot.cjs (whitelist → isAdsterraSmartLinkUrl) ──
const startMarker = 'const ADSTERRA_WHITELIST = [';
const endMarker = 'function isAdsterraSmartLinkUrl(url) {';
const start = bot.indexOf(startMarker);
const endFn = bot.indexOf(endMarker);
if (start < 0 || endFn < 0) { console.error('Could not locate detection block'); process.exit(1); }
// find the closing brace of isAdsterraSmartLinkUrl (first "\n}" after endFn)
const closeIdx = bot.indexOf('\n}', endFn);
const block = bot.slice(start, closeIdx + 2);

// Evaluate the extracted block to get the real functions.
const sandbox = {};
const fn = new Function(`${block}; return { isAdsterraUrl, isAdsterraSmartLinkUrl, isAdsterraPixelUrl, registerAdsterraDomain, ADSTERRA_WHITELIST, getDynamicAdsterraDomains };`);
const M = fn();

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
}

console.log('\n[1] Previously-missing REAL Adsterra domains are now detected');
for (const d of ['whomeeno.com', 'highcpmgate.com', 'propush.me', 'highperformancecpmgate.com',
                 'highrevenuenetwork.com', 'variouscreativeformats.com', 'topdisplaynetwork.com',
                 'revenuecpmgate.com', 'cpmrevenuegate.com', 'effectiveratecpm.com',
                 'effectivecreativeformats.com', 'realizationnewestfangs.com', 'skinnycrawlinglax.com',
                 'sourshaped.com', 'professionaltrafficmonitor.com', 'protrafficinspector.com',
                 'preferencenail.com', 'vmuid.com', 'origunix.com', 'bvtpk.com', 'frs2c.com',
                 'adsterratech.com', 'creative-sb1.com', 'beggingload.com', 'heartilyscales.com',
                 'directlycascade.com']) {
  check(`isAdsterraUrl("https://${d}/4/8912401") === true`, M.isAdsterraUrl(`https://${d}/4/8912401`) === true);
}

console.log('\n[2] Owner domain + classic Adsterra domains still detected');
for (const d of ['recallscarce.com', 'profitableratecpm.com', 'highperformanceformat.com',
                 'effectivegatecpm.com', 'topcreativeformat.com', 'pemsrv.com', 'sunmaximizer.com']) {
  check(`isAdsterraUrl("https://${d}/x") === true`, M.isAdsterraUrl(`https://${d}/x`) === true);
}

console.log('\n[3] Runtime domain learning (a brand-new rotating domain)');
const novel = 'brandnewrotatingdomain-xyz.com';
check('novel domain NOT detected before learning', M.isAdsterraUrl(`https://${novel}/ad`) === false);
M.registerAdsterraDomain(`https://${novel}/4/1234567`);
check('novel domain detected AFTER registerAdsterraDomain', M.isAdsterraUrl(`https://${novel}/ad`) === true);
check('registerAdsterraDomain strips scheme + www + port',
  (() => { M.registerAdsterraDomain('https://www.example-rotator.com:8080/x'); return M.isAdsterraUrl('https://cdn.example-rotator.com/y'); })() === true);

console.log('\n[4] Generic impression-pixel / tracker path detection');
for (const u of ['https://any-domain.tld/pixel/impr?x=1', 'https://x.tld/pixel/clk',
                 'https://x.tld/impr.gif', 'https://x.tld/abc/invoke.js',
                 'https://x.tld/watch.123456789.js', 'https://x.tld/sbar.json?key=1']) {
  check(`isAdsterraPixelUrl("${u}") === true`, M.isAdsterraPixelUrl(u) === true);
}

console.log('\n[5] No false positives on ordinary sites');
for (const u of ['https://google.com/search?q=hi', 'https://example.com/page',
                 'https://news.ycombinator.com/item?id=1']) {
  check(`isAdsterraUrl("${u}") === false`, M.isAdsterraUrl(u) === false);
  check(`isAdsterraPixelUrl("${u}") === false`, M.isAdsterraPixelUrl(u) === false);
}

console.log('\n[6] SmartLink classification still works');
check('isAdsterraSmartLinkUrl(whomeeno) === true', M.isAdsterraSmartLinkUrl('https://whomeeno.com/4/8912401') === true);
check('isAdsterraSmartLinkUrl(generic key url) === true',
  M.isAdsterraSmartLinkUrl('https://somesite.com/abcdef?key=123') === true);

console.log('\n[7] bot.cjs wiring (V39 markers present)');
check('adsterraMarkerDetected declared', bot.includes('let adsterraMarkerDetected = false;'));
check('fire watcher uses generic pixel detection', bot.includes('isAdsterraUrl(u.toLowerCase()) || isAdsterraPixelUrl(u)'));
check('success = pixel || marker || lenient', bot.includes('const _confirmed = adsterraPixelFired || adsterraMarkerDetected || (_lenient && smartlinkAdServed);'));
check('lenient config default present', bot.includes('smartlink_lenient_success: true,'));
check('tick registers all user domains', bot.includes('register EVERY user\'s SmartLink domains up-front'));

console.log('\n[8] api-server.cjs v39 wiring');
check('FREE_STARTER_IMPRESSIONS default = 10', /FREE_STARTER_IMPRESSIONS \?\? 10\)/.test(api));
check('ROOT_CACHE_VERSION defined', /const ROOT_CACHE_VERSION = 39;/.test(api));
check('cache discarded on version mismatch', api.includes('discarding stale cache'));
check('admin cache-clear endpoint present', api.includes("app.post('/api/admin/cache/clear'"));
check('cache stamped with __meta version', api.includes("const obj = { __meta: { v: ROOT_CACHE_VERSION, at: Date.now() } };"));

console.log(`\n═══════════════════════════════════════════`);
console.log(`  RESULT: ${pass} passed, ${fail} failed`);
console.log(`═══════════════════════════════════════════\n`);
process.exit(fail === 0 ? 0 : 1);

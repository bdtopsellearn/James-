/* Rename worker log wording: proxy -> COM booster (users never see "proxy"). */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const file = path.join(ROOT, 'bot-source/bot.cjs');
let src = fs.readFileSync(file, 'utf8');

const edits = [
  ['[ProxyVerify]', '[BoosterVerify]'],
  ['proxy=${_prox}', 'booster=${_prox}'],
  ['ProxyVerify: ${v.reason}', 'BoosterVerify: ${v.reason}'],
  ["'[WARN] Proxy setup failed:'", "'[WARN] Booster setup failed:'"],
  ['`direct (proxy ${v.reason})`', '`direct (booster ${v.reason})`'],
  // Sanitize the proxy label shown in the SL result line
  ["const _prox = br?.burst?.proxy || 'none';",
   "const _prox = String(br?.burst?.proxy || 'none').replace(/resi(dential)?/gi, 'BOOSTER').replace(/proxy/gi, 'booster');"],
];

let ok = 0, miss = [];
for (const [from, to] of edits) {
  if (!src.includes(from)) { miss.push(from.slice(0, 60)); continue; }
  const count = src.split(from).length - 1;
  src = src.split(from).join(to);
  ok += count;
  console.log(`\u2713 (${count}) ${from.slice(0, 50)}`);
}
fs.writeFileSync(file, src);
console.log(`\nApplied ${ok} replacements.`);
if (miss.length) { console.log('MISSED:'); miss.forEach((m) => console.log('  - ' + m)); }

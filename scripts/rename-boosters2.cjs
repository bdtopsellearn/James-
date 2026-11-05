/* Second rename batch: remaining visible proxy wording -> COM booster. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const edits = [
  ['src/views/ShopView.tsx', 'high-speed residential impression credits', 'high-speed COM-boosted impression credits'],
  ['src/views/SettingsView.tsx', 'proxy pool upgrades', 'COM booster upgrades'],
  ['src/views/AnalyticsView.tsx', 'and proxy performance.', 'and COM booster performance.'],
  ['src/components/rayobyte/AllowanceCard.tsx', 'distributed residential browser nodes', 'distributed COM booster nodes'],
  ['src/components/layout/TopBar.tsx', 'Proxy Pool 99.4%', 'COM Boosters 99.4%'],

  // Admin booster pool page (cosmetic labels)
  ['src/views/admin/AdminProxiesView.tsx', '<span>Add Proxy</span>', '<span>Add Booster</span>'],
  ['src/views/admin/AdminProxiesView.tsx', 'Proxy Label', 'Booster Label'],
  ['src/views/admin/AdminProxiesView.tsx', 'Add SOCKS5 / HTTP Proxy Node', 'Add SOCKS5 / HTTP Booster Node'],
  ['src/views/admin/AdminProxiesView.tsx', 'Proxy Identifier Name', 'Booster Name'],
  ['src/views/admin/AdminProxiesView.tsx', "Every proxy's exit country is auto-detected", "Every booster's exit country is auto-detected"],

  // Admin toasts
  ['src/App.tsx', "'Proxy Added'", "'Booster Added'"],
  ['src/App.tsx', "'Proxy Deleted'", "'Booster Deleted'"],
  ['src/App.tsx', "'Proxy Healthy'", "'Booster Healthy'"],
  ['src/App.tsx', "'Proxy Failed'", "'Booster Failed'"],
];

let ok = 0, miss = [];
for (const [file, from, to] of edits) {
  const p = path.join(ROOT, file);
  let src = fs.readFileSync(p, 'utf8');
  if (!src.includes(from)) { miss.push(`${file} :: ${from.slice(0, 60)}`); continue; }
  const count = src.split(from).length - 1;
  src = src.split(from).join(to);
  fs.writeFileSync(p, src);
  ok += count;
  console.log(`\u2713 ${file} (${count}) ${from.slice(0, 46)}`);
}
console.log(`\nApplied ${ok} replacements.`);
if (miss.length) { console.log('MISSED:'); miss.forEach((m) => console.log('  - ' + m)); }

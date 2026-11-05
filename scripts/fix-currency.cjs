/* Currency label cleanup: ৳ only for wallet balance/money, $ everywhere else. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const edits = [
  // ---- SmartLinksView: earnings/revenue -> $ ----
  ['src/views/SmartLinksView.tsx', '${totalRevenue.toFixed(2)} BDT', '${totalRevenue.toFixed(2)}'],
  ['src/views/SmartLinksView.tsx', 'Revenue (BDT)', 'Revenue (USD)'],

  // ---- ReferralView: earnings -> $ ----
  ['src/views/ReferralView.tsx', '${totalEarned.toFixed(2)} BDT', '${totalEarned.toFixed(2)}'],

  // ---- ShopView: balance keeps ৳, package price -> $ ----
  ['src/views/ShopView.tsx', '${wallet.balance.toFixed(2)} BDT', '৳{wallet.balance.toFixed(2)}'],
  ['src/views/ShopView.tsx', '${(appliedPromo ? selectedPkg.price * (1 - appliedPromo.discount / 100) : selectedPkg.price).toFixed(2)} BDT', '${(appliedPromo ? selectedPkg.price * (1 - appliedPromo.discount / 100) : selectedPkg.price).toFixed(2)}'],

  // ---- AdminUsersView: wallet balance keeps ৳ ----
  ['src/views/admin/AdminUsersView.tsx', 'Wallet funds (BDT) — current balance <span className="font-mono text-emerald-500">${Number((selectedUser as any).balance || 0).toFixed(2)}</span>', 'Wallet funds (৳) — current balance <span className="font-mono text-emerald-500">৳{Number((selectedUser as any).balance || 0).toFixed(2)}</span>'],

  // ---- AdminAdsterraView: revenue -> $ ----
  ['src/views/admin/AdminAdsterraView.tsx', 'revenue (BDT)', 'revenue ($)'],

  // ---- AdminGrowthView: payout rates -> USD ----
  ['src/views/admin/AdminGrowthView.tsx', "'BDT credited per 1,000 smartlink impressions'", "'USD credited per 1,000 smartlink impressions'"],
  ['src/views/admin/AdminGrowthView.tsx', "'BDT credited per 1,000 normal-link impressions'", "'USD credited per 1,000 normal-link impressions'"],

  // ---- AdminUserDetailsView: wallet adjustment keeps ৳ ----
  ['src/views/admin/AdminUserDetailsView.tsx', 'Amount (BDT)', 'Amount (৳)'],

  // ---- AdminCmsView: price -> $ ----
  ['src/views/admin/AdminCmsView.tsx', 'Price ($ BDT)', 'Price ($)'],

  // ---- InvoiceModal: BDT column keeps ৳, footer total -> USD ----
  ['src/components/ui/InvoiceModal.tsx', '                    ${invoice.amountBDT.toFixed(2)}\n', '                    ৳{invoice.amountBDT.toFixed(2)}\n'],
  ['src/components/ui/InvoiceModal.tsx', '${invoice.amountBDT.toFixed(2)} BDT', '${invoice.amountUSD.toFixed(2)}'],
];

let ok = 0, miss = [];
for (const [file, from, to] of edits) {
  const p = path.join(ROOT, file);
  let src = fs.readFileSync(p, 'utf8');
  if (!src.includes(from)) { miss.push(`${file} :: ${from.slice(0, 50)}`); continue; }
  const count = src.split(from).length - 1;
  src = src.split(from).join(to);
  fs.writeFileSync(p, src);
  ok += count;
  console.log(`✓ ${file}  (${count})  ${from.slice(0, 42)}`);
}
console.log(`\nApplied ${ok} replacements.`);
if (miss.length) { console.log('MISSED:'); miss.forEach((m) => console.log('  - ' + m)); }

/* Rename proxy/residential wording -> "COM booster" in all display text. */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

const edits = [
  // Splash
  ['src/components/brand/SplashScreen.tsx', 'Warming up residential proxies', 'Warming up COM boosters'],
  ['src/components/brand/SplashScreen.tsx', 'your residential SmartLink traffic dashboard.', 'your COM-boosted SmartLink traffic dashboard.'],
  ['src/components/brand/SplashScreen.tsx', "'Residential Proxies'", "'COM Boosters'"],

  // Login hero
  ['src/views/auth/UserLoginView.tsx', 'Residential traffic that', 'COM-boosted traffic that'],
  ['src/views/auth/UserLoginView.tsx', 'US-grade residential proxies, a 5-phase human-behaviour engine and Adsterra-safe dwell', 'US-grade COM boosters, a 5-phase human-behaviour engine and Adsterra-safe dwell'],
  ['src/views/auth/UserLoginView.tsx', "'Residential geo'", "'COM-boosted geo'"],

  // History
  ['src/views/HistoryView.tsx', "'ProxyRegion'", "'COM Booster'"],
  ['src/views/HistoryView.tsx', 'and residential node exit regions.', 'and COM booster regions.'],
  ['src/views/HistoryView.tsx', '<strong>Node Exit Region:</strong>', '<strong>COM Booster Region:</strong>'],
  ['src/views/HistoryView.tsx', '<strong>Proxy Server:</strong>', '<strong>COM Booster:</strong>'],

  // Traffic control
  ['src/views/TrafficControlView.tsx', 'US Residential SOCKS5', 'US COM Booster'],

  // Membership
  ['src/views/MembershipView.tsx', 'priority residential browser concurrency', 'priority COM booster concurrency'],

  // Support
  ['src/views/SupportView.tsx', 'our residential network engineers', 'our COM booster network engineers'],
  ['src/views/SupportView.tsx', 'placement IDs, proxy IPs, or screenshots', 'placement IDs, booster IDs, or screenshots'],

  // Live monitor + dashboard
  ['src/views/LiveMonitorView.tsx', 'Delivered in ${imp.proxyCountry}', 'COM-boosted in ${imp.proxyCountry}'],
  ['src/views/DashboardOverview.tsx', 'Delivered in ${impression.proxyCountry}', 'COM-boosted in ${impression.proxyCountry}'],

  // Admin views
  ['src/views/admin/AdminBroadcastView.tsx', 'New US-Residential Proxy Pool Added (140ms Latency)', 'New US COM Booster Pool Added (140ms Latency)'],
  ['src/views/admin/AdminOverviewView.tsx', 'proxy uptime', 'booster uptime'],
  ['src/views/admin/AdminOverviewView.tsx', 'SOCKS5 Proxy Pool', 'COM Booster Pool'],
  ['src/views/admin/AdminSecurityView.tsx', 'Residential Proxy Exit Verification', 'COM Booster Exit Verification'],
  ['src/views/admin/AdminTargetingView.tsx', 'Match geo to proxy country', 'Match geo to COM booster country'],
  ['src/views/admin/AdminTargetingView.tsx', "Impressions land in the proxy\u2019s exit country", "Impressions land in the COM booster\u2019s exit country"],
  ['src/views/admin/AdminTargetingView.tsx', '{proxyCountries.size} proxy {proxyCountries.size === 1 ? \'country\' : \'countries\'}', '{proxyCountries.size} COM booster {proxyCountries.size === 1 ? \'country\' : \'countries\'}'],
  ['src/views/admin/AdminProxiesView.tsx', 'SOCKS5 & HTTP Residential Proxy Pool', 'COM Booster Pool'],
  ['src/views/admin/AdminProxiesView.tsx', 'Dynamic node rotation, automated failover cooldowns, exit IP country verification, and MB quota meters.', 'Dynamic booster rotation, automated failover cooldowns, exit-country verification, and MB quota meters.'],
  ['src/views/admin/AdminAuditView.tsx', 'proxy actions', 'booster actions'],
  ['src/views/admin/AdminRolesView.tsx', 'Read engine parameters and proxy pools', 'Read engine parameters and booster pools'],
  ['src/views/admin/AdminRolesView.tsx', 'Adjust dwell times, concurrency, and proxy configuration', 'Adjust dwell times, concurrency, and booster configuration'],
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

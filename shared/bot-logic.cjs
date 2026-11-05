/**
 * ⚡ PN AD NETWORK ⚡ — Shared Business Logic
 *
 * Pure logic extracted from bot.js so BOTH the Telegram bot AND the web
 * API server use IDENTICAL rules. No Telegram. No Playwright. No globals.
 *
 * Every state-aware function takes its state as ARGUMENTS, never touches a
 * module-level cache. The caller (bot.js / api-server.js) is responsible for
 * supplying state (from its own cache, or freshly read from Firestore).
 *
 * ─── Exports ──────────────────────────────────────────────────────────
 *  Constants         MODE_*, ADSTERRA_*, DEFAULT_*, *_ORDER
 *  Predicates        isValidUrl, isAdsterraUrl, isAdsterraSmartLinkUrl,
 *                    isSocks5Proxy, isResidentialProxy, isPrivateIp
 *  Utilities         normalizeUrlKey, todayStr, getHourKey, hashTxn,
 *                    escapeHtml, getModeDisplayName
 *  Adsterra          extractAdsterraSmartlinks, fetchAdsterraSmartlinks,
 *                    fetchPublisherReport
 *  Proxy             parseProxyInput, toPlaywrightProxy, shortProxyLabel
 *  Decisions         getActiveMode, canRunImpression, proxyReadyForTraffic
 * ─────────────────────────────────────────────────────────────────────
 */

'use strict';

const crypto = require('crypto');
const net = require('net');
const dns = require('dns').promises;

// ═══════════════════════════════════════════════════════════════════════
//  MODE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════
const MODE_H4CK_ORGANIC = 'h4ck_organic';
const MODE_HYBRID_SMART = 'hybrid_smart';
const MODE_PURE_SEARCH  = 'pure_search';
const MODE_PURE_DIRECT  = 'pure_direct';

// ═══════════════════════════════════════════════════════════════════════
//  ADSTERRA WHITELIST
// ═══════════════════════════════════════════════════════════════════════
const ADSTERRA_WHITELIST = [
  'recallscarce.com',
  'adsterra.com', 'adsterra.io', 'adsterranetwork.com', 'adsterra.network', 'adsterra.org',
  'highperformanceformat.com', 'profitableratecpm.com', 'pemsrv.com', 'adsterratools.com',
  'adsterra.pro', 'adsterra.biz', 'adsterra.info', 'adsterra.xyz', 'adsterra.site',
  'adsterra.online', 'adsterra.tech', 'adsterra.live', 'adsterra.net', 'adsterra.co', 'adsterra.top',
  'adsterra-cdn.com', 'adsterra-static.com', 'adsterra-media.com',
  'pixel.adsterra.com', 'cdn.adsterra.com', 'track.adsterra.com', 'stats.adsterra.com',
  'ads.adsterra.com', 'api.adsterra.com', 'api3.adsterratools.com', 'api.adsterratools.com',
  'bidvertiser.com', 'popcash.net', 'propellerads.com', 'propellerads.net',
  'onclickalgo.com', 'onclickmega.com', 'onclckpro.com', 'onclickmax.com',
  'adcash.com', 'clickadu.com', 'hilltopads.net', 'hilltopads.com', 'trafficstars.com',
  'exoclick.com', 'exosrv.com', 'juicyads.com', 'plugrush.com', 'trafficjunky.com',
];

const ADSTERRA_API_BASE = 'https://api3.adsterratools.com/publisher';
const ADSTERRA_SMARTLINKS_ENDPOINT = ADSTERRA_API_BASE + '/smartlinks.json';
const ADSTERRA_STATS_ENDPOINT = ADSTERRA_API_BASE + '/stats.json';
const ADSTERRA_REQUEST_TIMEOUT_MS = 30000;

// ═══════════════════════════════════════════════════════════════════════
//  DEFAULTS  (identical to bot.js so behaviour matches 1:1)
// ═══════════════════════════════════════════════════════════════════════
const FREE_LINK_LIMIT = 2;
const FREE_VISITS_PER_LINK = 1;
const FREE_VISIT_WINDOW_MS = 60000;
const REFERRAL_BONUS = 20;

const PLAN_ORDER = ['monthly', 'twomonth', 'threemonth'];
const DEFAULT_PLANS = {
  monthly:    { label: '1 Month',  days: 30, price: 199, link_limit: 5,  visits_per_link: 5,  burst_window_ms: 5000, daily_burst_limit: 100, bonus_credits: 200,  enabled: true },
  twomonth:   { label: '2 Months', days: 60, price: 349, link_limit: 12, visits_per_link: 8,  burst_window_ms: 5000, daily_burst_limit: 300, bonus_credits: 500,  enabled: true },
  threemonth: { label: '3 Months', days: 90, price: 499, link_limit: 20, visits_per_link: 12, burst_window_ms: 5000, daily_burst_limit: 600, bonus_credits: 1000, enabled: true },
};

const DEFAULT_SHOP_PACKAGES = {
  p1: { amount: 100,   price: 10,   bonus: 0 },
  p2: { amount: 500,   price: 45,   bonus: 50 },
  p3: { amount: 1000,  price: 80,   bonus: 100 },
  p4: { amount: 5000,  price: 350,  bonus: 500 },
  p5: { amount: 10000, price: 650,  bonus: 1000 },
  p6: { amount: 50000, price: 2800, bonus: 5000 },
};
const SHOP_PACKAGE_ORDER = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

const DEFAULT_PAYMENT_METHODS = [
  { id: 'bkash',      name: 'bKash',      number: 'Not set', enabled: true, instructions: 'Send Money' },
  { id: 'nagad',      name: 'Nagad',      number: 'Not set', enabled: true, instructions: 'Send Money' },
  { id: 'rocket',     name: 'Rocket',     number: 'Not set', enabled: true, instructions: 'Send Money' },
  { id: 'binance',    name: 'Binance',    number: 'Not set', enabled: true, instructions: 'Pay ID' },
  { id: 'usdt_trc20', name: 'USDT TRC20', number: 'Not set', enabled: true, instructions: 'TRC20 Network' },
];

const SMARTLINK_DEFAULTS = {
  enabled: true, parallel_visits: 1, batch_interval_ms: 30000,
  min_run_time_ms: 15000, max_run_time_ms: 30000, max_concurrent_browsers: 2,
  min_interval_ms: 60000, max_interval_ms: 120000, per_link_daily_cap: 15,
  warmup_enabled: true, cookie_persistence: true, session_reuse_ms: 1800000,
  backoff_on_fail: true, residential_only: true, randomize_visit_order: true,
};

const AUTO_IMPRESSION_DEFAULTS = {
  h4ck_organic_mode: true,
  hybrid_smart_mode: false,
  pure_search_mode: false,
  pure_direct_mode: false,

  h4ck_referrer_chain: ['google', 'bing', 'ddg', 'yahoo'],
  h4ck_enable_multi_referrer: false,
  h4ck_multi_referrer_chance: 0.15,
  h4ck_enable_full_funnel: true,
  h4ck_enable_click: true,
  h4ck_enable_return_visit: true,
  h4ck_enable_competitor_visit: true,
  h4ck_enable_cookie_injection: true,
  h4ck_enable_zoom_simulation: false,
  h4ck_enable_keyboard_nav: true,
  h4ck_enable_video_pause: false,

  h4ck_funnel_depth_min: 2,
  h4ck_funnel_depth_max: 4,
  h4ck_click_probability: 0.015,
  h4ck_max_clicks_per_session: 1,
  h4ck_min_click_delay_ms: 30000,
  h4ck_return_visit_chance: 0.05,
  h4ck_competitor_visit_chance: 0.08,
  h4ck_search_timeout_ms: 8000,

  h4ck_smartlink_dwell_min_ms: 30000,
  h4ck_smartlink_dwell_max_ms: 45000,
  h4ck_dwell_min_ms: 30000,
  h4ck_dwell_max_ms: 45000,
  h4ck_reading_pause_chance: 0.30,
  h4ck_zoom_probability: 0.15,
  h4ck_keyboard_nav_chance: 0.20,
  h4ck_video_pause_chance: 0.10,

  h4ck_smart_data_saver: true,
  h4ck_saver_block_images: false,
  h4ck_saver_block_media: true,
  h4ck_saver_block_fonts: true,
  h4ck_saver_block_analytics: false,
  h4ck_saver_block_other_ads: false,
  h4ck_saver_block_css: false,
  h4ck_saver_block_websockets: true,
  h4ck_saver_block_beacons: false,
  h4ck_saver_image_size_limit_kb: 0,
  h4ck_saver_whitelist_adsterra: true,
  h4ck_saver_min_dom_only: false,
  h4ck_saver_smart_route: true,
  h4ck_saver_cache_response: true,

  smartlink_enabled: true, normal_enabled: true,
  hourly_limit_smartlink: 75, hourly_limit_normal: 90,
  daily_limit_smartlink: 1500, daily_limit_normal: 1800,
  min_interval_ms: 30000, max_interval_ms: 60000,
  parallel_workers: 1, human_behavior: true,
  proxy_required: true, residential_only: true,
  backoff_on_fail: true, max_consecutive_fails: 5, backoff_duration_ms: 300000,
  warmup_enabled: true, warmup_visits: 5,
  min_run_time_ms: 45000, max_run_time_ms: 90000,
  smart_warmup: true, auto_retry: true, max_retries: 2,
  burst_visits_per_link: 3, burst_window_ms: 15000,
  worker_tick_ms: 30000,
  organic_mode: true, require_us: false,
  data_saver_mode: true, data_saver_images: true, data_saver_media: true,
  data_saver_fonts: true, data_saver_analytics: true, data_saver_other_ads: true,
  adsterra_safe_mode: true,
  high_cpm_mode: true, safari_ratio: 0.60, us_only_strict: false,
  min_ad_dwell_ms: 30000, min_normal_dwell_ms: 30000,
  max_ad_dwell_ms: 45000, max_normal_dwell_ms: 45000,
  ad_hover_count: 3, viewport_pause_ms: 18000, multi_page_probability: 0.35,
};

const PROXY_DEFAULTS = {
  enabled: true,
  rotation: 'random',
  fallback_direct: true,
  max_retries: 3,
  health_check_url: 'https://api.ipify.org?format=json',
  connection_timeout_ms: 25000,
  cooldown_ms: 20000,
  max_fails: 3,
  low_quota_alert_percent: 10,
  force_us_only: false,
  auto_health_check: true,
  health_check_interval_ms: 300000,
  verify_exit_ip: true,
  require_residential: true,
  bridge_enabled: true,
};

// ══════════════════════════════════════════════════════════════════════════════
//  ⭐ V36 GLOBAL TARGETING ENGINE (mirrors bot-source/bot.cjs)
//  Country / Device / Browser / OS pick-rate weights + on/off toggles.
// ══════════════════════════════════════════════════════════════════════════════
const COUNTRY_GEO = {
  AF: { name: 'Afghanistan', flag: '🇦🇫' },
  AL: { name: 'Albania', flag: '🇦🇱' },
  DZ: { name: 'Algeria', flag: '🇩🇿' },
  AS: { name: 'American Samoa', flag: '🇦🇸' },
  AD: { name: 'Andorra', flag: '🇦🇩' },
  AO: { name: 'Angola', flag: '🇦🇴' },
  AI: { name: 'Anguilla', flag: '🇦🇮' },
  AQ: { name: 'Antarctica', flag: '🇦🇶' },
  AG: { name: 'Antigua and Barbuda', flag: '🇦🇬' },
  AR: { name: 'Argentina', flag: '🇦🇷' },
  AM: { name: 'Armenia', flag: '🇦🇲' },
  AW: { name: 'Aruba', flag: '🇦🇼' },
  AU: { name: 'Australia', flag: '🇦🇺' },
  AT: { name: 'Austria', flag: '🇦🇹' },
  AZ: { name: 'Azerbaijan', flag: '🇦🇿' },
  BS: { name: 'Bahamas', flag: '🇧🇸' },
  BH: { name: 'Bahrain', flag: '🇧🇭' },
  BD: { name: 'Bangladesh', flag: '🇧🇩' },
  BB: { name: 'Barbados', flag: '🇧🇧' },
  BY: { name: 'Belarus', flag: '🇧🇾' },
  BE: { name: 'Belgium', flag: '🇧🇪' },
  BZ: { name: 'Belize', flag: '🇧🇿' },
  BJ: { name: 'Benin', flag: '🇧🇯' },
  BM: { name: 'Bermuda', flag: '🇧🇲' },
  BT: { name: 'Bhutan', flag: '🇧🇹' },
  BO: { name: 'Bolivia', flag: '🇧🇴' },
  BA: { name: 'Bosnia and Herzegovina', flag: '🇧🇦' },
  BW: { name: 'Botswana', flag: '🇧🇼' },
  BV: { name: 'Bouvet Island', flag: '🇧🇻' },
  BR: { name: 'Brazil', flag: '🇧🇷' },
  IO: { name: 'British Indian Ocean Territory', flag: '🇮🇴' },
  VG: { name: 'British Virgin Islands', flag: '🇻🇬' },
  BN: { name: 'Brunei', flag: '🇧🇳' },
  BG: { name: 'Bulgaria', flag: '🇧🇬' },
  BF: { name: 'Burkina Faso', flag: '🇧🇫' },
  BI: { name: 'Burundi', flag: '🇧🇮' },
  KH: { name: 'Cambodia', flag: '🇰🇭' },
  CM: { name: 'Cameroon', flag: '🇨🇲' },
  CA: { name: 'Canada', flag: '🇨🇦' },
  CV: { name: 'Cape Verde', flag: '🇨🇻' },
  BQ: { name: 'Caribbean Netherlands', flag: '🇧🇶' },
  KY: { name: 'Cayman Islands', flag: '🇰🇾' },
  CF: { name: 'Central African Republic', flag: '🇨🇫' },
  TD: { name: 'Chad', flag: '🇹🇩' },
  CL: { name: 'Chile', flag: '🇨🇱' },
  CN: { name: 'China', flag: '🇨🇳' },
  CX: { name: 'Christmas Island', flag: '🇨🇽' },
  CC: { name: 'Cocos (Keeling) Islands', flag: '🇨🇨' },
  CO: { name: 'Colombia', flag: '🇨🇴' },
  KM: { name: 'Comoros', flag: '🇰🇲' },
  CG: { name: 'Congo', flag: '🇨🇬' },
  CK: { name: 'Cook Islands', flag: '🇨🇰' },
  CR: { name: 'Costa Rica', flag: '🇨🇷' },
  HR: { name: 'Croatia', flag: '🇭🇷' },
  CU: { name: 'Cuba', flag: '🇨🇺' },
  CW: { name: 'Curaçao', flag: '🇨🇼' },
  CY: { name: 'Cyprus', flag: '🇨🇾' },
  CZ: { name: 'Czechia', flag: '🇨🇿' },
  CD: { name: 'DR Congo', flag: '🇨🇩' },
  DK: { name: 'Denmark', flag: '🇩🇰' },
  DJ: { name: 'Djibouti', flag: '🇩🇯' },
  DM: { name: 'Dominica', flag: '🇩🇲' },
  DO: { name: 'Dominican Republic', flag: '🇩🇴' },
  EC: { name: 'Ecuador', flag: '🇪🇨' },
  EG: { name: 'Egypt', flag: '🇪🇬' },
  SV: { name: 'El Salvador', flag: '🇸🇻' },
  GQ: { name: 'Equatorial Guinea', flag: '🇬🇶' },
  ER: { name: 'Eritrea', flag: '🇪🇷' },
  EE: { name: 'Estonia', flag: '🇪🇪' },
  SZ: { name: 'Eswatini', flag: '🇸🇿' },
  ET: { name: 'Ethiopia', flag: '🇪🇹' },
  FK: { name: 'Falkland Islands', flag: '🇫🇰' },
  FO: { name: 'Faroe Islands', flag: '🇫🇴' },
  FJ: { name: 'Fiji', flag: '🇫🇯' },
  FI: { name: 'Finland', flag: '🇫🇮' },
  FR: { name: 'France', flag: '🇫🇷' },
  GF: { name: 'French Guiana', flag: '🇬🇫' },
  PF: { name: 'French Polynesia', flag: '🇵🇫' },
  TF: { name: 'French Southern and Antarctic Lands', flag: '🇹🇫' },
  GA: { name: 'Gabon', flag: '🇬🇦' },
  GM: { name: 'Gambia', flag: '🇬🇲' },
  GE: { name: 'Georgia', flag: '🇬🇪' },
  DE: { name: 'Germany', flag: '🇩🇪' },
  GH: { name: 'Ghana', flag: '🇬🇭' },
  GI: { name: 'Gibraltar', flag: '🇬🇮' },
  GR: { name: 'Greece', flag: '🇬🇷' },
  GL: { name: 'Greenland', flag: '🇬🇱' },
  GD: { name: 'Grenada', flag: '🇬🇩' },
  GP: { name: 'Guadeloupe', flag: '🇬🇵' },
  GU: { name: 'Guam', flag: '🇬🇺' },
  GT: { name: 'Guatemala', flag: '🇬🇹' },
  GG: { name: 'Guernsey', flag: '🇬🇬' },
  GN: { name: 'Guinea', flag: '🇬🇳' },
  GW: { name: 'Guinea-Bissau', flag: '🇬🇼' },
  GY: { name: 'Guyana', flag: '🇬🇾' },
  HT: { name: 'Haiti', flag: '🇭🇹' },
  HM: { name: 'Heard Island and McDonald Islands', flag: '🇭🇲' },
  HN: { name: 'Honduras', flag: '🇭🇳' },
  HK: { name: 'Hong Kong', flag: '🇭🇰' },
  HU: { name: 'Hungary', flag: '🇭🇺' },
  IS: { name: 'Iceland', flag: '🇮🇸' },
  IN: { name: 'India', flag: '🇮🇳' },
  ID: { name: 'Indonesia', flag: '🇮🇩' },
  IR: { name: 'Iran', flag: '🇮🇷' },
  IQ: { name: 'Iraq', flag: '🇮🇶' },
  IE: { name: 'Ireland', flag: '🇮🇪' },
  IM: { name: 'Isle of Man', flag: '🇮🇲' },
  IL: { name: 'Israel', flag: '🇮🇱' },
  IT: { name: 'Italy', flag: '🇮🇹' },
  CI: { name: 'Ivory Coast', flag: '🇨🇮' },
  JM: { name: 'Jamaica', flag: '🇯🇲' },
  JP: { name: 'Japan', flag: '🇯🇵' },
  JE: { name: 'Jersey', flag: '🇯🇪' },
  JO: { name: 'Jordan', flag: '🇯🇴' },
  KZ: { name: 'Kazakhstan', flag: '🇰🇿' },
  KE: { name: 'Kenya', flag: '🇰🇪' },
  KI: { name: 'Kiribati', flag: '🇰🇮' },
  XK: { name: 'Kosovo', flag: '🇽🇰' },
  KW: { name: 'Kuwait', flag: '🇰🇼' },
  KG: { name: 'Kyrgyzstan', flag: '🇰🇬' },
  LA: { name: 'Laos', flag: '🇱🇦' },
  LV: { name: 'Latvia', flag: '🇱🇻' },
  LB: { name: 'Lebanon', flag: '🇱🇧' },
  LS: { name: 'Lesotho', flag: '🇱🇸' },
  LR: { name: 'Liberia', flag: '🇱🇷' },
  LY: { name: 'Libya', flag: '🇱🇾' },
  LI: { name: 'Liechtenstein', flag: '🇱🇮' },
  LT: { name: 'Lithuania', flag: '🇱🇹' },
  LU: { name: 'Luxembourg', flag: '🇱🇺' },
  MO: { name: 'Macau', flag: '🇲🇴' },
  MG: { name: 'Madagascar', flag: '🇲🇬' },
  MW: { name: 'Malawi', flag: '🇲🇼' },
  MY: { name: 'Malaysia', flag: '🇲🇾' },
  MV: { name: 'Maldives', flag: '🇲🇻' },
  ML: { name: 'Mali', flag: '🇲🇱' },
  MT: { name: 'Malta', flag: '🇲🇹' },
  MH: { name: 'Marshall Islands', flag: '🇲🇭' },
  MQ: { name: 'Martinique', flag: '🇲🇶' },
  MR: { name: 'Mauritania', flag: '🇲🇷' },
  MU: { name: 'Mauritius', flag: '🇲🇺' },
  YT: { name: 'Mayotte', flag: '🇾🇹' },
  MX: { name: 'Mexico', flag: '🇲🇽' },
  FM: { name: 'Micronesia', flag: '🇫🇲' },
  MD: { name: 'Moldova', flag: '🇲🇩' },
  MC: { name: 'Monaco', flag: '🇲🇨' },
  MN: { name: 'Mongolia', flag: '🇲🇳' },
  ME: { name: 'Montenegro', flag: '🇲🇪' },
  MS: { name: 'Montserrat', flag: '🇲🇸' },
  MA: { name: 'Morocco', flag: '🇲🇦' },
  MZ: { name: 'Mozambique', flag: '🇲🇿' },
  MM: { name: 'Myanmar', flag: '🇲🇲' },
  NA: { name: 'Namibia', flag: '🇳🇦' },
  NR: { name: 'Nauru', flag: '🇳🇷' },
  NP: { name: 'Nepal', flag: '🇳🇵' },
  NL: { name: 'Netherlands', flag: '🇳🇱' },
  NC: { name: 'New Caledonia', flag: '🇳🇨' },
  NZ: { name: 'New Zealand', flag: '🇳🇿' },
  NI: { name: 'Nicaragua', flag: '🇳🇮' },
  NE: { name: 'Niger', flag: '🇳🇪' },
  NG: { name: 'Nigeria', flag: '🇳🇬' },
  NU: { name: 'Niue', flag: '🇳🇺' },
  NF: { name: 'Norfolk Island', flag: '🇳🇫' },
  KP: { name: 'North Korea', flag: '🇰🇵' },
  MK: { name: 'North Macedonia', flag: '🇲🇰' },
  MP: { name: 'Northern Mariana Islands', flag: '🇲🇵' },
  NO: { name: 'Norway', flag: '🇳🇴' },
  OM: { name: 'Oman', flag: '🇴🇲' },
  PK: { name: 'Pakistan', flag: '🇵🇰' },
  PW: { name: 'Palau', flag: '🇵🇼' },
  PS: { name: 'Palestine', flag: '🇵🇸' },
  PA: { name: 'Panama', flag: '🇵🇦' },
  PG: { name: 'Papua New Guinea', flag: '🇵🇬' },
  PY: { name: 'Paraguay', flag: '🇵🇾' },
  PE: { name: 'Peru', flag: '🇵🇪' },
  PH: { name: 'Philippines', flag: '🇵🇭' },
  PN: { name: 'Pitcairn Islands', flag: '🇵🇳' },
  PL: { name: 'Poland', flag: '🇵🇱' },
  PT: { name: 'Portugal', flag: '🇵🇹' },
  PR: { name: 'Puerto Rico', flag: '🇵🇷' },
  QA: { name: 'Qatar', flag: '🇶🇦' },
  RO: { name: 'Romania', flag: '🇷🇴' },
  RU: { name: 'Russia', flag: '🇷🇺' },
  RW: { name: 'Rwanda', flag: '🇷🇼' },
  RE: { name: 'Réunion', flag: '🇷🇪' },
  BL: { name: 'Saint Barthélemy', flag: '🇧🇱' },
  SH: { name: 'Saint Helena, Ascension and Tristan da Cunha', flag: '🇸🇭' },
  KN: { name: 'Saint Kitts and Nevis', flag: '🇰🇳' },
  LC: { name: 'Saint Lucia', flag: '🇱🇨' },
  MF: { name: 'Saint Martin', flag: '🇲🇫' },
  PM: { name: 'Saint Pierre and Miquelon', flag: '🇵🇲' },
  VC: { name: 'Saint Vincent and the Grenadines', flag: '🇻🇨' },
  WS: { name: 'Samoa', flag: '🇼🇸' },
  SM: { name: 'San Marino', flag: '🇸🇲' },
  SA: { name: 'Saudi Arabia', flag: '🇸🇦' },
  SN: { name: 'Senegal', flag: '🇸🇳' },
  RS: { name: 'Serbia', flag: '🇷🇸' },
  SC: { name: 'Seychelles', flag: '🇸🇨' },
  SL: { name: 'Sierra Leone', flag: '🇸🇱' },
  SG: { name: 'Singapore', flag: '🇸🇬' },
  SX: { name: 'Sint Maarten', flag: '🇸🇽' },
  SK: { name: 'Slovakia', flag: '🇸🇰' },
  SI: { name: 'Slovenia', flag: '🇸🇮' },
  SB: { name: 'Solomon Islands', flag: '🇸🇧' },
  SO: { name: 'Somalia', flag: '🇸🇴' },
  ZA: { name: 'South Africa', flag: '🇿🇦' },
  GS: { name: 'South Georgia', flag: '🇬🇸' },
  KR: { name: 'South Korea', flag: '🇰🇷' },
  SS: { name: 'South Sudan', flag: '🇸🇸' },
  ES: { name: 'Spain', flag: '🇪🇸' },
  LK: { name: 'Sri Lanka', flag: '🇱🇰' },
  SD: { name: 'Sudan', flag: '🇸🇩' },
  SR: { name: 'Suriname', flag: '🇸🇷' },
  SJ: { name: 'Svalbard and Jan Mayen', flag: '🇸🇯' },
  SE: { name: 'Sweden', flag: '🇸🇪' },
  CH: { name: 'Switzerland', flag: '🇨🇭' },
  SY: { name: 'Syria', flag: '🇸🇾' },
  ST: { name: 'São Tomé and Príncipe', flag: '🇸🇹' },
  TW: { name: 'Taiwan', flag: '🇹🇼' },
  TJ: { name: 'Tajikistan', flag: '🇹🇯' },
  TZ: { name: 'Tanzania', flag: '🇹🇿' },
  TH: { name: 'Thailand', flag: '🇹🇭' },
  TL: { name: 'Timor-Leste', flag: '🇹🇱' },
  TG: { name: 'Togo', flag: '🇹🇬' },
  TK: { name: 'Tokelau', flag: '🇹🇰' },
  TO: { name: 'Tonga', flag: '🇹🇴' },
  TT: { name: 'Trinidad and Tobago', flag: '🇹🇹' },
  TN: { name: 'Tunisia', flag: '🇹🇳' },
  TM: { name: 'Turkmenistan', flag: '🇹🇲' },
  TC: { name: 'Turks and Caicos Islands', flag: '🇹🇨' },
  TV: { name: 'Tuvalu', flag: '🇹🇻' },
  TR: { name: 'Türkiye', flag: '🇹🇷' },
  UG: { name: 'Uganda', flag: '🇺🇬' },
  UA: { name: 'Ukraine', flag: '🇺🇦' },
  AE: { name: 'United Arab Emirates', flag: '🇦🇪' },
  GB: { name: 'United Kingdom', flag: '🇬🇧' },
  US: { name: 'United States', flag: '🇺🇸' },
  UM: { name: 'United States Minor Outlying Islands', flag: '🇺🇲' },
  VI: { name: 'United States Virgin Islands', flag: '🇻🇮' },
  UY: { name: 'Uruguay', flag: '🇺🇾' },
  UZ: { name: 'Uzbekistan', flag: '🇺🇿' },
  VU: { name: 'Vanuatu', flag: '🇻🇺' },
  VA: { name: 'Vatican City', flag: '🇻🇦' },
  VE: { name: 'Venezuela', flag: '🇻🇪' },
  VN: { name: 'Vietnam', flag: '🇻🇳' },
  WF: { name: 'Wallis and Futuna', flag: '🇼🇫' },
  EH: { name: 'Western Sahara', flag: '🇪🇭' },
  YE: { name: 'Yemen', flag: '🇾🇪' },
  ZM: { name: 'Zambia', flag: '🇿🇲' },
  ZW: { name: 'Zimbabwe', flag: '🇿🇼' },
  AX: { name: 'Åland Islands', flag: '🇦🇽' },
};

const HIGH_CPM_COUNTRIES = ['US', 'GB', 'CA', 'AU', 'DE', 'CH', 'NO', 'SE', 'DK', 'NL', 'IE', 'NZ', 'SG', 'AE', 'IL', 'FI', 'AT', 'BE'];

const TARGETING_DIMENSIONS = {
  device: [
    { key: 'mobile',  label: 'Mobile' },
    { key: 'desktop', label: 'Desktop' },
    { key: 'tablet',  label: 'Tablet' },
  ],
  browser: [
    { key: 'chrome_mobile', label: 'Chrome Mobile' },
    { key: 'chrome',        label: 'Chrome' },
    { key: 'safari',        label: 'Safari' },
    { key: 'mobile_safari', label: 'Mobile Safari' },
    { key: 'yandex',        label: 'Yandex.Browser for Windows' },
    { key: 'edge',          label: 'Edge (Chromium) for Windows' },
    { key: 'firefox',       label: 'Firefox' },
  ],
  os: [
    { key: 'android', label: 'Android' },
    { key: 'windows', label: 'Windows' },
    { key: 'macos',   label: 'Mac OS X' },
    { key: 'ios',     label: 'iOS' },
    { key: 'ipados',  label: 'iPadOS' },
  ],
};

const TARGETING_DEFAULTS = {
  enabled: true,
  dwell_min_ms: 30000,             // ⭐ 30–45s successful visit target
  dwell_max_ms: 45000,
  proxy_country_match: true,       // geo follows the proxy's exit country
  cpm_optimize: true,              // bias toward high-CPM combos
  cpm_target_min: 3.0,
  cpm_target_max: 4.0,
  smart_data_saver: true,
  human_level: 'ultra',
  country_weights: { US: 12, GB: 7, CA: 6, AU: 5, DE: 3, IN: 1, BD: 1, PK: 1 },
  country_enabled: { US: true, GB: true, CA: true, AU: true, DE: true, IN: true, BD: true, PK: true },
  device_weights: { mobile: 30, desktop: 50, tablet: 20 },
  device_enabled: { mobile: true, desktop: true, tablet: true },
  browser_weights: { chrome_mobile: 12, chrome: 22, safari: 18, mobile_safari: 28, yandex: 3, edge: 10, firefox: 7 },
  browser_enabled: { chrome_mobile: true, chrome: true, safari: true, mobile_safari: true, yandex: true, edge: true, firefox: true },
  os_weights: { android: 14, windows: 28, macos: 16, ios: 32, ipados: 10 },
  os_enabled: { android: true, windows: true, macos: true, ios: true, ipados: true },
};

const MAINTENANCE_DEFAULTS = {
  enabled: false,
  message: '🛠️ <b>UNDER MAINTENANCE</b>\n\n⚙️ We are upgrading the service.\n⏳ Please try again in a little while.',
  whitelist: [],
};

// ═══════════════════════════════════════════════════════════════════════
//  PURE PREDICATES
// ═══════════════════════════════════════════════════════════════════════
function isValidUrl(v) {
  try {
    const u = new URL(String(v).trim());
    if (!['http:', 'https:'].includes(u.protocol)) return false;
    if (!u.hostname) return false;
    if (u.username || u.password) return false;
    return true;
  } catch (_) { return false; }
}

function isAdsterraUrl(url) {
  if (!url) return false;
  const lower = String(url).toLowerCase();
  return ADSTERRA_WHITELIST.some((d) => lower.includes(d));
}

function isAdsterraSmartLinkUrl(url) {
  if (!url) return false;
  const lower = String(url).toLowerCase();
  if (isAdsterraUrl(url)) return true;
  if (lower.includes('recallscarce.com')) return true;
  if (/\/[a-z0-9]{6,}(\?|$)/.test(lower) && /(key|aff|cid|ref|spot_id|placement)=/.test(lower)) return true;
  return false;
}

function isPrivateIp(ip) {
  if (net.isIP(ip) === 4) {
    const p = ip.split('.').map(Number);
    return p[0] === 0 || p[0] === 10 || p[0] === 127 ||
      (p[0] === 169 && p[1] === 254) ||
      (p[0] === 172 && p[1] >= 16 && p[1] <= 31) ||
      (p[0] === 192 && p[1] === 168) ||
      (p[0] === 100 && p[1] >= 64 && p[1] <= 127) || p[0] >= 224;
  }
  if (net.isIP(ip) === 6) {
    const x = ip.toLowerCase();
    if (x === '::' || x === '::1') return true;
    if (x.startsWith('fc') || x.startsWith('fd')) return true;
    if (x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb')) return true;
    if (x.startsWith('ff')) return true;
    if (x.startsWith('2001:db8')) return true;
    return false;
  }
  return false;
}

async function assertSafeRemoteUrl(raw, allowedHosts = null) {
  let u;
  try { u = new URL(String(raw).trim()); } catch (_) { throw new Error('Invalid URL'); }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only HTTP/HTTPS allowed');
  if (u.username || u.password) throw new Error('Credentials in URL not allowed');
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local'))
    throw new Error('Private host not allowed');
  if (allowedHosts && !allowedHosts.has(host)) throw new Error('Host not allowed');
  if (isPrivateIp(host)) throw new Error('Private IP not allowed');
  try {
    const answers = await dns.lookup(host, { all: true, verbatim: true });
    if (answers.some((a) => isPrivateIp(a.address))) throw new Error('Resolves to private IP');
  } catch (e) { if (e.message && e.message.includes('private IP')) throw e; }
  return u;
}

// ═══════════════════════════════════════════════════════════════════════
//  TIME / HASH / STRING UTILITIES
// ═══════════════════════════════════════════════════════════════════════
const BD_OFFSET_MS = 6 * 60 * 60 * 1000;

function todayStr() {
  const d = new Date(Date.now() + BD_OFFSET_MS);
  return d.toISOString().slice(0, 10);
}

function getHourKey(dateObj = null) {
  const d = dateObj instanceof Date
    ? new Date(dateObj.getTime() + BD_OFFSET_MS)
    : new Date(Date.now() + BD_OFFSET_MS);
  return d.toISOString().slice(0, 13);
}

function msUntilNextHour() {
  const now = Date.now() + BD_OFFSET_MS;
  const nextHour = Math.ceil(now / 3600000) * 3600000;
  return (nextHour - now) + 60000;
}

function hashTxn(txn) {
  return crypto.createHash('sha256').update(String(txn).trim().toLowerCase()).digest('hex');
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function normalizeUrlKey(url) {
  try {
    const u = new URL(String(url));
    return `${u.protocol}//${u.hostname.toLowerCase()}${u.pathname}${u.search}`;
  } catch (_) { return String(url); }
}

// ═══════════════════════════════════════════════════════════════════════
//  MODE HELPERS
// ═══════════════════════════════════════════════════════════════════════
function getActiveMode(aiSettings) {
  const cfg = aiSettings || {};
  if (cfg.h4ck_organic_mode) return MODE_H4CK_ORGANIC;
  if (cfg.hybrid_smart_mode) return MODE_HYBRID_SMART;
  if (cfg.pure_search_mode)  return MODE_PURE_SEARCH;
  if (cfg.pure_direct_mode)  return MODE_PURE_DIRECT;
  return MODE_H4CK_ORGANIC;
}

function getModeDisplayName(mode) {
  switch (mode) {
    case MODE_H4CK_ORGANIC: return '⚡ H4CK ORGANIC v30';
    case MODE_HYBRID_SMART: return '🎯 Hybrid Smart';
    case MODE_PURE_SEARCH:  return '🔍 Pure Search';
    case MODE_PURE_DIRECT:  return '🚀 Pure Direct';
    default:                return '❓ Unknown';
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  PROXY HELPERS
// ═══════════════════════════════════════════════════════════════════════
const RESIDENTIAL_PORT_HINTS = new Set([
  22225, 22228, 22229, 8000, 8001, 8002, 10000, 10001,
  12345, 10080, 10081, 11000, 11001, 11002, 11003,
  22000, 22001, 24000, 24001, 30000, 30001,
]);

function safeProxyServerUrl(serverStr, fallbackProto = 'socks5') {
  if (!serverStr) return '';
  let s = String(serverStr).trim();
  if (!/^[a-z0-9]+:\/\//i.test(s)) {
    s = `${fallbackProto}://${s}`;
  }
  return s;
}

function isResidentialProxy(p) {
  if (!p) return false;
  if (p.residential === true) return true;
  const name = String(p.name || '').toLowerCase();
  const server = String(p.server || '').toLowerCase();
  const patterns = ['resi', 'residential', 'mobile', '4g', 'lte', '5g', 'isp', 'static', 'res.',
    'proxy-seller', 'smartproxy', 'brightdata', 'oxylabs', 'iproyal', 'niceproxy'];
  for (const pat of patterns) if (name.includes(pat) || server.includes(pat)) return true;
  try {
    const sUrl = safeProxyServerUrl(server, p.protocol || p.type || 'socks5');
    const port = Number(new URL(sUrl).port);
    if (RESIDENTIAL_PORT_HINTS.has(port)) return true;
  } catch (_) {}
  return false;
}

function isSocks5Proxy(p) {
  if (!p) return false;
  try {
    const sUrl = safeProxyServerUrl(p.server, p.protocol || p.type || 'socks5');
    return new URL(sUrl).protocol.toLowerCase().startsWith('socks5');
  } catch (_) { return false; }
}

function proxyId(p) {
  return p.id || `${p.server}|${p.username || ''}`;
}

function shortProxyLabel(p) {
  if (!p) return 'direct';
  const s = String(p.server || '').replace(/^https?:\/\//, '').replace(/^socks5h?:\/\//, '');
  const nameTag = p.name ? `${p.name} | ` : '';
  return `${nameTag}${s}`;
}

function toPlaywrightProxy(p) {
  if (!p) return null;
  let parsed;
  try {
    const sUrl = safeProxyServerUrl(p.server, p.protocol || p.type || 'socks5');
    parsed = new URL(sUrl);
  }
  catch (_) { throw new Error('Invalid proxy URL'); }
  const protocol = parsed.protocol.toLowerCase();
  if (['socks4:', 'socks4a:'].includes(protocol)) throw new Error('SOCKS4 not supported');
  if (!['http:', 'https:', 'socks5:', 'socks5h:'].includes(protocol)) throw new Error('Unsupported protocol');
  const serverProtocol = protocol === 'socks5h:' ? 'socks5:' : protocol;
  const host = parsed.hostname.includes(':') ? `[${parsed.hostname}]` : parsed.hostname;
  const server = `${serverProtocol}//${host}:${parsed.port}`;
  const c = { server };
  const username = p.username || (parsed.username ? decodeURIComponent(parsed.username) : '');
  const password = p.password || (parsed.password ? decodeURIComponent(parsed.password) : '');
  if (username) c.username = username;
  if (password) c.password = password;
  return c;
}

/**
 * Parse a proxy string in any of these formats:
 *   socks5://user:pass@host:port#resi#US#500MB
 *   http://user:pass@host:port
 *   host:port:user:pass
 *   host:port
 * Trailing `#tag` segments can add: `resi`, 2-letter country, quota MB.
 * Returns a normalized proxy object, or null on failure.
 */
function parseProxyInput(raw) {
  let s = String(raw || '').trim();
  if (!s || s.startsWith('#')) return null;

  let country = null, quotaMb = null, residential = false;

  while (true) {
    const i = s.lastIndexOf('#');
    if (i < 0) break;
    const tag = s.slice(i + 1).trim();
    if (/^resi(dential)?$/i.test(tag) && !residential) { residential = true; s = s.slice(0, i).trim(); continue; }
    if (/^[A-Z]{2}$/i.test(tag) && !country) { country = tag.toUpperCase(); s = s.slice(0, i).trim(); continue; }
    const m = tag.match(/^(\d+(?:\.\d+)?)\s*(?:MB)?$/i);
    if (m && quotaMb === null) { quotaMb = Number(m[1]); s = s.slice(0, i).trim(); continue; }
    break;
  }

  let scheme = 'http';
  const sm = s.match(/^(https?|socks4a?|socks5h?):\/\//i);
  if (sm) { scheme = sm[1].toLowerCase(); s = s.slice(sm[0].length); }
  if (!['http', 'https', 'socks4', 'socks4a', 'socks5', 'socks5h'].includes(scheme)) return null;

  let username = null, password = null, hostPort = s;
  const at = s.lastIndexOf('@');
  if (at !== -1) {
    const creds = s.slice(0, at);
    hostPort = s.slice(at + 1);
    const c = creds.indexOf(':');
    if (c < 1) return null;
    try {
      username = decodeURIComponent(creds.slice(0, c));
      password = decodeURIComponent(creds.slice(c + 1));
    } catch (_) { return null; }
  }

  let host, port;
  const ipv6 = hostPort.match(/^\[([0-9a-f:.]+(?:%[a-z0-9]+)?)\]:(\d{1,5})$/i);
  if (ipv6) {
    host = `[${ipv6[1]}]`; port = ipv6[2];
  } else {
    const parts = hostPort.split(':');
    if (parts.length === 2) {
      host = parts[0]; port = parts[1];
    } else if (parts.length === 4 && username === null) {
      host = parts[0]; port = parts[1]; username = parts[2]; password = parts[3];
    } else if (parts.length === 3 && username === null) {
      host = parts[0]; port = parts[1];
      const rest = parts.slice(2).join(':');
      const colon = rest.indexOf(':');
      if (colon > 0) { username = rest.slice(0, colon); password = rest.slice(colon + 1); }
      else username = rest;
    } else {
      const lastColon = hostPort.lastIndexOf(':');
      if (lastColon < 1) return null;
      host = hostPort.slice(0, lastColon);
      port = hostPort.slice(lastColon + 1);
    }
  }

  const nPort = Number(port);
  if (!host || /\s/.test(host) || !/^\d{1,5}$/.test(String(port)) ||
      !Number.isInteger(nPort) || nPort < 1 || nPort > 65535) return null;

  const entry = { server: `${scheme}://${host}:${nPort}` };
  if (username !== null && username !== '') entry.username = username;
  if (password !== null && password !== '') entry.password = password;
  if (country) entry.country = country;
  if (quotaMb !== null && quotaMb > 0) entry.quota_mb = quotaMb;
  if (residential) entry.residential = true;
  return entry;
}

// ═══════════════════════════════════════════════════════════════════════
//  ADSTERRA — API CLIENT + PARSER
// ═══════════════════════════════════════════════════════════════════════
function extractAdsterraSmartlinks(payload) {
  const records = [];
  const seenObjects = new Set();
  const collectionKeys = new Set([
    'smartlinks', 'smart_links', 'smart-links', 'links', 'data', 'items',
    'results', 'result', 'records', 'placements',
  ]);
  const urlKeys = [
    'url', 'link', 'smartlink', 'smart_link', 'smartlink_url', 'smart_link_url',
    'link_url', 'direct_url', 'direct_link', 'target_url', 'destination_url', 'destination',
  ];

  function collect(node, depth = 0) {
    if (depth > 7 || node == null) return;
    if (typeof node === 'string') {
      if (isValidUrl(node)) records.push({ url: node.trim(), name: '', id: null, status: 'Active' });
      return;
    }
    if (Array.isArray(node)) { for (const item of node) collect(item, depth + 1); return; }
    if (typeof node !== 'object' || seenObjects.has(node)) return;
    seenObjects.add(node);

    let rawUrl = null;
    for (const key of urlKeys) {
      if (typeof node[key] === 'string' && isValidUrl(node[key])) { rawUrl = node[key].trim(); break; }
    }
    if (rawUrl) {
      records.push({
        url: rawUrl,
        name: String(node.name || node.title || node.label || node.domain || '').slice(0, 200),
        id: node.id || node.smartlink_id || null,
        status: node.status || 'Active',
      });
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      // Prefer known collection fields, but recurse through arbitrary JSON
      // objects too so custom user APIs such as {data:{items:[...]}} work.
      if (collectionKeys.has(key.toLowerCase()) || typeof value === 'object') {
        collect(value, depth + 1);
      }
    }
  }

  collect(payload);

  const unique = new Map();
  for (const link of records) {
    const key = link.url.replace(/\/$/, '');
    if (!unique.has(key)) unique.set(key, link);
  }
  return [...unique.values()];
}

async function fetchAdsterraSmartlinks(apiKey) {
  const token = String(apiKey || '').trim();
  if (!token) return { ok: false, error: 'API key not set' };
  const endpoints = ['smart-links.json', 'smartlinks.json', 'placements.json'];
  const errors = [];

  for (const resource of endpoints) {
    const url = `${ADSTERRA_API_BASE}/${resource}`;
    try { await assertSafeRemoteUrl(url, new Set([new URL(ADSTERRA_API_BASE).hostname])); }
    catch (e) { return { ok: false, error: `Invalid URL: ${e.message}` }; }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ADSTERRA_REQUEST_TIMEOUT_MS);
    let resp, body = '';
    try {
      resp = await fetch(url, {
        method: 'GET',
        headers: { 'X-API-Key': token, 'Accept': 'application/json', 'User-Agent': 'PN-AD-NETWORK/30.0' },
        signal: controller.signal,
        redirect: 'error',
      });
      body = await resp.text();
    } catch (e) { errors.push(`${resource}: ${e.message}`); continue; }
    finally { clearTimeout(timer); }

    if (resp.status === 401 || resp.status === 403) return { ok: false, error: `Unauthorized (HTTP ${resp.status})` };
    if (resp.status === 429) return { ok: false, error: 'Rate limit' };
    if (!resp.ok) { errors.push(`${resource}: HTTP ${resp.status}`); continue; }

    let payload;
    try { payload = JSON.parse(body); } catch (_) { errors.push(`${resource}: not JSON`); continue; }

    const links = extractAdsterraSmartlinks(payload);
    if (links.length) return { ok: true, links, endpoint: resource };
    errors.push(`${resource}: no links`);
  }
  return { ok: false, error: `No SmartLinks. ${errors.join(' | ')}` };
}

// ── Adsterra stats.json normaliser ───────────────────────────────────────────
// The Publisher API returns { items: [ { date, impression, clicks, revenue, ... } ] }.
// Field names differ slightly between API revisions and group-by modes, so we map
// defensively and ALWAYS emit the { date, impression, clicks, ctr, cpm, revenue }
// shape the dashboard expects (computing ctr / cpm when the API omits them).
function pickStatNumber(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') {
      const n = Number(row[k]);
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}
function pickStatString(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return String(row[k]);
  }
  return '';
}
function findAdsterraStatRows(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['items', 'data', 'results', 'result', 'stats', 'records', 'report', 'rows']) {
    const v = payload[key];
    if (Array.isArray(v)) return v;
    if (v && typeof v === 'object') {
      const nested = findAdsterraStatRows(v);
      if (nested.length) return nested;
    }
  }
  return [];
}
function normalizeAdsterraStats(payload) {
  const raw = findAdsterraStatRows(payload);
  const items = raw
    .filter((r) => r && typeof r === 'object')
    .map((r) => {
      const date = pickStatString(r, ['date', 'day', 'stat_date', 'datetime', 'date_key']).slice(0, 10);
      const impression = pickStatNumber(r, ['impression', 'impressions', 'imp', 'imps']);
      const clicks = pickStatNumber(r, ['clicks', 'click']);
      const revenue = pickStatNumber(r, ['revenue', 'earnings', 'income', 'profit', 'amount']);
      let ctr = pickStatNumber(r, ['ctr']);
      let cpm = pickStatNumber(r, ['cpm']);
      if (!ctr && impression > 0) ctr = (clicks / impression) * 100;
      if (!cpm && impression > 0) cpm = (revenue / impression) * 1000;
      return {
        date,
        impression: Math.round(impression),
        clicks: Math.round(clicks),
        ctr: Math.round(ctr * 100) / 100,
        cpm: Math.round(cpm * 10000) / 10000,
        revenue: Math.round(revenue * 100000) / 100000,
      };
    })
    .filter((r) => r.date);
  items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return items;
}

// One stats.json request. `arrayGroupBy` selects the documented `group_by[]=date`
// form (Adsterra's own tooling uses the bracketed array form for the date grouping).
async function requestAdsterraStats(apiKey, start, finish, arrayGroupBy) {
  const url = new URL(ADSTERRA_STATS_ENDPOINT);
  url.searchParams.set('start_date', start);
  url.searchParams.set('finish_date', finish);
  if (arrayGroupBy) url.searchParams.append('group_by[]', 'date');
  else url.searchParams.set('group_by', 'date');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ADSTERRA_REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'X-API-Key': apiKey, 'Accept': 'application/json', 'User-Agent': 'PN-AD-NETWORK/30.0' },
      signal: controller.signal,
      redirect: 'error',
    });
    const body = await resp.text();
    if (resp.status === 401 || resp.status === 403) return { ok: false, error: `Unauthorized (HTTP ${resp.status})`, fatal: true };
    if (resp.status === 429) return { ok: false, error: 'Rate limit', fatal: true };
    if (!resp.ok) return { ok: false, error: `Adsterra HTTP ${resp.status}` };
    let payload;
    try { payload = JSON.parse(body); } catch (_) { return { ok: false, error: 'Invalid JSON' }; }
    return { ok: true, payload };
  } catch (e) { return { ok: false, error: e.message }; }
  finally { clearTimeout(timer); }
}

async function fetchAdsterraPublisherReport(apiKey, startDate = null, finishDate = null) {
  if (!apiKey) return { ok: false, error: 'API key not set.' };
  const today = new Date().toISOString().slice(0, 10);
  const start = startDate || today;
  const finish = finishDate || today;

  // Primary attempt: documented array form. If it yields no rows (some accounts /
  // API revisions prefer the plain form), transparently retry with group_by=date.
  let attempt = await requestAdsterraStats(apiKey, start, finish, true);
  if (!attempt.ok && attempt.fatal) return { ok: false, error: attempt.error };
  let items = attempt.ok ? normalizeAdsterraStats(attempt.payload) : [];
  let payload = attempt.ok ? attempt.payload : null;

  if (!items.length) {
    const alt = await requestAdsterraStats(apiKey, start, finish, false);
    if (alt.ok) {
      const altItems = normalizeAdsterraStats(alt.payload);
      if (altItems.length) { items = altItems; payload = alt.payload; }
    } else if (!attempt.ok && alt.fatal) {
      return { ok: false, error: alt.error };
    }
  }

  if (!attempt.ok && !payload) return { ok: false, error: attempt.error || 'Adsterra request failed' };

  const now = new Date().toISOString();
  return {
    ok: true,
    date: start,
    data: {
      items,
      itemCount: items.length,
      dbLastUpdateTime: now,
      dbDateTime: now,
      raw: payload,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  DECISION FUNCTIONS  (state is passed in by the caller)
// ═══════════════════════════════════════════════════════════════════════

/**
 * Decide whether the proxy subsystem is ready to serve a visit.
 * Returns { ready: bool, code: 'OK'|'PROXY_OFF'|'NO_PROXY'|'PROXY_QUOTA', reason?: string }
 */
function proxyReadyForTraffic({ aiSettings, proxySettings, proxies, proxyStats }) {
  const cfg = aiSettings || {};
  const pc = proxySettings || {};
  const list = Array.isArray(proxies) ? proxies : [];
  const stats = (proxyStats && typeof proxyStats === 'object') ? proxyStats : {};

  // If direct fallback is allowed or proxy is not strictly required, never block traffic
  if (pc.fallback_direct || !cfg.proxy_required) {
    return { ready: true, code: 'OK' };
  }

  const enabled = list.filter((p) => p.enabled !== false);
  if (!enabled.length) {
    if (pc.fallback_direct || !cfg.proxy_required) {
      return { ready: true, code: 'OK' };
    }
    return { ready: false, reason: 'No booster configured (Contact Admin).', code: 'NO_PROXY' };
  }

  const anyAvailable = enabled.some((p) => {
    const s = stats[proxyId(p)] || {};
    const quota = Number(p.quota_mb || 0);
    const used = s.mb_used || 0;
    return !(quota > 0 && used >= quota);
  });
  if (!anyAvailable) {
    return { ready: false, reason: 'All boosters have exhausted their quota (Contact Admin).', code: 'PROXY_QUOTA' };
  }

  return { ready: true, code: 'OK' };
}

/**
 * Decide whether an impression run can start right now.
 * Caller must supply:
 *   uid, type ('smartlink'|'normal'), impressionBalance,
 *   aiSettings, hourlyCount, dailyCount, remainingBursts,
 *   proxyReady ({ ready, code, reason })
 * Returns { ok: true } or { ok: false, code, reason }.
 */
function canRunImpression({
  uid, type,
  impressionBalance,
  aiSettings,
  hourlyCount,
  dailyCount,
  remainingBursts,
  proxyReady,
}) {
  const cfg = aiSettings || {};
  const bal = Math.floor(Number(impressionBalance) || 0);

  if (bal <= 0) {
    return { ok: false, reason: 'Impression credit empty! Buy from Shop.', code: 'NO_CREDITS' };
  }

  if (!proxyReady || !proxyReady.ready) {
    return {
      ok: false,
      reason: (proxyReady && proxyReady.reason) || 'Proxy not ready.',
      code: (proxyReady && proxyReady.code) || 'PROXY_OFF',
    };
  }

  if (type === 'smartlink') {
    if (!cfg.smartlink_enabled) return { ok: false, reason: 'SmartLink disabled', code: 'DISABLED' };
    if (Number(hourlyCount) >= Number(cfg.hourly_limit_smartlink)) {
      return { ok: false, reason: `Hourly limit (${cfg.hourly_limit_smartlink}/hr)`, code: 'HOURLY_LIMIT' };
    }
    if (Number(dailyCount) >= Number(cfg.daily_limit_smartlink)) {
      return { ok: false, reason: 'Daily limit', code: 'DAILY_LIMIT' };
    }
  } else if (type === 'normal') {
    if (!cfg.normal_enabled) return { ok: false, reason: 'Normal disabled', code: 'DISABLED' };
    if (Number(hourlyCount) >= Number(cfg.hourly_limit_normal)) {
      return { ok: false, reason: `Hourly limit (${cfg.hourly_limit_normal}/hr)`, code: 'HOURLY_LIMIT' };
    }
    if (Number(dailyCount) >= Number(cfg.daily_limit_normal)) {
      return { ok: false, reason: 'Daily limit', code: 'DAILY_LIMIT' };
    }
  } else {
    return { ok: false, reason: `Unknown impression type: ${type}`, code: 'INVALID_TYPE' };
  }

  if (Number(remainingBursts) <= 0) {
    return { ok: false, reason: 'Daily burst limit reached', code: 'BURST_LIMIT' };
  }

  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════════════════
module.exports = {
  // Modes
  MODE_H4CK_ORGANIC,
  MODE_HYBRID_SMART,
  MODE_PURE_SEARCH,
  MODE_PURE_DIRECT,

  // Adsterra constants
  ADSTERRA_WHITELIST,
  ADSTERRA_API_BASE,
  ADSTERRA_SMARTLINKS_ENDPOINT,
  ADSTERRA_STATS_ENDPOINT,

  // Free tier
  FREE_LINK_LIMIT,
  FREE_VISITS_PER_LINK,
  FREE_VISIT_WINDOW_MS,
  REFERRAL_BONUS,

  // Plans / packages / payments
  PLAN_ORDER,
  DEFAULT_PLANS,
  SHOP_PACKAGE_ORDER,
  DEFAULT_SHOP_PACKAGES,
  DEFAULT_PAYMENT_METHODS,

  // Settings defaults
  SMARTLINK_DEFAULTS,
  AUTO_IMPRESSION_DEFAULTS,
  PROXY_DEFAULTS,
  MAINTENANCE_DEFAULTS,

  // ⭐ V36 Global targeting engine
  COUNTRY_GEO,
  HIGH_CPM_COUNTRIES,
  TARGETING_DIMENSIONS,
  TARGETING_DEFAULTS,

  // Predicates
  isValidUrl,
  isAdsterraUrl,
  isAdsterraSmartLinkUrl,
  isPrivateIp,
  assertSafeRemoteUrl,
  isSocks5Proxy,
  isResidentialProxy,

  // Utilities
  normalizeUrlKey,
  todayStr,
  getHourKey,
  msUntilNextHour,
  hashTxn,
  escapeHtml,
  proxyId,
  shortProxyLabel,
  toPlaywrightProxy,
  parseProxyInput,

  // Mode helpers
  getActiveMode,
  getModeDisplayName,

  // Adsterra
  extractAdsterraSmartlinks,
  fetchAdsterraSmartlinks,
  fetchAdsterraPublisherReport,

  // Decisions
  proxyReadyForTraffic,
  canRunImpression,
};
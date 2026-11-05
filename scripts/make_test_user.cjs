'use strict';
// Creates (or resets) a test user directly in Firestore for UI exploration.
const path = require('node:path');
const crypto = require('node:crypto');
const admin = require('firebase-admin');
const sa = require(path.join(__dirname, '..', 'firebase-service-account.json'));

admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function readRoot(name) {
  const snap = await db.collection(name).doc('_root').get();
  if (!snap.exists) return null;
  const v = snap.data();
  return v && Object.prototype.hasOwnProperty.call(v, 'value') ? v.value : v;
}
async function writeRoot(name, value) {
  await db.collection(name).doc('_root').set({ value, updated_at: Date.now() });
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function genPublicId() { return 'PN' + Math.random().toString(36).slice(2, 8).toUpperCase(); }
function genReferralCode() { return Math.random().toString(36).slice(2, 9).toUpperCase(); }
function todayStr() {
  const d = new Date(Date.now() + 6 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

(async () => {
  const email = 'demo@pntest.com';
  const password = 'Demo@12345';
  const users = (await readRoot('web_users')) || [];
  const list = Array.isArray(users) ? users : [];
  let rec = list.find((u) => u.email === email);
  const now = new Date().toISOString();
  if (!rec) {
    rec = {
      id: 'usr_demo_test_1',
      email,
      name: 'Demo Publisher',
      role: 'user',
      adminRole: null,
      status: 'active',
      emailVerified: true,
      membershipPlanId: 'free',
      membershipExpiresAt: now,
      createdAt: now,
      lastLoginAt: now,
      trialClaimed: false,
      publicId: genPublicId(),
      referralCode: genReferralCode(),
      passwordHash: hashPassword(password),
      settings: { notifications: true, promoAlerts: true, theme: 'dark' },
      isRootSuperAdmin: false,
      country: 'BD',
      avatar: '',
      bio: 'Demo account for testing.',
    };
    list.push(rec);
  } else {
    rec.passwordHash = hashPassword(password);
    rec.emailVerified = true;
    rec.verificationPending = false;
    rec.status = 'active';
  }
  await writeRoot('web_users', list);

  const uid = rec.id;
  const bal = (await readRoot('impression_balance')) || {};
  bal[uid] = 0; // requirement: new accounts start at 0
  await writeRoot('impression_balance', bal);

  const wallet = (await readRoot('balance')) || {};
  if (wallet[uid] === undefined) wallet[uid] = 0;
  await writeRoot('balance', wallet);

  const mem = (await readRoot('membership')) || {};
  if (!mem[uid]) mem[uid] = { plan: null, expires_at: null, link_limit: 5, visits_per_link: 100, burst_window_ms: 3600000, daily_burst_limit: 20, daily_burst_used: 0, daily_reset_date: todayStr() };
  await writeRoot('membership', mem);

  console.log('OK user:', uid, email, password);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

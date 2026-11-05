#!/usr/bin/env node
/**
 * One-off cleanup: revert the temporary Adsterra API key that was set on the
 * demo/test user during verification, and remove the throwaway test user.
 * Safe to run multiple times.
 */
const path = require('path');
const admin = require('firebase-admin');

const KEY_PATH = process.env.FIREBASE_KEY_PATH || path.join(__dirname, '..', 'firebase-service-account.json');
const svc = require(KEY_PATH);

admin.initializeApp({ credential: admin.credential.cert(svc) });
const db = admin.firestore();

const DEMO_UID = 'usr_demo_test_1';
const TEST_EMAIL = 'v40test@pntest.com';

(async () => {
  const slRef = db.collection('user_smartlinks').doc('_root');
  const snap = await slRef.get();
  if (!snap.exists) { console.log('no user_smartlinks/_root doc'); }
  else {
    const data = snap.data() || {};
    const value = { ...(data.value || {}) };
    if (value[DEMO_UID]) {
      console.log('demo entry BEFORE api_key =', value[DEMO_UID].api_key);
      delete value[DEMO_UID]; // demo user is deleted, so drop the orphaned entry entirely
      await slRef.set({ ...data, value, updated_at: Date.now() }, { merge: true });
      console.log('demo entry removed from user_smartlinks');
    } else {
      console.log('no demo entry in user_smartlinks');
    }
  }

  // Remove throwaway test user if present
  const usersRef = db.collection('web_all_users').doc('_root');
  const usnap = await usersRef.get();
  if (usnap.exists) {
    const ud = usnap.data() || {};
    let list = ud.value;
    if (Array.isArray(list)) {
      const before = list.length;
      list = list.filter((u) => u && u.email !== TEST_EMAIL);
      if (list.length !== before) {
        await usersRef.set({ ...ud, value: list, updated_at: Date.now() }, { merge: true });
        console.log(`removed ${before - list.length} test user(s) from web_all_users`);
      } else {
        console.log('no test user in web_all_users');
      }
    }
  }

  const wuRef = db.collection('web_users').doc('_root');
  const wsnap = await wuRef.get();
  if (wsnap.exists) {
    const wd = wsnap.data() || {};
    let wlist = wd.value;
    if (Array.isArray(wlist)) {
      const before = wlist.length;
      wlist = wlist.filter((u) => u && u.email !== TEST_EMAIL && u.id !== DEMO_UID);
      if (wlist.length !== before) {
        await wuRef.set({ ...wd, value: wlist, updated_at: Date.now() }, { merge: true });
        console.log(`removed ${before - wlist.length} test/demo user(s) from web_users`);
      } else {
        console.log('no test/demo user in web_users');
      }
    }
  }

  console.log('cleanup done');
  process.exit(0);
})().catch((e) => { console.error('cleanup failed:', e); process.exit(1); });

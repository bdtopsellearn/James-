const admin = require('firebase-admin');
const fs = require('fs');
const sa = JSON.parse(fs.readFileSync('firebase-service-account.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

const mode = process.argv[2] || 'read';
const ref = db.collection('web_registration').doc('_root');

(async () => {
  if (mode === 'read') {
    const s = await ref.get();
    console.log('web_registration/_root =', JSON.stringify(s.exists ? s.data() : null));
  } else if (mode === 'close') {
    const s = await ref.get();
    const prev = s.exists ? s.data() : null;
    fs.writeFileSync('/tmp/reg_prev.json', JSON.stringify(prev));
    await ref.set({ value: { open: false, message: 'New account creation is paused right now. Existing members can still sign in. Please check back soon!', updatedAt: new Date().toISOString() } }, { merge: true });
    console.log('CLOSED. prev saved to /tmp/reg_prev.json');
  } else if (mode === 'restore') {
    const prev = JSON.parse(fs.readFileSync('/tmp/reg_prev.json', 'utf8'));
    if (prev) await ref.set(prev, { merge: false }); else await ref.delete();
    console.log('RESTORED');
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

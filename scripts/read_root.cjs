const admin = require('firebase-admin');
const fs = require('fs');
const sa = JSON.parse(fs.readFileSync('firebase-service-account.json', 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();
(async () => {
  const cols = process.argv.slice(2);
  for (const c of cols) {
    const s = await db.collection(c).doc('_root').get();
    console.log('===', c, '===');
    console.log(JSON.stringify(s.exists ? s.data().value : null, null, 1));
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

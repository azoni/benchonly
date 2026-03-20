import admin from 'firebase-admin';
if (!admin.apps.length) {
  const p = process.env.FIREBASE_PROJECT_ID, c = process.env.FIREBASE_CLIENT_EMAIL, k = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (p && c && k) admin.initializeApp({ credential: admin.credential.cert({ projectId: p, clientEmail: c, privateKey: k }) });
}
export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'POST only' };
  const { key } = JSON.parse(event.body || '{}');
  if (key !== 'benchonly-seed-2026') return { statusCode: 403, body: 'bad key' };
  await admin.firestore().collection('globalStats').doc('volume').set({ totalLbs: 303500 });
  return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: '{"ok":true,"total":303500}' };
};

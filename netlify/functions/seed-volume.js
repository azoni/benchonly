import admin from 'firebase-admin';
if (!admin.apps.length) {
  const p = process.env.FIREBASE_PROJECT_ID, c = process.env.FIREBASE_CLIENT_EMAIL, k = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (p && c && k) admin.initializeApp({ credential: admin.credential.cert({ projectId: p, clientEmail: c, privateKey: k }) });
}
const db = admin.firestore();
export const handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'POST only' };
  const { key } = JSON.parse(event.body || '{}');
  if (key !== 'benchonly-seed-2026') return { statusCode: 403, headers, body: 'bad key' };
  const bigSets = [];
  async function scan(col) {
    const snap = await db.collection(col).get();
    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.status === 'deleted' || d.status === 'cancelled') continue;
      (d.exercises || []).forEach(ex => {
        if (!(ex.name || '').toLowerCase().includes('bench')) return;
        (ex.sets || []).forEach(s => {
          const w = parseFloat(s.actualWeight || s.prescribedWeight || 0);
          const r = parseInt(s.actualReps || s.prescribedReps || 0, 10);
          if (w > 0 && r > 0 && s.completed !== false) {
            const vol = w * r;
            if (vol > 2000) bigSets.push({ workout: d.name, exercise: ex.name, weight: w, reps: r, vol, col });
          }
        });
      });
    }
  }
  await scan('workouts');
  await scan('groupWorkouts');
  bigSets.sort((a, b) => b.vol - a.vol);
  return { statusCode: 200, headers, body: JSON.stringify(bigSets.slice(0, 10), null, 2) };
};

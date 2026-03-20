import admin from 'firebase-admin';
if (!admin.apps.length) {
  const p = process.env.FIREBASE_PROJECT_ID, c = process.env.FIREBASE_CLIENT_EMAIL, k = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (p && c && k) admin.initializeApp({ credential: admin.credential.cert({ projectId: p, clientEmail: c, privateKey: k }) });
}
const db = admin.firestore();

function calcBenchVolume(exercises) {
  let vol = 0;
  (exercises || []).forEach(ex => {
    const name = (ex.name || '').toLowerCase();
    if (!name.includes('bench')) return;
    (ex.sets || []).forEach(s => {
      const w = parseFloat(s.actualWeight || s.prescribedWeight || 0);
      const r = parseInt(s.actualReps || s.prescribedReps || 0, 10);
      if (w > 0 && r > 0 && s.completed !== false) vol += w * r;
    });
  });
  return vol;
}

export const handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{"error":"POST only"}' };
  const { key } = JSON.parse(event.body || '{}');
  if (key !== 'benchonly-seed-2026') return { statusCode: 403, headers, body: '{"error":"bad key"}' };

  try {
    let total = 0, benchExercises = [];

    // Personal workouts
    const snap = await db.collection('workouts').get();
    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.status !== 'completed' || d.workoutType === 'cardio') continue;
      const v = calcBenchVolume(d.exercises);
      if (v > 0) { total += v; benchExercises.push({ src: 'personal', name: d.name, vol: v }); }
    }

    // Group workouts
    try {
      const gSnap = await db.collection('groupWorkouts').get();
      for (const doc of gSnap.docs) {
        const d = doc.data();
        if (d.status === 'deleted' || d.status === 'cancelled') continue;
        const v = calcBenchVolume(d.exercises);
        if (v > 0) { total += v; benchExercises.push({ src: 'group', name: d.name, vol: v }); }
      }
    } catch (e) {}

    await db.collection('globalStats').doc('volume').set({ totalLbs: total });

    return { statusCode: 200, headers, body: JSON.stringify({ total, workouts: benchExercises.length, breakdown: benchExercises }) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

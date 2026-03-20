import admin from 'firebase-admin';
if (!admin.apps.length) {
  const p = process.env.FIREBASE_PROJECT_ID, c = process.env.FIREBASE_CLIENT_EMAIL, k = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (p && c && k) admin.initializeApp({ credential: admin.credential.cert({ projectId: p, clientEmail: c, privateKey: k }) });
}
const db = admin.firestore();

export const handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{"error":"POST only"}' };
  const { key } = JSON.parse(event.body || '{}');
  if (key !== 'benchonly-seed-2026') return { statusCode: 403, headers, body: '{"error":"bad key"}' };

  try {
    let total = 0, overallMaxWeight = 0, overallMaxSet = 0, totalSets = 0, totalReps = 0, workoutCount = 0;
    const byType = {};

    function process(exercises) {
      (exercises || []).forEach(ex => {
        const name = (ex.name || '').toLowerCase();
        if (!name.includes('bench')) return;
        const displayName = ex.name || 'Bench Press';
        if (!byType[displayName]) byType[displayName] = { volume: 0, sets: 0, reps: 0, maxWeight: 0, maxSet: 0 };
        (ex.sets || []).forEach(s => {
          const w = parseFloat(s.actualWeight || s.prescribedWeight || 0);
          const r = parseInt(s.actualReps || s.prescribedReps || 0, 10);
          if (w > 0 && r > 0 && r <= 50 && s.completed !== false) {
            const sv = w * r;
            total += sv; totalSets++; totalReps += r;
            byType[displayName].volume += sv; byType[displayName].sets++; byType[displayName].reps += r;
            if (w > byType[displayName].maxWeight) byType[displayName].maxWeight = w;
            if (sv > byType[displayName].maxSet) byType[displayName].maxSet = sv;
            if (w > overallMaxWeight) overallMaxWeight = w;
            if (sv > overallMaxSet) overallMaxSet = sv;
          }
        });
      });
    }

    for (const doc of (await db.collection('workouts').get()).docs) {
      const d = doc.data();
      if (d.status !== 'completed' || d.workoutType === 'cardio') continue;
      const b = total; process(d.exercises); if (total > b) workoutCount++;
    }
    try {
      for (const doc of (await db.collection('groupWorkouts').get()).docs) {
        const d = doc.data();
        if (d.status === 'deleted' || d.status === 'cancelled') continue;
        const b = total; process(d.exercises); if (total > b) workoutCount++;
      }
    } catch (e) {}

    const details = {
      totalLbs: total, totalSets, totalReps, workoutCount, maxWeight: overallMaxWeight, maxSet: overallMaxSet,
      byType: Object.entries(byType).map(([name, s]) => ({ name, ...s })).sort((a, b) => b.volume - a.volume),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection('globalStats').doc('volume').set({ totalLbs: total });
    await db.collection('globalStats').doc('benchDetails').set(details);
    return { statusCode: 200, headers, body: JSON.stringify({ total, maxWeight: overallMaxWeight, maxSet: overallMaxSet, sets: totalSets, reps: totalReps, workouts: workoutCount }) };
  } catch (e) { return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) }; }
};

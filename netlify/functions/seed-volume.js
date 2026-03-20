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
    let total = 0;
    const byType = {}; // exercise name → { volume, sets, maxWeight, maxSet }
    let overallMaxWeight = 0;
    let overallMaxSet = 0; // single set volume (weight × reps)
    let totalSets = 0;
    let totalReps = 0;
    let workoutCount = 0;

    function processExercises(exercises) {
      (exercises || []).forEach(ex => {
        const name = (ex.name || '').toLowerCase();
        if (!name.includes('bench')) return;
        const displayName = ex.name || 'Bench Press';
        if (!byType[displayName]) byType[displayName] = { volume: 0, sets: 0, reps: 0, maxWeight: 0, maxSet: 0 };

        (ex.sets || []).forEach(s => {
          const w = parseFloat(s.actualWeight || s.prescribedWeight || 0);
          const r = parseInt(s.actualReps || s.prescribedReps || 0, 10);
          if (w > 0 && r > 0 && s.completed !== false) {
            const setVol = w * r;
            total += setVol;
            totalSets++;
            totalReps += r;
            byType[displayName].volume += setVol;
            byType[displayName].sets++;
            byType[displayName].reps += r;
            if (w > byType[displayName].maxWeight) byType[displayName].maxWeight = w;
            if (setVol > byType[displayName].maxSet) byType[displayName].maxSet = setVol;
            if (w > overallMaxWeight) overallMaxWeight = w;
            if (setVol > overallMaxSet) overallMaxSet = setVol;
          }
        });
      });
    }

    // Personal workouts
    const snap = await db.collection('workouts').get();
    for (const doc of snap.docs) {
      const d = doc.data();
      if (d.status !== 'completed' || d.workoutType === 'cardio') continue;
      const before = total;
      processExercises(d.exercises);
      if (total > before) workoutCount++;
    }

    // Group workouts
    try {
      const gSnap = await db.collection('groupWorkouts').get();
      for (const doc of gSnap.docs) {
        const d = doc.data();
        if (d.status === 'deleted' || d.status === 'cancelled') continue;
        const before = total;
        processExercises(d.exercises);
        if (total > before) workoutCount++;
      }
    } catch (e) {}

    // Sort by volume desc
    const typeBreakdown = Object.entries(byType)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.volume - a.volume);

    const details = {
      totalLbs: total,
      totalSets,
      totalReps,
      workoutCount,
      maxWeight: overallMaxWeight,
      maxSet: overallMaxSet,
      byType: typeBreakdown,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('globalStats').doc('volume').set({ totalLbs: total });
    await db.collection('globalStats').doc('benchDetails').set(details);

    return { statusCode: 200, headers, body: JSON.stringify(details, null, 2) };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

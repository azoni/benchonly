import admin from 'firebase-admin';

if (!admin.apps.length) {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (projectId && clientEmail && privateKey) {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
  }
}

const db = admin.firestore();

export const handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '{"error":"POST only"}' };
  const { key } = JSON.parse(event.body || '{}');
  if (key !== 'benchonly-seed-2026') return { statusCode: 403, headers, body: '{"error":"bad key"}' };

  try {
    // Personal workouts
    const snap = await db.collection('workouts').get();
    let personalVol = 0, personalCount = 0, personalSets = 0;
    const breakdown = [];

    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.status !== 'completed') continue;
      if (data.workoutType === 'cardio') continue;
      if (!data.exercises?.length) continue;

      let vol = 0, sets = 0;
      data.exercises.forEach(ex => {
        (ex.sets || []).forEach(s => {
          const w = parseFloat(s.actualWeight || s.prescribedWeight || 0);
          const r = parseInt(s.actualReps || s.prescribedReps || 0, 10);
          if (w > 0 && r > 0 && s.completed !== false) { vol += w * r; sets++; }
        });
      });

      if (vol > 0) {
        personalVol += vol;
        personalCount++;
        personalSets += sets;
        breakdown.push({ id: doc.id.substring(0, 15), name: data.name, userId: data.userId?.substring(0, 8), vol, sets, date: data.date });
      }
    }

    // Group workouts — check structure more carefully
    let groupVol = 0, groupSets = 0, groupDocs = 0;
    const groupBreakdown = [];
    try {
      const groupSnap = await db.collection('groupWorkouts').get();
      groupDocs = groupSnap.size;
      for (const doc of groupSnap.docs) {
        const data = doc.data();
        // Only count completed group workouts
        if (data.status === 'deleted' || data.status === 'cancelled') continue;
        if (!data.exercises?.length) continue;

        let vol = 0, sets = 0;
        data.exercises.forEach(ex => {
          (ex.sets || []).forEach(s => {
            const w = parseFloat(s.actualWeight || s.prescribedWeight || 0);
            const r = parseInt(s.actualReps || s.prescribedReps || 0, 10);
            if (w > 0 && r > 0 && s.completed !== false) { vol += w * r; sets++; }
          });
        });

        if (vol > 0) {
          groupVol += vol;
          groupSets += sets;
          groupBreakdown.push({ id: doc.id.substring(0, 15), name: data.name, vol, sets, status: data.status });
        }
      }
    } catch (e) { console.log('Group error:', e.message); }

    const grandTotal = personalVol + groupVol;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        personal: { workouts: personalCount, sets: personalSets, volume: personalVol },
        group: { docs: groupDocs, setsWithVolume: groupSets, volume: groupVol, breakdown: groupBreakdown },
        grandTotal,
        personalBreakdown: breakdown,
      }, null, 2),
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

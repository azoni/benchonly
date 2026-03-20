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
    let totalVolume = 0;
    let workoutCount = 0;
    let totalDocs = 0;
    let cardioCount = 0;
    let scheduledCount = 0;
    let noExercises = 0;

    // Get ALL workouts (no filter — avoid index issues)
    const snap = await db.collection('workouts').get();
    totalDocs = snap.size;

    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.status !== 'completed') { scheduledCount++; continue; }
      if (data.workoutType === 'cardio') { cardioCount++; continue; }
      if (!data.exercises?.length) { noExercises++; continue; }

      let workoutVol = 0;
      data.exercises.forEach(ex => {
        (ex.sets || []).forEach(s => {
          const w = parseFloat(s.actualWeight || s.prescribedWeight || 0);
          const r = parseInt(s.actualReps || s.prescribedReps || 0, 10);
          if (w > 0 && r > 0 && s.completed !== false) workoutVol += w * r;
        });
      });

      if (workoutVol > 0) {
        totalVolume += workoutVol;
        workoutCount++;
      }
    }

    // Also check groupWorkouts collection
    let groupVol = 0;
    let groupCount = 0;
    try {
      const groupSnap = await db.collection('groupWorkouts').get();
      for (const doc of groupSnap.docs) {
        const data = doc.data();
        // Group workouts may have completions per user
        if (data.exercises?.length) {
          data.exercises.forEach(ex => {
            (ex.sets || []).forEach(s => {
              const w = parseFloat(s.actualWeight || s.prescribedWeight || 0);
              const r = parseInt(s.actualReps || s.prescribedReps || 0, 10);
              if (w > 0 && r > 0) { groupVol += w * r; groupCount++; }
            });
          });
        }
      }
    } catch (e) { console.log('No groupWorkouts collection or error:', e.message); }

    const grandTotal = totalVolume + groupVol;
    await db.collection('globalStats').doc('volume').set({ totalLbs: grandTotal });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        totalDocs,
        scheduledCount,
        cardioCount,
        noExercises,
        workoutCount,
        workoutVolume: totalVolume,
        groupCount,
        groupVolume: groupVol,
        grandTotal,
        formatted: grandTotal >= 1e6 ? `${(grandTotal / 1e6).toFixed(1)}M lbs` : `${grandTotal.toLocaleString()} lbs`,
      }),
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

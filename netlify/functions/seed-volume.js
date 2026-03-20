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
    let offset = null;

    // Paginate through all completed workouts
    while (true) {
      let q = db.collection('workouts')
        .where('status', '==', 'completed')
        .limit(500);

      if (offset) q = q.startAfter(offset);

      const snap = await q.get();
      if (snap.empty) break;

      for (const doc of snap.docs) {
        const data = doc.data();
        if (!data.exercises || data.workoutType === 'cardio') continue;

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

      offset = snap.docs[snap.docs.length - 1];
      if (snap.size < 500) break;
    }

    // Write the total
    await db.collection('globalStats').doc('volume').set({ totalLbs: totalVolume });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, totalVolume, workoutCount, formatted: `${(totalVolume / 1_000_000).toFixed(1)}M lbs` }),
    };
  } catch (e) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};

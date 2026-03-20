import admin from 'firebase-admin';

// Initialize Firebase Admin
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
const SYNC_SECRET = process.env.CROSS_APP_SYNC_SECRET || 'rowcrew-benchonly-sync-2026';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS_HEADERS };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS_HEADERS, body: '{"error":"POST only"}' };

  try {
    const body = JSON.parse(event.body || '{}');
    const { secret, email, meters, time, calories, date, source } = body;

    // Verify shared secret
    if (secret !== SYNC_SECRET) {
      return { statusCode: 403, headers: CORS_HEADERS, body: '{"error":"Invalid secret"}' };
    }

    if (!email || !meters) {
      return { statusCode: 400, headers: CORS_HEADERS, body: '{"error":"email and meters required"}' };
    }

    // Find benchonly user by email
    let userId = null;
    try {
      const userRecord = await admin.auth().getUserByEmail(email);
      userId = userRecord.uid;
    } catch (e) {
      // User doesn't exist on benchonly
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true, synced: false, reason: 'User not found on BenchOnly' }) };
    }

    // Calculate duration in minutes from time in seconds
    const durationMinutes = time ? Math.round(time / 60) : Math.round(meters / 100); // estimate ~100m/min if no time

    // Calculate calories — use provided or estimate from MET value for rowing (7.0 MET)
    const estimatedCalories = calories || Math.round(durationMinutes * 7.0 * 1.1); // rough estimate

    // Create cardio workout entry
    await db.collection('workouts').add({
      userId,
      workoutType: 'cardio',
      name: 'Rowing Machine',
      activityType: 'rowing_machine',
      duration: durationMinutes,
      distance: meters,
      estimatedCalories,
      notes: `Synced from Row Crew — ${meters.toLocaleString()}m${time ? ` in ${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}` : ''}`,
      date: date ? new Date(date) : new Date(),
      status: 'completed',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      syncSource: 'rowcrew',
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ ok: true, synced: true }),
    };
  } catch (error) {
    console.error('External cardio log error:', error);
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: error.message }) };
  }
};

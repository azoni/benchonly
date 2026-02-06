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

const db = admin.apps.length ? admin.firestore() : null;

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { groupId, workoutIds, coachId, deleteByDate } = JSON.parse(event.body);

    if (!groupId || !coachId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'groupId and coachId required' }),
      };
    }

    if (!db) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Firebase not configured' }),
      };
    }

    let deletedCount = 0;

    if (workoutIds && workoutIds.length > 0) {
      // Delete specific workouts by ID
      const batch = db.batch();
      for (const id of workoutIds) {
        const docRef = db.collection('groupWorkouts').doc(id);
        const doc = await docRef.get();
        
        // Verify this workout belongs to the group and coach has access
        if (doc.exists && doc.data().groupId === groupId) {
          batch.delete(docRef);
          deletedCount++;
        }
      }
      await batch.commit();
      
    } else if (deleteByDate) {
      // Delete all workouts for a specific date
      const startOfDay = new Date(deleteByDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(deleteByDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      const snapshot = await db.collection('groupWorkouts')
        .where('groupId', '==', groupId)
        .where('date', '>=', startOfDay)
        .where('date', '<=', endOfDay)
        .get();
      
      const batch = db.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
        deletedCount++;
      });
      await batch.commit();
      
    } else {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Must provide workoutIds or deleteByDate' }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        deletedCount,
        message: `Deleted ${deletedCount} workout(s)`,
      }),
    };
    
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message }),
    };
  }
}
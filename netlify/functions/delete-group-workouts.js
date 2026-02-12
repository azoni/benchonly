import { verifyAuth, UNAUTHORIZED, CORS_HEADERS, OPTIONS_RESPONSE, admin } from './utils/auth.js';
import { logError } from './utils/logger.js';

const db = admin.apps.length ? admin.firestore() : null;

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return OPTIONS_RESPONSE;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const auth = await verifyAuth(event);
  if (!auth) return UNAUTHORIZED;

  try {
    const { groupId, workoutIds, deleteByDate } = JSON.parse(event.body);

    if (!groupId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        body: JSON.stringify({ error: 'groupId required' }),
      };
    }

    if (!db) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        body: JSON.stringify({ error: 'Firebase not configured' }),
      };
    }

    // Verify caller is an admin of the group
    const groupDoc = await db.collection('groups').doc(groupId).get();
    if (!groupDoc.exists) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        body: JSON.stringify({ error: 'Group not found' }),
      };
    }
    const groupData = groupDoc.data();
    const isGroupAdmin = (groupData.admins || []).includes(auth.uid) || 
                         groupData.createdBy === auth.uid || 
                         auth.isAdmin;
    if (!isGroupAdmin) {
      return {
        statusCode: 403,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        body: JSON.stringify({ error: 'Only group admins can delete workouts' }),
      };
    }

    let deletedCount = 0;

    if (workoutIds && workoutIds.length > 0) {
      const batch = db.batch();
      for (const id of workoutIds) {
        const docRef = db.collection('groupWorkouts').doc(id);
        const doc = await docRef.get();
        if (doc.exists && doc.data().groupId === groupId) {
          batch.delete(docRef);
          deletedCount++;
        }
      }
      await batch.commit();
    } else if (deleteByDate) {
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
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        body: JSON.stringify({ error: 'Must provide workoutIds or deleteByDate' }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ success: true, deletedCount, message: `Deleted ${deletedCount} workout(s)` }),
    };
  } catch (error) {
    console.error('Error:', error);
    logError('delete-group-workouts', error, 'high', { action: 'delete' });
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ error: error.message }),
    };
  }
}

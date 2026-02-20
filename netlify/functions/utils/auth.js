import admin from 'firebase-admin';

// Initialize Firebase Admin (safe to call multiple times)
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

const ADMIN_EMAIL = 'charltonuw@gmail.com';

/**
 * Verify Firebase ID token from Authorization header.
 * Returns { uid, email, isAdmin } on success, or null on failure.
 */
export async function verifyAuth(event) {
  const authHeader = event.headers?.authorization || event.headers?.Authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  try {
    const token = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email,
      isAdmin: decoded.email === ADMIN_EMAIL,
    };
  } catch (err) {
    console.error('[auth] Token verification failed:', err.message);
    return null;
  }
}

/**
 * Standard 401 response
 */
export const UNAUTHORIZED = {
  statusCode: 401,
  headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://benchpressonly.com', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS' },
  body: JSON.stringify({ error: 'Unauthorized' }),
};

/**
 * CORS headers — locked to production domain
 */
const ALLOWED_ORIGINS = [
  'https://benchpressonly.com',
  'http://localhost:5173',
  'capacitor://localhost',   // iOS native (Capacitor)
  'http://localhost',        // Android native (Capacitor)
];

export function getCorsHeaders(event) {
  const origin = event?.headers?.origin || '';
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// Keep static version for backwards compat — uses production origin
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://benchpressonly.com',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Standard OPTIONS response for CORS preflight
 */
export function optionsResponse(event) {
  return {
    statusCode: 204,
    headers: getCorsHeaders(event),
    body: '',
  };
}

// Keep static version for backwards compat
export const OPTIONS_RESPONSE = {
  statusCode: 204,
  headers: CORS_HEADERS,
  body: '',
};

export { admin };

import { verifyAuth, UNAUTHORIZED, CORS_HEADERS, OPTIONS_RESPONSE, admin } from './utils/auth.js';
import crypto from 'crypto';

const db = admin.firestore();

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return OPTIONS_RESPONSE;
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const auth = await verifyAuth(event);
  if (!auth) return UNAUTHORIZED;

  const clientId = process.env.OURA_CLIENT_ID;
  const siteUrl = process.env.SITE_URL || 'https://benchpressonly.com';

  if (!clientId) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Oura integration not configured' }),
    };
  }

  try {
    // Generate CSRF nonce and store in Firestore
    const nonce = crypto.randomBytes(16).toString('hex');
    await db.collection('ouraStates').doc(nonce).set({
      uid: auth.uid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      // Expire after 10 minutes
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const state = `${auth.uid}:${nonce}`;
    const redirectUri = `${siteUrl}/.netlify/functions/oura-callback`;
    const scopes = 'daily heartrate workout session';

    const authUrl = `https://cloud.ouraring.com/oauth/authorize?` +
      `response_type=code` +
      `&client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&state=${encodeURIComponent(state)}`;

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ authUrl }),
    };
  } catch (err) {
    console.error('[oura-auth] Error:', err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'Failed to initiate Oura auth' }),
    };
  }
};

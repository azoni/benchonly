import { admin } from './utils/auth.js';

const db = admin.firestore();

export const handler = async (event) => {
  // This is a GET redirect from Oura — no CORS needed, no Firebase auth
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const { code, state, error: ouraError } = event.queryStringParameters || {};
  const siteUrl = process.env.SITE_URL || 'https://benchpressonly.com';
  const settingsUrl = `${siteUrl}/settings`;

  // User denied access
  if (ouraError === 'access_denied') {
    return {
      statusCode: 302,
      headers: { Location: `${settingsUrl}?oura=denied` },
      body: '',
    };
  }

  if (!code || !state) {
    return {
      statusCode: 302,
      headers: { Location: `${settingsUrl}?oura=error&reason=missing_params` },
      body: '',
    };
  }

  try {
    // Parse and verify state
    const [uid, nonce] = state.split(':');
    if (!uid || !nonce) throw new Error('Invalid state format');

    const stateDoc = await db.collection('ouraStates').doc(nonce).get();
    if (!stateDoc.exists) throw new Error('Invalid or expired state');

    const stateData = stateDoc.data();
    if (stateData.uid !== uid) throw new Error('State UID mismatch');
    if (stateData.expiresAt.toDate() < new Date()) throw new Error('State expired');

    // Delete used state
    await db.collection('ouraStates').doc(nonce).delete();

    // Exchange code for tokens
    const clientId = process.env.OURA_CLIENT_ID;
    const clientSecret = process.env.OURA_CLIENT_SECRET;
    const redirectUri = `${siteUrl}/.netlify/functions/oura-callback`;

    const tokenResponse = await fetch('https://api.ouraring.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('[oura-callback] Token exchange failed:', errText);
      throw new Error('Token exchange failed');
    }

    const tokens = await tokenResponse.json();

    // Store tokens in Firestore under user's integrations
    await db.collection('users').doc(uid).collection('integrations').doc('oura').set({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      connectedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'connected',
    });

    return {
      statusCode: 302,
      headers: { Location: `${settingsUrl}?oura=connected` },
      body: '',
    };
  } catch (err) {
    console.error('[oura-callback] Error:', err.message);
    return {
      statusCode: 302,
      headers: { Location: `${settingsUrl}?oura=error&reason=${encodeURIComponent(err.message)}` },
      body: '',
    };
  }
};

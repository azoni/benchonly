import { verifyAuth, UNAUTHORIZED, CORS_HEADERS, OPTIONS_RESPONSE, admin } from './utils/auth.js';

const db = admin.firestore();
const OURA_API = 'https://api.ouraring.com/v2/usercollection';

/**
 * Refresh access token if expired or about to expire (within 5 min).
 * Returns current valid access token.
 */
async function getValidToken(uid) {
  const doc = await db.collection('users').doc(uid).collection('integrations').doc('oura').get();
  if (!doc.exists || doc.data().status !== 'connected') {
    throw new Error('Oura not connected');
  }

  const data = doc.data();
  const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);

  // Token still valid
  if (expiresAt > fiveMinFromNow) {
    return data.accessToken;
  }

  // Refresh the token
  const clientId = process.env.OURA_CLIENT_ID;
  const clientSecret = process.env.OURA_CLIENT_SECRET;

  const response = await fetch('https://api.ouraring.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: data.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error('[oura-sync] Token refresh failed:', errText);
    // Mark as disconnected
    await db.collection('users').doc(uid).collection('integrations').doc('oura').update({
      status: 'expired',
    });
    throw new Error('Oura token expired. Please reconnect.');
  }

  const tokens = await response.json();

  // Update stored tokens
  await db.collection('users').doc(uid).collection('integrations').doc('oura').update({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    status: 'connected',
  });

  return tokens.access_token;
}

/**
 * Fetch data from an Oura API endpoint.
 */
async function fetchOuraData(accessToken, endpoint, startDate, endDate) {
  const url = `${OURA_API}/${endpoint}?start_date=${startDate}&end_date=${endDate}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error('oura_unauthorized');
    }
    console.error(`[oura-sync] ${endpoint} fetch failed:`, response.status);
    return [];
  }

  const data = await response.json();
  return data.data || [];
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return OPTIONS_RESPONSE;
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const auth = await verifyAuth(event);
  if (!auth) return UNAUTHORIZED;

  try {
    const accessToken = await getValidToken(auth.uid);

    // Fetch last 7 days of data
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const [sleep, readiness, activity] = await Promise.all([
      fetchOuraData(accessToken, 'daily_sleep', startDate, endDate),
      fetchOuraData(accessToken, 'daily_readiness', startDate, endDate),
      fetchOuraData(accessToken, 'daily_activity', startDate, endDate),
    ]);

    // Build summary for AI context and display
    const summary = {
      lastSynced: new Date().toISOString(),
      sleep: sleep.map(s => ({
        day: s.day,
        score: s.score,
        totalSleepDuration: s.contributors?.total_sleep,
        efficiency: s.contributors?.efficiency,
        restfulness: s.contributors?.restfulness,
        latency: s.contributors?.latency,
        deepSleep: s.contributors?.deep_sleep,
        remSleep: s.contributors?.rem_sleep,
      })),
      readiness: readiness.map(r => ({
        day: r.day,
        score: r.score,
        temperatureDeviation: r.contributors?.body_temperature,
        hrv: r.contributors?.hrv_balance,
        restingHeartRate: r.contributors?.resting_heart_rate,
        recoveryIndex: r.contributors?.recovery_index,
        previousDayActivity: r.contributors?.previous_day_activity,
        sleepBalance: r.contributors?.sleep_balance,
      })),
      activity: activity.map(a => ({
        day: a.day,
        score: a.score,
        activeCalories: a.active_calories,
        steps: a.steps,
        equivalentWalkingDistance: a.equivalent_walking_distance,
        totalCalories: a.total_calories,
        trainingFrequency: a.contributors?.training_frequency,
        trainingVolume: a.contributors?.training_volume,
      })),
    };

    // Store in Firestore
    await db.collection('users').doc(auth.uid).collection('integrations').doc('oura').update({
      lastSynced: admin.firestore.FieldValue.serverTimestamp(),
      data: summary,
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true, data: summary }),
    };
  } catch (err) {
    console.error('[oura-sync] Error:', err.message);

    const statusCode = err.message === 'Oura not connected' ? 404 
      : err.message.includes('expired') ? 401 
      : 500;

    return {
      statusCode,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

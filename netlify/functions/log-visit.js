import admin from 'firebase-admin';

const MCP_URL = process.env.MCP_URL || "https://azoni-mcp.onrender.com";
const MCP_KEY = process.env.MCP_ADMIN_KEY;

// Initialize Firebase Admin if not already done
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

async function getTodayPageViewCount() {
  if (!admin.apps.length) return 0;
  try {
    const db = admin.firestore();
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const snap = await db.collection('analytics')
      .where('action', '==', 'page_view')
      .where('timestamp', '>=', dayStart)
      .get();
    return snap.size;
  } catch {
    return 0;
  }
}

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: '{"error":"POST only"}' };

  if (MCP_KEY) {
    try {
      // Log site visit
      const visitPromise = fetch(`${MCP_URL}/activity/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${MCP_KEY}` },
        body: JSON.stringify({ type: "site_visit", title: "Site visit", source: "benchpressonly" }),
      });

      // Also send today's page view count
      const pageViews = await getTodayPageViewCount();
      const promises = [visitPromise];
      if (pageViews > 0) {
        promises.push(fetch(`${MCP_URL}/activity/log`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${MCP_KEY}` },
          body: JSON.stringify({ type: "page_view_summary", title: `${pageViews} page views today`, source: "benchpressonly" }),
        }));
      }
      await Promise.allSettled(promises);
    } catch {}
  }

  return { statusCode: 200, headers, body: '{"ok":true}' };
};

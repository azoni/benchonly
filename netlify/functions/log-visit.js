import admin from 'firebase-admin';

const MCP_URL = process.env.MCP_URL || "https://azoni-mcp.onrender.com";
const MCP_KEY = process.env.MCP_ADMIN_KEY;
const PORTFOLIO_URL = "https://azoni.netlify.app/.netlify/functions/log-agent-activity";
const PORTFOLIO_SECRET = process.env.AGENT_WEBHOOK_SECRET;

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

  const promises = [];

  // Write to portfolio Firestore (primary — what the dashboard reads)
  if (PORTFOLIO_SECRET) {
    promises.push(
      fetch(PORTFOLIO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "site_visit", title: "Site visit", source: "benchpressonly", secret: PORTFOLIO_SECRET }),
      }).catch(() => {})
    );
  }

  // Also forward to MCP
  if (MCP_KEY) {
    promises.push(
      fetch(`${MCP_URL}/activity/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${MCP_KEY}` },
        body: JSON.stringify({ type: "site_visit", title: "Site visit", source: "benchpressonly" }),
      }).catch(() => {})
    );
  }

  // Send page view summary
  const pageViews = await getTodayPageViewCount();
  if (pageViews > 0 && PORTFOLIO_SECRET) {
    promises.push(
      fetch(PORTFOLIO_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "page_view_summary", title: `${pageViews} page views today`, source: "benchpressonly", secret: PORTFOLIO_SECRET }),
      }).catch(() => {})
    );
  }

  await Promise.allSettled(promises);
  return { statusCode: 200, headers, body: '{"ok":true}' };
};

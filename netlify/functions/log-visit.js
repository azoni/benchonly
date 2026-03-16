const MCP_URL = process.env.MCP_URL || "https://azoni-mcp.onrender.com";
const MCP_KEY = process.env.MCP_ADMIN_KEY;
const PORTFOLIO_URL = "https://azoni.netlify.app/.netlify/functions/log-agent-activity";
const PORTFOLIO_SECRET = process.env.AGENT_WEBHOOK_SECRET;

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

  await Promise.allSettled(promises);
  return { statusCode: 200, headers, body: '{"ok":true}' };
};

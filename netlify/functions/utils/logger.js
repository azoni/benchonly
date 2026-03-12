const MCP_URL = process.env.MCP_URL || 'https://azoni-mcp.onrender.com';
const MCP_KEY = process.env.MCP_ADMIN_KEY;

/**
 * Fire-and-forget activity logger — logs to MCP ecosystem feed.
 */
export function logActivity({ type, title, description, model, tokens, cost, metadata }) {
  if (!MCP_KEY) return;
  fetch(`${MCP_URL}/activity/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MCP_KEY}` },
    body: JSON.stringify({
      type, title, source: 'benchpressonly',
      description: description || '', model, tokens, cost, metadata,
    }),
  }).catch(e => console.error('[activity-log] Failed:', e.message));
}

/**
 * Fire-and-forget error logger — reports errors to MCP ecosystem.
 */
export function logError(fn, error, severity = 'high', context = {}) {
  logActivity({
    type: 'error_logged',
    title: `[${fn}] ${error?.message || String(error)}`.slice(0, 120),
    description: error?.stack || '',
    metadata: { severity, function: fn, ...context },
  });
}
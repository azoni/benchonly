const AZONI_BASE = 'https://azoni.ai/.netlify/functions';

/**
 * Fire-and-forget activity logger — logs AI usage to azoni.ai portfolio
 */
export function logActivity({ type, title, description, reasoning, model, tokens, cost, metadata }) {
  const secret = process.env.AGENT_WEBHOOK_SECRET;
  if (!secret) return;
  fetch(`${AZONI_BASE}/log-agent-activity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type, title, description: description || '', reasoning: reasoning || '',
      source: 'benchpressonly', model, tokens, cost, metadata: metadata || {}, secret,
    }),
  }).catch(e => console.error('[activity-log] Failed:', e.message));
}

/**
 * Fire-and-forget error logger — reports errors to azoni.ai orchestrator
 * 
 * @param {string}  fn        - Function name (e.g. 'generate-workout')
 * @param {Error}   error     - The caught error object
 * @param {string}  severity  - 'low' | 'medium' | 'high' | 'critical'
 * @param {object}  context   - Additional context (action, userId, etc.)
 */
export function logError(fn, error, severity = 'high', context = {}) {
  const secret = process.env.AGENT_WEBHOOK_SECRET;
  if (!secret) return;
  fetch(`${AZONI_BASE}/log-error`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'benchpressonly',
      error: error?.message || String(error),
      stack: error?.stack || '',
      severity,
      context: { function: fn, ...context },
      secret,
    }),
  }).catch(e => console.error('[error-log] Failed:', e.message));
}
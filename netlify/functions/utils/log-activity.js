/**
 * Activity logger - fire-and-forget POST to azoni.ai activity feed.
 * 
 * Usage in any Netlify function:
 *   import { logActivity } from './utils/log-activity.js';
 *   
 *   // After AI call succeeds:
 *   logActivity({
 *     type: 'workout_generated',
 *     title: 'Generated Push Day Workout',
 *     description: '6 exercises, moderate intensity',
 *     model: 'gpt-4o-mini',
 *     tokens: { prompt: 1200, completion: 800, total: 2000 },
 *     cost: 0.00066,
 *     metadata: { workoutId: 'abc123' }
 *   });
 */

const ACTIVITY_WEBHOOK_URL = 'https://azoni.ai/.netlify/functions/log-agent-activity';

export function logActivity({ type, title, description, reasoning, model, tokens, cost, metadata }) {
  const secret = process.env.AGENT_WEBHOOK_SECRET;
  if (!secret) return;

  // Fire and forget — never block the response to the user
  fetch(ACTIVITY_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type,
      title,
      description: description || '',
      reasoning: reasoning || '',
      source: 'benchpressonly',
      model,
      tokens,
      cost,
      metadata: metadata || {},
      secret,
    }),
  }).catch((e) => console.error('[activity-log] Failed:', e.message));
}

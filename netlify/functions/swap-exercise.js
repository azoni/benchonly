import OpenAI from 'openai';
import { verifyAuth, UNAUTHORIZED, CORS_HEADERS, OPTIONS_RESPONSE } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';
import { checkRateLimit, deductCredits, refundCredits } from './utils/credits.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return OPTIONS_RESPONSE;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const auth = await verifyAuth(event);
  if (!auth) return UNAUTHORIZED;

  const rateCheck = await checkRateLimit(auth.uid, 'swap-exercise');
  if (!rateCheck.allowed) {
    return { statusCode: 429, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Too many requests.' }) };
  }

  const creditResult = await deductCredits(auth.uid, 'swap-exercise', null, auth.isAdmin);
  if (!creditResult.success) {
    return { statusCode: 402, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Not enough credits.' }) };
  }

  try {
    const { exerciseName, exerciseType, sets, workoutContext, reason } = JSON.parse(event.body);

    if (!exerciseName) {
      return { statusCode: 400, body: JSON.stringify({ error: 'exerciseName required' }) };
    }

    // Build a concise prompt
    const setsDescription = sets?.length > 0
      ? `Current prescription: ${sets.length} sets, ${sets[0].prescribedWeight ? sets[0].prescribedWeight + 'lb × ' : ''}${sets[0].prescribedReps || sets[0].prescribedTime || '?'}`
      : '';

    const otherExercises = workoutContext?.otherExercises?.join(', ') || '';

    const prompt = `Replace "${exerciseName}" with a similar exercise.
${setsDescription}
${exerciseType === 'bodyweight' ? 'This is a bodyweight exercise.' : exerciseType === 'time' ? 'This is a time-based exercise.' : ''}
${reason ? `Reason for swap: ${reason}` : ''}
${otherExercises ? `Other exercises already in this workout (avoid duplicates): ${otherExercises}` : ''}

Respond ONLY with valid JSON, no markdown fences:
{
  "name": "Exercise Name",
  "notes": "Brief coaching note",
  "type": "${exerciseType || 'weight'}",
  "sets": [${sets?.map((s, i) => {
    if (exerciseType === 'time') return `{"prescribedTime": "${s.prescribedTime || '30s'}", "targetRpe": ${s.targetRpe || 'null'}}`;
    if (exerciseType === 'bodyweight') return `{"prescribedReps": ${s.prescribedReps || 10}, "targetRpe": ${s.targetRpe || 'null'}}`;
    return `{"prescribedWeight": ${s.prescribedWeight || 'null'}, "prescribedReps": ${s.prescribedReps || 8}, "targetRpe": ${s.targetRpe || 'null'}}`;
  }).join(', ') || ''}]
}

Rules:
- Same muscle group and movement pattern as the original
- Similar difficulty and rep range
- Keep the same number of sets (${sets?.length || 3})
- Adjust weight if the new exercise typically uses different loads
- RESPOND WITH ONLY THE JSON`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a strength coach. Suggest exercise alternatives. Respond only with JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.8,
      max_tokens: 300,
    });

    const responseText = completion.choices[0].message.content;
    const cleanJson = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    
    let exercise;
    try {
      exercise = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.error('Parse error:', parseErr, '\nRaw:', responseText);
      logError('swap-exercise', parseErr, 'medium', { action: 'parse-response', exercise: exerciseName });
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to parse AI response' }) };
    }

    const usage = completion.usage;
    logActivity({
      type: 'exercise_swapped',
      title: `Swapped: ${exerciseName} → ${exercise.name}`,
      description: reason || 'User requested exercise swap',
      model: 'gpt-4o-mini',
      tokens: usage?.total_tokens || 0,
      cost: ((usage?.prompt_tokens || 0) / 1e6) * 0.15 + ((usage?.completion_tokens || 0) / 1e6) * 0.60,
      metadata: { original: exerciseName, replacement: exercise.name, type: exerciseType },
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exercise, originalName: exerciseName }),
    };
  } catch (err) {
    console.error('Swap exercise error:', err);
    logError('swap-exercise', err, 'high', { action: 'swap' });
    await refundCredits(auth.uid, creditResult.cost || 1, auth.isAdmin);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Failed to swap exercise' }),
    };
  }
};

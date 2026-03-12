import OpenAI from 'openai';
import { verifyAuth, UNAUTHORIZED, getCorsHeaders, optionsResponse } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';
import { checkRateLimit, deductCredits, refundCredits } from './utils/credits.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const handler = async (event) => {
  const cors = getCorsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return optionsResponse(event);
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: cors, body: 'Method not allowed' };
  }

  const auth = await verifyAuth(event);
  if (!auth) return UNAUTHORIZED;

  const rateCheck = await checkRateLimit(auth.uid, 'generate-exercise-notes');
  if (!rateCheck.allowed) {
    return { statusCode: 429, headers: cors, body: JSON.stringify({ error: 'Too many requests.' }) };
  }

  const creditResult = await deductCredits(auth.uid, 'generate-exercise-notes', null, auth.isAdmin);
  if (!creditResult.success) {
    return { statusCode: 402, headers: cors, body: JSON.stringify({ error: 'Not enough credits.' }) };
  }

  try {
    const { exerciseName, exerciseType } = JSON.parse(event.body);
    if (!exerciseName) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: 'exerciseName required' }) };
    }

    const prompt = `Generate coaching information for the exercise "${exerciseName}" (type: ${exerciseType || 'weight'}).

Respond ONLY with valid JSON, no markdown fences:
{
  "howTo": "1-2 sentence description of how to perform the exercise with correct form",
  "cues": ["form cue 1", "form cue 2", "form cue 3"],
  "substitutions": ["alternative exercise 1", "alternative exercise 2", "alternative exercise 3"]
}

Rules:
- howTo should be concise but specific to ${exerciseName}
- cues should be 2-3 brief phrases (not full sentences)
- substitutions should be 2-3 exercises targeting the same muscle group
- RESPOND WITH ONLY THE JSON`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a strength coach. Generate exercise coaching information. Respond only with JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 300,
    });

    const responseText = completion.choices[0].message.content;
    const cleanJson = responseText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

    let notes;
    try {
      notes = JSON.parse(cleanJson);
    } catch (parseErr) {
      console.error('Parse error:', parseErr, '\nRaw:', responseText);
      logError('generate-exercise-notes', parseErr, 'medium', { action: 'parse-response', exercise: exerciseName });
      return { statusCode: 500, headers: cors, body: JSON.stringify({ error: 'Failed to parse AI response' }) };
    }

    const usage = completion.usage;
    logActivity({
      type: 'exercise_notes_generated',
      title: `Notes: ${exerciseName}`,
      description: 'Generated exercise coaching notes',
      model: 'gpt-4o-mini',
      tokens: usage?.total_tokens || 0,
      cost: ((usage?.prompt_tokens || 0) / 1e6) * 0.15 + ((usage?.completion_tokens || 0) / 1e6) * 0.60,
      metadata: { exercise: exerciseName, type: exerciseType },
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
      body: JSON.stringify({
        howTo: notes.howTo || '',
        cues: Array.isArray(notes.cues) ? notes.cues : [],
        substitutions: Array.isArray(notes.substitutions) ? notes.substitutions : [],
      }),
    };
  } catch (err) {
    console.error('Generate exercise notes error:', err);
    logError('generate-exercise-notes', err, 'medium', { action: 'generate' });
    await refundCredits(auth.uid, creditResult.cost || 1, auth.isAdmin);
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message || 'Failed to generate notes' }),
    };
  }
};

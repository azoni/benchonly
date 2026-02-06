import OpenAI from 'openai';
import admin from 'firebase-admin';

// Initialize Firebase Admin
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

const db = admin.apps.length ? admin.firestore() : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { userId, prompt, workoutFocus, intensity, context } = JSON.parse(event.body);

    if (!userId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'userId required' }),
      };
    }

    if (!db) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Firebase not configured. Add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY to Netlify.' }),
      };
    }

    const contextStr = buildContext(context, workoutFocus, intensity);

    const systemPrompt = `You are an expert strength coach. Create a personalized workout considering:
- Max lifts (use 70-85% of e1RM for working sets)
- Pain history (AVOID or SUBSTITUTE those exercises)
- RPE patterns (adjust intensity accordingly)
- Goals (prioritize goal lifts)
- Recent workout history (build on what they've been doing)

OUTPUT JSON:
{
  "name": "Workout Name",
  "description": "Brief description",
  "estimatedDuration": 45,
  "notes": "Coaching notes explaining workout design and any modifications for pain/RPE.",
  "exercises": [
    {
      "name": "Exercise Name",
      "type": "weight",
      "sets": [{ "prescribedReps": 8, "prescribedWeight": 185, "targetRpe": 7 }],
      "restSeconds": 90,
      "notes": "Form cues"
    }
  ]
}`;

    const userPrompt = `Create a workout:\n\n${contextStr}\n\n${prompt ? `USER REQUEST: ${prompt}` : ''}`;

    const startTime = Date.now();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 2000,
    });

    const responseTime = Date.now() - startTime;
    const usage = completion.usage;

    let workout;
    try {
      workout = JSON.parse(completion.choices[0].message.content);
    } catch {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'AI returned invalid JSON' }),
      };
    }

    // Save to Firestore
    const workoutData = {
      name: workout.name || 'AI Workout',
      description: workout.description || '',
      notes: workout.notes || '',
      estimatedDuration: workout.estimatedDuration || null,
      exercises: (workout.exercises || []).map((ex, i) => ({
        id: Date.now() + i,
        name: ex.name,
        type: ex.type || 'weight',
        sets: (ex.sets || []).map((s, j) => ({
          id: Date.now() + i * 100 + j,
          prescribedWeight: String(s.prescribedWeight || ''),
          prescribedReps: String(s.prescribedReps || ''),
          targetRpe: s.targetRpe || null,
          actualWeight: '',
          actualReps: '',
          rpe: '',
          painLevel: 0,
          completed: false,
        })),
        restSeconds: ex.restSeconds || 90,
        notes: ex.notes || '',
        expanded: true,
      })),
      status: 'scheduled',
      date: new Date(),
      userId,
      generatedByAI: true,
      aiModel: 'gpt-4o-mini',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection('workouts').add(workoutData);
    const cost = (usage.prompt_tokens / 1e6) * 0.15 + (usage.completion_tokens / 1e6) * 0.60;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        workoutId: docRef.id,
        workout: { ...workout, id: docRef.id },
        usage: {
          model: 'gpt-4o-mini',
          tokens: usage.total_tokens,
          responseMs: responseTime,
          cost: `$${cost.toFixed(6)}`,
        },
      }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message }),
    };
  }
}

function buildContext(ctx, focus, intensity) {
  let s = '';
  if (focus && focus !== 'auto') s += `FOCUS: ${focus}\n`;
  
  const intMap = { light: 'Light (RPE 5-6)', moderate: 'Moderate (RPE 7-8)', heavy: 'Heavy (RPE 8-9)', max: 'Max (RPE 9-10)' };
  s += `INTENSITY: ${intMap[intensity] || 'Moderate'}\n\n`;

  const lifts = Object.entries(ctx?.maxLifts || {});
  if (lifts.length) {
    s += 'MAX LIFTS (use 70-85% for working sets):\n';
    lifts.sort((a, b) => b[1].e1rm - a[1].e1rm).slice(0, 10).forEach(([n, d]) => {
      s += `  ${n}: ${d.e1rm}lb e1RM (best: ${d.weight}lb x ${d.reps})\n`;
    });
    s += '\n';
  } else {
    s += 'MAX LIFTS: No data - use conservative weights\n\n';
  }

  const pain = Object.entries(ctx?.painHistory || {});
  if (pain.length) {
    s += 'PAIN HISTORY [MUST AVOID OR SUBSTITUTE]:\n';
    pain.forEach(([n, d]) => { 
      s += `  ${n}: ${d.maxPain}/10 pain (${d.count}x)\n`; 
    });
    s += '\n';
  }

  const rpe = Object.entries(ctx?.rpeAverages || {});
  if (rpe.length) {
    const avgAll = rpe.reduce((sum, [_, v]) => sum + v, 0) / rpe.length;
    s += `RPE PATTERNS (overall avg: ${avgAll.toFixed(1)}):\n`;
    rpe.slice(0, 6).forEach(([n, v]) => {
      let note = '';
      if (v > 8.5) note = ' [rates hard - be conservative]';
      else if (v < 6) note = ' [can push more]';
      s += `  ${n}: ${v}${note}\n`;
    });
    s += '\n';
  }

  if (ctx?.goals?.length) {
    s += 'GOALS:\n';
    ctx.goals.slice(0, 4).forEach(g => {
      s += `  ${g.lift}: ${g.currentWeight || g.currentValue || '?'} -> ${g.targetWeight || g.targetValue}\n`;
    });
    s += '\n';
  }

  if (ctx?.recentWorkouts?.length) {
    s += `RECENT WORKOUTS (${ctx.recentWorkouts.length}):\n`;
    ctx.recentWorkouts.slice(0, 5).forEach(w => {
      s += `  ${w.date || 'Recent'}: ${w.name || 'Workout'}\n`;
      (w.exercises || []).slice(0, 4).forEach(ex => {
        const sets = ex.sets || [];
        const wt = sets[0]?.actualWeight || sets[0]?.prescribedWeight;
        const rp = sets[0]?.actualReps || sets[0]?.prescribedReps;
        if (wt || rp) s += `    ${ex.name}: ${wt || '?'}lb x ${rp || '?'} (${sets.length} sets)\n`;
      });
    });
    s += '\n';
  }

  return s;
}
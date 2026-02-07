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
    const { userId, prompt, workoutFocus, intensity, context, model, settings } = JSON.parse(event.body);

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

    // Get admin settings (or use defaults)
    const adminSettings = settings || {
      painThresholdMin: 3,
      painThresholdCount: 2,
    };

    const contextStr = buildContext(context, workoutFocus, intensity, adminSettings);

    // Select model based on request
    const selectedModel = model === 'premium' ? 'gpt-4o' : 'gpt-4o-mini';

    const systemPrompt = `You are an expert strength coach. Create a personalized workout.

CRITICAL RULES FOR REPEATING PREVIOUS WORKOUTS:
If the user asks to "repeat", "same as", "copy", or reference a previous workout:
1. Use the EXACT same exercises from that workout - NO substitutions unless explicitly allowed
2. Use the EXACT same number of sets and reps
3. ONLY adjust WEIGHTS based on:
   - Did user complete all prescribed reps? → Increase weight 2.5-5%
   - Was RPE low (under 7)? → Increase weight 5%
   - Was RPE very high (9-10)? → Keep same or decrease slightly
   - Any pain reported? → Add warning in notes but DON'T substitute unless user allows
4. If user says "no substitutions" - NEVER substitute, only add warnings in notes

STANDARD WORKOUT RULES:
- Max lifts (use 70-85% of e1RM for working sets)
- Pain history (AVOID or SUBSTITUTE those exercises - unless told not to)
- RPE patterns (adjust intensity accordingly)
- Goals (prioritize goal lifts)
- Recent workout history (build on what they've been doing)
- Cardio/activity load (factor in overall training stress)

WEIGHT PROGRESSION LOGIC:
- Completed all reps at target RPE 7-8: Add 5 lbs (upper) or 5-10 lbs (lower)
- Completed all reps at RPE 6 or below: Add 5-10 lbs
- Missed reps or RPE 9+: Keep same weight or reduce 5%
- Pain reported on exercise: DO NOT increase weight, add note about monitoring

OUTPUT JSON only, no markdown:
{
  "name": "Workout Name",
  "description": "Brief description",
  "estimatedDuration": 45,
  "notes": "Coaching notes explaining workout design, weight selections, and any modifications or warnings.",
  "exercises": [
    {
      "name": "Exercise Name",
      "type": "weight",
      "sets": [{ "prescribedReps": 8, "prescribedWeight": 185, "targetRpe": 7 }],
      "restSeconds": 90,
      "notes": "Form cues or warnings"
    }
  ]
}`;

    const userPrompt = `Create a workout:\n\n${contextStr}\n\n${prompt ? `USER REQUEST: ${prompt}` : ''}`;

    const startTime = Date.now();
    const completion = await openai.chat.completions.create({
      model: selectedModel,
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

    // Calculate cost based on model
    let cost;
    if (selectedModel === 'gpt-4o') {
      // GPT-4o: $2.50/$10.00 per 1M tokens
      cost = (usage.prompt_tokens / 1e6) * 2.50 + (usage.completion_tokens / 1e6) * 10.00;
    } else {
      // GPT-4o-mini: $0.15/$0.60 per 1M tokens
      cost = (usage.prompt_tokens / 1e6) * 0.15 + (usage.completion_tokens / 1e6) * 0.60;
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
      aiModel: selectedModel,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection('workouts').add(workoutData);

    // Log AI usage for tracking
    try {
      await db.collection('tokenUsage').add({
        userId,
        feature: 'generate-workout',
        model: selectedModel,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        estimatedCost: cost,
        responseTimeMs: responseTime,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error('Failed to log usage:', e);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        workoutId: docRef.id,
        workout: { ...workout, id: docRef.id },
        usage: {
          model: selectedModel,
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

function buildContext(ctx, focus, intensity, settings = {}) {
  const painThresholdMin = settings.painThresholdMin || 3;
  const painThresholdCount = settings.painThresholdCount || 2;
  
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

  // Filter pain to only significant patterns
  const pain = Object.entries(ctx?.painHistory || {}).filter(([_, d]) => 
    d.maxPain >= painThresholdMin || d.count >= painThresholdCount
  );
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

  // Include cardio/activity data
  if (ctx?.cardioHistory?.length) {
    s += 'RECENT CARDIO/ACTIVITY (factor into recovery):\n';
    ctx.cardioHistory.slice(0, 5).forEach(c => {
      const duration = c.duration ? `${c.duration}min` : '';
      const distance = c.distance ? `${c.distance}mi` : '';
      s += `  ${c.date || 'Recent'}: ${c.activityType || c.name || 'Activity'} ${duration} ${distance}\n`;
    });
    s += '\n';
  }

  if (ctx?.recentWorkouts?.length) {
    s += `\nRECENT WORKOUTS (${ctx.recentWorkouts.length} total) - IMPORTANT FOR REPEAT REQUESTS:\n`;
    ctx.recentWorkouts.slice(0, 5).forEach(w => {
      const dayName = w.dayOfWeek || '';
      s += `  [${w.date || 'Recent'}${dayName ? ` ${dayName}` : ''}] "${w.name || 'Workout'}"\n`;
      (w.exercises || []).forEach(ex => {
        const sets = ex.sets || [];
        if (sets.length === 0) return;
        
        // Show each set's details for accurate repeat
        const setDetails = sets.map((set, i) => {
          const prescribed = `${set.prescribedWeight || '?'}x${set.prescribedReps || '?'}`;
          const actual = set.actualWeight || set.actualReps ? 
            `→${set.actualWeight || '?'}x${set.actualReps || '?'}` : '';
          const rpeStr = set.rpe ? ` RPE:${set.rpe}` : '';
          const painStr = set.painLevel && set.painLevel > 0 ? ` PAIN:${set.painLevel}` : '';
          const completed = set.completed ? '✓' : '';
          return `${prescribed}${actual}${rpeStr}${painStr}${completed}`;
        }).join(', ');
        
        s += `    ${ex.name}: ${setDetails}\n`;
      });
    });
    s += '\n';
  }

  return s;
}

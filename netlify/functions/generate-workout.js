import OpenAI from 'openai';
import { verifyAuth, UNAUTHORIZED, CORS_HEADERS, OPTIONS_RESPONSE, admin } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';

const db = admin.apps.length ? admin.firestore() : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return OPTIONS_RESPONSE;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const auth = await verifyAuth(event);
  if (!auth) return UNAUTHORIZED;

  try {
    const { prompt, workoutFocus, intensity, context, model, settings, draftMode: draftModeInput, targetUserId } = JSON.parse(event.body);
    // Use targetUserId only if caller is admin (for impersonation)
    const userId = (auth.isAdmin && targetUserId) ? targetUserId : auth.uid;
    // Enforce admin-only premium model
    const selectedModel = (model === 'premium' && auth.isAdmin) ? 'gpt-4o' : 'gpt-4o-mini';

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

EXERCISE TYPES:
- "weight": Standard weighted exercises (bench press, squat, rows). Sets have prescribedWeight and prescribedReps.
- "bodyweight": No external weight (pull-ups, push-ups, dips). Sets have prescribedReps only (NO prescribedWeight).
- "time": Time-based exercises (planks, dead hangs, wall sits). Sets have prescribedTime (in seconds) only.

OUTPUT JSON only, no markdown:
{
  "name": "Workout Name",
  "description": "Brief description",
  "estimatedDuration": 45,
  "notes": "Coaching notes explaining workout design, weight selections, and any modifications or warnings.",
  "exercises": [
    {
      "name": "Bench Press",
      "type": "weight",
      "sets": [
        { "prescribedReps": 8, "prescribedWeight": 185, "targetRpe": 7 },
        { "prescribedReps": 8, "prescribedWeight": 185, "targetRpe": 7 },
        { "prescribedReps": 8, "prescribedWeight": 185, "targetRpe": 8 },
        { "prescribedReps": 8, "prescribedWeight": 185, "targetRpe": 8 }
      ],
      "restSeconds": 90,
      "notes": "Form cues or warnings"
    },
    {
      "name": "Pull-ups",
      "type": "bodyweight",
      "sets": [
        { "prescribedReps": 10, "targetRpe": 7 },
        { "prescribedReps": 10, "targetRpe": 7 },
        { "prescribedReps": 10, "targetRpe": 8 }
      ],
      "restSeconds": 90,
      "notes": "Strict form, full ROM"
    },
    {
      "name": "Dead Hang",
      "type": "time",
      "sets": [
        { "prescribedTime": 45, "targetRpe": 7 },
        { "prescribedTime": 45, "targetRpe": 7 },
        { "prescribedTime": 45, "targetRpe": 8 }
      ],
      "restSeconds": 60,
      "notes": "Active shoulders, full grip"
    }
  ]
}

IMPORTANT: Each exercise MUST have 3-5 separate set objects in the "sets" array. If you prescribe 4x8 for bench press, the "sets" array must contain 4 individual objects. NEVER return just 1 set object — always return the full number of sets. This is critical.`;

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
      max_tokens: 4000,
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

    // Post-processing: expand exercises that only have 1 set (AI sometimes gets lazy)
    // If an exercise has only 1 set, duplicate it to 3 or 4 sets
    if (workout.exercises && Array.isArray(workout.exercises)) {
      workout.exercises = workout.exercises.map(ex => {
        if (ex.sets && ex.sets.length === 1) {
          const template = ex.sets[0];
          const targetSets = ex.type === 'time' ? 3 : 4;
          ex.sets = Array.from({ length: targetSets }, () => ({ ...template }));
        }
        return ex;
      });
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

    // Save to Firestore (skip if draft mode)
    const draftMode = draftModeInput === true;
    const workoutData = {
      name: workout.name || 'AI Workout',
      description: workout.description || '',
      notes: workout.notes || '',
      estimatedDuration: workout.estimatedDuration || null,
      exercises: (workout.exercises || []).map((ex, i) => ({
        id: Date.now() + i,
        name: ex.name,
        type: ex.type || 'weight',
        sets: (ex.sets || []).map((s, j) => {
          const base = {
            id: Date.now() + i * 100 + j,
            targetRpe: s.targetRpe || null,
            rpe: '',
            painLevel: 0,
            completed: false,
          };
          if (ex.type === 'time') {
            return {
              ...base,
              prescribedTime: String(s.prescribedTime || ''),
              actualTime: '',
            };
          }
          if (ex.type === 'bodyweight') {
            return {
              ...base,
              prescribedReps: String(s.prescribedReps || ''),
              actualReps: '',
            };
          }
          return {
            ...base,
            prescribedWeight: String(s.prescribedWeight || ''),
            prescribedReps: String(s.prescribedReps || ''),
            actualWeight: '',
            actualReps: '',
          };
        }),
        restSeconds: ex.restSeconds || 90,
        notes: ex.notes || '',
        expanded: true,
      })),
      status: 'scheduled',
      date: new Date(),
      userId,
      generatedByAI: true,
      aiModel: selectedModel,
    };

    let workoutId = null;
    if (!draftMode) {
      workoutData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      const docRef = await db.collection('workouts').add(workoutData);
      workoutId = docRef.id;
    }

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
        draftMode,
        userMessage: `Generate ${workoutFocus || 'auto'} workout (${intensity || 'moderate'})`,
        assistantResponse: `${workout.name || 'Workout'}: ${(workout.exercises || []).map(e => e.name).join(', ')}`.slice(0, 500),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error('Failed to log usage:', e);
    }

    // Log to portfolio activity feed (only on actual save)
    if (!draftMode && workoutId) {
      logActivity({
        type: 'workout_generated',
        title: `Generated Workout: ${workout.name || 'AI Workout'}`,
        description: `${(workout.exercises || []).length} exercises, ${selectedModel}`,
        model: selectedModel,
        tokens: { prompt: usage.prompt_tokens, completion: usage.completion_tokens, total: usage.total_tokens },
        cost,
        metadata: { workoutId, exerciseCount: (workout.exercises || []).length },
      });
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        workoutId,
        workout: workoutData,
        draftMode,
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
    logError('generate-workout', error, 'high', { action: 'generate' });
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
  if (focus === 'no-equipment') {
    s += `FOCUS: Bodyweight only — NO equipment whatsoever. Use exercises like push-ups, pull-ups (if available), squats, lunges, planks, burpees, dips, glute bridges, mountain climbers, etc. Set type to 'bodyweight' or 'time' for all exercises.\n`;
  } else if (focus === 'vacation') {
    s += `FOCUS: Hotel/travel workout — minimal or no equipment. Assume only bodyweight and maybe a single set of light dumbbells or resistance band. Keep it 20-35 min. Prioritize compound movements and circuits. Set type to 'bodyweight' or 'time' for exercises without weights.\n`;
  } else if (focus && focus !== 'auto') {
    s += `FOCUS: ${focus}\n`;
  }
  
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
    s += 'PAIN HISTORY:\n';
    pain.forEach(([n, d]) => {
      let status
      if (d.recentCount > 0) {
        status = `ACTIVE — last ${d.lastDaysAgo}d ago. AVOID or SUBSTITUTE.`
      } else if (d.lastDaysAgo !== null && d.lastDaysAgo > 60) {
        status = `RECOVERING (${d.lastDaysAgo}d ago) — OK to include cautiously at reduced load. Note: "Stop if discomfort."`
      } else if (d.lastDaysAgo !== null) {
        status = `FADING (${d.lastDaysAgo}d ago) — include at reduced intensity if needed.`
      } else {
        status = `${d.count}x total — AVOID or SUBSTITUTE.`
      }
      s += `  ${n}: ${d.maxPain}/10 peak — ${status}\n`;
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
      const current = g.currentValue ?? g.currentWeight ?? '?'
      const target = g.targetValue ?? g.targetWeight ?? '?'
      const unit = g.metricType === 'reps' ? ' reps' : g.metricType === 'time' ? 'sec' : 'lb'
      s += `  ${g.lift}: ${current} -> ${target}${unit}\n`;
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

  // Include Oura Ring recovery data
  if (ctx?.ouraData) {
    const { latest, averages } = ctx.ouraData;
    s += 'OURA RING DATA (adjust workout intensity based on recovery):\n';
    if (latest?.readiness?.score) {
      s += `  Readiness Score: ${latest.readiness.score}/100`;
      if (latest.readiness.score < 70) s += ' (LOW - consider reducing intensity)';
      else if (latest.readiness.score >= 85) s += ' (HIGH - good for heavy training)';
      s += '\n';
    }
    if (latest?.sleep?.score) {
      s += `  Sleep Score: ${latest.sleep.score}/100`;
      if (latest.sleep.score < 70) s += ' (POOR SLEEP - reduce volume/intensity)';
      s += '\n';
    }
    if (latest?.activity?.score) {
      s += `  Activity Score: ${latest.activity.score}/100\n`;
    }
    if (averages?.readinessScore) {
      s += `  7-Day Avg Readiness: ${averages.readinessScore}/100\n`;
    }
    if (averages?.sleepScore) {
      s += `  7-Day Avg Sleep: ${averages.sleepScore}/100\n`;
    }
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
import OpenAI from 'openai';
import { verifyAuth, UNAUTHORIZED, getCorsHeaders, optionsResponse, admin } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';
import { checkRateLimit, deductCredits, refundCredits } from './utils/credits.js';

const db = admin.apps.length ? admin.firestore() : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function handler(event) {
  const cors = getCorsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return optionsResponse(event);

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const auth = await verifyAuth(event);
  if (!auth) return UNAUTHORIZED;

  // Rate limit
  const rateCheck = await checkRateLimit(auth.uid, 'generate-group-workout');
  if (!rateCheck.allowed) {
    return { statusCode: 429, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Too many requests. Please wait a moment.' }) };
  }

  let creditCost = 0;

  try {
    const { groupId, athletes, prompt, workoutDate, model, settings, workoutFocus, intensity, duration, exerciseCount, maxExercise } = JSON.parse(event.body);
    const coachId = auth.uid;

    // Credit cost: 5 per athlete (or 100 for premium)
    creditCost = model === 'premium' ? 100 : (athletes?.length || 1) * 5;

    // Server-side credit deduction
    const creditResult = await deductCredits(coachId, 'generate-group-workout', creditCost, auth.isAdmin);
    if (!creditResult.success) {
      return { statusCode: 402, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: `Not enough credits. Need ${creditCost}, have ${creditResult.balance}.` }) };
    }

    if (!groupId || !athletes?.length) {
      await refundCredits(coachId, creditCost, auth.isAdmin);
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...cors },
        body: JSON.stringify({ error: 'groupId and athletes required' }),
      };
    }

    if (!db) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', ...cors },
        body: JSON.stringify({ error: 'Firebase not configured. Add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY to Netlify.' }),
      };
    }

    // Get admin settings (or use defaults)
    const adminSettings = settings || {
      painThresholdMin: 3,
      painThresholdCount: 2,
    };

    // Model selection - enforce admin-only premium
    const selectedModel = (model === 'premium' && auth.isAdmin) ? 'gpt-4.1-mini' : 'gpt-4o-mini';

    // Fetch group data for Firestore rules compliance
    let groupAdmins = [coachId];
    let groupMembers = [coachId];
    try {
      const groupDoc = await db.collection('groups').doc(groupId).get();
      if (groupDoc.exists) {
        const groupData = groupDoc.data();
        groupAdmins = groupData.admins || [coachId];
        groupMembers = groupData.members || [coachId];
      }
    } catch (e) {
      console.error('Failed to fetch group:', e);
    }

    const contextStr = buildGroupContext(athletes, adminSettings, workoutFocus, intensity, duration, exerciseCount, maxExercise);

    const systemPrompt = `You are an expert strength coach creating personalized workouts for a group.

CRITICAL RULES FOR REPEATING PREVIOUS WORKOUTS:
If the coach asks to "repeat", "same as", "copy", or reference a previous workout:
1. Use the EXACT same exercises from that workout - NO substitutions unless explicitly allowed
2. Use the EXACT same number of sets and reps
3. ONLY adjust WEIGHTS based on:
   - Did athlete complete all prescribed reps? → Increase weight 2.5-5%
   - Was RPE low (under 7)? → Increase weight 5%
   - Was RPE very high (9-10)? → Keep same or decrease slightly
   - Any pain reported? → Add warning in notes but DON'T substitute unless coach allows
4. Each athlete may have done DIFFERENT exercises on the same day - respect their individual workout
5. If coach says "no substitutions" - NEVER substitute, only add warnings in notes

STANDARD WORKOUT RULES:
1. Same exercises for all athletes (group consistency) for NEW workouts
2. Personalize WEIGHTS based on each athlete's max lifts (70-85% of e1RM)
3. AVOID or SUBSTITUTE exercises where athlete has pain history (unless told not to)
4. Consider RPE patterns when setting weights
5. Factor in cardio/activity load when considering recovery
6. Include coaching notes explaining your reasoning

NO TRAINING DATA:
If an athlete has NO max lift data, set weights very conservatively (bar weight or 50-65 lbs for upper body, 95-135 lbs for lower body). Add a note: "No training history — weights set conservatively. Track this session to enable personalized loads next time."

WARM-UP GUIDANCE:
For the first compound lift, include warm-up ramp sets in the exercise "notes" field for each athlete. Scale warm-up to their working weight. Skip warm-up notes for isolation/accessory exercises.

DURATION & EXERCISE COUNT:
If a target duration or exercise count is specified, respect it. Adjust total volume so the workout fits.

1RM TEST PROTOCOL:
If the focus is "1rm-test", generate a max-attempt session for the specified exercise per athlete:
1. The target lift with progressive warm-up sets ramping from ~40% to ~90% of each athlete's e1RM, then 2-3 max attempt singles. Include detailed attempt plan in exercise notes with real weights.
2. 1-2 light accessory exercises as cooldown (2 sets each).
3. Name the workout "1RM Test: [Exercise Name]".
For athletes with no e1RM data, use conservative warm-up and let them work up by feel.

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
  "coachingNotes": "Explanation of workout focus, exercise selection, and programming intent. Include any warnings about pain or form issues.",
  "baseExercises": [
    { "name": "Bench Press", "type": "weight", "defaultSets": 4, "defaultReps": 8 },
    { "name": "Pull-ups", "type": "bodyweight", "defaultSets": 3, "defaultReps": 10 },
    { "name": "Dead Hang", "type": "time", "defaultSets": 3, "defaultTime": 30 }
  ],
  "athleteWorkouts": {
    "ATHLETE_ID": {
      "athleteName": "Name",
      "personalNotes": "Notes for this athlete explaining weight selections, any concerns, and modifications.",
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
          "notes": "Form cues or warnings",
          "substitution": null
        },
        {
          "name": "Pull-ups",
          "type": "bodyweight",
          "sets": [
            { "prescribedReps": 10, "targetRpe": 7 },
            { "prescribedReps": 10, "targetRpe": 7 },
            { "prescribedReps": 10, "targetRpe": 8 }
          ],
          "notes": "Full ROM",
          "substitution": null
        },
        {
          "name": "Dead Hang",
          "type": "time",
          "sets": [
            { "prescribedTime": 30, "targetRpe": 7 },
            { "prescribedTime": 30, "targetRpe": 7 },
            { "prescribedTime": 30, "targetRpe": 8 }
          ],
          "notes": "Active shoulders",
          "substitution": null
        }
      ]
    }
  }
}

IMPORTANT: Each exercise MUST have 3-5 separate set objects in the "sets" array matching the defaultSets count. If defaultSets is 4, include 4 individual objects. NEVER return just 1 set object — always return the full number of sets. This is critical.

For pain substitutions (only when allowed): "substitution": { "reason": "shoulder pain", "original": "Bench Press", "replacement": "Floor Press" }`;

    const userPrompt = `Create a group workout:\n\n${contextStr}\n\n${prompt ? `COACH REQUEST: ${prompt}` : 'Generate appropriate strength workout.'}`;

    const startTime = Date.now();
    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 6000,
    });

    const responseTime = Date.now() - startTime;
    const usage = completion.usage;

    let result;
    try {
      result = JSON.parse(completion.choices[0].message.content);
    } catch {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', ...cors },
        body: JSON.stringify({ error: 'AI returned invalid JSON' }),
      };
    }

    // Post-processing: expand exercises that only have 1 set (AI sometimes gets lazy)
    if (result.athleteWorkouts) {
      for (const aw of Object.values(result.athleteWorkouts)) {
        if (aw.exercises && Array.isArray(aw.exercises)) {
          aw.exercises = aw.exercises.map(ex => {
            if (ex.sets && ex.sets.length === 1) {
              const template = ex.sets[0];
              // Use defaultSets from baseExercises if available, otherwise default to 3-4
              const baseEx = (result.baseExercises || []).find(b => b.name === ex.name);
              const targetSets = baseEx?.defaultSets || (ex.type === 'time' ? 3 : 4);
              ex.sets = Array.from({ length: targetSets }, () => ({ ...template }));
            }
            return ex;
          });
        }
      }
    }

    if (!result.athleteWorkouts) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', ...cors },
        body: JSON.stringify({ error: 'AI response missing athleteWorkouts' }),
      };
    }

    // Parse date
    let parsedDate = new Date();
    if (workoutDate) {
      const [y, m, d] = workoutDate.split('-').map(Number);
      parsedDate = new Date(y, m - 1, d, 12, 0, 0);
    }

    // Save workouts to Firestore
    const createdWorkouts = [];
    for (const [athleteId, aw] of Object.entries(result.athleteWorkouts)) {
      const workoutData = {
        name: result.name || 'AI Group Workout',
        description: result.description || '',
        coachingNotes: result.coachingNotes || '',
        personalNotes: aw.personalNotes || '',
        exercises: (aw.exercises || []).map((ex, i) => ({
          id: Date.now() + i,
          name: ex.substitution?.replacement || ex.name,
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
          notes: ex.notes || (ex.substitution ? `Modified: ${ex.substitution.reason}` : ''),
          expanded: true,
        })),
        status: 'scheduled',
        date: parsedDate,
        assignedTo: athleteId,
        assignedBy: coachId,
        groupId,
        groupAdmins,
        groupMembers,
        generatedByAI: true,
        aiModel: selectedModel,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const docRef = await db.collection('groupWorkouts').add(workoutData);
      createdWorkouts.push({ athleteId, workoutId: docRef.id, athleteName: aw.athleteName });
    }

    // Cost calculation - GPT-4.1-mini: $0.40/$1.60 per 1M, GPT-4o-mini: $0.15/$0.60 per 1M
    const isPremium = selectedModel === 'gpt-4.1-mini';
    const inputRate = isPremium ? 0.40 : 0.15;
    const outputRate = isPremium ? 1.60 : 0.60;
    const cost = (usage.prompt_tokens / 1e6) * inputRate + (usage.completion_tokens / 1e6) * outputRate;

    // Log AI usage for tracking
    try {
      await db.collection('tokenUsage').add({
        userId: coachId,
        feature: 'generate-group-workout',
        model: selectedModel,
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
        estimatedCost: cost,
        responseTimeMs: responseTime,
        athleteCount: athletes.length,
        groupId,
        userMessage: `Group workout for ${athletes.length} athletes${prompt ? `: ${prompt.slice(0, 200)}` : ''}`,
        assistantResponse: `${result.name || 'Workout'} (${athletes.length} athletes)`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error('Failed to log usage:', e);
    }

    // Log to portfolio activity feed
    logActivity({
      type: 'group_workout_generated',
      title: `Group Workout: ${result.name || 'AI Group Workout'}`,
      description: `${athletes.length} athletes, ${selectedModel}`,
      model: selectedModel,
      tokens: { prompt: usage.prompt_tokens, completion: usage.completion_tokens, total: usage.total_tokens },
      cost,
      metadata: { groupId, athleteCount: athletes.length },
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...cors },
      body: JSON.stringify({
        success: true,
        workoutName: result.name,
        coachingNotes: result.coachingNotes,
        baseExercises: result.baseExercises,
        athleteWorkouts: result.athleteWorkouts,
        createdWorkouts,
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
    logError('generate-group-workout', error, 'high', { action: 'generate' });
    await refundCredits(auth.uid, creditCost, auth.isAdmin);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...cors },
      body: JSON.stringify({ error: error.message }),
    };
  }
}

function buildGroupContext(athletes, settings = {}, focus = 'auto', intensity = 'moderate', duration = null, exerciseCount = null, maxExercise = null) {
  const painThresholdMin = settings.painThresholdMin || 3;
  const painThresholdCount = settings.painThresholdCount || 2;
  
  let s = `GROUP: ${athletes.length} athletes\n`;

  // 1RM test mode
  if (focus === '1rm-test' && maxExercise) {
    s += `\nFOCUS: 1RM TEST for ${maxExercise}\nGenerate a max-attempt session following the 1RM TEST PROTOCOL.\n`;
  } else {
    if (focus && focus !== 'auto') {
      if (focus === 'no-equipment') {
        s += `\nFOCUS: Bodyweight only — NO equipment.\n`;
      } else {
        s += `\nFOCUS: ${focus}\n`;
      }
    }
    const intMap = { light: 'Light (RPE 5-6)', moderate: 'Moderate (RPE 7-8)', heavy: 'Heavy (RPE 8-9)', max: 'Max (RPE 9-10)' };
    s += `INTENSITY: ${intMap[intensity] || 'Moderate'}\n`;
    if (duration) s += `TARGET DURATION: ${duration} minutes.\n`;
    if (exerciseCount) s += `TARGET EXERCISES: ${exerciseCount} exercises.\n`;
  }
  s += '\n';

  athletes.forEach((a) => {
    s += `--- ${a.name} (ID: ${a.id}) ---\n`;

    const lifts = Object.entries(a.maxLifts || {});
    if (lifts.length) {
      s += 'Maxes: ';
      s += lifts.sort((x, y) => y[1].e1rm - x[1].e1rm).slice(0, 6).map(([n, d]) => 
        `${n} ${d.e1rm}lb (${d.weight}x${d.reps})`
      ).join(', ');
      s += '\n';
    } else {
      s += 'Maxes: No data (use conservative weights)\n';
    }

    // Only flag pain if significant based on settings
    const pain = Object.entries(a.painHistory || {});
    const significantPain = pain.filter(([_, d]) => d.maxPain >= painThresholdMin || d.count >= painThresholdCount);
    if (significantPain.length) {
      s += 'PAIN HISTORY: ';
      s += significantPain.map(([n, d]) => `${n} (${d.maxPain}/10, ${d.count}x)`).join(', ');
      s += '\n';
    }

    const rpe = Object.entries(a.rpeAverages || {});
    if (rpe.length) {
      const avg = rpe.reduce((sum, [_, v]) => sum + v, 0) / rpe.length;
      s += `Avg RPE: ${avg.toFixed(1)}`;
      if (avg > 8.5) s += ' [rates hard - be conservative]';
      else if (avg < 6.5) s += ' [can push harder]';
      s += '\n';
    }

    if (a.goals?.length) {
      s += 'Goals: ' + a.goals.slice(0, 3).map(g => 
        `${g.lift}: ${g.currentWeight || g.currentValue || '?'}->${g.targetWeight || g.targetValue}`
      ).join(', ') + '\n';
    }

    // Include cardio/activity data
    if (a.cardioHistory?.length) {
      s += 'Recent Cardio: ';
      s += a.cardioHistory.slice(0, 3).map(c => {
        const duration = c.duration ? `${c.duration}min` : '';
        return `${c.activityType || c.name || 'Activity'} ${duration}`;
      }).join(', ');
      s += '\n';
    }

    // DETAILED recent workout history for repeating workouts
    if (a.recentWorkouts?.length) {
      s += `\nRECENT WORKOUTS (${a.recentWorkouts.length} total):\n`;
      a.recentWorkouts.slice(0, 3).forEach(w => {
        const dayName = w.dayOfWeek || '';
        s += `  [${w.date || 'Recent'}${dayName ? ` ${dayName}` : ''}] "${w.name || 'Workout'}"\n`;
        (w.exercises || []).forEach(ex => {
          const sets = ex.sets || [];
          if (sets.length === 0) return;
          
          // Show each set's details
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
    }

    s += '\n';
  });

  return s;
}
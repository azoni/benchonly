import { verifyAuth, UNAUTHORIZED, getCorsHeaders, optionsResponse, admin } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';
import { checkRateLimit, deductCredits, refundCredits } from './utils/credits.js';
import OpenAI from 'openai';

const db = admin.apps.length ? admin.firestore() : null;
const INTERNAL_KEY = process.env.INTERNAL_FUNCTION_KEY || 'form-check-internal';

export async function handler(event) {
  const cors = getCorsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return optionsResponse(event);
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const auth = await verifyAuth(event);
  if (!auth) return UNAUTHORIZED;

  const rateCheck = await checkRateLimit(auth.uid, 'generate-group-workout');
  if (!rateCheck.allowed) {
    return { statusCode: 429, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Too many requests.' }) };
  }

  let creditCost = 0;

  try {
    const { groupId, athletes, prompt, workoutDate, model, workoutFocus, intensity, duration, exerciseCount, maxExercise, includeWarmup = false, includeStretches = false, jobId } = JSON.parse(event.body);
    const coachId = auth.uid;

    creditCost = model === 'premium' ? 100 : (athletes?.length || 1) * 5;

    const creditResult = await deductCredits(coachId, 'generate-group-workout', creditCost, auth.isAdmin);
    if (!creditResult.success) {
      return { statusCode: 402, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: `Not enough credits. Need ${creditCost}, have ${creditResult.balance}.` }) };
    }

    if (!groupId || !athletes?.length) {
      await refundCredits(coachId, creditCost, auth.isAdmin);
      return { statusCode: 400, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'groupId and athletes required' }) };
    }

    if (!db) {
      await refundCredits(coachId, creditCost, auth.isAdmin);
      return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Database unavailable' }) };
    }

    const selectedModel = (model === 'premium' && auth.isAdmin) ? 'gpt-4.1-mini' : 'gpt-4o-mini';

    // Fetch group data
    let groupAdmins = [coachId], groupMembers = [coachId];
    try {
      const groupDoc = await db.collection('groups').doc(groupId).get();
      if (groupDoc.exists) {
        const gd = groupDoc.data();
        groupAdmins = gd.admins || [coachId];
        groupMembers = gd.members || [coachId];
      }
    } catch (e) { console.error('Failed to fetch group:', e); }

    const contextStr = buildGroupContext(athletes, { painThresholdMin: 3, painThresholdCount: 2 }, workoutFocus, intensity, duration, exerciseCount, maxExercise, includeWarmup, includeStretches);
    const systemPrompt = buildSystemPrompt();

    // ─── Store job and invoke background function ───
    const actualJobId = jobId || `ggw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const jobRef = db.collection('groupWorkoutJobs').doc(actualJobId);
    await jobRef.set({
      coachId, status: 'pending',
      athletes, prompt: prompt || '', workoutDate: workoutDate || null,
      selectedModel, systemPrompt, contextStr,
      groupId, groupAdmins, groupMembers,
      creditCost, isAdmin: auth.isAdmin || false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Try background function
    const siteUrl = process.env.URL || 'https://benchpressonly.com';
    let backgroundOk = false;
    try {
      const bgResp = await fetch(`${siteUrl}/.netlify/functions/generate-group-workout-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: actualJobId, _internalKey: INTERNAL_KEY }),
      });
      if (bgResp.status === 202) backgroundOk = true;
      else console.warn('[group-workout] Background returned', bgResp.status);
    } catch (bgErr) {
      console.warn('[group-workout] Background failed:', bgErr.message);
    }

    if (backgroundOk) {
      logActivity({ type: 'group_workout_queued', title: 'Group Workout Queued', description: `${athletes.length} athletes`, metadata: { groupId } });
      return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ jobId: actualJobId, background: true }) };
    }

    // ─── Fallback: inline ───
    console.log('[group-workout] Processing inline');
    await jobRef.update({ status: 'processing' });

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 23000 });
    const userPrompt = `Create a group workout:\n\n${contextStr}\n\n${prompt ? `COACH REQUEST: ${prompt}` : 'Generate appropriate strength workout.'}`;
    const maxTokens = Math.min(2500 + (athletes.length * 1000), 8000);

    const startTime = Date.now();
    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      response_format: { type: 'json_object' }, temperature: 0.7, max_tokens: maxTokens,
    });
    const responseTime = Date.now() - startTime;
    const usage = completion.usage;

    let result;
    try { result = JSON.parse(completion.choices[0].message.content); }
    catch { return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'AI returned invalid JSON' }) }; }

    expandSingleSets(result);
    fillMissingExerciseInfo(result);
    if (!result.athleteWorkouts) return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'AI response missing athleteWorkouts' }) };

    const createdWorkouts = await saveWorkouts(result, athletes, coachId, groupId, groupAdmins, groupMembers, selectedModel, workoutDate, userPrompt);
    const cost = calcCost(usage, selectedModel);
    await logUsage(db, coachId, selectedModel, usage, cost, responseTime, athletes, groupId, prompt, result);

    const inlineResult = {
      success: true, workoutName: result.name, coachingNotes: result.coachingNotes,
      baseExercises: result.baseExercises, athleteWorkouts: result.athleteWorkouts, createdWorkouts,
      usage: { model: selectedModel, tokens: usage.total_tokens, responseMs: responseTime, cost: `$${cost.toFixed(6)}` },
    };
    await jobRef.update({ status: 'complete', result: inlineResult }).catch(() => {});
    return { statusCode: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(inlineResult) };

  } catch (error) {
    console.error('Error:', error);
    logError('generate-group-workout', error, 'high', { action: 'generate' });
    await refundCredits(auth.uid, creditCost, auth.isAdmin);
    return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: error.message }) };
  }
}

// ─── Shared helpers ───

function expandSingleSets(result) {
  if (!result.athleteWorkouts) return;
  for (const aw of Object.values(result.athleteWorkouts)) {
    if (aw.exercises && Array.isArray(aw.exercises)) {
      aw.exercises = aw.exercises.map(ex => {
        if (ex.sets && ex.sets.length === 1) {
          const t = ex.sets[0];
          const baseEx = (result.baseExercises || []).find(b => b.name === ex.name);
          const n = baseEx?.defaultSets || (ex.type === 'time' ? 3 : 4);
          ex.sets = Array.from({ length: n }, (_, i) => {
            const s = { ...t };
            if (i === 0 && n >= 3 && s.prescribedWeight) {
              const w = parseFloat(s.prescribedWeight);
              if (w > 0) s.prescribedWeight = String(Math.round((w * 0.85) / 5) * 5);
            }
            return s;
          });
        }
        return ex;
      });
    }
  }
}

function fillMissingExerciseInfo(result) {
  if (!result.athleteWorkouts) return;
  for (const aw of Object.values(result.athleteWorkouts)) {
    (aw.exercises || []).forEach(ex => {
      const name = (ex.name || '').trim();
      if (!ex.howTo && !/^(warm.?up|cool.?down|stretch)/i.test(name)) {
        ex.howTo = `Perform ${name} with controlled form through a full range of motion. Focus on the target muscles and maintain a steady tempo.`;
      }
      if (!Array.isArray(ex.cues) || ex.cues.length === 0) {
        if (!/^(warm.?up|cool.?down|stretch)/i.test(name)) {
          ex.cues = ['Control the eccentric (lowering) phase', 'Maintain proper posture throughout', 'Breathe out on exertion'];
        }
      }
      if (!Array.isArray(ex.substitutions) || ex.substitutions.length === 0) {
        ex.substitutions = [];
      }
    });
  }
}

async function saveWorkouts(result, athletes, coachId, groupId, groupAdmins, groupMembers, selectedModel, workoutDate, userPrompt) {
  let parsedDate = new Date();
  if (workoutDate) { const [y, m, d] = workoutDate.split('-').map(Number); parsedDate = new Date(y, m - 1, d, 12, 0, 0); }

  const created = [];
  for (const [athleteId, aw] of Object.entries(result.athleteWorkouts)) {
    const workoutData = {
      name: result.name || 'AI Group Workout', description: result.description || '',
      coachingNotes: result.coachingNotes || '', personalNotes: aw.personalNotes || '',
      exercises: (aw.exercises || []).map((ex, i) => ({
        id: Date.now() + i, name: ex.substitution?.replacement || ex.name, type: ex.type || 'weight',
        howTo: ex.howTo || '', cues: Array.isArray(ex.cues) ? ex.cues : [], substitutions: Array.isArray(ex.substitutions) ? ex.substitutions : [],
        sets: (ex.sets || []).map((s, j) => {
          const base = { id: Date.now() + i * 100 + j, targetRpe: s.targetRpe || null, rpe: '', painLevel: 0, completed: false };
          if (ex.type === 'time') return { ...base, prescribedTime: String(s.prescribedTime || ''), actualTime: '' };
          if (ex.type === 'bodyweight') return { ...base, prescribedReps: String(s.prescribedReps || ''), actualReps: '' };
          return { ...base, prescribedWeight: String(s.prescribedWeight || ''), prescribedReps: String(s.prescribedReps || ''), actualWeight: '', actualReps: '' };
        }),
        notes: ex.notes || (ex.substitution ? `Modified: ${ex.substitution.reason}` : ''), expanded: true,
      })),
      status: 'scheduled', date: parsedDate, assignedTo: athleteId, assignedBy: coachId,
      groupId, groupAdmins, groupMembers, generatedByAI: true, aiModel: selectedModel, generationPrompt: userPrompt,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const docRef = await db.collection('groupWorkouts').add(workoutData);
    created.push({ athleteId, workoutId: docRef.id, athleteName: aw.athleteName });
  }
  return created;
}

function calcCost(usage, model) {
  const isPremium = model === 'gpt-4.1-mini';
  return (usage.prompt_tokens / 1e6) * (isPremium ? 0.40 : 0.15) + (usage.completion_tokens / 1e6) * (isPremium ? 1.60 : 0.60);
}

async function logUsage(database, coachId, model, usage, cost, responseTime, athletes, groupId, prompt, result) {
  try {
    await database.collection('tokenUsage').add({
      userId: coachId, feature: 'generate-group-workout', model,
      promptTokens: usage.prompt_tokens, completionTokens: usage.completion_tokens, totalTokens: usage.total_tokens,
      estimatedCost: cost, responseTimeMs: responseTime, athleteCount: athletes.length, groupId,
      userMessage: `Group workout for ${athletes.length} athletes${prompt ? `: ${prompt.slice(0, 200)}` : ''}`,
      assistantResponse: `${result.name || 'Workout'} (${athletes.length} athletes)`,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) { console.error('Failed to log usage:', e); }

  logActivity({
    type: 'group_workout_generated', title: `Group Workout: ${result.name || 'AI Group Workout'}`,
    description: `${athletes.length} athletes, ${model}`, model,
    tokens: { prompt: usage.prompt_tokens, completion: usage.completion_tokens, total: usage.total_tokens },
    cost, metadata: { groupId, athleteCount: athletes.length },
  });
}

function buildSystemPrompt() {
  return `You are an expert strength coach creating personalized workouts for a group.

CRITICAL RULES FOR REPEATING PREVIOUS WORKOUTS:
If the coach asks to "repeat", "same as", "copy", or reference a previous workout:
1. Use the EXACT same exercises from that workout - NO substitutions unless explicitly allowed
2. Use the EXACT same number of sets and reps
3. ONLY adjust WEIGHTS based on RPE/completion
4. Each athlete may have done DIFFERENT exercises - respect their individual workout
5. If coach says "no substitutions" - NEVER substitute, only add warnings in notes

STANDARD WORKOUT RULES:
1. Same exercises for all athletes (group consistency) for NEW workouts
2. Personalize WEIGHTS based on each athlete's max lifts — see INTENSITY SCALING below
3. AVOID or SUBSTITUTE exercises where athlete has pain history (unless told not to)
4. Consider RPE patterns when setting weights
5. Factor in cardio/activity load when considering recovery
6. Include coaching notes explaining your reasoning

EXERCISE DATABASE — pick from these based on focus. Use the EXACT names listed here:

CHEST: Bench Press, Incline Bench Press, Decline Bench Press, Close-Grip Bench Press, Floor Press, Paused Bench Press, Spoto Press, Larsen Press, DB Bench Press, Incline DB Press, Cable Flyes, Incline Cable Flyes, Pec Deck, DB Flyes, Machine Chest Press, Push-ups
SHOULDERS: Overhead Press, DB Shoulder Press, Push Press, Arnold Press, Landmine Press, Z Press, Lateral Raises, Cable Lateral Raises, Rear Delt Flyes, Face Pulls, Front Raises, Upright Rows, Band Pull-Aparts
TRICEPS: Tricep Pushdowns, Overhead Tricep Extensions, Skull Crushers, Dips, JM Press, French Press, Diamond Push-ups
BACK: Barbell Rows, Pendlay Rows, T-Bar Rows, Dumbbell Rows, Meadows Rows, Seal Rows, Cable Rows, Chest-Supported Rows, Kroc Rows, Pull-ups, Chin-ups, Lat Pulldowns, Close-Grip Pulldowns, Straight-Arm Pulldowns, Shrugs, Rack Pulls
BICEPS: Barbell Curls, DB Curls, Hammer Curls, Incline DB Curls, Preacher Curls, Cable Curls, Spider Curls, EZ Bar Curls, Reverse Curls
QUADS: Squats, Front Squats, Goblet Squats, Hack Squats, Leg Press, Pause Squats, Bulgarian Split Squats, Walking Lunges, Reverse Lunges, Step-ups, Leg Extensions
HAMSTRINGS/GLUTES: Romanian Deadlifts, Stiff-Leg Deadlifts, Conventional Deadlifts, Sumo Deadlifts, Trap Bar Deadlifts, Good Mornings, Hip Thrusts, Leg Curls, Nordic Curls, Glute-Ham Raises, Kettlebell Swings, Back Extensions
CORE: Planks, Ab Wheel Rollouts, Hanging Leg Raises, Cable Crunches, Pallof Press, Farmer's Walks, Dead Bugs

FOCUS COMBINATIONS:
- PUSH: 1-2 chest compounds + 1 shoulder + 1-2 tricep/accessory
- PULL: 1-2 back compounds + 1 vertical pull + 1-2 bicep/accessory
- LEGS: 1-2 quad compounds + 1-2 hamstring/glute + 1 calf/core
- UPPER: 1 push compound + 1 pull compound + 2-3 accessories
- FULL BODY: 1 lower compound + 1 upper push + 1 upper pull + 1-2 accessories
- BENCH FOCUS: Bench variation as main + 2-3 chest/tricep accessories

ROTATE exercises — do NOT repeat what athletes did last session. Mix familiar exercises (for accurate weights) with new ones.
Pick exercises from this database AND the athletes' existing exercises. Prioritize compound movements.

WEIGHT CALCULATION — USE EACH ATHLETE'S DATA:
When setting weights, follow this priority:
1. If athlete has e1RM data for the EXACT exercise: use intensity scaling below
2. If athlete has data for a RELATED exercise, infer:
   Bench-related: Incline ≈ 75-80%, Close-Grip ≈ 85-90%, Floor Press ≈ 85%, DB Bench ≈ 40-45% per hand
   Press-related: OHP ≈ 60-65% of Bench, Push Press ≈ 70%, DB Shoulder Press ≈ 30-35% per hand
   Row-related: Barbell Row ≈ 70-80% of Bench, DB Row ≈ 35-40% per hand, T-Bar Row ≈ 65-75%
   Squat-related: Front Squat ≈ 80-85%, Goblet Squat ≈ 25-30%, Hack Squat ≈ 80-90%
   Deadlift-related: RDL ≈ 70-75%, Sumo ≈ 95-100%, Trap Bar ≈ 100-105%
   General: DB variations ≈ 40-45% of barbell per hand, Cable exercises ≈ light-moderate
3. If NO related data: conservative defaults and note it

GROUP COACHING:
- personalNotes MUST be athlete-specific — reference their recent performance, strengths, or areas to improve
- If one athlete is significantly stronger, note pairing for work-in logistics
- Call out specific form cues or RPE targets that differ per athlete

WEIGHT CEILING — CRITICAL:
- NEVER prescribe working set weight above 90% of e1RM, EVER. The only exception is a 1RM test.
- e1RM means estimated 1-rep max. You CANNOT do your e1RM for triples. A 325lb e1RM means ~295 for a triple at RPE 9-10.
- If an athlete did 295x3 last session, do NOT jump to 305-325x3. Add 5 lbs max (300x3) or keep the same.
- Working sets should feel HARD but COMPLETABLE. Prescribing weights the athlete cannot physically lift destroys trust.

INTENSITY SCALING (% of e1RM):
- Light (RPE 5-6): 60-70% of e1RM, reps 10-15
- Moderate (RPE 7-8): 70-80% of e1RM, reps 6-10
- Heavy (RPE 8-9): 80-88% of e1RM, reps 3-6
- Max (RPE 9-10): 85-92% of e1RM, reps 1-3
Round all weights to the nearest 5 lbs.
IMPORTANT: Each athlete's data below includes pre-computed TARGET weight ranges. USE THOSE RANGES — do not calculate your own.

WEIGHT PROGRESSION FROM LAST SESSION:
- Completed all reps at RPE 7-8: Add 5 lbs (upper) or 5-10 lbs (lower)
- Completed all reps at RPE 6 or below: Add 5-10 lbs
- Missed reps or RPE 9+: Keep same weight or reduce 5%
- Pain reported: DO NOT increase weight

NO TRAINING DATA:
If an athlete has NO max lift data, set weights very conservatively (bar weight or 50-65 lbs upper, 95-135 lbs lower). Note: "No training history — weights set conservatively."

WARM-UP GUIDANCE:
If the context specifies INCLUDE_WARMUP: true, add a "Warm-up" exercise as the FIRST exercise with type "time", 2-3 sets of 60-90 seconds of dynamic movements. Describe in "notes".
If INCLUDE_WARMUP is false, skip it but still include warm-up ramp sets in the "notes" of the first compound lift per athlete.

STRETCHING GUIDANCE:
If the context specifies INCLUDE_STRETCHES: true, add a "Cool-down Stretches" exercise as the LAST exercise with type "time", 2-3 sets of 45-60 seconds of static stretches targeting muscles worked. Describe in "notes".
If INCLUDE_STRETCHES is false, skip it.

DURATION & EXERCISE COUNT:
If specified, respect it. Adjust total volume to fit.

1RM TEST PROTOCOL:
If focus is "1rm-test", generate max-attempt session: progressive warm-up ~40% to ~90% e1RM, then 2-3 max singles. 1-2 light accessories as cooldown. Name: "1RM Test: [Exercise]".

EXERCISE TYPES:
- "weight": prescribedWeight + prescribedReps
- "bodyweight": prescribedReps only (NO prescribedWeight)
- "time": prescribedTime (seconds) only

EXERCISE INFO — for each exercise include:
- "howTo": 1-2 sentence description of how to perform the exercise with correct form
- "cues": Array of 2-3 short key form cues (brief phrases, not full sentences)
- "substitutions": Array of 2-3 alternative exercises if equipment is unavailable or the exercise causes discomfort

OUTPUT JSON only, no markdown:
{
  "name": "Workout Name",
  "description": "Brief description",
  "coachingNotes": "Programming explanation with warnings.",
  "baseExercises": [
    { "name": "Bench Press", "type": "weight", "defaultSets": 4, "defaultReps": 8 }
  ],
  "athleteWorkouts": {
    "ATHLETE_ID": {
      "athleteName": "Name",
      "personalNotes": "Notes for this athlete.",
      "exercises": [
        {
          "name": "Bench Press", "type": "weight",
          "howTo": "Lie flat on bench, grip bar slightly wider than shoulders, lower to mid-chest at ~45° elbow angle, press to lockout.",
          "cues": ["Shoulder blades squeezed", "Feet driving into floor", "Controlled descent"],
          "substitutions": ["DB Bench Press", "Floor Press", "Push-ups"],
          "sets": [
            { "prescribedReps": 8, "prescribedWeight": 185, "targetRpe": 7 },
            { "prescribedReps": 8, "prescribedWeight": 185, "targetRpe": 8 }
          ],
          "notes": "Form cues", "substitution": null
        }
      ]
    }
  }
}

IMPORTANT: Each exercise MUST have 3-5 separate set objects matching defaultSets. NEVER return just 1 set.
For pain substitutions: "substitution": { "reason": "shoulder pain", "original": "Bench Press", "replacement": "Floor Press" }`;
}

function buildGroupContext(athletes, settings = {}, focus = 'auto', intensity = 'moderate', duration = null, exerciseCount = null, maxExercise = null, includeWarmup = false, includeStretches = false) {
  const painMin = settings.painThresholdMin || 3;
  const painCount = settings.painThresholdCount || 2;
  let s = `GROUP: ${athletes.length} athletes\n`;
  s += `INCLUDE_WARMUP: ${includeWarmup ? 'true' : 'false'}\n`;
  s += `INCLUDE_STRETCHES: ${includeStretches ? 'true' : 'false'}\n`;

  const intRanges = { light: [0.60, 0.70], moderate: [0.70, 0.80], heavy: [0.80, 0.88], max: [0.85, 0.92] };
  const range = intRanges[intensity] || intRanges.moderate;

  if (focus === '1rm-test' && maxExercise) {
    s += `\nFOCUS: 1RM TEST for ${maxExercise}\nGenerate a max-attempt session following the 1RM TEST PROTOCOL.\n`;
  } else {
    if (focus && focus !== 'auto') {
      s += `\nFOCUS: ${focus === 'no-equipment' ? 'Bodyweight only' : focus}\n`;
    } else {
      s += `\nFOCUS: auto — pick the best focus based on athletes' recent workout patterns.\n`;
    }
    const intMap = { light: 'Light (RPE 5-6)', moderate: 'Moderate (RPE 7-8)', heavy: 'Heavy (RPE 8-9)', max: 'Max (RPE 9-10)' };
    s += `INTENSITY: ${intMap[intensity] || 'Moderate'}\n`;
    if (duration) s += `TARGET DURATION: ${duration} minutes.\n`;
    if (exerciseCount) s += `TARGET EXERCISES: ${exerciseCount} exercises.\n`;
  }
  s += '\n';

  athletes.forEach(a => {
    s += `--- ${a.name} (ID: ${a.id}) ---\n`;
    const lifts = Object.entries(a.maxLifts || {});
    if (lifts.length) {
      s += 'Maxes (with TARGET weight range for this intensity):\n';
      lifts.sort((x, y) => y[1].e1rm - x[1].e1rm).slice(0, 6).forEach(([n, d]) => {
        const lo = Math.round((d.e1rm * range[0]) / 5) * 5;
        const hi = Math.round((d.e1rm * range[1]) / 5) * 5;
        s += `  ${n}: e1RM ${d.e1rm}lb (${d.weight}x${d.reps}) → TARGET: ${lo}-${hi} lbs\n`;
      });
    } else { s += 'Maxes: No data (use conservative weights)\n'; }

    const pain = Object.entries(a.painHistory || {}).filter(([_, d]) => d.maxPain >= painMin || d.count >= painCount);
    if (pain.length) {
      s += 'PAIN: ' + pain.map(([n, d]) => {
        let status = `${d.maxPain}/10, ${d.count}x`;
        if (d.recentCount > 0) status += ` ACTIVE ${d.lastDaysAgo}d ago`;
        else if (d.lastDaysAgo != null) status += ` last ${d.lastDaysAgo}d ago`;
        return `${n} (${status})`;
      }).join(', ') + '\n';
    }

    const rpe = Object.entries(a.rpeAverages || {});
    if (rpe.length) {
      const avg = rpe.reduce((sum, [_, v]) => sum + v, 0) / rpe.length;
      s += `Avg RPE: ${avg.toFixed(1)}${avg > 8.5 ? ' [conservative]' : avg < 6.5 ? ' [push harder]' : ''}\n`;
    }

    if (a.goals?.length) s += 'Goals: ' + a.goals.slice(0, 3).map(g => `${g.lift}: ${g.currentWeight || '?'}->${g.targetWeight || g.targetValue}`).join(', ') + '\n';

    if (a.recentWorkouts?.length) {
      s += `Recent (${a.recentWorkouts.length}):\n`;
      a.recentWorkouts.slice(0, 3).forEach(w => {
        s += `  [${w.date || '?'}] "${w.name || 'Workout'}"\n`;
        (w.exercises || []).forEach(ex => {
          const sets = ex.sets || [];
          if (!sets.length) return;
          const details = sets.map(set => {
            let r = `${set.prescribedWeight || '?'}x${set.prescribedReps || '?'}`;
            if (set.actualWeight || set.actualReps) r += `→${set.actualWeight || '?'}x${set.actualReps || '?'}`;
            if (set.rpe) r += ` RPE:${set.rpe}`;
            if (set.painLevel > 0) r += ` PAIN:${set.painLevel}`;
            return r;
          }).join(', ');
          s += `    ${ex.name}: ${details}\n`;
        });
      });
    }
    s += '\n';
  });
  return s;
}

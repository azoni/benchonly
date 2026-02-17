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
    const { groupId, athletes, prompt, workoutDate, model, workoutFocus, intensity, duration, exerciseCount, maxExercise, includeWarmup = true, includeStretches = false, jobId } = JSON.parse(event.body);
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
    const maxTokens = Math.min(2000 + (athletes.length * 1000), 8000);

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
    if (!result.athleteWorkouts) return { statusCode: 500, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'AI response missing athleteWorkouts' }) };

    const createdWorkouts = await saveWorkouts(result, athletes, coachId, groupId, groupAdmins, groupMembers, selectedModel, workoutDate);
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
          ex.sets = Array.from({ length: n }, () => ({ ...t }));
        }
        return ex;
      });
    }
  }
}

async function saveWorkouts(result, athletes, coachId, groupId, groupAdmins, groupMembers, selectedModel, workoutDate) {
  let parsedDate = new Date();
  if (workoutDate) { const [y, m, d] = workoutDate.split('-').map(Number); parsedDate = new Date(y, m - 1, d, 12, 0, 0); }

  const created = [];
  for (const [athleteId, aw] of Object.entries(result.athleteWorkouts)) {
    const workoutData = {
      name: result.name || 'AI Group Workout', description: result.description || '',
      coachingNotes: result.coachingNotes || '', personalNotes: aw.personalNotes || '',
      exercises: (aw.exercises || []).map((ex, i) => ({
        id: Date.now() + i, name: ex.substitution?.replacement || ex.name, type: ex.type || 'weight',
        sets: (ex.sets || []).map((s, j) => {
          const base = { id: Date.now() + i * 100 + j, targetRpe: s.targetRpe || null, rpe: '', painLevel: 0, completed: false };
          if (ex.type === 'time') return { ...base, prescribedTime: String(s.prescribedTime || ''), actualTime: '' };
          if (ex.type === 'bodyweight') return { ...base, prescribedReps: String(s.prescribedReps || ''), actualReps: '' };
          return { ...base, prescribedWeight: String(s.prescribedWeight || ''), prescribedReps: String(s.prescribedReps || ''), actualWeight: '', actualReps: '' };
        }),
        notes: ex.notes || (ex.substitution ? `Modified: ${ex.substitution.reason}` : ''), expanded: true,
      })),
      status: 'scheduled', date: parsedDate, assignedTo: athleteId, assignedBy: coachId,
      groupId, groupAdmins, groupMembers, generatedByAI: true, aiModel: selectedModel,
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

WEIGHT CEILING — CRITICAL:
- NEVER prescribe working set weight above 90% of e1RM, EVER. The only exception is a 1RM test.
- e1RM means estimated 1-rep max. You CANNOT do your e1RM for triples. A 325lb e1RM means ~295 for a triple at RPE 9-10.
- If an athlete did 295x3 last session, do NOT jump to 305-325x3. Add 5 lbs max (300x3) or keep the same.
- Working sets should feel HARD but COMPLETABLE. Prescribing weights the athlete cannot physically lift destroys trust.

INTENSITY SCALING (% of e1RM):
- Light (RPE 5-6): 60-70% of e1RM, reps 10-15. Example: 325 e1RM → 195-225 lbs
- Moderate (RPE 7-8): 70-80% of e1RM, reps 6-10. Example: 325 e1RM → 225-260 lbs
- Heavy (RPE 8-9): 80-88% of e1RM, reps 3-6. Example: 325 e1RM → 260-285 lbs
- Max (RPE 9-10): 85-92% of e1RM, reps 1-3. Example: 325 e1RM → 275-300 lbs
Round all weights to the nearest 5 lbs.

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

function buildGroupContext(athletes, settings = {}, focus = 'auto', intensity = 'moderate', duration = null, exerciseCount = null, maxExercise = null, includeWarmup = true, includeStretches = false) {
  const painMin = settings.painThresholdMin || 3;
  const painCount = settings.painThresholdCount || 2;
  let s = `GROUP: ${athletes.length} athletes\n`;
  s += `INCLUDE_WARMUP: ${includeWarmup ? 'true' : 'false'}\n`;
  s += `INCLUDE_STRETCHES: ${includeStretches ? 'true' : 'false'}\n`;

  if (focus === '1rm-test' && maxExercise) {
    s += `\nFOCUS: 1RM TEST for ${maxExercise}\nGenerate a max-attempt session following the 1RM TEST PROTOCOL.\n`;
  } else {
    if (focus && focus !== 'auto') s += `\nFOCUS: ${focus === 'no-equipment' ? 'Bodyweight only' : focus}\n`;
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
      s += 'Maxes: ' + lifts.sort((x, y) => y[1].e1rm - x[1].e1rm).slice(0, 6).map(([n, d]) => `${n} ${d.e1rm}lb (${d.weight}x${d.reps})`).join(', ') + '\n';
    } else { s += 'Maxes: No data (use conservative weights)\n'; }

    const pain = Object.entries(a.painHistory || {}).filter(([_, d]) => d.maxPain >= painMin || d.count >= painCount);
    if (pain.length) s += 'PAIN: ' + pain.map(([n, d]) => `${n} (${d.maxPain}/10, ${d.count}x)`).join(', ') + '\n';

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

import OpenAI from 'openai';
import { verifyAuth, UNAUTHORIZED, getCorsHeaders, optionsResponse, admin } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';
import { checkRateLimit, deductCredits, refundCredits } from './utils/credits.js';

const db = admin.apps.length ? admin.firestore() : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 24000 });

export async function handler(event) {
  const cors = getCorsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return optionsResponse(event);

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const auth = await verifyAuth(event);
  if (!auth) return UNAUTHORIZED;

  // Rate limit
  const rateCheck = await checkRateLimit(auth.uid, 'generate-workout');
  if (!rateCheck.allowed) {
    return { statusCode: 429, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Too many requests. Please wait a moment.' }) };
  }

  let creditCost = 5;

  try {
    const { prompt, workoutFocus, intensity, context, model, settings, draftMode: draftModeInput, targetUserId, duration, exerciseCount, maxExercise, includeWarmup, includeStretches } = JSON.parse(event.body);
    // Use targetUserId only if caller is admin (for impersonation)
    const userId = (auth.isAdmin && targetUserId) ? targetUserId : auth.uid;
    // Enforce admin-only premium model
    const selectedModel = (model === 'premium' && auth.isAdmin) ? 'gpt-4.1-mini' : 'gpt-4o-mini';
    creditCost = model === 'premium' ? 100 : 5;

    // Server-side credit deduction
    const creditResult = await deductCredits(userId, 'generate-workout', creditCost, auth.isAdmin);
    if (!creditResult.success) {
      return { statusCode: 402, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: `Not enough credits. Need ${creditCost}, have ${creditResult.balance}.` }) };
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

    const contextStr = buildContext(context, workoutFocus, intensity, adminSettings, duration, exerciseCount, maxExercise, includeWarmup, includeStretches);

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

WARM-UP GUIDANCE:
If INCLUDE_WARMUP is true, the FIRST exercise in the workout should be a quick general warm-up:
- Name it "Warm-up" with type "time"
- Include 2-3 sets, each with a DIFFERENT dynamic movement relevant to the workout
- Each set MUST have a "setNote" describing the specific movement: e.g. "Arm circles & band pull-aparts"
- Set prescribedTime to 45-60 seconds per set
- Keep it under 5 minutes total
- IMPORTANT: Each set's setNote should name a specific movement, not just "warm-up". Tailor movements to the workout focus (e.g. push day → arm circles, band pull-aparts, push-up walk-outs; leg day → leg swings, hip circles, bodyweight squats)
Example sets: [{"prescribedTime": 60, "setNote": "Arm circles 20x each direction"}, {"prescribedTime": 60, "setNote": "Leg swings 10/side + hip circles"}, {"prescribedTime": 45, "setNote": "Band pull-aparts 15x"}]
If INCLUDE_WARMUP is false, skip the warm-up exercise entirely.

STRETCHING GUIDANCE:
If INCLUDE_STRETCHES is true, add a "Cool-down Stretches" exercise as the LAST exercise:
- Name it "Cool-down Stretches" with type "time"
- Include 2-3 sets, each with a DIFFERENT static stretch targeting muscles worked
- Each set MUST have a "setNote" describing the specific stretch: e.g. "Chest doorway stretch 30s/side"
- Set prescribedTime to 30-60 seconds per set
- IMPORTANT: Each set's setNote should name the specific stretch for that hold. Match stretches to the muscles trained (e.g. chest day → chest stretch, tricep stretch, lat stretch)
Example sets: [{"prescribedTime": 45, "setNote": "Chest doorway stretch 30s/side"}, {"prescribedTime": 45, "setNote": "Tricep overhead stretch 30s/side"}, {"prescribedTime": 45, "setNote": "Lat stretch 30s/side"}]
If INCLUDE_STRETCHES is false, skip the stretching exercise entirely.

For the first COMPOUND lift (bench, squat, OHP, deadlift), include ramp-up sets in the exercise "notes" field. Example:
"Warm-up: Bar x10, 95x8, 135x5, 185x3 → working sets"
Scale the warm-up to the working weight. Skip warm-up notes for isolation/accessory exercises.

DURATION & EXERCISE COUNT:
If a target duration or exercise count is specified, respect it:
- The exercise count means MAIN EXERCISES ONLY. Warm-up and Cool-down Stretches do NOT count toward this number. If the user asks for 5 exercises and warm-up is enabled, you produce: 1 warm-up + 5 main exercises = 6 total entries.
- Fewer exercises = more sets per exercise. More exercises = fewer sets each.
- Short workouts (15-20 min): 2-3 exercises, 2-3 sets each, minimal rest.
- Medium workouts (30-45 min): 4-5 exercises, 3-4 sets each.
- Long workouts (60-90 min): 5-8 exercises, 3-5 sets each.
- Adjust total volume so the workout fits the requested time.

WEIGHT SELECTION — CRITICAL:
- ALWAYS use the TARGET WEIGHT RANGE provided in the context for each lift. These ranges are pre-calculated from the user's actual maxes at the requested intensity. Do NOT exceed the upper bound.
- If a lift is not in the max lifts list, infer conservatively from related lifts (e.g. if bench is 225, incline DB press should be around 60-70% of that per arm).
- When in doubt, prescribe LIGHTER, not heavier. Users can always add weight; an overly heavy workout is dangerous and discouraging.
- For isolation/accessory exercises, use 50-65% of the main compound lift weight for that muscle group.

1RM TEST PROTOCOL:
If the focus is "1rm-test", generate a max-attempt session for the specified exercise:
1. Exercise 1: The target lift. Include 6-8 progressive warm-up sets ramping from ~40% to ~90% of estimated 1RM, then 2-3 max attempt singles at 95-105% e1RM. In the exercise "notes", write detailed warm-up/attempt plan:
   "Warm-up: Bar x5, [40%]x5, [50%]x3, [60%]x2, [70%]x1, [80%]x1, [90%]x1 → Attempts: [95%]x1, [100%]x1, [102-105%]x1. Rest 3-5 min between attempts."
   Use the actual e1RM data to calculate real weights rounded to nearest 5 lbs.
2. Exercise 2-3: 1-2 light accessory exercises (2 sets each) as a cooldown targeting muscles used in the main lift. Keep volume very low.
3. Set the workout name to "1RM Test: [Exercise Name]".
4. Set estimatedDuration to 30-40 minutes.

STANDARD WORKOUT RULES:
- Max lifts (use 70-85% of e1RM for working sets)
- Pain history (AVOID or SUBSTITUTE those exercises - unless told not to)
- RPE patterns (adjust intensity accordingly)
- Goals (prioritize goal lifts)
- Recent workout history (build on what they've been doing)
- Cardio/activity load (factor in overall training stress)
- USER NOTES: Pay close attention to any user notes from recent workouts. These are the lifter's own observations (e.g. "shoulder felt tight", "grip was slipping", "felt strong today"). Use these to adjust exercise selection, weight, and volume.

EXERCISE SELECTION — THIS IS CRITICAL:
Do NOT just repeat the same exercises the user always does. Look at their recent workouts and ROTATE exercises. If they benched last session, use Incline DB Press or Floor Press this time. Introduce exercises they haven't tried yet. A good workout mixes 1-2 exercises the user has data for (so weights are accurate) with 1-3 new exercises (use conservative weights and note it).

EXERCISE DATABASE — pick from these based on focus. Use the EXACT names listed here:

CHEST (push/bench focus):
  Compounds: Bench Press, Incline Bench Press, Decline Bench Press, Close-Grip Bench Press, Floor Press, Paused Bench Press, Spoto Press, Larsen Press, DB Bench Press, Incline DB Press, Decline DB Press
  Accessories: Cable Flyes, Incline Cable Flyes, Pec Deck, DB Flyes, Machine Chest Press, Svend Press, Push-ups, Deficit Push-ups

SHOULDERS:
  Compounds: Overhead Press, DB Shoulder Press, Push Press, Arnold Press, Landmine Press, Z Press, Viking Press, Behind-the-Neck Press
  Accessories: Lateral Raises, Cable Lateral Raises, Rear Delt Flyes, Face Pulls, Front Raises, DB Rear Delt Rows, Upright Rows, Lu Raises, Band Pull-Aparts

TRICEPS:
  Tricep Pushdowns, Overhead Tricep Extensions, Skull Crushers, Close-Grip Push-ups, Dips, Tricep Kickbacks, JM Press, French Press, Diamond Push-ups

BACK:
  Compounds: Barbell Rows, Pendlay Rows, T-Bar Rows, Dumbbell Rows, Meadows Rows, Seal Rows, Cable Rows, Chest-Supported Rows, Helms Rows, Kroc Rows
  Vertical: Pull-ups, Chin-ups, Lat Pulldowns, Close-Grip Pulldowns, Neutral-Grip Pulldowns, Straight-Arm Pulldowns
  Accessories: Face Pulls, Band Pull-Aparts, Rear Delt Flyes, Shrugs, DB Shrugs, Rack Pulls

BICEPS:
  Barbell Curls, DB Curls, Hammer Curls, Incline DB Curls, Preacher Curls, Cable Curls, Concentration Curls, Spider Curls, EZ Bar Curls, Reverse Curls

QUADS:
  Compounds: Squats, Front Squats, Goblet Squats, Hack Squats, Leg Press, Smith Machine Squats, Safety Bar Squats, Pause Squats, Anderson Squats
  Accessories: Bulgarian Split Squats, Walking Lunges, Reverse Lunges, Step-ups, Sissy Squats, Leg Extensions, Wall Sits

HAMSTRINGS & GLUTES:
  Compounds: Romanian Deadlifts, Stiff-Leg Deadlifts, Conventional Deadlifts, Sumo Deadlifts, Trap Bar Deadlifts, Good Mornings, Hip Thrusts, Barbell Hip Thrusts, Cable Pull-Throughs
  Accessories: Leg Curls, Nordic Curls, Glute-Ham Raises, Single-Leg RDL, Kettlebell Swings, Back Extensions, Reverse Hypers, Glute Bridges

CALVES:
  Standing Calf Raises, Seated Calf Raises, Single-Leg Calf Raises, Smith Machine Calf Raises, Leg Press Calf Raises

CORE:
  Planks, Side Planks, Dead Bugs, Ab Wheel Rollouts, Hanging Leg Raises, Cable Crunches, Pallof Press, Farmer's Walks, Suitcase Carries, L-Sits, Dragon Flags

FOCUS COMBINATIONS:
- PUSH: Pick 1-2 chest compounds + 1 shoulder + 1-2 tricep/accessory
- PULL: Pick 1-2 back compounds + 1 vertical pull + 1-2 bicep/accessory
- LEGS: Pick 1-2 quad compounds + 1-2 hamstring/glute + 1 calf/core
- UPPER: Pick 1 push compound + 1 pull compound + 2-3 accessories (mix shoulders, arms, back)
- FULL BODY: Pick 1 lower compound + 1 upper push + 1 upper pull + 1-2 accessories
- BENCH FOCUS: Bench variation as main lift + 2-3 chest/tricep accessories that support bench

Prioritize compound movements first, accessories second. DO NOT use exercises outside this database unless the user has logged them before.

WEIGHT CALCULATION — CRITICAL:
When setting weights, follow this priority:
1. If user has e1RM data for the EXACT exercise: use intensity scaling below
2. If user has data for a RELATED exercise, infer the weight:
   Bench-related: Incline ≈ 75-80%, Decline ≈ 105%, Close-Grip ≈ 85-90%, Floor Press ≈ 85%, Paused ≈ 85-90%, Spoto ≈ 85%, DB Bench ≈ 40-45% per hand
   Press-related: OHP ≈ 60-65% of Bench, Push Press ≈ 70% of Bench, Arnold Press ≈ 30% of Bench per hand, DB Shoulder Press ≈ 30-35% per hand
   Row-related: Barbell Row ≈ 70-80% of Bench, Pendlay Row ≈ 65-75% of Bench, DB Row ≈ 35-40% per hand, T-Bar Row ≈ 65-75%
   Squat-related: Front Squat ≈ 80-85%, Goblet Squat ≈ 25-30%, Hack Squat ≈ 80-90%, Pause Squat ≈ 80-85%
   Deadlift-related: RDL ≈ 70-75%, Sumo ≈ 95-100%, Trap Bar ≈ 100-105%, Stiff-Leg ≈ 65-70%
   General: DB variations ≈ 40-45% of barbell (per hand), Cable exercises ≈ use light-moderate weight
3. If NO related data exists: use conservative defaults (45-95 lbs upper, 95-135 lbs lower) and note it.

WEIGHT CEILING — CRITICAL:
- NEVER prescribe working set weight above 90% of e1RM, EVER. The only exception is a 1RM test.
- e1RM means estimated 1-rep max. You CANNOT do your e1RM for triples. A 325lb e1RM means ~295 for a hard triple.
- If user did 295x3 last session, do NOT jump to 305-325x3. Add 5 lbs max (300x3) or keep the same.
- Working sets should feel HARD but COMPLETABLE. Never prescribe weights the user cannot physically lift.

INTENSITY SCALING (% of e1RM):
- Light (RPE 5-6): 60-70% of e1RM, reps 10-15
- Moderate (RPE 7-8): 70-80% of e1RM, reps 6-10
- Heavy (RPE 8-9): 80-88% of e1RM, reps 3-6
- Max (RPE 9-10): 85-92% of e1RM, reps 1-3
Round all weights to the nearest 5 lbs.
IMPORTANT: The user's context below includes pre-computed TARGET weight ranges for each lift. USE THOSE RANGES — do not calculate your own.

NO TRAINING DATA:
If the user has NO max lift data at all, set weights very conservatively: bar weight (45 lbs) to 65 lbs for upper body pressing, 95-135 lbs for lower body compounds. Add a prominent note in the workout "notes" field: "No training history available — all weights are set conservatively. Log this workout so future sessions can be personalized to your actual strength." For the 1RM test with no data, start the warm-up at the bar and increase in small increments.

EXERCISE TYPES:
- "weight": Standard weighted exercises (bench press, squat, rows). Sets have prescribedWeight and prescribedReps.
- "bodyweight": No external weight (pull-ups, push-ups, dips). Sets have prescribedReps only (NO prescribedWeight).
- "time": Time-based exercises (planks, dead hangs, wall sits). Sets have prescribedTime (in seconds) only.

EXERCISE INFO — for each exercise include:
- "howTo": 1-2 sentence description of how to perform the exercise with correct form
- "cues": Array of 2-3 short key form cues (brief phrases, not full sentences)
- "substitutions": Array of 2-3 alternative exercises if equipment is unavailable or the exercise causes discomfort

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
      "howTo": "Lie on a flat bench with eyes under the bar. Grip slightly wider than shoulder width, unrack, lower bar to mid-chest with elbows at ~45 degrees, press back up to lockout.",
      "cues": ["Squeeze shoulder blades together", "Drive feet into floor", "Bar path: slight diagonal from chest to shoulders"],
      "substitutions": ["DB Bench Press", "Floor Press", "Push-ups"],
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
      "howTo": "Hang from a bar with overhand grip slightly wider than shoulders. Pull up until chin clears the bar, then lower with control to full arm extension.",
      "cues": ["Initiate with lats, not arms", "Avoid swinging or kipping", "Full dead hang at bottom"],
      "substitutions": ["Lat Pulldowns", "Chin-ups", "Band-Assisted Pull-ups"],
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
      "howTo": "Grip a pull-up bar with overhand grip and hang with arms fully extended. Engage shoulders slightly (active hang) and hold.",
      "cues": ["Shoulders away from ears", "Grip tight, breathe steady"],
      "substitutions": ["Farmer's Walks", "Plate Pinch Hold"],
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

IMPORTANT: Each exercise MUST have 3-5 separate set objects in the "sets" array. If you prescribe 4x8 for bench press, the "sets" array must contain 4 individual objects. NEVER return just 1 set object — always return the full number of sets. This is critical.
IMPORTANT: For warm-up and cool-down/stretch exercises, each set MUST include a "setNote" field describing the specific movement for that set (e.g. "Arm circles 20x", "Chest doorway stretch 30s/side"). Never leave warm-up/stretch sets without a setNote.
IMPORTANT: EVERY exercise MUST include "howTo" (1-2 sentence form description), "cues" (2-3 form cues), and "substitutions" (2-3 alternatives). These fields are REQUIRED — do not skip them for any exercise.`;

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
      max_tokens: 4500,
    });

    const responseTime = Date.now() - startTime;
    const usage = completion.usage;

    let workout;
    try {
      workout = JSON.parse(completion.choices[0].message.content);
    } catch {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', ...cors },
        body: JSON.stringify({ error: 'AI returned invalid JSON' }),
      };
    }

    // Post-processing: enforce correct exercise types for known exercises
    const TIME_EXERCISES = /^(dead hang|plank|side plank|wall sit|l-sit|farmer.?s walk|suitcase carr|warm.?up|cool.?down|stretch)/i;
    const BW_EXERCISES = /^(pull.?up|chin.?up|push.?up|dip|deficit push|diamond push|close.?grip push|burpee|mountain climber|glute bridge|dead bug|nordic curl|pistol squat|dragon flag|ab wheel|hanging leg raise)/i;
    if (workout.exercises && Array.isArray(workout.exercises)) {
      workout.exercises.forEach(ex => {
        const name = (ex.name || '').trim();
        if (TIME_EXERCISES.test(name)) {
          ex.type = 'time';
          // Convert any reps-only sets to time-based
          (ex.sets || []).forEach(s => {
            if (!s.prescribedTime && s.prescribedReps) {
              s.prescribedTime = String(Math.max(30, parseInt(s.prescribedReps) * 3 || 30));
              delete s.prescribedReps;
            }
            if (!s.prescribedTime) s.prescribedTime = '30';
            delete s.prescribedWeight;
          });
        } else if (BW_EXERCISES.test(name)) {
          ex.type = 'bodyweight';
          // Remove prescribedWeight (unless it's small added weight like weighted vest)
          (ex.sets || []).forEach(s => {
            const w = parseFloat(s.prescribedWeight || 0);
            if (w > 100) delete s.prescribedWeight; // clearly wrong — bodyweight doesn't use heavy weight
          });
        }
      });
    }

    // Post-processing: expand exercises that only have 1 set (AI sometimes gets lazy)
    // If an exercise has only 1 set, duplicate it to 3 or 4 sets with basic progression
    if (workout.exercises && Array.isArray(workout.exercises)) {
      workout.exercises = workout.exercises.map(ex => {
        if (ex.sets && ex.sets.length === 1) {
          const template = ex.sets[0];
          const targetSets = ex.type === 'time' ? 3 : 4;
          ex.sets = Array.from({ length: targetSets }, (_, i) => {
            const s = { ...template };
            // First set is a lighter ramp-up for weight exercises
            if (i === 0 && targetSets >= 3 && s.prescribedWeight) {
              const w = parseFloat(s.prescribedWeight);
              if (w > 0) s.prescribedWeight = String(Math.round((w * 0.85) / 5) * 5);
            }
            return s;
          });
        }
        return ex;
      });
    }

    // Weight ceiling validation: cap prescribed weights at 90% of e1RM
    const maxLifts = context?.maxLifts || {};
    if (workout.exercises && Array.isArray(workout.exercises)) {
      workout.exercises.forEach(ex => {
        if (ex.type !== 'weight' || !ex.sets) return;
        const liftData = maxLifts[ex.name];
        if (!liftData?.e1rm) return;
        const cap = Math.round((liftData.e1rm * 0.9) / 5) * 5;
        ex.sets.forEach(s => {
          if (s.prescribedWeight && parseFloat(s.prescribedWeight) > cap) {
            s.prescribedWeight = String(cap);
          }
        });
      });
    }

    // Calculate cost based on model
    let cost;
    if (selectedModel === 'gpt-4.1-mini') {
      // GPT-4.1-mini: $0.40/$1.60 per 1M tokens
      cost = (usage.prompt_tokens / 1e6) * 0.40 + (usage.completion_tokens / 1e6) * 1.60;
    } else {
      // GPT-4o-mini: $0.15/$0.60 per 1M tokens
      cost = (usage.prompt_tokens / 1e6) * 0.15 + (usage.completion_tokens / 1e6) * 0.60;
    }

    // Post-processing: fill in missing exercise info fields
    if (workout.exercises && Array.isArray(workout.exercises)) {
      workout.exercises.forEach(ex => {
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
        howTo: ex.howTo || '',
        cues: Array.isArray(ex.cues) ? ex.cues : [],
        substitutions: Array.isArray(ex.substitutions) ? ex.substitutions : [],
        sets: (ex.sets || []).map((s, j) => {
          const base = {
            id: Date.now() + i * 100 + j,
            targetRpe: s.targetRpe || null,
            rpe: '',
            painLevel: 0,
            completed: false,
            ...(s.setNote ? { setNote: s.setNote } : {}),
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
      generationPrompt: userPrompt,
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
      headers: { 'Content-Type': 'application/json', ...cors },
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
    await refundCredits(auth.uid, creditCost, auth.isAdmin);
    const isTimeout = error?.code === 'ETIMEDOUT' || error?.message?.includes('timeout') || error?.message?.includes('timed out');
    return {
      statusCode: isTimeout ? 504 : 500,
      headers: { 'Content-Type': 'application/json', ...cors },
      body: JSON.stringify({ error: isTimeout ? 'AI took too long to respond. Try again or use standard model.' : error.message }),
    };
  }
}

function buildContext(ctx, focus, intensity, settings = {}, duration = null, exerciseCount = null, maxExercise = null, includeWarmup = true, includeStretches = false) {
  const painThresholdMin = settings.painThresholdMin || 3;
  const painThresholdCount = settings.painThresholdCount || 2;
  
  let s = '';

  // Warm-up preference
  s += `INCLUDE_WARMUP: ${includeWarmup ? 'true' : 'false'}\n`;
  s += `INCLUDE_STRETCHES: ${includeStretches ? 'true' : 'false'}\n\n`;

  // 1RM test mode
  if (focus === '1rm-test' && maxExercise) {
    s += `FOCUS: 1RM TEST for ${maxExercise}\n`;
    s += `Generate a max-attempt session following the 1RM TEST PROTOCOL.\n`;
    const liftData = ctx?.maxLifts?.[maxExercise];
    if (liftData) {
      s += `Current e1RM: ${liftData.e1rm} lbs (best: ${liftData.weight}lb x ${liftData.reps})\n`;
    } else {
      s += `No e1RM data available — use conservative warm-up progression and let the athlete work up by feel.\n`;
    }
    s += '\n';
  } else {
    // Duration and exercise count constraints
    if (duration) {
      s += `TARGET DURATION: ${duration} minutes. Fit the workout within this time.\n`;
    }
    if (exerciseCount) {
      s += `TARGET EXERCISES: ${exerciseCount} main exercises (do NOT count warm-up or stretching blocks toward this number). Use exactly this many.\n`;
    }
    if (duration || exerciseCount) s += '\n';
  }

  if (focus === '1rm-test') {
    // Skip regular focus/intensity for 1RM test
  } else if (focus === 'core') {
    s += `FOCUS: Core-dominant workout. Prioritize exercises like planks, dead bugs, pallof press, hanging leg raises, ab wheel rollouts, cable crunches, farmer carries, bird dogs, Copenhagen planks, and anti-rotation movements. Include both anterior and posterior core work. May include 1-2 compound lifts (e.g. front squats, overhead press) that heavily tax the core, but the session should feel core-focused overall.\n`;
  } else if (focus === 'no-equipment') {
    s += `FOCUS: Bodyweight only — NO equipment whatsoever. Use exercises like push-ups, pull-ups (if available), squats, lunges, planks, burpees, dips, glute bridges, mountain climbers, etc. Set type to 'bodyweight' or 'time' for all exercises.\n`;
  } else if (focus === 'vacation') {
    s += `FOCUS: Hotel/travel workout — minimal or no equipment. Assume only bodyweight and maybe a single set of light dumbbells or resistance band. Keep it 20-35 min. Prioritize compound movements and circuits. Set type to 'bodyweight' or 'time' for exercises without weights.\n`;
  } else if (focus && focus !== 'auto') {
    s += `FOCUS: ${focus}\n`;
  } else {
    // Auto-detect: analyze recent workouts to suggest what focus is needed
    const recentFocuses = (ctx?.recentWorkouts || []).slice(0, 5).map(w => (w.name || '').toLowerCase());
    const hadPush = recentFocuses.some(n => /push|bench|chest|press|tricep/i.test(n));
    const hadPull = recentFocuses.some(n => /pull|back|row|bicep/i.test(n));
    const hadLegs = recentFocuses.some(n => /leg|squat|deadlift|hamstring|glute/i.test(n));
    const suggestions = [];
    if (!hadPush) suggestions.push('push');
    if (!hadPull) suggestions.push('pull');
    if (!hadLegs) suggestions.push('legs');
    if (suggestions.length > 0) {
      s += `FOCUS: auto — recent workouts suggest ${suggestions.join(' or ')} is overdue. Prioritize accordingly.\n`;
    } else {
      s += `FOCUS: auto — pick the best focus based on recent workout pattern.\n`;
    }
  }
  
  const intMap = { light: 'Light (RPE 5-6)', moderate: 'Moderate (RPE 7-8)', heavy: 'Heavy (RPE 8-9)', max: 'Max (RPE 9-10)' };
  s += `INTENSITY: ${intMap[intensity] || 'Moderate'}\n\n`;

  // Intensity ranges for pre-computing target weights
  const intRanges = { light: [0.60, 0.70], moderate: [0.70, 0.80], heavy: [0.80, 0.88], max: [0.85, 0.92] };
  const range = intRanges[intensity] || intRanges.moderate;

  const lifts = Object.entries(ctx?.maxLifts || {});
  if (lifts.length) {
    s += 'MAX LIFTS — with TARGET WEIGHT RANGE for this session\'s intensity:\n';
    lifts.sort((a, b) => b[1].e1rm - a[1].e1rm).slice(0, 15).forEach(([n, d]) => {
      const lo = Math.round((d.e1rm * range[0]) / 5) * 5;
      const hi = Math.round((d.e1rm * range[1]) / 5) * 5;
      s += `  ${n}: e1RM ${d.e1rm}lb (best: ${d.weight}x${d.reps}) → TARGET: ${lo}-${hi} lbs\n`;
    });
    s += '  ↑ IMPORTANT: Working set weights MUST fall within these TARGET ranges. NEVER exceed the upper bound. For exercises not listed, infer conservatively from related lifts.\n';
    s += '\n';
  } else {
    s += 'MAX LIFTS: No data - use conservative weights and note it\n\n';
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
    // Check data freshness
    const ouraDate = latest?.readiness?.day || latest?.sleep?.day;
    let stale = false;
    if (ouraDate) {
      const daysOld = Math.floor((Date.now() - new Date(ouraDate).getTime()) / (1000 * 60 * 60 * 24));
      stale = daysOld > 7;
    }
    s += `OURA RING DATA${stale ? ' (⚠ DATA >7 DAYS OLD — may not reflect current recovery)' : ''} (adjust workout intensity based on recovery):\n`;
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
      if (w.userNotes) s += `    USER NOTES: "${w.userNotes}"\n`;
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
        if (ex.userNotes) s += `      USER NOTE: "${ex.userNotes}"\n`;
      });
    });
    s += '\n';
  }

  return s;
}
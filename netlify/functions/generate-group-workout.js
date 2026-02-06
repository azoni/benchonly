import OpenAI from 'openai';
import admin from 'firebase-admin';

// Initialize Firebase Admin if not already
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { 
      coachId,
      groupId,
      athleteIds,
      prompt,
      workoutDate,
    } = JSON.parse(event.body);

    if (!groupId || !athleteIds?.length) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing groupId or athleteIds' }),
      };
    }

    // Gather context for each athlete
    const athleteContexts = await Promise.all(
      athleteIds.map(async (athleteId) => {
        return await gatherAthleteContext(athleteId);
      })
    );

    // Build combined context for AI
    const combinedContext = buildGroupContext(athleteContexts, prompt);

    const systemPrompt = `You are an expert strength training coach generating workouts for a group of athletes. Each athlete has different strength levels, pain history, and RPE patterns.

Your job is to generate:
1. A BASE TEMPLATE workout that defines the exercises and structure
2. PERSONALIZED SETS for each athlete based on their individual data

PERSONALIZATION RULES:
- Adjust weights based on each athlete's max lifts (use ~70-85% of e1RM for working sets)
- If an athlete has pain history on an exercise, suggest an alternative for ONLY that athlete
- Consider each athlete's typical RPE - if they usually rate things high, be slightly conservative
- Keep the same exercise order and structure, just adjust the numbers

OUTPUT FORMAT (JSON):
{
  "name": "Workout name",
  "description": "Brief description",
  "baseExercises": [
    {
      "name": "Bench Press",
      "type": "weight",
      "defaultSets": 4,
      "defaultReps": 8,
      "restSeconds": 90,
      "notes": "General form cues"
    }
  ],
  "athleteWorkouts": {
    "ATHLETE_ID": {
      "athleteName": "Name",
      "exercises": [
        {
          "name": "Bench Press",
          "sets": [
            { "prescribedReps": 8, "prescribedWeight": 185 }
          ],
          "notes": "Athlete-specific notes if any",
          "substitution": null
        }
      ],
      "modifications": "Any overall modifications for this athlete"
    }
  },
  "generalNotes": "Warmup suggestions, coaching cues, etc."
}

If an athlete needs a substitution, include:
"substitution": { "reason": "shoulder pain history", "original": "Bench Press", "replacement": "Floor Press" }`;

    const userPrompt = `Generate a group workout with this context:

${combinedContext}

${prompt ? `COACH'S REQUEST: ${prompt}` : 'Generate an appropriate workout for the group.'}

Create a workout that works for all athletes with personalized weights based on their individual data.`;

    const startTime = Date.now();

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
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

    const result = JSON.parse(completion.choices[0].message.content);

    // Create individual workout documents for each athlete
    const workoutPromises = Object.entries(result.athleteWorkouts).map(
      async ([athleteId, athleteWorkout]) => {
        const workoutData = {
          name: result.name,
          description: result.description,
          exercises: athleteWorkout.exercises.map((ex, index) => ({
            id: Date.now() + index,
            name: ex.substitution?.replacement || ex.name,
            type: ex.type || 'weight',
            sets: ex.sets.map((set, setIndex) => ({
              id: Date.now() + index * 100 + setIndex,
              prescribedWeight: set.prescribedWeight?.toString() || '',
              prescribedReps: set.prescribedReps?.toString() || '',
              actualWeight: '',
              actualReps: '',
              rpe: '',
              painLevel: 0,
              completed: false,
            })),
            notes: ex.notes || (ex.substitution ? `Modified: ${ex.substitution.reason}` : ''),
            expanded: true,
          })),
          status: 'scheduled',
          date: workoutDate ? new Date(workoutDate) : new Date(),
          assignedTo: athleteId,
          assignedBy: coachId,
          groupId: groupId,
          generatedByAI: true,
          modifications: athleteWorkout.modifications || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        const docRef = await db.collection('groupWorkouts').add(workoutData);
        return { athleteId, workoutId: docRef.id };
      }
    );

    const createdWorkouts = await Promise.all(workoutPromises);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        workoutName: result.name,
        baseExercises: result.baseExercises,
        athleteWorkouts: result.athleteWorkouts,
        createdWorkouts,
        generalNotes: result.generalNotes,
        usage: {
          model: 'gpt-4-turbo-preview',
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          responseTimeMs: responseTime,
        },
      }),
    };
  } catch (error) {
    console.error('Generate group workout error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Failed to generate group workout', details: error.message }),
    };
  }
}

async function gatherAthleteContext(athleteId) {
  // Get user profile
  const userDoc = await db.collection('users').doc(athleteId).get();
  const userData = userDoc.data() || {};

  // Get recent workouts
  const personalWorkouts = await db.collection('workouts')
    .where('userId', '==', athleteId)
    .where('status', '==', 'completed')
    .orderBy('date', 'desc')
    .limit(10)
    .get();

  const groupWorkouts = await db.collection('groupWorkouts')
    .where('assignedTo', '==', athleteId)
    .where('status', '==', 'completed')
    .orderBy('date', 'desc')
    .limit(10)
    .get();

  const allWorkouts = [
    ...personalWorkouts.docs.map(d => ({ id: d.id, ...d.data() })),
    ...groupWorkouts.docs.map(d => ({ id: d.id, ...d.data() })),
  ].sort((a, b) => {
    const dateA = a.date?.toDate?.() || new Date(a.date);
    const dateB = b.date?.toDate?.() || new Date(b.date);
    return dateB - dateA;
  }).slice(0, 10);

  // Calculate maxes, pain, RPE from workouts
  const maxLifts = {};
  const painHistory = {};
  const rpeData = {};

  allWorkouts.forEach(workout => {
    (workout.exercises || []).forEach(exercise => {
      const name = exercise.name;

      (exercise.sets || []).forEach(set => {
        const weight = parseFloat(set.actualWeight) || parseFloat(set.prescribedWeight) || 0;
        const reps = parseInt(set.actualReps) || parseInt(set.prescribedReps) || 0;
        const rpe = parseInt(set.rpe) || 0;
        const pain = parseInt(set.painLevel) || 0;

        // Track max lifts
        if (weight > 0 && reps > 0 && reps <= 12) {
          const e1rm = Math.round(weight * (1 + reps / 30));
          if (!maxLifts[name] || e1rm > maxLifts[name].e1rm) {
            maxLifts[name] = { weight, reps, e1rm };
          }
        }

        // Track pain
        if (pain > 0) {
          if (!painHistory[name]) {
            painHistory[name] = { count: 0, maxPain: 0 };
          }
          painHistory[name].count++;
          painHistory[name].maxPain = Math.max(painHistory[name].maxPain, pain);
        }

        // Track RPE
        if (rpe > 0) {
          if (!rpeData[name]) {
            rpeData[name] = { total: 0, count: 0 };
          }
          rpeData[name].total += rpe;
          rpeData[name].count++;
        }
      });
    });
  });

  // Calculate RPE averages
  const rpeAverages = {};
  Object.entries(rpeData).forEach(([name, data]) => {
    rpeAverages[name] = Math.round(data.total / data.count * 10) / 10;
  });

  // Get goals
  const goalsSnapshot = await db.collection('goals')
    .where('userId', '==', athleteId)
    .where('status', '==', 'active')
    .get();

  const goals = goalsSnapshot.docs.map(d => d.data());

  return {
    id: athleteId,
    name: userData.displayName || 'Unknown',
    recentWorkouts: allWorkouts.slice(0, 5),
    maxLifts,
    painHistory,
    rpeAverages,
    goals,
  };
}

function buildGroupContext(athleteContexts, prompt) {
  let context = `=== GROUP OF ${athleteContexts.length} ATHLETES ===\n\n`;

  athleteContexts.forEach((athlete, index) => {
    context += `--- ATHLETE ${index + 1}: ${athlete.name} (ID: ${athlete.id}) ---\n`;

    // Max lifts
    if (Object.keys(athlete.maxLifts).length > 0) {
      context += 'Max Lifts:\n';
      Object.entries(athlete.maxLifts)
        .sort((a, b) => b[1].e1rm - a[1].e1rm)
        .slice(0, 8)
        .forEach(([name, data]) => {
          context += `  ${name}: ${data.e1rm} lbs (${data.weight}x${data.reps})\n`;
        });
    }

    // Pain history
    if (Object.keys(athlete.painHistory).length > 0) {
      context += '⚠️ Pain History:\n';
      Object.entries(athlete.painHistory).forEach(([name, data]) => {
        context += `  ${name}: pain ${data.maxPain}/10 (${data.count}x)\n`;
      });
    }

    // Goals
    if (athlete.goals?.length > 0) {
      context += 'Goals:\n';
      athlete.goals.forEach(goal => {
        context += `  ${goal.lift}: ${goal.currentWeight || goal.currentValue} → ${goal.targetWeight || goal.targetValue}\n`;
      });
    }

    // Recent workout summary
    if (athlete.recentWorkouts?.length > 0) {
      const lastWorkout = athlete.recentWorkouts[0];
      const date = lastWorkout.date?.toDate?.()?.toISOString().split('T')[0] || lastWorkout.date;
      context += `Last workout: ${date} - ${lastWorkout.name || 'Workout'}\n`;
    }

    context += '\n';
  });

  return context;
}

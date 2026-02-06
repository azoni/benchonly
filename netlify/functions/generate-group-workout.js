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
    const { coachId, groupId, athletes, prompt, workoutDate } = JSON.parse(event.body);

    if (!groupId || !athletes?.length) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'groupId and athletes required' }),
      };
    }

    if (!db) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Firebase not configured. Add FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY to Netlify.' }),
      };
    }

    const contextStr = buildGroupContext(athletes);

    const systemPrompt = `You are an expert strength coach creating personalized workouts for a group.

RULES:
1. Same exercises for all athletes (group consistency)
2. Personalize WEIGHTS based on each athlete's max lifts (70-85% of e1RM)
3. AVOID or SUBSTITUTE exercises where athlete has pain history
4. Consider RPE patterns when setting weights
5. Include coaching notes explaining your reasoning

OUTPUT JSON:
{
  "name": "Workout Name",
  "description": "Brief description",
  "coachingNotes": "Explanation of workout focus, exercise selection, and programming intent.",
  "baseExercises": [
    { "name": "Bench Press", "type": "weight", "defaultSets": 4, "defaultReps": 8 }
  ],
  "athleteWorkouts": {
    "ATHLETE_ID": {
      "athleteName": "Name",
      "personalNotes": "Notes for this athlete explaining weight selections and modifications.",
      "exercises": [
        {
          "name": "Bench Press",
          "type": "weight",
          "sets": [{ "prescribedReps": 8, "prescribedWeight": 185, "targetRpe": 7 }],
          "notes": "Form cues",
          "substitution": null
        }
      ]
    }
  }
}

For pain substitutions: "substitution": { "reason": "shoulder pain", "original": "Bench Press", "replacement": "Floor Press" }`;

    const userPrompt = `Create a group workout:\n\n${contextStr}\n\n${prompt ? `COACH REQUEST: ${prompt}` : 'Generate appropriate strength workout.'}`;

    const startTime = Date.now();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 3000,
    });

    const responseTime = Date.now() - startTime;
    const usage = completion.usage;

    let result;
    try {
      result = JSON.parse(completion.choices[0].message.content);
    } catch {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'AI returned invalid JSON' }),
      };
    }

    if (!result.athleteWorkouts) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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
          notes: ex.notes || (ex.substitution ? `Modified: ${ex.substitution.reason}` : ''),
          expanded: true,
        })),
        status: 'scheduled',
        date: parsedDate,
        assignedTo: athleteId,
        assignedBy: coachId,
        groupId,
        generatedByAI: true,
        aiModel: 'gpt-4o-mini',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const docRef = await db.collection('groupWorkouts').add(workoutData);
      createdWorkouts.push({ athleteId, workoutId: docRef.id, athleteName: aw.athleteName });
    }

    const cost = (usage.prompt_tokens / 1e6) * 0.15 + (usage.completion_tokens / 1e6) * 0.60;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        success: true,
        workoutName: result.name,
        coachingNotes: result.coachingNotes,
        baseExercises: result.baseExercises,
        athleteWorkouts: result.athleteWorkouts,
        createdWorkouts,
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

function buildGroupContext(athletes) {
  let s = `GROUP: ${athletes.length} athletes\n\n`;

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

    const pain = Object.entries(a.painHistory || {});
    if (pain.length) {
      s += 'PAIN [MUST SUBSTITUTE]: ';
      s += pain.map(([n, d]) => `${n} (${d.maxPain}/10, ${d.count}x)`).join(', ');
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

    if (a.recentWorkouts?.length) {
      s += `Recent (${a.recentWorkouts.length} workouts):\n`;
      a.recentWorkouts.slice(0, 2).forEach(w => {
        s += `  ${w.date || 'Recent'}: ${w.name || 'Workout'}\n`;
        (w.exercises || []).slice(0, 3).forEach(ex => {
          const sets = ex.sets || [];
          const wt = sets[0]?.actualWeight || sets[0]?.prescribedWeight;
          const rp = sets[0]?.actualReps || sets[0]?.prescribedReps;
          if (wt || rp) s += `    ${ex.name}: ${wt || '?'}lb x ${rp || '?'}\n`;
        });
      });
    }

    s += '\n';
  });

  return s;
}
import OpenAI from 'openai';
import { admin } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';
import { refundCredits } from './utils/credits.js';

const db = admin.apps.length ? admin.firestore() : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120000 });

const INTERNAL_KEY = process.env.INTERNAL_FUNCTION_KEY || 'form-check-internal';

// Post-processing regexes (mirror of generate-workout.js)
const TIME_EXERCISES = /^(dead hang|plank|side plank|wall sit|l-sit|farmer.?s walk|suitcase carr|warm.?up|cool.?down|stretch|hip flexor|pigeon|thoracic|cat.?cow|world.?s greatest|90.?90|frog|lizard|foam roll|lacrosse ball|banded.*distraction|couch stretch|pancake|thread the needle|sprint|agility ladder|assault bike|rowing machine|bike sprint)/i;
const BW_EXERCISES = /^(pull.?up|chin.?up|push.?up|dip|deficit push|diamond push|close.?grip push|burpee|mountain climber|glute bridge|dead bug|nordic curl|pistol squat|dragon flag|ab wheel|hanging leg raise|box jump|broad jump|tuck jump|depth jump|bounding|muscle.?up|handstand|l.?sit|human flag|planche|front lever|archer|korean dip|ring dip|double.?under|toes.?to.?bar|wall walk)/i;

export async function handler(event) {
  console.log('[generate-workout-bg] Handler invoked');

  if (event.httpMethod !== 'POST') return { statusCode: 405 };

  let jobId, userId, creditCost = 0;

  try {
    const body = JSON.parse(event.body);
    jobId = body.jobId;

    console.log('[generate-workout-bg] Processing job:', jobId);

    if (body._internalKey !== INTERNAL_KEY) {
      console.error('[generate-workout-bg] Invalid internal key');
      return { statusCode: 403 };
    }

    if (!jobId || !db) {
      console.error('[generate-workout-bg] Missing jobId or db');
      return { statusCode: 400 };
    }

    const jobRef = db.collection('workoutJobs').doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) {
      console.error('[generate-workout-bg] Job not found:', jobId);
      return { statusCode: 404 };
    }

    const job = jobSnap.data();
    userId = job.userId;
    creditCost = job.creditCost || 0;

    const { systemPrompt, userPrompt, selectedModel, category, draftMode, contextMaxLifts, isAdmin: jobIsAdmin } = job;

    console.log('[generate-workout-bg] Job data:', { userId, model: selectedModel, category, draftMode });

    await jobRef.update({ status: 'processing' });

    const startTime = Date.now();
    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: category !== 'strength' ? 5000 : 4500,
    });

    const responseTime = Date.now() - startTime;
    const usage = completion.usage;

    let workout;
    try {
      workout = JSON.parse(completion.choices[0].message.content);
    } catch {
      await jobRef.update({ status: 'error', error: 'AI returned invalid JSON' });
      if (creditCost > 0) await refundCredits(userId, creditCost, jobIsAdmin).catch(() => {});
      return { statusCode: 200 };
    }

    // Post-processing: enforce correct exercise types for known exercises
    if (workout.exercises && Array.isArray(workout.exercises)) {
      workout.exercises.forEach(ex => {
        const name = (ex.name || '').trim();
        if (TIME_EXERCISES.test(name)) {
          ex.type = 'time';
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
          (ex.sets || []).forEach(s => {
            const w = parseFloat(s.prescribedWeight || 0);
            if (w > 100) delete s.prescribedWeight;
          });
        }
      });
    }

    // Post-processing: expand exercises that only have 1 set
    if (workout.exercises && Array.isArray(workout.exercises)) {
      workout.exercises = workout.exercises.map(ex => {
        if (ex.sets && ex.sets.length === 1) {
          const template = ex.sets[0];
          const targetSets = ex.type === 'time' ? 3 : 4;
          ex.sets = Array.from({ length: targetSets }, (_, i) => {
            const s = { ...template };
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
    const maxLifts = contextMaxLifts || {};
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

    // Calculate cost
    let cost;
    if (selectedModel === 'gpt-4.1-mini') {
      cost = (usage.prompt_tokens / 1e6) * 0.40 + (usage.completion_tokens / 1e6) * 1.60;
    } else {
      cost = (usage.prompt_tokens / 1e6) * 0.15 + (usage.completion_tokens / 1e6) * 0.60;
    }

    // Build workout data for Firestore
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
            return { ...base, prescribedTime: String(s.prescribedTime || ''), actualTime: '' };
          }
          if (ex.type === 'bodyweight') {
            return { ...base, prescribedReps: String(s.prescribedReps || ''), actualReps: '' };
          }
          return { ...base, prescribedWeight: String(s.prescribedWeight || ''), prescribedReps: String(s.prescribedReps || ''), actualWeight: '', actualReps: '' };
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
      workoutCategory: category,
      generationPrompt: userPrompt,
    };

    let workoutId = null;
    if (!draftMode) {
      workoutData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      const docRef = await db.collection('workouts').add(workoutData);
      workoutId = docRef.id;
    }

    // Log token usage
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
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error('[generate-workout-bg] Failed to log usage:', e);
    }

    // Log portfolio activity
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

    // Mark job complete with result
    await jobRef.update({
      status: 'complete',
      result: {
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
      },
    });

    console.log('[generate-workout-bg] Done:', jobId, `in ${responseTime}ms`);
    return { statusCode: 200 };

  } catch (error) {
    console.error('[generate-workout-bg] Error:', error);
    if (jobId && db) {
      await db.collection('workoutJobs').doc(jobId).update({
        status: 'error',
        error: error.message || 'Unknown error',
      }).catch(() => {});
    }
    if (userId && creditCost > 0) {
      await refundCredits(userId, creditCost, false).catch(() => {});
    }
    logError('generate-workout-bg', error, 'high', { action: 'generate', jobId });
    return { statusCode: 200 };
  }
}

import OpenAI from 'openai';
import { admin } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';
import { refundCredits } from './utils/credits.js';

const db = admin.apps.length ? admin.firestore() : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 120000 });

const INTERNAL_KEY = process.env.INTERNAL_FUNCTION_KEY || 'form-check-internal';

export async function handler(event) {
  console.log('[group-workout-bg] Handler invoked');

  if (event.httpMethod !== 'POST') return { statusCode: 405 };

  let jobId, coachId, creditCost = 0;

  try {
    const body = JSON.parse(event.body);
    jobId = body.jobId;

    console.log('[group-workout-bg] Processing job:', jobId);

    if (body._internalKey !== INTERNAL_KEY) {
      console.error('[group-workout-bg] Invalid internal key');
      return { statusCode: 403 };
    }

    if (!jobId || !db) {
      console.error('[group-workout-bg] Missing jobId or db');
      return { statusCode: 400 };
    }

    const jobRef = db.collection('groupWorkoutJobs').doc(jobId);
    const jobSnap = await jobRef.get();
    if (!jobSnap.exists) {
      console.error('[group-workout-bg] Job not found:', jobId);
      return { statusCode: 404 };
    }

    const job = jobSnap.data();
    coachId = job.coachId;
    creditCost = job.creditCost || 0;

    const {
      athletes, prompt, workoutDate, selectedModel, systemPrompt, contextStr,
      groupId, groupAdmins, groupMembers, isAdmin: jobIsAdmin,
    } = job;

    console.log('[group-workout-bg] Job data:', { coachId, athleteCount: athletes?.length, model: selectedModel });

    await jobRef.update({ status: 'processing' });

    // Build the user prompt
    const userPrompt = `Create a group workout:\n\n${contextStr}\n\n${prompt ? `COACH REQUEST: ${prompt}` : 'Generate appropriate strength workout.'}`;

    // Scale tokens by athlete count
    const maxTokens = Math.min(2000 + ((athletes?.length || 1) * 1000), 8000);

    const startTime = Date.now();
    const completion = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: maxTokens,
    });

    const responseTime = Date.now() - startTime;
    const usage = completion.usage;

    let result;
    try {
      result = JSON.parse(completion.choices[0].message.content);
    } catch {
      await jobRef.update({ status: 'error', error: 'AI returned invalid JSON' });
      if (creditCost > 0) await refundCredits(coachId, creditCost, jobIsAdmin).catch(() => {});
      return { statusCode: 200 };
    }

    // Post-processing: expand exercises that only have 1 set
    if (result.athleteWorkouts) {
      for (const aw of Object.values(result.athleteWorkouts)) {
        if (aw.exercises && Array.isArray(aw.exercises)) {
          aw.exercises = aw.exercises.map(ex => {
            if (ex.sets && ex.sets.length === 1) {
              const template = ex.sets[0];
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
      await jobRef.update({ status: 'error', error: 'AI response missing athleteWorkouts' });
      if (creditCost > 0) await refundCredits(coachId, creditCost, jobIsAdmin).catch(() => {});
      return { statusCode: 200 };
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
              return { ...base, prescribedTime: String(s.prescribedTime || ''), actualTime: '' };
            }
            if (ex.type === 'bodyweight') {
              return { ...base, prescribedReps: String(s.prescribedReps || ''), actualReps: '' };
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
        groupAdmins: groupAdmins || [coachId],
        groupMembers: groupMembers || [coachId],
        generatedByAI: true,
        aiModel: selectedModel,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const docRef = await db.collection('groupWorkouts').add(workoutData);
      createdWorkouts.push({ athleteId, workoutId: docRef.id, athleteName: aw.athleteName });
    }

    // Cost calculation
    const isPremium = selectedModel === 'gpt-4.1-mini';
    const inputRate = isPremium ? 0.40 : 0.15;
    const outputRate = isPremium ? 1.60 : 0.60;
    const cost = (usage.prompt_tokens / 1e6) * inputRate + (usage.completion_tokens / 1e6) * outputRate;

    // Log AI usage
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
        athleteCount: athletes?.length || 0,
        groupId,
        userMessage: `Group workout for ${athletes?.length || 0} athletes${prompt ? `: ${prompt.slice(0, 200)}` : ''}`,
        assistantResponse: `${result.name || 'Workout'} (${athletes?.length || 0} athletes)`,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      console.error('Failed to log usage:', e);
    }

    logActivity({
      type: 'group_workout_generated',
      title: `Group Workout: ${result.name || 'AI Group Workout'}`,
      description: `${athletes?.length || 0} athletes, ${selectedModel}`,
      model: selectedModel,
      tokens: { prompt: usage.prompt_tokens, completion: usage.completion_tokens, total: usage.total_tokens },
      cost,
      metadata: { groupId, athleteCount: athletes?.length || 0 },
    });

    // Write results to job doc
    await jobRef.update({
      status: 'complete',
      result: {
        success: true,
        workoutName: result.name,
        coachingNotes: result.coachingNotes,
        baseExercises: result.baseExercises,
        createdWorkouts,
        usage: {
          model: selectedModel,
          tokens: usage.total_tokens,
          responseMs: responseTime,
          cost: `$${cost.toFixed(6)}`,
        },
      },
    });

    console.log('[group-workout-bg] Job complete:', jobId, `${createdWorkouts.length} workouts created in ${responseTime}ms`);
    return { statusCode: 200 };

  } catch (error) {
    console.error('[group-workout-bg] Error:', error);
    logError('generate-group-workout-background', error, 'high', { action: 'generate', jobId });

    if (jobId && db) {
      try {
        await db.collection('groupWorkoutJobs').doc(jobId).update({
          status: 'error',
          error: error.message || 'Generation failed',
        });
      } catch (e) {
        console.error('[group-workout-bg] Failed to update job error:', e);
      }
    }

    if (coachId && creditCost > 0) {
      await refundCredits(coachId, creditCost, false).catch(() => {});
    }

    return { statusCode: 200 };
  }
}
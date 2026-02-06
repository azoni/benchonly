import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { 
      userId, 
      prompt, 
      workoutFocus, 
      intensity, 
      context 
    } = JSON.parse(event.body);

    const { recentWorkouts, goals, maxLifts, painHistory, rpeAverages } = context || {};

    // Build context summary for AI
    const contextSummary = buildContextSummary({
      recentWorkouts,
      goals,
      maxLifts,
      painHistory,
      rpeAverages,
      workoutFocus,
      intensity,
    });

    const systemPrompt = `You are an expert strength training coach creating personalized workout programs. You have access to the athlete's training history, goals, and any pain/injury data.

Your job is to generate a workout that:
1. Progresses appropriately from their recent training
2. Respects their pain history (avoid or modify exercises that caused pain)
3. Targets their RPE sweet spot based on the requested intensity
4. Works toward their active goals
5. Follows intelligent programming patterns (not the same workout twice in a row)

INTENSITY GUIDELINES:
- Light (RPE 5-6): Recovery/deload, ~60-70% of working weights, higher reps
- Moderate (RPE 7-8): Standard training, ~75-85% of max, moderate reps
- Heavy (RPE 8-9): Strength focus, ~85-92% of max, lower reps
- Max Effort (RPE 9-10): Test day, ~95%+ of max, singles/doubles

PROGRAMMING PATTERNS:
- If they did heavy compounds recently, consider accessory work or different movement patterns
- Monday = typically heavy, Thursday = typically volume/hypertrophy (if following standard split)
- Vary rep ranges: strength (1-5), hypertrophy (6-12), endurance (12+)

PAIN AVOIDANCE:
- If an exercise has pain history, suggest an alternative that works the same muscles
- For shoulder pain: avoid overhead pressing, suggest landmine press or floor press
- For lower back pain: avoid conventional deadlift, suggest trap bar or RDL
- For knee pain: avoid deep squats, suggest box squats or leg press

Format your response as a JSON object:
{
  "name": "Workout name (descriptive, like 'Upper Body Strength' or 'Heavy Bench Day')",
  "description": "Brief description of the workout focus and goals",
  "estimatedDuration": 60,
  "exercises": [
    {
      "name": "Exercise name",
      "type": "weight|bodyweight|time",
      "sets": [
        { 
          "prescribedReps": 8, 
          "prescribedWeight": 185,
          "targetRpe": 7
        }
      ],
      "notes": "Form cues or modification notes",
      "restSeconds": 90
    }
  ],
  "notes": "General workout notes, warmup suggestions, etc."
}

Be specific with weights based on their max lifts. If you don't have data for an exercise, prescribe conservative weights or leave weight blank for them to fill in.`;

    const userPrompt = `Generate a personalized workout with this context:

${contextSummary}

${prompt ? `USER REQUEST: ${prompt}` : ''}

Generate an appropriate ${workoutFocus !== 'auto' ? workoutFocus + ' focused' : ''} workout at ${intensity} intensity.`;

    const startTime = Date.now();

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 2500,
    });

    const responseTime = Date.now() - startTime;
    const usage = completion.usage;

    const tokenLog = {
      userId,
      feature: 'generate-workout',
      model: 'gpt-4-turbo-preview',
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
      responseTimeMs: responseTime,
      createdAt: new Date().toISOString(),
    };

    const workout = JSON.parse(completion.choices[0].message.content);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        workout,
        usage: tokenLog,
      }),
    };
  } catch (error) {
    console.error('Generate workout error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Failed to generate workout', details: error.message }),
    };
  }
}

function buildContextSummary({ recentWorkouts, goals, maxLifts, painHistory, rpeAverages, workoutFocus, intensity }) {
  let summary = '';

  // Recent workouts summary
  if (recentWorkouts?.length > 0) {
    summary += '=== RECENT TRAINING (last 2 weeks) ===\n';
    recentWorkouts.slice(0, 7).forEach((workout) => {
      const exercises = workout.exercises?.map((e) => {
        const topSet = e.sets?.reduce((best, set) => {
          const weight = parseFloat(set.actualWeight) || parseFloat(set.prescribedWeight) || 0;
          return weight > (best?.weight || 0) ? { weight, reps: set.actualReps || set.prescribedReps } : best;
        }, null);
        return topSet ? `${e.name} (${topSet.weight}x${topSet.reps})` : e.name;
      }).join(', ');
      summary += `${workout.date}: ${workout.name || 'Workout'} - ${exercises || 'no exercises'}\n`;
    });
    summary += '\n';
  }

  // Max lifts
  if (maxLifts && Object.keys(maxLifts).length > 0) {
    summary += '=== CURRENT MAXES (estimated 1RM) ===\n';
    const sortedLifts = Object.entries(maxLifts)
      .sort((a, b) => b[1].e1rm - a[1].e1rm)
      .slice(0, 15);
    sortedLifts.forEach(([name, data]) => {
      summary += `${name}: ${data.e1rm} lbs (best: ${data.weight}x${data.reps})\n`;
    });
    summary += '\n';
  }

  // Goals
  if (goals?.length > 0) {
    summary += '=== ACTIVE GOALS ===\n';
    goals.forEach((goal) => {
      const current = goal.currentWeight || goal.currentValue || 0;
      const target = goal.targetWeight || goal.targetValue || 0;
      summary += `${goal.lift}: ${current} → ${target} lbs\n`;
    });
    summary += '\n';
  }

  // Pain history - CRITICAL for safety
  if (painHistory && Object.keys(painHistory).length > 0) {
    summary += '=== ⚠️ PAIN HISTORY (AVOID OR MODIFY) ===\n';
    Object.entries(painHistory).forEach(([name, data]) => {
      summary += `${name}: Pain level ${data.maxPain}/10 logged ${data.count} time(s)\n`;
    });
    summary += 'IMPORTANT: Suggest alternative exercises for anything with pain history.\n\n';
  }

  // RPE patterns
  if (rpeAverages && Object.keys(rpeAverages).length > 0) {
    summary += '=== TYPICAL RPE BY EXERCISE ===\n';
    const sorted = Object.entries(rpeAverages)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    sorted.forEach(([name, avg]) => {
      summary += `${name}: avg RPE ${avg}\n`;
    });
    summary += '\n';
  }

  // Day pattern analysis
  if (recentWorkouts?.length >= 3) {
    const dayPatterns = analyzeDayPatterns(recentWorkouts);
    if (dayPatterns) {
      summary += '=== TRAINING PATTERN ===\n';
      summary += dayPatterns + '\n\n';
    }
  }

  return summary;
}

function analyzeDayPatterns(workouts) {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayData = {};

  workouts.forEach((workout) => {
    const date = new Date(workout.date);
    const dayName = dayNames[date.getDay()];
    
    if (!dayData[dayName]) {
      dayData[dayName] = { count: 0, types: [] };
    }
    dayData[dayName].count++;
    
    // Try to determine workout type
    const exerciseNames = workout.exercises?.map((e) => e.name.toLowerCase()).join(' ') || '';
    if (exerciseNames.includes('bench') || exerciseNames.includes('press') || exerciseNames.includes('push')) {
      dayData[dayName].types.push('push');
    }
    if (exerciseNames.includes('row') || exerciseNames.includes('pull') || exerciseNames.includes('curl')) {
      dayData[dayName].types.push('pull');
    }
    if (exerciseNames.includes('squat') || exerciseNames.includes('deadlift') || exerciseNames.includes('leg')) {
      dayData[dayName].types.push('legs');
    }
  });

  const patterns = Object.entries(dayData)
    .filter(([_, data]) => data.count >= 2)
    .map(([day, data]) => {
      const commonType = data.types.length > 0
        ? [...new Set(data.types)].join('/')
        : 'mixed';
      return `${day}: typically ${commonType}`;
    });

  return patterns.length > 0 ? patterns.join(', ') : null;
}

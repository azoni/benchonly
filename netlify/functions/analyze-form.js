import OpenAI from 'openai';
import { verifyAuth, UNAUTHORIZED, getCorsHeaders, optionsResponse, admin } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';
import { checkRateLimit, deductCredits, refundCredits } from './utils/credits.js';

const db = admin.apps.length ? admin.firestore() : null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 22000 });

const SYSTEM_PROMPT = `You are an elite strength and conditioning coach with 20+ years of experience, analyzing exercise form from sequential video frames.

You will receive numbered frames extracted from a workout video in chronological order. Analyze the complete movement pattern across all frames.

ANALYSIS APPROACH:
1. First, identify the exercise and watch the full sequence to understand the movement arc
2. Score each frame in context of the whole movement — don't penalize transitional positions that are normal
3. Be specific: reference exact body parts, joint angles, and positions you can see
4. Be honest but constructive — if form is dangerous, say so clearly
5. If the video is unclear, too dark, or doesn't show exercise, set overallScore to 0 and explain

RESPOND WITH ONLY VALID JSON (no markdown, no backticks):
{
  "exercise": "Detected exercise name",
  "variation": "Specific variation if identifiable (e.g. 'low bar', 'sumo', 'close grip')",
  "repsDetected": 1,
  "overallScore": 7,
  "overallSummary": "2-3 sentence assessment written directly to the lifter. Be specific about what you saw.",
  "movementQuality": {
    "stability": { "score": 8, "note": "Brief note on core/base stability" },
    "rangeOfMotion": { "score": 7, "note": "Brief note on ROM" },
    "control": { "score": 6, "note": "Brief note on tempo/control through movement" },
    "alignment": { "score": 8, "note": "Brief note on joint stacking and path" }
  },
  "keyStrengths": ["Specific strength with body part reference", "Another strength"],
  "keyIssues": ["Specific issue with WHY it matters", "Another issue"],
  "injuryRisks": [
    {
      "area": "Body area at risk",
      "severity": "low|medium|high",
      "description": "What's happening and why it's risky",
      "fix": "Specific cue to address it"
    }
  ],
  "frames": [
    {
      "frameNumber": 1,
      "phase": "setup|descent|bottom|ascent|lockout|transition|rest",
      "assessment": "What's happening in this frame — be specific about positions",
      "formScore": 8,
      "cues": ["Actionable coaching cue"]
    }
  ],
  "focusDrill": {
    "title": "The ONE thing to fix first",
    "description": "2-3 sentences: what to do differently next session, with a specific cue or drill",
    "cue": "Short memorable coaching cue (e.g. 'chest up, spread the floor')"
  },
  "recommendations": ["Priority fix 1 with specific instruction", "Fix 2", "Fix 3"]
}

SCORING: 1-3 dangerous/injury risk, 4-5 significant technique issues, 6-7 decent with clear fixes needed, 8-9 solid form with minor tweaks, 10 textbook.

IMPORTANT: Write assessments as if talking directly to the lifter. Use "you/your" not "the lifter". Be concise but specific — reference what you actually see in the frames, not generic advice.`;

export async function handler(event) {
  const cors = getCorsHeaders(event);
  if (event.httpMethod === 'OPTIONS') return optionsResponse(event);
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const auth = await verifyAuth(event);
  if (!auth) return UNAUTHORIZED;

  // Rate limit
  const rateCheck = await checkRateLimit(auth.uid, 'form-check');
  if (!rateCheck.allowed) {
    return { statusCode: 429, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Too many requests. Please wait a moment.' }) };
  }

  let creditCost = 0;

  try {
    const { frames, note, targetUserId, model, quality } = JSON.parse(event.body);
    const userId = (auth.isAdmin && targetUserId) ? targetUserId : auth.uid;
    
    // Premium uses high detail vision — admin only
    const isPremium = model === 'premium' && auth.isAdmin;
    const imageDetail = isPremium ? 'high' : 'low';

    // Determine credit cost from quality
    const QUALITY_COSTS = { quick: 10, standard: 15, detailed: 25 };
    creditCost = isPremium ? 50 : (QUALITY_COSTS[quality] || 15);

    // Server-side credit deduction
    const creditResult = await deductCredits(userId, 'form-check', creditCost, auth.isAdmin);
    if (!creditResult.success) {
      return { statusCode: 402, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: `Not enough credits. Need ${creditCost}, have ${creditResult.balance}.` }) };
    }

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      await refundCredits(userId, creditCost, auth.isAdmin);
      return {
        statusCode: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No frames provided' }),
      };
    }

    if (frames.length > 25) {
      await refundCredits(userId, creditCost, auth.isAdmin);
      return {
        statusCode: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Too many frames (max 25)' }),
      };
    }

    // Build the message content with images
    const content = [];

    // Text intro
    let userText = `Analyze these ${frames.length} sequential frames from a workout video.`;
    if (note) {
      userText += `\n\nUser note: "${note}"`;
    }
    userText += `\n\nFrames are numbered 1-${frames.length} in chronological order, extracted evenly across the video (~1 per second).`;
    content.push({ type: 'text', text: userText });

    // Add each frame as an image
    frames.forEach((frame, i) => {
      content.push({
        type: 'text',
        text: `Frame ${i + 1}:`
      });
      content.push({
        type: 'image_url',
        image_url: {
          url: frame.startsWith('data:') ? frame : `data:image/jpeg;base64,${frame}`,
          detail: imageDetail,
        },
      });
    });

    logActivity({ type: 'form-check', title: 'Form Check', description: `Analyzed ${frames.length} frames (${quality || 'standard'})`, model: isPremium ? 'premium' : 'standard', metadata: { userId, frameCount: frames.length, quality: quality || 'standard', hasNote: !!note } });

    const startMs = Date.now();
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      max_tokens: 4096,
      temperature: 0.3,
    });
    const responseTime = Date.now() - startMs;

    const usage = response.usage;
    // gpt-4o pricing: $2.50/1M input, $10/1M output
    const cost = (usage.prompt_tokens / 1e6) * 2.50 + (usage.completion_tokens / 1e6) * 10.00;

    const raw = response.choices[0]?.message?.content || '';

    // Parse JSON — strip markdown fences if present
    let analysis;
    try {
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      analysis = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Failed to parse form analysis JSON:', parseErr.message);
      console.error('Raw response:', raw.substring(0, 500));
      analysis = null;
    }

    // Log to tokenUsage collection
    if (db) {
      try {
        await db.collection('tokenUsage').add({
          userId,
          feature: 'form-check',
          model: 'gpt-4o',
          promptTokens: usage.prompt_tokens,
          completionTokens: usage.completion_tokens,
          totalTokens: usage.total_tokens,
          estimatedCost: cost,
          responseTimeMs: responseTime,
          userMessage: `Form check (${quality || 'standard'}): ${frames.length} frames${note ? ` — ${note}` : ''}`,
          assistantResponse: `${analysis?.exercise || 'Unknown'}: score ${analysis?.overallScore || 0}/10`,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.error('Failed to log usage:', e);
      }
    }

    if (!analysis) {
      return {
        statusCode: 200,
        headers: { ...cors, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysis: {
            exercise: 'Unknown',
            overallScore: 0,
            overallSummary: 'The analysis could not be parsed. Please try again.',
            keyIssues: [],
            keyStrengths: [],
            frames: [],
            recommendations: [],
          },
          tokens: usage,
        }),
      };
    }

    // Save successful analysis to formCheckJobs for history
    if (db && analysis.overallScore > 0) {
      try {
        const jobId = `fc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await db.collection('formCheckJobs').doc(jobId).set({
          userId,
          status: 'complete',
          quality: quality || 'standard',
          frameCount: frames.length,
          analysis,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        console.error('Failed to save form check to history:', e);
        // Don't fail the response — history save is best-effort
      }
    }

    return {
      statusCode: 200,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        analysis,
        tokens: usage,
      }),
    };
  } catch (error) {
    console.error('Form analysis error:', error);
    logError('analyze-form', error, 'high', { userId: auth.uid });
    // Refund credits on failure
    await refundCredits(auth.uid, creditCost, auth.isAdmin);

    // Detect timeout specifically
    const isTimeout = error.message?.includes('timeout') || error.message?.includes('timed out') || error.code === 'ETIMEDOUT';
    const errorMsg = isTimeout
      ? 'Analysis took too long. Try Standard (10 frames) instead of Detailed for faster results.'
      : 'Failed to analyze form. Please try again.';

    return {
      statusCode: isTimeout ? 504 : 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: errorMsg }),
    };
  }
}
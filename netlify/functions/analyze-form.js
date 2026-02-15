import OpenAI from 'openai';
import { verifyAuth, UNAUTHORIZED, CORS_HEADERS, OPTIONS_RESPONSE } from './utils/auth.js';
import { logActivity, logError } from './utils/logger.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 24000 });

const SYSTEM_PROMPT = `You are an expert strength and conditioning coach analyzing exercise form from video frames.

You will receive sequential frames extracted from a workout video, numbered in order. Analyze the movement frame by frame.

ANALYSIS RULES:
- Identify the exercise being performed from the movement pattern
- Track form throughout the entire range of motion
- Be specific about joint angles, body positions, and alignment
- Call out both good form AND issues — be balanced
- For each issue, explain WHY it matters (injury risk, muscle activation, etc.)
- Give actionable corrections, not vague advice
- If a frame is a transition or rest, note it briefly and move on
- Consider the full movement arc — some positions look wrong in isolation but are fine mid-movement

RESPOND WITH ONLY VALID JSON (no markdown, no backticks, no preamble):
{
  "exercise": "Name of the exercise detected",
  "overallScore": 7,
  "overallSummary": "2-3 sentence overall assessment",
  "keyIssues": ["Most important issue 1", "Issue 2"],
  "keyStrengths": ["What they're doing well 1", "Strength 2"],
  "frames": [
    {
      "frameNumber": 1,
      "phase": "setup|descent|bottom|ascent|lockout|transition|rest",
      "assessment": "Brief assessment of this specific frame",
      "formScore": 8,
      "cues": ["Specific coaching cue if needed"]
    }
  ],
  "recommendations": ["Top priority fix 1", "Fix 2", "Fix 3"]
}

SCORING: 1-3 dangerous form, 4-5 needs significant work, 6-7 decent with some issues, 8-9 good form, 10 textbook.

If the video is unclear, too dark, or doesn't show an exercise, say so in overallSummary and set overallScore to 0.`;

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return OPTIONS_RESPONSE;
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  const auth = await verifyAuth(event);
  if (!auth) return UNAUTHORIZED;

  try {
    const { frames, note, targetUserId, model } = JSON.parse(event.body);
    const userId = (auth.isAdmin && targetUserId) ? targetUserId : auth.uid;
    
    // Premium uses high detail vision — admin only
    const isPremium = model === 'premium' && auth.isAdmin;
    const imageDetail = isPremium ? 'high' : 'low';

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'No frames provided' }),
      };
    }

    if (frames.length > 30) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Too many frames (max 30)' }),
      };
    }

    // Build the message content with images
    const content = [];

    // Text intro
    let userText = `Analyze these ${frames.length} sequential frames from a workout video.`;
    if (note) {
      userText += `\n\nUser note: "${note}"`;
    }
    userText += `\n\nFrames are numbered 1-${frames.length} in chronological order, extracted at ~1 frame per second.`;
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

    logActivity({ type: 'form-check', title: 'Form Check', description: `Analyzed ${frames.length} frames`, model: isPremium ? 'premium' : 'standard', metadata: { userId, frameCount: frames.length, hasNote: !!note } });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      max_tokens: 4096,
      temperature: 0.3,
    });

    const raw = response.choices[0]?.message?.content || '';

    // Parse JSON — strip markdown fences if present
    let analysis;
    try {
      const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      analysis = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Failed to parse form analysis JSON:', parseErr.message);
      console.error('Raw response:', raw.substring(0, 500));
      return {
        statusCode: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
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
          tokens: response.usage,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        analysis,
        tokens: response.usage,
      }),
    };
  } catch (error) {
    console.error('Form analysis error:', error);
    logError('analyze-form', error, 'high', { userId: auth.uid });
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to analyze form. Please try again.' }),
    };
  }
}
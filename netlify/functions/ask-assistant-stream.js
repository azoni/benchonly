import OpenAI from 'openai'
import admin from 'firebase-admin';
import { buildSystemPrompt } from './utils/promptBuilder.js';
import { logActivity, logError } from './utils/logger.js';

// Initialize Firebase Admin if not already done
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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const ADMIN_EMAIL = 'charltonuw@gmail.com';

const ALLOWED_ORIGINS = [
  'https://benchpressonly.com',
  'http://localhost:5173',
  'capacitor://localhost',
  'http://localhost',
];

function getCorsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

async function verifyToken(authHeader) {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.split('Bearer ')[1];
    const decoded = await admin.auth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email,
      isAdmin: decoded.email === ADMIN_EMAIL,
    };
  } catch {
    return null;
  }
}

async function deductCredits(userId, isAdmin) {
  if (isAdmin || !db) return { success: true };
  try {
    const userRef = db.collection('users').doc(userId);
    const snap = await userRef.get();
    const balance = snap.exists ? (snap.data().credits || 0) : 0;
    if (balance < 1) return { success: false };
    await userRef.update({ credits: admin.firestore.FieldValue.increment(-1) });
    return { success: true };
  } catch {
    return { success: false };
  }
}

async function refundCredits(userId, isAdmin) {
  if (isAdmin || !db) return;
  try {
    await db.collection('users').doc(userId).update({
      credits: admin.firestore.FieldValue.increment(1)
    });
  } catch {}
}

export default async (request) => {
  const origin = request.headers.get('origin') || '';
  const cors = getCorsHeaders(origin);

  if (request.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: cors });
  }

  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: cors });
  }

  // Auth
  const auth = await verifyToken(request.headers.get('authorization'));
  if (!auth) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let creditDeducted = false;

  try {
    const { message, context } = await request.json();
    if (!message) {
      return new Response(JSON.stringify({ error: 'Message required' }), {
        status: 400,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    // Deduct credit
    const creditResult = await deductCredits(auth.uid, auth.isAdmin);
    if (!creditResult.success) {
      return new Response(JSON.stringify({ error: 'Not enough credits.' }), {
        status: 402,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }
    creditDeducted = true;

    const personality = context?.personality || 'coach';
    const { systemPrompt, isWorkoutRequest } = buildSystemPrompt(message, context, personality);

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          const startTime = Date.now();
          const openaiStream = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: message }
            ],
            temperature: 0.7,
            max_tokens: isWorkoutRequest ? 1200 : 500,
            stream: true,
            stream_options: { include_usage: true },
          });

          let fullText = '';
          let usage = null;

          for await (const chunk of openaiStream) {
            // Usage comes in the final chunk
            if (chunk.usage) {
              usage = chunk.usage;
            }

            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (delta) {
              fullText += delta;
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`)
              );
            }
          }

          const responseTime = Date.now() - startTime;

          // Parse workout JSON from accumulated text
          let workout = null;
          const workoutMatch = fullText.match(/```workout\s*([\s\S]*?)\s*```/);
          if (workoutMatch) {
            try { workout = JSON.parse(workoutMatch[1]); } catch {}
          }

          // Build usage data
          const usageData = usage ? {
            userId: auth.uid,
            feature: 'ask-assistant',
            model: 'gpt-4o-mini',
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
            estimatedCost: (usage.prompt_tokens / 1e6) * 0.15 + (usage.completion_tokens / 1e6) * 0.60,
            responseTimeMs: responseTime,
            userMessage: (message || '').slice(0, 500),
            assistantResponse: fullText.replace(/```workout[\s\S]*?```/g, '').trim().slice(0, 1000),
            createdAt: new Date().toISOString(),
          } : null;

          // Send final event with metadata
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true, workout, usage: usageData })}\n\n`)
          );

          // Log activity (fire and forget)
          if (usage) {
            const cost = (usage.prompt_tokens / 1e6) * 0.15 + (usage.completion_tokens / 1e6) * 0.60;
            logActivity({
              type: 'assistant_chat',
              title: workout ? 'Assistant Generated Workout (Stream)' : 'Assistant Answered Question (Stream)',
              description: message.slice(0, 120),
              model: 'gpt-4o-mini',
              tokens: { prompt: usage.prompt_tokens, completion: usage.completion_tokens, total: usage.total_tokens },
              cost,
            });
          }
        } catch (err) {
          console.error('[ask-assistant-stream] Stream error:', err);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: err.message || 'Stream failed' })}\n\n`)
          );
          // Refund on error
          if (creditDeducted) {
            await refundCredits(auth.uid, auth.isAdmin);
            creditDeducted = false;
          }
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('[ask-assistant-stream] Error:', error);
    logError('ask-assistant-stream', error, 'high', { action: 'stream-chat' });
    if (creditDeducted) {
      await refundCredits(auth.uid, auth.isAdmin);
    }
    return new Response(JSON.stringify({ error: 'Failed to start stream' }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
};

export const config = {
  path: '/.netlify/functions/ask-assistant-stream',
};

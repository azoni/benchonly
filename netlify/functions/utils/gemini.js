import { GoogleGenerativeAI } from '@google/generative-ai'

// Gemini model selection
// gemini-2.0-flash  — standard: fast, cheap, strong vision
// gemini-1.5-pro    — premium:  larger context, best reasoning
const GEMINI_STANDARD = 'gemini-2.0-flash'
const GEMINI_PREMIUM  = 'gemini-1.5-pro'

// Approximate cost per 1M tokens (USD) for logging
const GEMINI_RATES = {
  [GEMINI_STANDARD]: { input: 0.10, output: 0.40 },
  [GEMINI_PREMIUM]:  { input: 1.25, output: 5.00 },
}

/**
 * Call Gemini with a system prompt + multipart user content.
 * Throws if GOOGLE_API_KEY is missing or the call fails — caller handles fallback.
 *
 * @param {string} systemPrompt
 * @param {Array}  parts  - Gemini parts array from buildGeminiParts()
 * @param {boolean} isPremium
 * @returns {{ text: string, model: string, promptTokens: number, completionTokens: number, cost: number }}
 */
export async function callGemini(systemPrompt, parts, isPremium) {
  if (!process.env.GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY not set')

  const genai = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY)
  const modelName = isPremium ? GEMINI_PREMIUM : GEMINI_STANDARD

  const model = genai.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
  })

  const result = await model.generateContent({
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
      maxOutputTokens: 4096,
    },
  })

  const text = result.response.text()
  const usage = result.response.usageMetadata || {}
  const promptTokens     = usage.promptTokenCount     || 0
  const completionTokens = usage.candidatesTokenCount || 0
  const rates = GEMINI_RATES[modelName] || GEMINI_RATES[GEMINI_STANDARD]
  const cost = (promptTokens / 1e6) * rates.input + (completionTokens / 1e6) * rates.output

  return { text, model: modelName, promptTokens, completionTokens, cost }
}

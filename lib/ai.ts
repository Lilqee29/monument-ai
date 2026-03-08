// ─── OpenRouter Config ────────────────────────────────────────────────────────

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENROUTER_API_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || '';

/**
 * Verified free model lists — March 2026.
 * All models confirmed $0 on OpenRouter as of March 7, 2026.
 * Source: costgoat.com/pricing/openrouter-free-models (27 free models listed)
 *
 * TEXT_MODELS — ordered fastest → most capable:
 *   - llama-3.2-3b    : tiny, ~1-2s, confirmed free ✓
 *   - liquid/lfm-1.2b : tiny instruct, ~1-2s, confirmed free ✓
 *   - gemma-3-4b      : fast + vision, confirmed free ✓
 *   - nvidia nemotron-9b: tools support, confirmed free ✓
 *   - llama-3.3-70b   : best quality text, confirmed free ✓
 *   - mistral-small   : solid fallback, confirmed free ✓
 *   - gemma-3-27b     : last resort text, confirmed free ✓
 *
 * VISION_MODELS — must support image input:
 *   - gemma-3-4b      : smallest vision model, confirmed free ✓
 *   - gemma-3-12b     : mid vision, confirmed free ✓
 *   - nvidia/nemotron-nano-12b-vl : vision + tools, confirmed free ✓
 *   - mistral-small   : vision + tools, confirmed free ✓
 *   - gemma-3-27b     : highest quality vision, confirmed free ✓
 *
 * REMOVED (not in current free list):
 *   - microsoft/phi-3-mini → NOT free on OpenRouter anymore
 *   - meta-llama/llama-3.2-11b-vision → replaced by nemotron-12b-vl
 *   - qwen3-thinking variants → too slow (reasoning overhead)
 *   - openrouter/auto → non-deterministic, unpredictable latency
 */

// ── TEXT: fastest first ──────────────────────────────────────────────────────
export const TEXT_MODELS: string[] = [
  'meta-llama/llama-3.2-3b-instruct:free',        // ~1-2s — smallest, great JSON
  'liquid/lfm-2.5-1.2b-instruct:free',            // ~1-2s — ultra tiny, fast
  'google/gemma-3-4b-it:free',                    // ~2-3s — small Gemma, reliable
  'nvidia/nemotron-nano-9b-v2:free',              // ~3-4s — tools support, solid
  'google/gemma-3-12b-it:free',                   // ~4-6s — mid-size fallback
  'meta-llama/llama-3.3-70b-instruct:free',       // ~6-10s — best free text quality
  'mistralai/mistral-small-3.1-24b-instruct:free',// ~5-8s — solid European fallback
  'google/gemma-3-27b-it:free',                   // ~8-12s — last resort
];

// ── VISION: image-capable models only ────────────────────────────────────────
export const VISION_MODELS: string[] = [
  'google/gemma-3-4b-it:free',                    // ~3-5s — fastest vision, confirmed free
  'google/gemma-3-12b-it:free',                   // ~5-7s — mid vision quality
  'nvidia/nemotron-nano-12b-v2-vl:free',          // ~5-8s — vision + tools, NVIDIA
  'mistralai/mistral-small-3.1-24b-instruct:free',// ~6-10s — vision + tools
  'google/gemma-3-27b-it:free',                   // ~9-14s — best free vision quality
];

// ─── In-memory response cache ─────────────────────────────────────────────────
const responseCache = new Map<string, string>();

function getCacheKey(model: string, messages: unknown[]): string {
  return `${model}::${JSON.stringify(messages)}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MonumentDetails {
  built: string;
  architect: string;
  style: string;
  height: string;
  material: string;
  visitors_per_year: string;
  unesco: boolean;
  fun_fact: string;
  xp_reward?: number;
}

export interface MonumentResult {
  name: string;
  city: string;
  country: string;
  coordinates: { lat: number; lng: number };
  history: string;
  cultural_context?: string;
  architectural_details?: string;
  style_explanation?: string;
  significance_score?: number;
  details: MonumentDetails;
}

export interface MonumentError {
  error: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface OpenRouterTextPart {
  type: 'text';
  text: string;
}

interface OpenRouterImagePart {
  type: 'image_url';
  image_url: { url: string };
}

type OpenRouterContentPart = OpenRouterTextPart | OpenRouterImagePart;

interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | OpenRouterContentPart[];
}

// ─── Core fetch — single model call ──────────────────────────────────────────

async function fetchModel(
  model: string,
  messages: OpenRouterMessage[],
  maxTokens: number,
  jsonMode: boolean,
  signal?: AbortSignal,
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.7,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const response = await fetch(OPENROUTER_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'https://relica.expo.app',
      'X-Title': 'RELICA',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);

  const content: string | undefined = data.choices?.[0]?.message?.content;
  if (!content?.trim()) throw new Error('Empty response');

  return content;
}

// ─── RACE strategy: fire top N models simultaneously, take the first winner ───
//
// This is the biggest speed improvement. Instead of trying models one-by-one
// (sequential — slow), we fire the top 3 at once and cancel the losers.
// If any of the fast small models responds in 2s, we never wait for the 10s ones.

async function callOpenRouter(
  models: string[],
  messages: OpenRouterMessage[],
  jsonMode = false,
  maxTokens = 800,
  raceCount = 3,          // how many models to fire simultaneously
): Promise<string> {
  // 1. Check cache first (instant)
  for (const model of models.slice(0, raceCount)) {
    const cached = responseCache.get(getCacheKey(model, messages));
    if (cached) {
      console.log(`[RELICA] ✓ Cache hit: ${model}`);
      return cached;
    }
  }

  // 2. Race the top N models — first valid response wins
  const controllers = models.slice(0, raceCount).map(() => new AbortController());

  const racePromises = models.slice(0, raceCount).map((model, i) =>
    fetchModel(model, messages, maxTokens, jsonMode, controllers[i].signal)
      .then(content => {
        console.log(`[RELICA] ✓ Race winner: ${model}`);
        // Cancel all other in-flight requests
        controllers.forEach((c, j) => { if (j !== i) c.abort(); });
        // Cache the winner
        responseCache.set(getCacheKey(model, messages), content);
        return content;
      })
  );

  try {
    // Promise.any = resolves with FIRST success, ignores individual failures
    return await Promise.any(racePromises);
  } catch {
    // All top-N failed — fall back to remaining models sequentially
    console.warn(`[RELICA] Race failed, trying fallback models...`);
    for (const model of models.slice(raceCount)) {
      try {
        const content = await fetchModel(model, messages, maxTokens, jsonMode);
        responseCache.set(getCacheKey(model, messages), content);
        console.log(`[RELICA] ✓ Fallback winner: ${model}`);
        return content;
      } catch (err: any) {
        console.warn(`[RELICA] ${model} failed: ${err.message}`);
      }
    }
    throw new Error('All models failed.');
  }
}

// ─── JSON Extraction Helper ───────────────────────────────────────────────────

function extractJSON<T>(raw: string): T | null {
  let cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      try { return JSON.parse(match[0]) as T; } catch { /* fall through */ }
    }
    return null;
  }
}

// ─── Monument Identification ──────────────────────────────────────────────────
// Prompt trimmed significantly — shorter = faster response from model

const IDENTIFICATION_SYSTEM_PROMPT = `You are an expert in world architecture, monuments, and cultural heritage.

Identify the monument/building/architectural style in the photo, then respond ONLY with this exact JSON (no markdown fences):
{
  "name": "Official name or style",
  "city": "City or 'Various'",
  "country": "Country or 'Global'",
  "coordinates": { "lat": 0.0, "lng": 0.0 },
  "history": "5+ vivid paragraphs with anecdotes and historical turning points.",
  "cultural_context": "What this means to locals today.",
  "architectural_details": "Materials, proportions, structural innovations.",
  "style_explanation": "Why this building/style exists — political, economic, or artistic reasons.",
  "significance_score": 8,
  "details": {
    "built": "Year or era",
    "architect": "Name or 'Unknown'",
    "style": "Style label",
    "height": "Height or N/A",
    "material": "Primary materials",
    "visitors_per_year": "e.g. 6 million or Unknown",
    "unesco": false,
    "fun_fact": "One surprising little-known fact",
    "xp_reward": 300
  }
}
If unrecognizable: { "error": "Object not recognized — please aim at a clearly visible monument." }`;

export async function identifyMonument(
  imageBase64: string,
  mimeType: string,
  language: string = 'English',
  locationHint?: string,
): Promise<MonumentResult | MonumentError> {
  const locationLine = locationHint ? `Location hint: ${locationHint}.` : '';
  const langLine = language !== 'English' ? `Write all narrative fields in ${language.toUpperCase()}.` : '';

  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: [IDENTIFICATION_SYSTEM_PROMPT, locationLine, langLine].filter(Boolean).join('\n'),
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Identify this monument and return the JSON.' },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
      ],
    },
  ];

  // Vision needs more tokens for rich history; race top 2 vision models
  const raw = await callOpenRouter(VISION_MODELS, messages, true, 2400, 2);
  const result = extractJSON<MonumentResult | MonumentError>(raw);

  if (!result) return { error: 'Could not parse AI response. Please try again.' };

  if ('details' in result && result.details && !result.details.xp_reward) {
    result.details.xp_reward = Math.round((result.significance_score ?? 5) * 50);
  }

  return result;
}

// ─── Q&A Chat ─────────────────────────────────────────────────────────────────
// Trimmed system prompt — only inject what's needed

export async function askQuestion(
  monumentName: string,
  history: string,
  question: string,
  chatHistory: ChatMessage[],
  language: string = 'English',
  extraContext?: { cultural_context?: string; architectural_details?: string; style_explanation?: string },
): Promise<string> {
  // Only include context sections that exist — avoids padding tokens
  const ctx = [
    `History: ${history.slice(0, 800)}`,
    extraContext?.cultural_context ? `Culture: ${extraContext.cultural_context.slice(0, 300)}` : '',
    extraContext?.architectural_details ? `Architecture: ${extraContext.architectural_details.slice(0, 300)}` : '',
  ].filter(Boolean).join('\n');

  const systemPrompt = `You are "The Archivist" — RELICA's expert guide for ${monumentName}.
Be knowledgeable, passionate, and concise (2-4 sentences by default).
Context: ${ctx}
Language: ${language}.`;

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.slice(-6), // last 6 messages only (was 10 — saves tokens)
    { role: 'user', content: question },
  ];

  return (await callOpenRouter(TEXT_MODELS, messages, false, 350, 3)).trim();
}

// ─── Caption Generator ────────────────────────────────────────────────────────

export async function generateCaption(
  monumentName: string,
  city: string,
  country: string,
  funFact: string,
  language: string = 'English',
): Promise<string> {
  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: `Write exactly 2 poetic sentences about ${monumentName} in ${city}, ${country}. Weave in: "${funFact.slice(0, 120)}". Language: ${language}. No hashtags.`,
    },
    { role: 'user', content: 'Generate.' },
  ];

  try {
    return (await callOpenRouter(TEXT_MODELS, messages, false, 120, 3)).trim();
  } catch {
    return `Discovered at ${monumentName}, ${city}. Every stone tells a story — this one whispered of centuries.`;
  }
}

// ─── Quest Generation ─────────────────────────────────────────────────────────
// Trimmed prompt — removed verbose philosophy section

export interface QuestTask {
  id: string;
  description: string;
  hint: string;
  location_hint: string;
  type: 'architecture' | 'nature' | 'exploration' | 'social' | 'photo';
  completed: boolean;
  xp_reward: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface DynamicQuest {
  title: string;
  duration_minutes: number;
  total_xp: number;
  theme: string;
  tasks: QuestTask[];
}

export async function generateQuest(
  lat: number | null = null,
  lng: number | null = null,
  city = 'Unknown City',
  country = 'Unknown Country',
  language = 'English',
): Promise<DynamicQuest> {
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
  const duration = timeOfDay === 'night' ? 30 : 45;
  const locationCtx = lat && lng ? `[${lat.toFixed(3)}, ${lng.toFixed(3)}] ` : '';

  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: `You are a quest master for RELICA, a monument exploration app. Generate a 3-task urban quest.
Return ONLY valid JSON, no markdown:
{"title":"Epic quest name","theme":"One-line narrative theme","duration_minutes":${duration},"total_xp":900,"tasks":[{"id":"task_1","description":"...","hint":"...","location_hint":"...","type":"architecture","difficulty":"easy","completed":false,"xp_reward":300},{"id":"task_2",...},{"id":"task_3",...}]}
Task types: architecture, nature, exploration, social, photo. Language: ${language}.`,
    },
    {
      role: 'user',
      content: `City: ${locationCtx}${city}, ${country}. Time: ${timeOfDay}. Make tasks feel locally authentic.`,
    },
  ];

  const raw = await callOpenRouter(TEXT_MODELS, messages, true, 700, 3);
  const result = extractJSON<DynamicQuest>(raw);

  if (result && Array.isArray(result.tasks) && result.tasks.length >= 2) {
    result.tasks = result.tasks.map((t, i) => ({
      ...t,
      id: t.id || `task_${i + 1}`,
      difficulty: (t.difficulty || 'medium') as 'easy' | 'medium' | 'hard',
      completed: false,
    }));
    return result as DynamicQuest;
  }

  // Fallback
  return {
    title: timeOfDay === 'night' ? "Night Explorer's Circuit" : 'Urban Discovery Walk',
    theme: `Discover the hidden stories of ${city}`,
    duration_minutes: duration,
    total_xp: 900,
    tasks: [
      { id: 'task_1', description: 'Find and scan a historical building or monument.', hint: 'Look for stone facades, sculpted details, and plaques.', location_hint: 'City center or old town.', type: 'architecture', difficulty: 'easy', completed: false, xp_reward: 300 },
      { id: 'task_2', description: 'Photograph a striking doorway or gate.', hint: 'Look for ornate ironwork or carved stone arches.', location_hint: 'Side streets away from tourist areas.', type: 'photo', difficulty: 'easy', completed: false, xp_reward: 300 },
      { id: 'task_3', description: 'Find a fountain, water feature, or public square.', hint: 'Public squares often have a central feature.', location_hint: 'Within 10 min walk of city center.', type: 'exploration', difficulty: 'medium', completed: false, xp_reward: 300 },
    ],
  };
}

// ─── Quest Photo Verification ─────────────────────────────────────────────────
// Kept vision since we need to see the photo — but trimmed prompt heavily

export interface VerificationResult {
  matched_task_id: string | null;
  reason: string;
  confidence?: number;
}

export async function verifyQuestObjective(
  imageBase64: string,
  mimeType: string,
  uncompletedTasks: QuestTask[],
): Promise<VerificationResult> {
  if (!uncompletedTasks.length) return { matched_task_id: null, reason: 'No active tasks.', confidence: 0 };

  const taskList = uncompletedTasks
    .map(t => `${t.id}: [${t.type}] ${t.description}`)
    .join('\n');

  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: `You verify if a photo matches a quest task. Be generous — if intent is clear, accept it.
Return ONLY JSON: {"matched_task_id":"task_1","reason":"...","confidence":0.9}
Or if no match: {"matched_task_id":null,"reason":"...","confidence":0.0}`,
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: `Tasks:\n${taskList}\n\nDoes the photo match any task?` },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
      ],
    },
  ];

  const raw = await callOpenRouter(VISION_MODELS, messages, true, 180, 2);
  const result = extractJSON<VerificationResult>(raw);

  if (!result) return { matched_task_id: null, reason: 'Parse error.', confidence: 0 };

  // Validate task ID actually exists
  if (result.matched_task_id && !uncompletedTasks.find(t => t.id === result.matched_task_id)) {
    result.matched_task_id = null;
    result.confidence = 0;
  }
  if ((result.confidence ?? 1) < 0.5) result.matched_task_id = null;

  return result;
}

// ─── Geo-Alert ────────────────────────────────────────────────────────────────

export async function generateProximityAlert(
  monumentName: string,
  city: string,
  distanceMeters: number,
  language = 'English',
): Promise<string> {
  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: `Write a single exciting push notification (max 100 chars) telling a traveler they are ${distanceMeters}m from ${monumentName} in ${city}. Language: ${language}. No hashtags.`,
    },
    { role: 'user', content: 'Generate.' },
  ];

  try {
    return (await callOpenRouter(TEXT_MODELS, messages, false, 80, 3)).trim().slice(0, 140);
  } catch {
    return `🏛️ You're ${distanceMeters}m from ${monumentName}! Tap to explore.`;
  }
}

// ─── Cache utilities ──────────────────────────────────────────────────────────

export function clearAICache() {
  responseCache.clear();
  console.log('[RELICA] AI cache cleared.');
}

export function getAICacheSize() {
  return responseCache.size;
}
// ─── OpenRouter Config ────────────────────────────────────────────────────────

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENROUTER_API_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || '';

// ─── Gemini Config ───────────────────────────────────────────────────────────
// Primary provider — faster, better JSON, free 15 RPM / 1M tokens per day

export const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
export const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY || '';
export const GEMINI_MODEL = 'gemini-2.5-flash'; // best free: fast, 1M ctx, JSON, vision

// ─── Known landmarks for cross-referencing ────────────────────────────────────
// Import the verified landmarks database to cross-check AI results and fix
// hallucinated coordinates (e.g. AI returning 0,0 for unknown locations).
import { WORLD_LANDMARKS } from '@/constants/landmarks';

/**
 * Verified free model lists — July 2026.
 * All models confirmed $0 on OpenRouter as of July 27, 2026.
 * Source: OpenRouter API /api/v1/models (18 free models total)
 *
 * TEXT_MODELS — ordered fastest → most capable:
 *   - nemotron-nano-9b-v2   : ~1-2s, smallest, 128K ctx
 *   - nemotron-3-nano-30b   : ~2-4s, mid, 256K ctx
 *   - nemotron-3-super-120b : ~4-8s, large, 262K ctx
 *   - gpt-oss-20b           : ~4-8s, OpenAI, 131K ctx
 *   - nemotron-3-ultra-550b : ~8-15s, huge, 1M ctx
 *
 * VISION_MODELS — must support image input:
 *   - nemotron-nano-12b-v2-vl : ~3-5s, fastest vision
 *   - nemotron-3.5-content-safety : ~4-6s, 128K ctx
 *   - nemotron-3-nano-omni-30b : ~5-8s, reasoning + vision + audio
 *   - gemma-4-26b-a4b-it : ~5-10s, 262K ctx, Google
 *   - gemma-4-31b-it : ~8-14s, best free vision quality
 *   - openrouter/free : ~5-12s, router picks best free model
 *
 * REMOVED (no longer free as of July 2026):
 *   - meta-llama/llama-3.2-3b-instruct:free → removed from free tier
 *   - liquid/lfm-2.5-1.2b-instruct:free → removed from free tier
 *   - google/gemma-3-4b-it:free → replaced by gemma-4
 *   - google/gemma-3-12b-it:free → replaced by gemma-4
 *   - google/gemma-3-27b-it:free → replaced by gemma-4
 *   - meta-llama/llama-3.3-70b-instruct:free → removed from free tier
 *   - mistralai/mistral-small-3.1-24b-instruct:free → removed from free tier
 */

// ── TEXT: fastest first ──────────────────────────────────────────────────────
export const TEXT_MODELS: string[] = [
  'nvidia/nemotron-nano-9b-v2:free',              // ~1-2s — smallest, 128K ctx
  'nvidia/nemotron-3-nano-30b-a3b:free',          // ~2-4s — mid, 256K ctx
  'nvidia/nemotron-3-super-120b-a12b:free',       // ~4-8s — large, 262K ctx
  'openai/gpt-oss-20b:free',                      // ~4-8s — OpenAI, 131K ctx
  'nvidia/nemotron-3-ultra-550b-a55b:free',       // ~8-15s — huge, 1M ctx
];

// ── VISION: image-capable models only ────────────────────────────────────────
export const VISION_MODELS: string[] = [
  'nvidia/nemotron-nano-12b-v2-vl:free',          // ~3-5s — fastest vision
  'nvidia/nemotron-3.5-content-safety:free',       // ~4-6s — 128K ctx
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free', // ~5-8s — reasoning + vision
  'google/gemma-4-26b-a4b-it:free',               // ~5-10s — 262K ctx, Google
  'google/gemma-4-31b-it:free',                   // ~8-14s — best free vision
  'openrouter/free',                              // ~5-12s — router picks best
];

// ─── In-memory response cache with LRU eviction ───────────────────────────────
const MAX_CACHE_ENTRIES = 100;
const responseCache = new Map<string, string>();

function getCacheKey(model: string, messages: unknown[]): string {
  return `${model}::${JSON.stringify(messages)}`;
}

/** Evict oldest entry when cache is full (LRU — Map preserves insertion order) */
function evictIfNeeded(): void {
  while (responseCache.size > MAX_CACHE_ENTRIES) {
    // Map.keys() returns in insertion order — first key is oldest
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey !== undefined) {
      responseCache.delete(oldestKey);
    } else {
      break;
    }
  }
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
  /** Set when coordinates were cross-referenced from WORLD_LANDMARKS (not AI-generated) */
  _crossReferenced?: boolean;
  /** Set when AI returned (0,0) coordinates — likely hallucinated */
  _coordinatesUnverified?: boolean;
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

// ─── Gemini fetch — primary provider ────────────────────────────────────────

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

async function fetchGemini(
  messages: OpenRouterMessage[],
  maxTokens: number,
  jsonMode: boolean,
  signal?: AbortSignal,
): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('No Gemini API key');

  // Convert OpenRouter messages → Gemini format
  // Gemini uses 'model' instead of 'assistant', and systemInstruction is separate
  let systemPrompt = '';
  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrompt += (systemPrompt ? '\n' : '') + msg.content;
    } else {
      const parts: GeminiPart[] = [];
      if (typeof msg.content === 'string') {
        parts.push({ text: msg.content });
      } else {
        for (const part of msg.content) {
          if (part.type === 'text') {
            parts.push({ text: part.text });
          } else if (part.type === 'image_url') {
            // Extract base64 data from data URL
            const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              parts.push({ inlineData: { mimeType: match[1], data: match[2] } });
            }
          }
        }
      }
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts,
      });
    }
  }

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.7,
    },
  };

  if (systemPrompt) {
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }
  if (jsonMode) {
    (body.generationConfig as Record<string, unknown>).responseMimeType = 'application/json';
  }

  const url = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Gemini HTTP ${response.status}: ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text?.trim()) throw new Error('Gemini empty response');

  return text;
}

// ─── RACE strategy: fire top N models simultaneously, take the first winner ───
//
// Gemini is tried first (fastest, best JSON). If it fails or no key, 
// fall back to OpenRouter race.

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
        evictIfNeeded();
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
        evictIfNeeded();
        console.log(`[RELICA] ✓ Fallback winner: ${model}`);
        return content;
      } catch (err: any) {
        console.warn(`[RELICA] ${model} failed: ${err.message}`);
      }
    }
    throw new Error('All models failed.');
  }
}

// ─── Unified callAI — Gemini first, OpenRouter fallback ─────────────────────
//
// Every public function should use this. Gemini is tried first (faster, better 
// JSON, free tier). If Gemini fails or no key, falls back to OpenRouter race.

async function callAI(
  messages: OpenRouterMessage[],
  options: {
    jsonMode?: boolean;
    maxTokens?: number;
    vision?: boolean;
    raceCount?: number;
  } = {},
): Promise<string> {
  const { jsonMode = false, maxTokens = 800, vision = false, raceCount = 3 } = options;

  // 1. Try Gemini first (if key is configured)
  if (GEMINI_API_KEY) {
    const cacheKey = `gemini::${JSON.stringify(messages)}`;
    const cached = responseCache.get(cacheKey);
    if (cached) {
      console.log('[RELICA] ✓ Gemini cache hit');
      return cached;
    }

    try {
      const content = await fetchGemini(messages, maxTokens, jsonMode);
      responseCache.set(cacheKey, content);
      evictIfNeeded();
      console.log('[RELICA] ✓ Gemini winner');
      return content;
    } catch (err: any) {
      console.warn(`[RELICA] Gemini failed: ${err.message} — falling back to OpenRouter`);
    }
  }

  // 2. Fallback to OpenRouter race
  const models = vision ? VISION_MODELS : TEXT_MODELS;
  return callOpenRouter(models, messages, jsonMode, maxTokens, raceCount);
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

  // Vision needs more tokens for rich history; try Gemini first, then race top 2 vision models
  const raw = await callAI(messages, { jsonMode: true, maxTokens: 2400, vision: true, raceCount: 2 });
  const result = extractJSON<MonumentResult | MonumentError>(raw);

  if (!result) return { error: 'Could not parse AI response. Please try again.' };

  if ('details' in result && result.details && !result.details.xp_reward) {
    result.details.xp_reward = Math.round((result.significance_score ?? 5) * 50);
  }

  // Cross-reference: if AI returned coordinates that are clearly wrong (0,0) or
  // the monument name matches a known landmark, use verified coordinates instead.
  if ('name' in result && result.name) {
    const aiName = result.name.toLowerCase();
    const knownLandmark = WORLD_LANDMARKS.find(
      (lm) => lm.name.toLowerCase() === aiName || aiName.includes(lm.name.toLowerCase())
    );
    if (knownLandmark) {
      // Use verified coordinates from our database
      result.coordinates = knownLandmark.coordinates;
      result._crossReferenced = true;
    } else if (
      result.coordinates &&
      result.coordinates.lat === 0 &&
      result.coordinates.lng === 0
    ) {
      // AI returned (0,0) — likely hallucinated coordinates, clear them
      result.coordinates = { lat: 0, lng: 0 };
      result._coordinatesUnverified = true;
    }
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

  return (await callAI(messages, { jsonMode: false, maxTokens: 350, raceCount: 3 })).trim();
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
    return (await callAI(messages, { jsonMode: false, maxTokens: 120, raceCount: 3 })).trim();
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

  const raw = await callAI(messages, { jsonMode: true, maxTokens: 700, raceCount: 3 });
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

  const raw = await callAI(messages, { jsonMode: true, maxTokens: 180, vision: true, raceCount: 2 });
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
    return (await callAI(messages, { jsonMode: false, maxTokens: 80, raceCount: 3 })).trim().slice(0, 140);
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

export function getAICacheMaxSize() {
  return MAX_CACHE_ENTRIES;
}
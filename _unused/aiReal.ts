// ─── OpenRouter Config ────────────────────────────────────────────────────────

export const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENROUTER_API_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || '';

/**
 * Model Priority List — updated March 2026.
 * Vision-capable models are used for image analysis.
 * Text models for quest gen, Q&A, verification text.
 * Each list ordered by quality → cost → fallback.
 */
export const VISION_MODELS: string[] = [
  'google/gemma-3-27b-it:free',              // ~8s, no thinking overhead
  'mistralai/mistral-small-3.1-24b-instruct:free', // ~10s fallback
  'google/gemma-3-12b-it:free',              // ~6s smaller fallback
  'qwen/qwen3-vl-30b-a3b-thinking',          // slow reasoning, last resort
  'google/gemma-3-4b-it:free',
  'openrouter/auto',
];

export const TEXT_MODELS: string[] = [
  'google/gemma-3-27b-it:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'google/gemma-3-12b-it:free',
  'qwen/qwen3-vl-30b-a3b-thinking',
  'openrouter/auto',
];

// ─── In-memory response cache ─────────────────────────────────────────────────
// Prevent identical requests from hitting the API multiple times per session.
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
  significance_score?: number; // 1-10 rarity/importance score
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

// ─── Core fetch helper ────────────────────────────────────────────────────────

const RETRY_DELAY_MS = 400;

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Tries each model in order, with caching and exponential backoff on failure.
 * Returns the raw string content from the winning model.
 */
async function callOpenRouter(
  models: string[],
  messages: OpenRouterMessage[],
  jsonMode = false,
  maxTokens = 3200
): Promise<string> {
  let lastError: Error = new Error('All models failed.');

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const cacheKey = getCacheKey(model, messages);

    // 1. Check in-memory cache
    if (responseCache.has(cacheKey)) {
      console.log(`[RELICA] ✓ Cache hit: ${model}`);
      return responseCache.get(cacheKey)!;
    }

    // 2. Exponential backoff wait after first failure
    if (i > 0) await sleep(RETRY_DELAY_MS * i);

    try {
      console.log(`[RELICA] Trying: ${model}`);

      const body: Record<string, unknown> = {
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.7,
      };

      if (jsonMode) {
        body.response_format = { type: 'json_object' };
      }

      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'HTTP-Referer': 'https://relica.expo.app',
          'X-Title': 'RELICA',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[RELICA] HTTP ${response.status} from ${model}: ${errText.slice(0, 120)}`);
        lastError = new Error(`HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();

      if (data.error) {
        console.warn(`[RELICA] ${model} API error → ${data.error.message}`);
        lastError = new Error(data.error.message);
        continue;
      }

      const content: string | undefined = data.choices?.[0]?.message?.content;

      if (!content || content.trim() === '') {
        console.warn(`[RELICA] ${model} → empty response`);
        continue;
      }

      console.log(`[RELICA] ✓ Success: ${model} (${content.length} chars)`);

      // 3. Cache the response
      responseCache.set(cacheKey, content);

      return content;
    } catch (err: any) {
      console.error(`[RELICA] Network error (${model}): ${err.message}`);
      lastError = err;
    }
  }

  throw lastError;
}

// ─── JSON Extraction Helper ───────────────────────────────────────────────────

function extractJSON<T>(raw: string): T | null {
  // Strip markdown fences
  let cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  // Strip CDATA-like <think>...</think> reasoning blocks some models emit
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Last resort: grab the first JSON object/array in the response
    const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]) as T;
      } catch { /* fall through */ }
    }
    return null;
  }
}

// ─── Monument Identification ──────────────────────────────────────────────────

const IDENTIFICATION_SYSTEM_PROMPT = `
You are a world-class authority on art history, architecture, cultural landmarks, and heritage sites.

The user will send you a photo of: a monument, landmark, historical building, OR an architectural style (e.g. Haussmannian Paris, Brutalist library, Victorian terrace).

Your twin goals:
1. IDENTIFY the exact landmark, building, or architectural style with maximum precision.
2. NARRATE its story in rich, engaging prose that would captivate a curious traveler.

If it's an architectural STYLE (not a single building), explain WHY the buildings look that way — the political, economic, or social forces that shaped them.

QUALITY REQUIREMENTS:
- "history": Write a MINIMUM of 5 vivid paragraphs. Weave in anecdotes, turning points, and human drama.
- "cultural_context": Explain what this place means to locals today — rituals, pride, controversy.
- "architectural_details": Describe materials, proportions, signature elements, and craftmanship.
- "style_explanation": Provide the deep WHY — who commissioned it, what ideology it embodies, what problem it solved.
- "significance_score": Rate 1-10 how globally important/rare this monument is (10 = Eiffel Tower level).
- "details.xp_reward": Based on significance_score, award between 50 (local gem) and 500 (world wonder) XP.
- "details.material": Primary construction material(s).
- "details.visitors_per_year": Approximate annual visitor count or "Unknown".

You MUST respond ONLY in valid JSON. No markdown fences, no commentary — raw JSON only.

EXACT structure:
{
  "name": "Full official name or architectural style",
  "city": "City name (or 'Various' for a style)",
  "country": "Country (or 'Global' for styles)",
  "coordinates": { "lat": 0.0, "lng": 0.0 },
  "history": "Rich 5+ paragraph narrative with human stories and historical turning points.",
  "cultural_context": "What this place means to locals today — ceremonies, pride, controversies.",
  "architectural_details": "Specific materials, dimensions, structural innovations, ornamental details.",
  "style_explanation": "The political, economic, or artistic reason this style/building exists.",
  "significance_score": 8,
  "details": {
    "built": "Year or era",
    "architect": "Name(s) or 'Unknown'",
    "style": "Precise style label",
    "height": "Height with unit, or N/A",
    "material": "Primary material(s)",
    "visitors_per_year": "e.g. 6 million",
    "unesco": false,
    "fun_fact": "One genuinely surprising, little-known fact",
    "xp_reward": 300
  }
}

If you genuinely cannot identify the image with reasonable confidence, respond ONLY with:
{ "error": "Object not recognized — please aim at a clearly visible monument or building." }
`.trim();

export async function identifyMonument(
  imageBase64: string,
  mimeType: string,
  language: string = 'English',
  locationHint?: string
): Promise<MonumentResult | MonumentError> {
  const locationCtx = locationHint
    ? `\n\nUser's current location context: ${locationHint}. Use this to narrow your identification if multiple monuments match.`
    : '';

  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content:
        IDENTIFICATION_SYSTEM_PROMPT +
        locationCtx +
        `\n\nCRITICAL: You MUST write all narrative text (history, cultural_context, architectural_details, style_explanation, fun_fact) completely in ${language.toUpperCase()}. JSON keys must remain in English.`,
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Please identify this monument and return its complete history and all details in the JSON format specified. Be as thorough and vivid as possible.',
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${imageBase64}`,
          },
        },
      ],
    },
  ];

  const raw = await callOpenRouter(VISION_MODELS, messages, true, 3800);
  const result = extractJSON<MonumentResult | MonumentError>(raw);

  if (!result) {
    console.error('[RELICA] JSON extraction failed. Raw:', raw.slice(0, 300));
    return { error: 'Could not parse AI response. Please try again.' };
  }

  // Post-process: ensure xp_reward is set
  if ('details' in result && result.details && !result.details.xp_reward) {
    const score = result.significance_score ?? 5;
    result.details.xp_reward = Math.round(score * 50);
  }

  return result;
}

// ─── Q&A Chat ─────────────────────────────────────────────────────────────────

export async function askQuestion(
  monumentName: string,
  history: string,
  question: string,
  chatHistory: ChatMessage[],
  language: string = 'English',
  extraContext?: { cultural_context?: string; architectural_details?: string; style_explanation?: string }
): Promise<string> {
  const contextBlocks = [
    `📜 HISTORY:\n${history}`,
    extraContext?.cultural_context ? `🏙️ CULTURAL CONTEXT:\n${extraContext.cultural_context}` : '',
    extraContext?.architectural_details ? `🏗️ ARCHITECTURE:\n${extraContext.architectural_details}` : '',
    extraContext?.style_explanation ? `🎨 STYLE EXPLANATION:\n${extraContext.style_explanation}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const systemPrompt = `
You are "The Archivist" — RELICA's expert guide persona, specializing in ${monumentName}.

Your character:
- Deeply knowledgeable but never condescending
- Speaks with genuine passion and vivid storytelling
- Uses precise historical dates, names, and details
- Occasionally shares your own "perspective" as an ancient archivist

Your knowledge base for ${monumentName}:
${contextBlocks}

Response guidelines:
- Always respond in ${language.toUpperCase()}
- Default to 2-4 sentences; expand to full paragraphs ONLY when the user asks for more detail
- Use concrete details — avoid vague platitudes
- If asked something completely unrelated to this monument, gently redirect with humor
- When uncertain about a specific fact, say so honestly rather than fabricating
- End complex answers with "Would you like me to elaborate on any particular aspect?"
  `.trim();

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.slice(-10), // Keep last 10 messages for context window efficiency
    { role: 'user', content: question },
  ];

  const answer = await callOpenRouter(TEXT_MODELS, messages, false, 800);
  return answer.trim();
}

// ─── Smart Monument Caption Generator ────────────────────────────────────────

/**
 * Generates a poetic, shareable caption for a monument photo.
 * Used for the share card feature.
 */
export async function generateCaption(
  monumentName: string,
  city: string,
  country: string,
  funFact: string,
  language: string = 'English'
): Promise<string> {
  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: `You are a poetic travel writer. Write exactly 2 sentences — a striking opener and a closing hook — about ${monumentName} in ${city}, ${country}. Fun fact to weave in: "${funFact}". Write in ${language.toUpperCase()}. No hashtags, no emojis. Pure evocative prose.`,
    },
    { role: 'user', content: 'Generate the caption.' },
  ];

  try {
    const result = await callOpenRouter(TEXT_MODELS, messages, false, 200);
    return result.trim();
  } catch {
    return `Discovered at ${monumentName}, ${city}. Every stone tells a story — this one whispered of centuries.`;
  }
}

// ─── Gamification & Quests ────────────────────────────────────────────────────

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

const QUEST_SYSTEM_PROMPT = `
You are the Quest Master AI for 'RELICA' — a gamified urban exploration app.
Your quests should feel like real adventures, not scavenger hunt checklists.

Quest Design Philosophy:
- Each task should feel achievable within 5-20 minute walking distance
- Mix task TYPES: architecture (scan a building), nature (find a unique plant), exploration (discover a hidden alley), photo (frame a specific shot), social (ask a local)
- The quest theme should match the city's personality (e.g. "Art Nouveau Paris", "Ancient Rome Circuit")
- Hints should be evocative and specific, not generic

You MUST respond ONLY in valid JSON. No markdown fences.

EXACT structure:
{
  "title": "Quest name that feels epic (e.g. 'Shadows of the Republic')",
  "theme": "One-line description of the quest's narrative theme",
  "duration_minutes": 45,
  "total_xp": 1000,
  "tasks": [
    {
      "id": "task_1",
      "description": "Find and photograph a door that is over 100 years old.",
      "hint": "Look for worn ironwork handles and stone door frames — not modern glass.",
      "location_hint": "The oldest streets near the cathedral district.",
      "type": "photo",
      "difficulty": "easy",
      "completed": false,
      "xp_reward": 300
    },
    ...3 tasks total...
  ]
}
`.trim();

export async function generateQuest(
  lat: number | null = null,
  lng: number | null = null,
  city: string = 'Unknown City',
  country: string = 'Unknown Country',
  language: string = 'English'
): Promise<DynamicQuest> {
  // Add time-of-day context for more relevant quests
  const hour = new Date().getHours();
  const timeOfDay =
    hour >= 5 && hour < 12 ? 'morning' :
    hour >= 12 && hour < 17 ? 'afternoon' :
    hour >= 17 && hour < 21 ? 'evening' : 'night';

  const locationContext = lat && lng
    ? `GPS coordinates [${lat.toFixed(4)}, ${lng.toFixed(4)}] in `
    : '';

  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content:
        QUEST_SYSTEM_PROMPT +
        `\n\nCRITICAL: Translate all quest content (title, theme, descriptions, hints) into ${language.toUpperCase()}. Keep JSON keys in English.`,
    },
    {
      role: 'user',
      content: `Generate an exploration quest for a user currently in ${locationContext}${city}, ${country}. It is currently ${timeOfDay}. Make the tasks feel authentically local — reference the city's known landmarks, streets, or cultural identity. The quest should be doable in ${timeOfDay === 'night' ? '30' : '45'} minutes by foot.`,
    },
  ];

  const raw = await callOpenRouter(TEXT_MODELS, messages, true, 1600);
  const result = extractJSON<DynamicQuest>(raw);

  if (result && result.tasks?.length >= 2) {
    // Ensure all tasks have required fields
    result.tasks = result.tasks.map((t, i) => ({
      ...t,
      id: t.id || `task_${i + 1}`,
      difficulty: t.difficulty || 'medium',
      completed: false,
    }));
    return result;
  }

  console.error('[RELICA] Quest parse failed, using fallback. Raw:', raw.slice(0, 200));

  // Smart fallback based on time of day
  return {
    title: timeOfDay === 'night' ? "Night Explorer's Circuit" : "Urban Discovery Walk",
    theme: `Discover the hidden stories of ${city}`,
    duration_minutes: timeOfDay === 'night' ? 30 : 45,
    total_xp: 900,
    tasks: [
      {
        id: 'task_1',
        description: 'Find and scan a historical building or monument.',
        hint: 'Look for stone facades, sculpted details, and plaques on walls.',
        location_hint: 'City center or old town district.',
        type: 'architecture',
        difficulty: 'easy',
        completed: false,
        xp_reward: 300,
      },
      {
        id: 'task_2',
        description: 'Photograph a striking doorway or gate.',
        hint: 'Look for ornate ironwork, carved stone arches, or brightly painted wood.',
        location_hint: 'Side streets away from main tourist areas.',
        type: 'photo',
        difficulty: 'easy',
        completed: false,
        xp_reward: 300,
      },
      {
        id: 'task_3',
        description: 'Find a fountain, water feature, or public square.',
        hint: 'Public squares often have a central feature — look for gathered locals.',
        location_hint: 'Within 10 minutes walk of the city center.',
        type: 'exploration',
        difficulty: 'medium',
        completed: false,
        xp_reward: 300,
      },
    ],
  };
}

// ─── Gamification Photo Verification ──────────────────────────────────────────

const VERIFICATION_SYSTEM_PROMPT = `
You are the Verification Engine for RELICA's quest system.

Your job: Determine if a submitted photo satisfies any ONE of the active, uncompleted quest tasks.

Verification philosophy:
- Be GENEROUS. If the intent is clear, accept it.
- "Find a bronze statue" + photo of ANY statue = MATCH
- "Photograph a doorway" + photo of ANY door = MATCH  
- Only reject if the photo is completely unrelated (e.g. a selfie when the task was to find a building)
- One photo can only complete ONE task at a time (the best match)

You MUST respond ONLY in valid JSON. No markdown fences.
{
  "matched_task_id": "task_1",
  "reason": "The image clearly shows a historic stone building facade matching the architecture task.",
  "confidence": 0.92
}

If no tasks are satisfied:
{
  "matched_task_id": null,
  "reason": "The image does not appear to match any active task.",
  "confidence": 0.0
}
`.trim();

export interface VerificationResult {
  matched_task_id: string | null;
  reason: string;
  confidence?: number;
}

export async function verifyQuestObjective(
  imageBase64: string,
  mimeType: string,
  uncompletedTasks: QuestTask[]
): Promise<VerificationResult> {
  if (uncompletedTasks.length === 0) {
    return { matched_task_id: null, reason: 'No active tasks.', confidence: 0 };
  }

  const taskList = uncompletedTasks
    .map(t => `ID: ${t.id} | Type: ${t.type} | Difficulty: ${t.difficulty || 'medium'}\nTask: ${t.description}`)
    .join('\n\n');

  const messages: OpenRouterMessage[] = [
    { role: 'system', content: VERIFICATION_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Active quest tasks to check:\n\n${taskList}\n\nAnalyze the submitted image and return your verdict as JSON.`,
        },
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${imageBase64}` },
        },
      ],
    },
  ];

  const raw = await callOpenRouter(VISION_MODELS, messages, true, 2000); // was 3800
  const result = extractJSON<VerificationResult>(raw);

  if (!result) {
    return { matched_task_id: null, reason: 'Parse error.', confidence: 0 };
  }

  // Safety guard: if AI returns a non-existent task ID, nullify it
  if (result.matched_task_id && !uncompletedTasks.find(t => t.id === result.matched_task_id)) {
    result.matched_task_id = null;
    result.confidence = 0;
  }

  // Only accept matches above 50% confidence
  if (result.confidence !== undefined && result.confidence < 0.5) {
    result.matched_task_id = null;
  }

  return result;
}

// ─── Geo-Alert Monument Hint ──────────────────────────────────────────────────

/**
 * Given nearby POI data, generate an enticing "you're close to X" notification.
 * Used by the geofencing system.
 */
export async function generateProximityAlert(
  monumentName: string,
  city: string,
  distanceMeters: number,
  language: string = 'English'
): Promise<string> {
  const messages: OpenRouterMessage[] = [
    {
      role: 'system',
      content: `You are writing a short, exciting push notification (max 120 characters) to alert a traveler that they are ${distanceMeters}m away from ${monumentName} in ${city}. Make it feel urgent and exciting. In ${language.toUpperCase()}. No hashtags.`,
    },
    { role: 'user', content: 'Generate the alert.' },
  ];

  try {
    const result = await callOpenRouter(TEXT_MODELS, messages, false, 120);
    return result.trim().slice(0, 140);
  } catch {
    return `🏛️ You're ${distanceMeters}m from ${monumentName}! Tap to start exploring.`;
  }
}

// ─── Cache utilities ──────────────────────────────────────────────────────────

export function clearAICache() {
  responseCache.clear();
  console.log('[RELICA] Cache cleared.');
}

export function getAICacheSize() {
  return responseCache.size;
}

// src/lib/gemini-pool.ts
// Gemini API Multi-Key Pool with automatic failover and exhaustion tracking.
// When an active key exhausts its quota (429/402/403/401), it is automatically
// removed from rotation and the system immediately switches to the next available backup key.

const RAW_GEMINI_KEYS: string[] = [];

// Load keys from environment variables securely
if (process.env.GEMINI_API_KEY) {
  const keys = process.env.GEMINI_API_KEY.split(',').map(k => k.trim()).filter(Boolean);
  RAW_GEMINI_KEYS.push(...keys);
}

if (process.env.GEMINI_BACKUP_KEYS) {
  const backupKeys = process.env.GEMINI_BACKUP_KEYS.split(',').map(k => k.trim()).filter(Boolean);
  for (const bk of backupKeys) {
    if (!RAW_GEMINI_KEYS.includes(bk)) {
      RAW_GEMINI_KEYS.push(bk);
    }
  }
}

// In-memory set of exhausted or failed keys
const exhaustedKeys = new Set<string>();

let currentKeyIndex = 0;

export interface GeminiMessage {
  role: 'user' | 'assistant' | 'system' | 'model';
  content: string;
}

export function cleanAsterisks(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1') // Bold **matn** -> matn
    .replace(/^\s*\*\s+/gm, '• ')   // * bullet -> •
    .replace(/\*/g, '')             // Qolgan yulduzchalar
    .replace(/#/g, '')              // Markdown sarlavhalar
    .trim();
}

/**
 * Returns the pool status: active keys count, exhausted keys count.
 */
export function getGeminiPoolStatus() {
  const activeKeys = RAW_GEMINI_KEYS.filter(k => !exhaustedKeys.has(k));
  return {
    total: RAW_GEMINI_KEYS.length,
    activeCount: activeKeys.length,
    exhaustedCount: exhaustedKeys.size,
    currentKeyMasked: activeKeys[0] ? `${activeKeys[0].slice(0, 10)}...${activeKeys[0].slice(-5)}` : 'None',
  };
}

/**
 * Executes a Gemini prompt with automatic failover across all pool keys.
 * If a key hits 429 (rate limit), 403 (quota), 402 or 401, it is permanently marked as exhausted.
 */
export async function generateGeminiContent(
  systemInstruction: string,
  messages: { role: string; content: string }[],
  temperature = 0.7,
  maxOutputTokens = 1024
): Promise<string> {
  const modelName = 'gemini-flash-lite-latest';

  // Format contents for Gemini v1beta
  const conversationParts = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  if (conversationParts.length === 0) {
    throw new Error('Gemini: no user messages provided');
  }

  // Iterate through available keys
  const triedKeys = new Set<string>();

  while (triedKeys.size < RAW_GEMINI_KEYS.length) {
    // Find next available key not in exhaustedKeys
    const availableKeys = RAW_GEMINI_KEYS.filter(k => !exhaustedKeys.has(k));
    if (availableKeys.length === 0) {
      throw new Error(`[Gemini Pool] Barcha ${RAW_GEMINI_KEYS.length} ta Gemini API kalitlari limiti tugadi!`);
    }

    // Wrap index safely
    if (currentKeyIndex >= availableKeys.length) {
      currentKeyIndex = 0;
    }

    const apiKey = availableKeys[currentKeyIndex];
    triedKeys.add(apiKey);
    const maskedKey = `${apiKey.slice(0, 10)}...${apiKey.slice(-5)}`;

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: conversationParts,
          generationConfig: {
            maxOutputTokens,
            temperature,
          },
        }),
      });

      // Check for limit / quota exhaustion / auth errors
      if (response.status === 429 || response.status === 402 || response.status === 403 || response.status === 401) {
        const errorText = await response.text();
        console.warn(`[Gemini Pool] Kalit (${maskedKey}) limiti yoki ruxsati tugadi (HTTP ${response.status}). Zaxira kalitga o'tilmoqda... Xato:`, errorText);
        
        // Kalit butunlay o'chiriladi
        exhaustedKeys.add(apiKey);
        currentKeyIndex = 0; // Keyingi bo'sh kalitga o'tamiz
        continue;
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error (HTTP ${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!candidateText) {
        throw new Error('Gemini javob bermadi yoki bloklandi.');
      }

      // Success!
      return cleanAsterisks(candidateText);
    } catch (err: any) {
      console.warn(`[Gemini Pool] Xatolik (${maskedKey}):`, err.message || err);
      // Agar tarmoq xatosi yoki 5xx bo'lsa ham keyingi kalitni sinab ko'ramiz
      currentKeyIndex = (currentKeyIndex + 1) % Math.max(1, availableKeys.length);
      
      // If it was an explicit API error with exhaustion, we already added to exhaustedKeys
      if (triedKeys.size >= availableKeys.length) {
        throw err;
      }
    }
  }

  throw new Error('[Gemini Pool] Barcha mavjud zaxira kalitlar sinab ko\'rildi, hech biri ishlamadi.');
}

import { NextRequest, NextResponse } from 'next/server';
import { generateGeminiContent, cleanAsterisks, getGeminiPoolStatus } from '@/lib/gemini-pool';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

const SYSTEM_PROMPT = `Sen "Muqimiy Aql Markazi" (Qo'qon Universiteti qoshidagi zamonaviy interaktiv AI Kiosk platformasi) virtual yo'lboshchisisan. Isming Muqimiy AI.

SENING TO'LIQ BILIMLAR BAZANG VA IMKONIYATLARING:
1. MUQIMIY AQL MARKAZI VA QO'QON UNIVERSITETI:
   - Ushbu interaktiv kiosk Qo'qon Universiteti tomonidan talabalar, yoshlar va barcha fuqarolarga raqamli ta'lim, kasbiy yo'naltirish va zamonaviy texnologiyalarni bepul taqdim etish uchun ishlab chiqilgan.
   - Platforma ovozli sun'iy intellekt, neyron nutq (VoiceLab) va realistik video avatar texnologiyalari bilan jihozlangan.

2. BARCHA 6 TA ASOSIY YO'NALISH:
   - 1. TIL O'RGANISH (Ibrat Farzandlari bilan hamkorlikda): Ingliz (IELTS, CEFR A1-C1), Rus, Xitoy (HSK) va Nemis (Ausbildung, Goethe) tillarini noldan boshlab bepul video darslar orqali o'rganish.
   - 2. KASB O'RGANISH (Ustoz AI bilan hamkorlikda): Web dasturlash (Frontend, Backend, Python, JavaScript), Grafik dizayn (Figma, Photoshop), SMM va marketing, Sun'iy intellekt muhandisligi.
   - 3. XAVFSIZ MIGRATSIYA: Xorijda qonuniy o'qish va ishlash, davlat rasmiy manbalari, Janubiy Koreya (EPS), Germaniya (Ausbildung), Yaponiya va boshqa davlatlarga xavfsiz viza tartiblari.
   - 4. PSIXOLOGIK KO'MAK: Maxfiy ruhiy testlar, stress va xavotirni yengish, miyani tozalovchi ultra-yuqori 9,000 Hz, 10,000 Hz va 40,000 Hz Gamma solfeggio tovush to'lqinlari, AI psixolog bilan samimiy suhbat.
   - 5. AI MULOQOT VA AI HUB: Eng ilg'or sun'iy intellekt vositalari (ChatGPT, Midjourney, Claude, Gemini), matn va tasvir generatorlari katalogi.
   - 6. BUYUK ALLOMALAR VA TARIXIY SHAXSLAR: Sohibqiron Amir Temur, Alisher Navoiy, Mirzo Ulug'bek, Mahmudxo'ja Behbudiy va Abdulla Avloniy bilan bevosita jonli ovozli muloqot va ularning hayotiy saboqlari.

3. QANDAY JAVOB BERISH KERAK:
   - Foydalanuvchi platforma, uning bo'limlari, qanday ishlashi yoki o'zini qiziqtirgan har qanday savolni bersa: juda samimiy, dono, aniq, ilhomlantiruvchi va ravon o'zbek tilida javob ber.
   - HECH QACHON yulduzcha (* yoki **) belgilaridan foydalanma (ovozli o'qishda xalaqit bermasligi uchun).
   - Javoblaringni ixcham, tushunarli va chiroyli so'zlar bilan tuz. Ovozli muloqotda tinglovchiga xush yoqadigan samimiy do'stona ohangda gapir.`;

// 1. GEMINI (Asosiy — Multi-Key Pool zaxirasi bilan, limiti tugasa keyingisiga avtomatik o'tadi)
async function callGemini(messages: ChatMessage[]): Promise<string> {
  return await generateGeminiContent(SYSTEM_PROMPT, messages, 0.7, 1024);
}

// 2. GROQ (1-chi zaxira)
async function callGroq(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return cleanAsterisks(data.choices?.[0]?.message?.content || 'Javob olinmadi.');
}

// 3. DEEPSEEK (2-chi zaxira)
async function callDeepSeek(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not set');

  const response = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return cleanAsterisks(data.choices?.[0]?.message?.content || 'Javob olinmadi.');
}

// 4. KIE AI (3-chi zaxira)
async function callKIE(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) throw new Error('KIE_API_KEY not set');

  const response = await fetch('https://api.kie.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages.map(m => ({ role: m.role, content: m.content })),
      ],
      max_tokens: 1024,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`KIE AI error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return cleanAsterisks(data.choices?.[0]?.message?.content || 'Javob olinmadi.');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, userName, userAge } = body as {
      messages: ChatMessage[];
      userName?: string;
      userAge?: number;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'Messages required' }, { status: 400 });
    }

    // Child safety filter (7-12 age)
    if (userAge && userAge <= 12) {
      const lastMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
      const unsafeWords = ['urush', 'qurol', 'zorlik', 'o\'ldirish', 'jinsiy'];
      if (unsafeWords.some(w => lastMsg.includes(w))) {
        return NextResponse.json({
          reply: `Salom ${userName || 'do\'stim'}! Keling, bilim, o'yinlar va ijodiy g'oyalar haqida gaplashamiz! 🌟`,
          provider: 'safety-filter',
        });
      }
    }

    // Fallback zanjiri: 1. Gemini (Multi-Key Pool) → 2. Groq → 3. DeepSeek → 4. KIE AI
    let reply: string;
    let provider: string;

    try {
      reply = await callGemini(messages);
      provider = 'gemini';
    } catch (geminiError) {
      console.warn('[Chat] Gemini pool failed, falling back to Groq:', geminiError);
      try {
        reply = await callGroq(messages);
        provider = 'groq';
      } catch (groqError) {
        console.warn('[Chat] Groq failed, falling back to DeepSeek:', groqError);
        try {
          reply = await callDeepSeek(messages);
          provider = 'deepseek';
        } catch (deepseekError) {
          console.warn('[Chat] DeepSeek failed, falling back to KIE AI:', deepseekError);
          try {
            reply = await callKIE(messages);
            provider = 'kie';
          } catch (kieError) {
            console.error('All 4 AI providers failed:', kieError);
            return NextResponse.json({
              reply: `Kechirasiz, hozirda AI xizmati vaqtincha ishlamayapti. Iltimos, qayta urinib ko'ring.`,
              provider: 'fallback',
            });
          }
        }
      }
    }

    return NextResponse.json({ reply, provider });
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Serverda xatolik yuz berdi' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    geminiPool: getGeminiPoolStatus(),
  });
}

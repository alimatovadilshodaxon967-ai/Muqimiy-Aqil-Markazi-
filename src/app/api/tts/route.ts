import { NextRequest, NextResponse } from 'next/server';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const ELEVENLABS_VOICE_MAP: Record<string, string> = {
  'mohira': 'EXAVITQu4vr4xnSDxMaL', // Bella - Soft, warm, pleasant female voice
  'mohira-ai': 'EXAVITQu4vr4xnSDxMaL',
  'female': 'EXAVITQu4vr4xnSDxMaL',
  'amir-temur': 'pNInz6obpgDQGcFmaJgB', // Adam - Deep, commanding, regal
  'alisher-navoiy': 'JBFqnCBsd6RMkjVDRZzb', // George - Warm, poetic, wise
  'mirzo-ulugbek': 'onwK4e9ZLuTAKqWW03F9', // Daniel - Clear, scientific, authoritative
  'mahmudxoja-behbudiy': 'ErXwobaYiN019PkySvjV', // Antoni - Resolute, energetic reformer
  'abdulla-avloniy': 'nPczCjzI2devNBz1zQrb', // Brian - Wise educator, empathetic
};

// ─── VoiceLab.uz (O'zbekiston milliy AI ovoz platformasi) ─────────────
const VOICELAB_VOICES: Record<string, string> = {
  'gulya': 'voice_7b350d91-4e56-4bc3-869c-8cd6ba646c3c', // Gulya - Sweet streamer (Juda yoqimli, samimiy ayol ovozi)
  'mohira': 'voice_7b350d91-4e56-4bc3-869c-8cd6ba646c3c',
  'female': 'voice_7b350d91-4e56-4bc3-869c-8cd6ba646c3c',
  'madina': 'voice_4ef06e6b-2229-4023-ad66-c2a7a2b736ff',
  'safiya': 'voice_2785aabd-21b5-4cc7-9845-2230186ef7d9',
  'dilnoza': 'voice_f7179d1c-07ab-4b3d-b5be-84dcf2935388',
  'javohir': 'voice_fa56cecf-9b0b-45ba-9ec3-494efb5b301f', // Javohir - Bright presenter (27 yosh, rasmiy, jarangdor yosh yo'lboshchi)
  'muqimiy': 'voice_fa56cecf-9b0b-45ba-9ec3-494efb5b301f', // Muqimiy AI yo'lboshchisi uchun Javohir ovozi
  'male': 'voice_fa56cecf-9b0b-45ba-9ec3-494efb5b301f',
  'abdulhay': 'voice_M-p5iz9z_kPWNm_C0cFqbC6X', // Abdulhay Otaxo'jayev (Piter Parker)
  'amir-temur': 'voice_8bae02c6-d078-4757-9d62-0fce6da23cf7', // Amir - Warm storyteller (Salobatli hukmdor)
  'psychologist': 'voice_fa56cecf-9b0b-45ba-9ec3-494efb5b301f',
};

// ─── VoiceLab API Key Rotation Pool (Foydalanuvchi taqdim etgan 10 ta kalit) ───
const VOICELAB_KEY_POOL: string[] = [
  'vlk_qQ4O4WlnQ-cPw23_PiBkZ8NK1Tj8Ywmu-GeltcH6VqQ', // 1. Faol kalit (200 OK)
  'vlk_WkCzoxnsKdJ3ffT3Gt-abjO9YNeyLtGY1TZlCS1VhYg', // 2. Faol kalit (200 OK)
  'vlk_sS-lIYDMWPqIaO8_iegg9D1n9SePqvNy0q6vthHk4YM', // 3. Faol kalit (200 OK)
  'vlk_Syrv5hJm2hEgsUxLNQ3cKhhmxClgFMICUduHf0EZgcc', // 4. Faol kalit (200 OK)
  'vlk_-Xishu-yP9pksI8QS_EXV8G6vJNu7VTI3Jr9NGy1s6k', // 5. Faol kalit (200 OK)
  'vlk_Vb_xPvvMYRgNW8T0r08jL1wj_JWyKOjVg5nVv852Ppw', // 6. Faol kalit (200 OK)
  'vlk_3JUy_pjdKLCP2gXDgQd-pPfnbbBjbRHpA8qQhRMoL38', // 7. Faol kalit (200 OK)
  'vlk_x7y5QaqzTurjgFKNHJ5nFAK9D8One9XaJJV7x9FGdu4', // 8. Faol kalit (200 OK)
  'vlk_jymjsVHzrXt8jTp1WtrtvH3ps1ICwZ81lLUIH81Eboc', // 9. (Limiti tugagan)
  'vlk_YVdii2PwwrYLGDS1bXJ4xbdEG0Qs6RnaIZZcJVIRbMg', // 10. (Limiti tugagan)
];

// Limiti tugagan yoki yaroqsiz kalitlar ro'yxati (avtomatik chetlatiladi)
const exhaustedVoiceLabKeys = new Set<string>();

// Xotiradagi tezkor audio kesh (0 soniyada javob, kredit sarflanmaydi)
const ttsAudioCache = new Map<string, string>();

async function synthesizeVoiceLab(text: string, figureOrVoiceId?: string): Promise<string> {
  const voiceId = (figureOrVoiceId && VOICELAB_VOICES[figureOrVoiceId])
    || (figureOrVoiceId && figureOrVoiceId.startsWith('voice_') ? figureOrVoiceId : null)
    || process.env.VOICELAB_VOICE_ID
    || 'voice_fa56cecf-9b0b-45ba-9ec3-494efb5b301f'; // Birlamchi: Javohir (Bright presenter, 27 yosh, jarangdor o'zbek yigit ovozi)

  const cleanText = text
    .replace(/[\u{1F600}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*/g, '')
    .trim();

  // 1. Keshdan tekshirish (Agar avval aytilgan bo'lsa, 0 ms da darhol qaytariladi)
  const cacheKey = `${voiceId}_${cleanText}`;
  if (ttsAudioCache.has(cacheKey)) {
    return ttsAudioCache.get(cacheKey)!;
  }

  // 2. Mavjud kalitlar zanjiri (Avtomatik navbatma-navbat o'tish)
  const availableKeys = VOICELAB_KEY_POOL.filter(k => !exhaustedVoiceLabKeys.has(k));

  if (availableKeys.length === 0) {
    throw new Error('Barcha VoiceLab API kalitlarining limiti tugagan');
  }

  let lastError: any = null;

  for (const apiKey of availableKeys) {
    try {
      const response = await fetch('https://api.voicelab.uz/v1/tts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: cleanText,
          voice_id: voiceId,
          language: 'uz',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        // 402 - Insufficient credits yoki 401 - Unauthorized bo'lsa, bu kalitni o'chiramiz va keyingisiga o'tamiz
        if (response.status === 402 || response.status === 401) {
          exhaustedVoiceLabKeys.add(apiKey);
          console.warn(`[VoiceLab Key Pool] Kalit (${apiKey.slice(0, 12)}...) limiti tugadi (Status: ${response.status}). Keyingi kalitga avtomatik o'tilmoqda...`);
          continue; // Keyingi kalitni sinaymiz
        }
        throw new Error(`VoiceLab error (${response.status}): ${errText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const audioBase64 = `data:audio/wav;base64,${buffer.toString('base64')}`;

      // Muvaffaqiyatli audioni keshga saqlaymiz
      ttsAudioCache.set(cacheKey, audioBase64);
      return audioBase64;
    } catch (err: any) {
      lastError = err;
      if (err.message?.includes('402') || err.message?.includes('401')) {
        exhaustedVoiceLabKeys.add(apiKey);
        continue;
      }
      console.warn(`[VoiceLab Key Attempt Failed]:`, err.message || err);
    }
  }

  throw lastError || new Error('VoiceLab sintezi barcha kalitlarda muvaffaqiyatsiz bo‘ldi');
}

async function synthesizeElevenLabs(text: string, figureOrVoiceId?: string): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY || 'sk_6a69c04ce21c8204d2ecb33120f4b736d5343fc1d6844c36';
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');

  const voiceId = (figureOrVoiceId && ELEVENLABS_VOICE_MAP[figureOrVoiceId]) 
    || (figureOrVoiceId && figureOrVoiceId.length > 10 ? figureOrVoiceId : null)
    || 'pNInz6obpgDQGcFmaJgB';

  const cleanText = text
    .replace(/[\u{1F600}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*/g, '')
    .trim();

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text: cleanText,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.55,
        similarity_boost: 0.85,
        style: 0.40,
        use_speaker_boost: true,
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs TTS failed: ${response.status} - ${err}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return `data:audio/mp3;base64,${buffer.toString('base64')}`;
}

async function synthesizeEdgeTTS(text: string, voice?: string, figureId?: string, rate?: string, pitch?: string): Promise<string> {
  const isFemale = voice?.toLowerCase().includes('madina') || voice?.toLowerCase().includes('female') || figureId === 'mohira' || figureId === 'mohira-ai' || figureId === 'female';
  const selectedVoice = voice || (isFemale ? 'uz-UZ-MadinaNeural' : 'uz-UZ-SardorNeural');
  const selectedRate = rate || (isFemale ? '+2%' : '+0%');
  const selectedPitch = pitch || (isFemale ? '+1Hz' : '+0Hz');

  const tts = new MsEdgeTTS();
  await tts.setMetadata(selectedVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  const { audioStream } = tts.toStream(text, { rate: selectedRate, pitch: selectedPitch });

  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    audioStream.on('data', (chunk: any) => {
      if (chunk instanceof Buffer) chunks.push(chunk);
    });
    audioStream.on('end', () => resolve());
    audioStream.on('error', (err: any) => reject(err));
  });

  const audioBuffer = Buffer.concat(chunks);
  return `data:audio/mp3;base64,${audioBuffer.toString('base64')}`;
}

async function synthesizeGoogleTTS(text: string): Promise<string> {
  const cleanText = text
    .replace(/[\u{1F600}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*/g, '')
    .trim();

  // Split text into chunks <= 200 chars if long
  const truncated = cleanText.length > 200 ? cleanText.slice(0, 200) : cleanText;
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=uz&client=tw-ob&q=${encodeURIComponent(truncated)}`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  if (!response.ok) {
    throw new Error(`Google TTS failed: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return `data:audio/mp3;base64,${buffer.toString('base64')}`;
}

let elevenLabsQuotaExceededUntil = 0;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, figureId, voice, rate, pitch } = body as {
      text: string;
      figureId?: string;
      voice?: string;
      rate?: string;
      pitch?: string;
    };

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const now = Date.now();

    // 1. VoiceLab (O'zbek ovozi)
    try {
      const audioBase64 = await synthesizeVoiceLab(text, figureId || voice);
      return NextResponse.json({
        status: 'success',
        provider: 'voicelab',
        audioBase64,
      });
    } catch (voicelabErr: any) {
      console.warn('VoiceLab TTS error, falling back:', voicelabErr.message || voicelabErr);
    }

    // 2. ElevenLabs
    const canTryElevenLabs = now > elevenLabsQuotaExceededUntil;
    if (canTryElevenLabs) {
      try {
        const audioBase64 = await synthesizeElevenLabs(text, figureId || voice);
        return NextResponse.json({
          status: 'success',
          provider: 'elevenlabs',
          audioBase64,
        });
      } catch (elevenErr: any) {
        const errMsg = String(elevenErr);
        if (errMsg.includes('quota_exceeded') || errMsg.includes('401') || errMsg.includes('429')) {
          elevenLabsQuotaExceededUntil = Date.now() + 15 * 60 * 1000;
        }
      }
    }

    // 3. Microsoft Edge Neural Uzbek TTS
    try {
      const audioBase64 = await synthesizeEdgeTTS(text, voice, figureId, rate, pitch);
      return NextResponse.json({
        status: 'success',
        provider: 'edge-tts',
        audioBase64,
      });
    } catch (edgeErr: any) {
      console.warn('Edge TTS error, falling back to Google TTS:', edgeErr.message || edgeErr);
    }

    // 4. Google Neural/Mobile TTS (100% reliable fallback)
    const audioBase64 = await synthesizeGoogleTTS(text);
    return NextResponse.json({
      status: 'success',
      provider: 'google-tts',
      audioBase64,
    });
  } catch (error) {
    console.error('TTS API error:', error);
    return NextResponse.json(
      { error: 'TTS xizmati xatolikka uchradi', details: String(error) },
      { status: 500 }
    );
  }
}

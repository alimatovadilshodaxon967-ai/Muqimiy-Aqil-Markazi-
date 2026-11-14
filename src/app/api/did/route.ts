import { NextRequest, NextResponse } from 'next/server';

// D-ID API endpoints
const DID_API_URL = 'https://api.d-id.com';

// D-ID stock presenterlar va ularning manbalari
const DID_PRESENTERS: Record<string, {
  name: string;
  sourceUrl: string;
  presenterId?: string;
  voiceId: string;
}> = {
  // Mohira / Bosh yordamchi
  mohira: {
    name: 'Alyssa (Mohira)',
    sourceUrl: 'https://clips-presenters.d-id.com/v2/Alyssa_NoHands_BlackShirt_Home/Mvn6Nalx90/y0J6MTfOaZ/image.png',
    presenterId: 'v2_public_Alyssa_NoHands_BlackShirt_Home@Mvn6Nalx90',
    voiceId: 'uz-UZ-MadinaNeural',
  },
  // Ibrat Farzandlari — Til o'qituvchisi (Lana)
  ibrat: {
    name: 'Lana (Ibrat Farzandlari)',
    sourceUrl: 'https://clips-presenters.d-id.com/v2/lana/TtreMLgSnL/b4HH6GpEhF/image.png',
    presenterId: 'v2_public_lana@TtreMLgSnL',
    voiceId: 'uz-UZ-MadinaNeural',
  },
  // Ustoz AI — Zamonaviy kasblar va IT ustozi (Matt)
  ustoz: {
    name: 'Matt (Ustoz AI)',
    sourceUrl: 'https://clips-presenters.d-id.com/v2/Matt_NoHands_GreyTshirt_Outdoor/rwE9avfhZE/Kx_xEIPaws/image.png',
    presenterId: 'v2_public_Matt_NoHands_GreyTshirt_Outdoor@rwE9avfhZE',
    voiceId: 'uz-UZ-SardorNeural',
  },
  // Migratsiya AI — Xalqaro maslahatchi (Diana)
  migration: {
    name: 'Diana (Migratsiya AI)',
    sourceUrl: 'https://clips-presenters.d-id.com/v2/diana/so9Pg73d6N/T5Ts5WC1R0/image.png',
    presenterId: 'v2_public_diana@so9Pg73d6N',
    voiceId: 'uz-UZ-MadinaNeural',
  },
};

function getAuthHeader(): string {
  const apiKey = process.env.DID_API_KEY || '';
  if (!apiKey) return '';
  if (apiKey.startsWith('Basic ')) return apiKey;
  return 'Basic ' + Buffer.from(apiKey).toString('base64');
}

let didCreditsExhaustedUntil = 0;

/**
 * POST /api/did
 * Body: { text: string, presenter?: string, voiceId?: string }
 * Returns: { success: boolean, videoUrl?: string, id?: string, fallback?: boolean, error?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, presenter = 'mohira', voiceId } = body as {
      text: string;
      presenter?: string;
      voiceId?: string;
    };

    if (!text || text.trim().length === 0) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const authHeader = getAuthHeader();
    if (!authHeader) {
      return NextResponse.json(
        { 
          fallback: true,
          error: 'D-ID API key not configured. Using local avatar fallback.',
        },
        { status: 200 }
      );
    }

    // Agar avvalgi so'rovda kredit tugaganligi aniqlangan bo'lsa, zaxira darhol ishga tushadi
    if (Date.now() < didCreditsExhaustedUntil) {
      return NextResponse.json({
        fallback: true,
        error: 'D-ID credits exhausted, using high quality studio avatar fallback',
      }, { status: 200 });
    }

    const config = DID_PRESENTERS[presenter] || DID_PRESENTERS.mohira;
    const sourceUrl = config.sourceUrl;
    const selectedVoice = voiceId || config.voiceId;

    // Matnni tozalash (emoji va markdown olib tashlash, max 500 belgi)
    const cleanText = text
      .replace(/[\u{1F600}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*/g, '')
      .replace(/#{1,6}\s/g, '')
      .trim()
      .slice(0, 500);

    // 1-QADAM: D-ID /talks endpoint orqali generatsiya boshlash
    const createResponse = await fetch(`${DID_API_URL}/talks`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        source_url: sourceUrl,
        script: {
          type: 'text',
          input: cleanText,
          provider: {
            type: 'microsoft',
            voice_id: selectedVoice,
          },
        },
        config: {
          fluent: true,
          pad_audio: 0.0,
          stitch: true,
        },
      }),
    });

    if (!createResponse.ok) {
      const errText = await createResponse.text();
      let errJson: any = null;
      try {
        errJson = JSON.parse(errText);
      } catch {}

      if (createResponse.status === 402 || String(errText).includes('not enough credits')) {
        // 15 daqiqa davomida D-ID ga ortiqcha so'rov yubormaydi va darhol studiya videosiga o'tadi
        didCreditsExhaustedUntil = Date.now() + 15 * 60 * 1000;
      }

      console.warn('D-ID API issue, falling back to local avatar:', createResponse.status, errJson || errText);
      return NextResponse.json({
        fallback: true,
        status: createResponse.status,
        error: errJson?.description || errJson?.kind || 'D-ID credits exhausted or unavailable',
      }, { status: 200 });
    }

    const createData = await createResponse.json();
    const talkId = createData.id;

    if (!talkId) {
      return NextResponse.json({
        fallback: true,
        error: 'No talk ID from D-ID',
      }, { status: 200 });
    }

    // 2-QADAM: Video tayyor bo'lguncha polling (max 25 soniya)
    const maxAttempts = 25;
    const pollInterval = 1000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const statusResponse = await fetch(`${DID_API_URL}/talks/${talkId}`, {
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
      });

      if (!statusResponse.ok) continue;

      const statusData = await statusResponse.json();

      if (statusData.status === 'done' && statusData.result_url) {
        return NextResponse.json({
          success: true,
          videoUrl: statusData.result_url,
          id: talkId,
          duration: statusData.duration,
        });
      }

      if (statusData.status === 'error') {
        return NextResponse.json({
          fallback: true,
          error: 'D-ID video render error',
          details: statusData.error,
        }, { status: 200 });
      }
    }

    // Timeout
    return NextResponse.json({
      fallback: true,
      error: 'D-ID generation timed out, using local fallback',
    }, { status: 200 });

  } catch (error) {
    console.error('D-ID API route exception:', error);
    return NextResponse.json({
      fallback: true,
      error: String(error),
    }, { status: 200 });
  }
}

/**
 * GET /api/did
 * Presenterlar ro'yxatini olish
 */
export async function GET() {
  return NextResponse.json({
    presenters: DID_PRESENTERS,
    configured: Boolean(process.env.DID_API_KEY),
  });
}

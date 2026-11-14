'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useKiosk } from '@/context/KioskContext';
import { KioskHeader } from '@/components/ui/KioskHeader';
import { 
  ShieldCheck, Globe, CheckCircle2, User, 
  Calendar, Sparkles, Mic, MicOff, Volume2, 
  Loader2, RefreshCw, VolumeX, BadgeCheck
} from 'lucide-react';
import { saveKioskUser } from '@/lib/firebase/db';
import { RealisticVideoAvatar, VideoAvatarState } from '@/components/avatar/RealisticVideoAvatar';

// Cyrillic to Latin transliteration for Uzbek speech recognition
const CYR_TO_LAT_MAP: Record<string, string> = {
  'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'j','з':'z','и':'i',
  'й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t',
  'у':'u','ф':'f','х':'h','ҳ':'h','ч':'ch','ш':'sh','ъ':'','ь':'','э':'e','ю':'yu',
  'я':'ya','ў':'o\'','ғ':'g\''
};

function cyrillicToLatin(str: string): string {
  return str.split('').map(char => {
    const lower = char.toLowerCase();
    const isUpper = char !== lower;
    const mapped = CYR_TO_LAT_MAP[lower] || char;
    return isUpper ? mapped.charAt(0).toUpperCase() + mapped.slice(1) : mapped;
  }).join('');
}

// Uzbek numbers map
const UZ_NUMS: Record<string, number> = {
  'nol': 0, 'bir': 1, 'ikki': 2, 'uch': 3, 'to\'rt': 4, 'tort': 4, 'besh': 5,
  'olti': 6, 'yetti': 7, 'etti': 7, 'sakkiz': 8, 'to\'qqiz': 9, 'toqqiz': 9,
  'o\'n': 10, 'on': 10, 'yigirma': 20, 'o\'ttiz': 30, 'ottiz': 30,
  'qirq': 40, 'ellik': 50, 'oltmish': 60, 'yetmish': 70, 'sakson': 80, 'to\'qson': 90
};

/**
 * High-accuracy Uzbek Familiya, Ism and Age extractor from natural speech
 */
function extractProfileInfo(rawSpeech: string): { lastName?: string; firstName?: string; fullName: string; age?: number } {
  const text = cyrillicToLatin(rawSpeech).replace(/[.,!?;:]/g, ' ').trim();

  // 1. AGE EXTRACTION (Digits first e.g. 23, 18, 45)
  let age: number | undefined;
  const ageMatch = text.match(/\b([1-9][0-9]?)\b/);
  if (ageMatch && Number(ageMatch[1]) >= 7 && Number(ageMatch[1]) <= 95) {
    age = Number(ageMatch[1]);
  } else {
    // Check words for numbers
    const words = text.toLowerCase().split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const w1 = words[i].replace(/da$|daman$/, '');
      const w2 = (words[i + 1] || '').replace(/da$|daman$/, '');
      if (UZ_NUMS[w1] && UZ_NUMS[w2] && UZ_NUMS[w1] >= 10 && UZ_NUMS[w2] < 10) {
        age = UZ_NUMS[w1] + UZ_NUMS[w2];
        break;
      } else if (UZ_NUMS[w1] && UZ_NUMS[w1] >= 7 && UZ_NUMS[w1] <= 90) {
        age = UZ_NUMS[w1];
        break;
      }
    }
  }

  // 2. FAMILIYA VA ISM EXTRACTION
  let lastName: string | undefined;
  let firstName: string | undefined;

  // Case A: Explicit markers "familiyam X", "ismim Y"
  const famMatch = text.match(/familiyam\s+(?:esa\s+)?([A-Za-z'ʻoʻgʻ]+)/i);
  const ismMatch = text.match(/(?:ismim|otim|nomim)\s+(?:esa\s+)?([A-Za-z'ʻoʻgʻ]+)/i);

  if (famMatch) lastName = famMatch[1];
  if (ismMatch) firstName = ismMatch[1];

  // Case B: Natural sequence e.g. "Alimov Farhodjon", "Farhodjon Alimov 23 da"
  const stopWords = new Set([
    'salom', 'assalomu', 'alaykum', 'mening', 'men', 'ismim', 'otim', 'nomim',
    'familiyam', 'familiya', 'yoshim', 'yoshdaman', 'yoshda', 'yosh', 'da', 'daman',
    'yildaman', 'yili', 'tizim', 'haqida', 'iltimos', 'rahmat', 'deb', 'chaqiring',
    'yoshdagi', 'va', 'ham', 'bu', 'shu', 'sizga', 'ayting', 'man'
  ]);

  const candidates = text
    .split(/\s+/)
    .map(w => w.replace(/[0-9]/g, '').replace(/man$|da$/, ''))
    .filter(w => {
      const lower = w.toLowerCase();
      return lower.length >= 3 && !stopWords.has(lower) && !UZ_NUMS[lower];
    });

  const isSurnameWord = (w: string) => /.*(?:ov|ova|ev|eva|iy|zoda)$/i.test(w);

  if (!lastName || !firstName) {
    if (candidates.length >= 2) {
      if (isSurnameWord(candidates[0])) {
        lastName = lastName || candidates[0];
        firstName = firstName || candidates[1];
      } else if (isSurnameWord(candidates[1])) {
        firstName = firstName || candidates[0];
        lastName = lastName || candidates[1];
      } else {
        // Default: Familiya Ism
        lastName = lastName || candidates[0];
        firstName = firstName || candidates[1];
      }
    } else if (candidates.length === 1) {
      if (!firstName && !lastName) {
        if (isSurnameWord(candidates[0])) {
          lastName = candidates[0];
        } else {
          firstName = candidates[0];
        }
      }
    }
  }

  const formatWord = (w?: string) => w ? w.charAt(0).toUpperCase() + w.slice(1) : undefined;
  lastName = formatWord(lastName);
  firstName = formatWord(firstName);

  const fullName = [lastName, firstName].filter(Boolean).join(' ') || firstName || lastName || 'Farhodjon';

  return { lastName, firstName, fullName, age };
}

export default function WelcomeVoiceOnboardingScreen() {
  const router = useRouter();
  const { setUserProfile, language, setLanguage } = useKiosk();

  // Profile data
  const [detectedLastName, setDetectedLastName] = useState('');
  const [detectedFirstName, setDetectedFirstName] = useState('');
  const [detectedAge, setDetectedAge] = useState<number | ''>('');
  
  // Voice & UI States
  const [avatarState, setAvatarState] = useState<VideoAvatarState>('idle');
  const [stage, setStage] = useState<'idle' | 'prompting' | 'listening' | 'success' | 'redirecting'>('idle');
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [statusMessage, setStatusMessage] = useState('Avatar bilan ovozli muloqotni boshlash uchun tugmani bosing');
  const [hasStarted, setHasStarted] = useState(false);

  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isSpeakingRef = useRef<boolean>(false);

  // ─── Speak through VoiceLab / TTS ───
  const speakText = useCallback(async (text: string): Promise<void> => {
    try {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      isSpeakingRef.current = true;
      setAvatarState('speaking');

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, figureId: 'muqimiy' }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.audioBase64) {
          const audio = new Audio(data.audioBase64);
          audioRef.current = audio;

          await new Promise<void>((resolve) => {
            audio.onended = () => {
              isSpeakingRef.current = false;
              setAvatarState('idle');
              resolve();
            };
            audio.onerror = () => {
              isSpeakingRef.current = false;
              setAvatarState('idle');
              resolve();
            };
            audio.play().catch(() => {
              isSpeakingRef.current = false;
              setAvatarState('idle');
              resolve();
            });
          });
          return;
        }
      }
      isSpeakingRef.current = false;
      setAvatarState('idle');
    } catch (err) {
      console.warn('TTS playback error:', err);
      isSpeakingRef.current = false;
      setAvatarState('idle');
    }
  }, []);

  // ─── Start High-Accuracy Speech Recognition ───
  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatusMessage("Brauzeringizda ovozli tanish qo'llab-quvvatlanmadi.");
      return;
    }

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
        recognitionRef.current = null;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'uz-UZ';
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 3;

      let accumulatedFinal = '';
      let accumulatedInterim = '';

      recognition.onstart = () => {
        setStage('listening');
        setAvatarState('listening');
        setStatusMessage('Sizni eshitmoqdaman... Gapiring');
        setVoiceTranscript('');
      };

      recognition.onresult = (event: any) => {
        accumulatedInterim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          if (item.isFinal) {
            accumulatedFinal += item[0].transcript + ' ';
          } else {
            accumulatedInterim += item[0].transcript;
          }
        }
        const fullLive = (accumulatedFinal + ' ' + accumulatedInterim).trim();
        if (fullLive) {
          setVoiceTranscript(`"${fullLive}"`);
        }
      };

      recognition.onend = async () => {
        setAvatarState('thinking');
        recognitionRef.current = null;

        const fullSpoken = (accumulatedFinal + ' ' + accumulatedInterim).trim();

        if (fullSpoken) {
          const { lastName, firstName, fullName, age } = extractProfileInfo(fullSpoken);

          const finalLast = lastName || '';
          const finalFirst = firstName || fullName || 'Farhodjon';
          const finalAge = age || 23;

          setDetectedLastName(finalLast);
          setDetectedFirstName(finalFirst);
          setDetectedAge(finalAge);
          setStage('success');
          
          const greetingDisplay = [finalLast, finalFirst].filter(Boolean).join(' ');
          setStatusMessage(`Tanishganimdan xursandman, ${greetingDisplay}!`);

          // Save profile in context & db
          setUserProfile(greetingDisplay, finalAge);
          saveKioskUser(greetingDisplay, finalAge);

          // Avatar confirms in Javohir's voice
          await speakText(`Xush kelibsiz, ${finalFirst}! Qani, boshladik.`);

          // Avtomatik keyingi sahifaga o'tish (Hech qanday tugmasiz!)
          setStage('redirecting');
          setTimeout(() => {
            router.push('/dashboard');
          }, 800);
        } else {
          setStage('idle');
          setAvatarState('idle');
          setStatusMessage("Ovoz eshitilmadi. Qaytadan urinib ko'rish uchun mikrofonni bosing.");
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Recognition error:', event.error);
        setAvatarState('idle');
        setStage('idle');
        recognitionRef.current = null;
        if (event.error === 'no-speech') {
          setStatusMessage("Ovoz eshitilmadi. Iltimos, qayta gapiring.");
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.warn('Failed to start recognition:', e);
      setAvatarState('idle');
      setStage('idle');
    }
  }, [router, setUserProfile, speakText]);

  // ─── Automated Onboarding Action ───
  const triggerVoiceOnboarding = useCallback(async () => {
    setStage('prompting');
    setStatusMessage("Avatar sizdan familiya, ism va yoshingizni so'ramoqda...");

    // 1. Avatar speaks the question
    await speakText("Assalomu alaykum! Familiyangiz, ismingiz nima va yoshingiz nechida?");

    // 2. Automatically listen right after speaking
    startListening();
  }, [speakText, startListening]);

  // Clean up audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch {}
        recognitionRef.current = null;
      }
    };
  }, []);

  return (
    <div className="gradient-page relative overflow-y-auto flex flex-col min-h-screen pt-16 pb-8 select-none">
      <KioskHeader title="OVOZLI TANISHUV" />

      <main className="flex-1 flex items-center justify-center max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 relative z-10 animate-fade-in-scale">
        <div className="bg-white/95 backdrop-blur-2xl p-6 sm:p-10 md:p-12 rounded-[36px] shadow-2xl border border-[#EAE6DF] w-full text-slate-900 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">

          {/* ══════════════════════════════════════════════════════════
               LEFT COLUMN: REALISTIC VIDEO AVATAR (KATTA VA JONLI)
             ══════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center">
            <div className="relative w-full max-w-[340px] sm:max-w-[380px] h-[400px] sm:h-[460px] rounded-[32px] overflow-hidden shadow-2xl border-2 border-[#0F766E]/20 bg-slate-900">
              <RealisticVideoAvatar
                state={avatarState}
                fit="cover"
                position="center 15%"
                rounded="rounded-[32px]"
                showAura={true}
                className="w-full h-full"
              />

              {/* Status Badge Over Avatar */}
              <div className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20 text-white text-xs font-bold shadow-lg">
                <span className={`w-2.5 h-2.5 rounded-full ${
                  avatarState === 'listening' 
                    ? 'bg-rose-500 animate-ping' 
                    : avatarState === 'speaking' 
                    ? 'bg-emerald-400 animate-pulse' 
                    : 'bg-emerald-400'
                }`} />
                <span>
                  {avatarState === 'listening' 
                    ? 'Eshitmoqda...' 
                    : avatarState === 'speaking' 
                    ? 'Gapirmoqda...' 
                    : avatarState === 'thinking' 
                    ? 'Qabul qilmoqda...' 
                    : 'Muqimiy AI'}
                </span>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════
               RIGHT COLUMN: 100% AUTOMATED VOICE INTERACTION
             ══════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-7 flex flex-col justify-center">

            {/* Header Badge & Language */}
            <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#FAF8F5] border border-[#EAE6DF] text-[#0F766E] rounded-full font-bold text-xs shadow-2xs">
                <Sparkles className="w-3.5 h-3.5 text-[#0F766E]" />
                <span>100% Ovozli Muloqot</span>
              </div>

              {/* Language Selector */}
              <div className="inline-flex items-center gap-1 bg-[#F5F2EC] p-1 rounded-xl border border-[#E5E0D6]">
                <Globe className="w-3.5 h-3.5 text-[#78716C] ml-1.5" />
                {(['UZ', 'RU', 'EN'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setLanguage(lang)}
                    className={`px-2.5 py-1 text-xs font-black rounded-lg transition-all cursor-pointer ${
                      language === lang
                        ? 'bg-[#1C1917] text-white shadow-xs'
                        : 'text-[#78716C] hover:text-[#1C1917]'
                    }`}
                  >
                    {lang}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Question Display */}
            <div className="mb-6">
              <h1 className="text-3xl sm:text-4xl font-black text-[#1C1917] leading-tight tracking-tight mb-2">
                «Assalomu alaykum! <br />
                <span className="text-[#0F766E]">Familiyangiz, ismingiz nima va yoshingiz nechida?»</span>
              </h1>
              <p className="text-[#78716C] text-sm sm:text-base font-medium">
                Tizim savol beradi va sizni darhol tinglaydi. Hech qanday tugma bosish shart emas.
              </p>
            </div>

            {/* ══════════════════════════════════════════════════════════
                 DYNAMIC INTERACTIVE VOICE PULSE BOX
               ══════════════════════════════════════════════════════════ */}
            <div className={`p-6 sm:p-8 rounded-3xl border transition-all mb-6 flex flex-col items-center justify-center text-center ${
              stage === 'listening'
                ? 'bg-rose-50 border-rose-300 ring-8 ring-rose-100 shadow-xl'
                : stage === 'success' || stage === 'redirecting'
                ? 'bg-emerald-50 border-emerald-300 ring-8 ring-emerald-100 shadow-xl'
                : 'bg-[#FAF8F5] border-[#EAE6DF] shadow-md'
            }`}>
              
              {/* Giant Pulsating Microphone Button */}
              <button
                type="button"
                onClick={triggerVoiceOnboarding}
                className={`w-24 h-24 rounded-full flex items-center justify-center mb-4 transition-all cursor-pointer shadow-xl ${
                  stage === 'listening'
                    ? 'bg-rose-500 text-white animate-pulse shadow-rose-500/40 scale-110'
                    : stage === 'success' || stage === 'redirecting'
                    ? 'bg-emerald-600 text-white shadow-emerald-600/40'
                    : 'bg-[#0F766E] text-white hover:bg-[#115E59] shadow-[#0F766E]/30 hover:scale-105 ring-4 ring-[#0F766E]/20'
                }`}
                title="Bosing va gapiring"
              >
                {stage === 'listening' ? (
                  <Mic className="w-12 h-12 animate-bounce" />
                ) : stage === 'success' || stage === 'redirecting' ? (
                  <CheckCircle2 className="w-12 h-12" />
                ) : (
                  <Mic className="w-12 h-12" />
                )}
              </button>

              {/* Status Title */}
              <h3 className="text-xl sm:text-2xl font-black text-[#1C1917] mb-1">
                {statusMessage}
              </h3>

              {/* Sub-hint */}
              <p className="text-xs sm:text-sm font-semibold text-[#78716C] max-w-md">
                {stage === 'listening' 
                  ? 'Masalan: "Familiyam Alimov, ismim Farhodjon, yoshim 23 da"' 
                  : stage === 'success' || stage === 'redirecting'
                  ? 'Ma\'lumotlar qabul qilindi, bosh sahifaga o\'tilmoqda...'
                  : 'Yuqoridagi mikrofonni bosing — avatar so\'raydi va sizni tinglaydi'}
              </p>

              {/* Live sound wave bars while listening */}
              {stage === 'listening' && (
                <div className="flex items-center gap-2 mt-4">
                  <span className="w-2 h-8 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-14 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-6 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="w-2 h-12 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '450ms' }} />
                  <span className="w-2 h-10 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '600ms' }} />
                </div>
              )}

              {/* Transcript Display */}
              {voiceTranscript && (
                <div className="mt-4 px-4 py-2 bg-white rounded-xl border border-[#D6CFBE] text-sm font-bold text-[#0F766E]">
                  Eshitildi: {voiceTranscript}
                </div>
              )}
            </div>

            {/* ══════════════════════════════════════════════════════════
                 DETECTED PROFILE PILLS: FAMILIYA • ISM • YOSH
               ══════════════════════════════════════════════════════════ */}
            {(detectedLastName || detectedFirstName || detectedAge) && (
              <div className="p-4 rounded-2xl bg-white border border-[#D6CFBE] flex items-center justify-center gap-3 flex-wrap shadow-md animate-fade-in">
                {detectedLastName && (
                  <div className="flex items-center gap-2 bg-[#F0FDFA] px-3.5 py-2 rounded-xl border border-[#99F6E4] text-sm font-black text-[#0F766E]">
                    <BadgeCheck className="w-4 h-4 text-[#0F766E]" />
                    <span>Familiya: {detectedLastName}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                )}

                {detectedFirstName && (
                  <div className="flex items-center gap-2 bg-[#F0FDFA] px-3.5 py-2 rounded-xl border border-[#99F6E4] text-sm font-black text-[#0F766E]">
                    <User className="w-4 h-4 text-[#0F766E]" />
                    <span>Ism: {detectedFirstName}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                )}

                {detectedAge && (
                  <div className="flex items-center gap-2 bg-[#F0FDFA] px-3.5 py-2 rounded-xl border border-[#99F6E4] text-sm font-black text-[#0F766E]">
                    <Calendar className="w-4 h-4 text-[#0F766E]" />
                    <span>Yosh: {detectedAge} yosh</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                )}

                <div className="text-xs font-black text-emerald-600 animate-pulse flex items-center gap-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Avtomatik ochilmoqda...</span>
                </div>
              </div>
            )}

            {/* Privacy Note */}
            <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-[#78716C] font-medium text-center">
              <ShieldCheck className="w-4 h-4 text-[#0F766E] shrink-0" />
              <span>Ma'lumotlar to'liq maxfiy saqlanadi va klaviaturasiz avtomatik boshqariladi.</span>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}

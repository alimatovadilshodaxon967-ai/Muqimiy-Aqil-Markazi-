'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useKiosk } from '@/context/KioskContext';
import { KioskHeader } from '@/components/ui/KioskHeader';
import { getTranslation } from '@/lib/translations';
import { RealisticVideoAvatar } from '@/components/avatar/RealisticVideoAvatar';
import { generateAIResponse, AIMessage } from '@/lib/ai/aiService';
import { detectNavigationIntent } from '@/lib/avatar/avatarNavigation';
import { 
  HeartHandshake, ShieldCheck,
  Mic, MicOff, Volume2, Wind, Music, Play, Pause, X, Loader2, Sparkles, MessageCircle
} from 'lucide-react';

// Shifobaxsh Oliy Hz va Solfeggio treklari
const HZ_TRACKS = [
  { id: '9000', hz: '9,000 Hz', title: 'Tinnitus & Miyani Tozalash', videoId: '7KUu8XL1JqQ', icon: '🧠', badge: '9,000 Hz Oliy Ringing', desc: 'Miyadagi shovqin va ortiqcha bosimni tozalovchi chastota' },
  { id: '10000', hz: '10,000 Hz', title: 'Epifiz Bezi & Fikrlar Reset', videoId: '-Paw9T7zf6s', icon: '✨', badge: '10,000 Hz Fikr Reset', desc: 'Miyadagi to‘xtovsiz salbiy fikrlarni tozalovchi sof chastota' },
  { id: '40000', hz: '40,000 Hz', title: 'Gamma To‘lqinlari (Brain Fog Reset)', videoId: 'ZkD5EJc-ZeM', icon: '⚡', badge: '40,000 Hz Gamma', desc: 'Miyadagi tumanli holat va aqliy toliqishni quvib ongni tiniqlashtiradi' },
  { id: '1111', hz: '1,111 Hz', title: 'Stress & Tinchlanish Handpan', videoId: '1C51Rz0G184', icon: '🌿', badge: '1,111 Hz Handpan', desc: 'Miyadagi shovqin va bosimni yengillashtiradi' },
  { id: '528', hz: '528 Hz', title: 'Ruhiy Quvvat & Shifo', videoId: 'mPZkdNFkNps', icon: '💖', badge: '528 Hz Shifo', desc: 'Charchoqni quvib tanaga quvvat beradi' },
];

export default function PsychologyHubScreen() {
  const router = useRouter();
  const { language, user } = useKiosk();
  const t = getTranslation(language);
  const userName = user?.name ? user.name.replace(/[0-9]/g, '').trim() : 'Farhodjon';

  // AI Avatar & Voice states
  const [avatarState, setAvatarState] = useState<'idle' | 'speaking' | 'listening' | 'thinking'>('idle');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [liveVoiceActive, setLiveVoiceActive] = useState(false);
  const [currentSpeechText, setCurrentSpeechText] = useState<string>('');
  const [conversationHistory, setConversationHistory] = useState<AIMessage[]>([]);

  // Music & Breathing states
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [currentHzIndex, setCurrentHzIndex] = useState(0);
  const [showBreathing, setShowBreathing] = useState(false);
  const [breathPhase, setBreathPhase] = useState<'inhale' | 'hold' | 'exhale'>('inhale');
  const [breathCount, setBreathCount] = useState(4);

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const speechAbortRef = useRef<boolean>(false);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const latestTranscriptRef = useRef<string>('');
  const liveVoiceActiveRef = useRef<boolean>(false);
  const isThinkingRef = useRef<boolean>(false);

  liveVoiceActiveRef.current = liveVoiceActive;
  isThinkingRef.current = isThinking;

  // ─── 4-7-8 Breathing Timer ───
  useEffect(() => {
    if (!showBreathing) return;
    let timer: NodeJS.Timeout;

    const runBreathingCycle = () => {
      setBreathPhase('inhale');
      setBreathCount(4);
      let count = 4;
      const inhaleInt = setInterval(() => {
        count--;
        setBreathCount(count);
        if (count <= 0) {
          clearInterval(inhaleInt);
          setBreathPhase('hold');
          setBreathCount(7);
          let holdCount = 7;
          const holdInt = setInterval(() => {
            holdCount--;
            setBreathCount(holdCount);
            if (holdCount <= 0) {
              clearInterval(holdInt);
              setBreathPhase('exhale');
              setBreathCount(8);
              let exhaleCount = 8;
              const exhaleInt = setInterval(() => {
                exhaleCount--;
                setBreathCount(exhaleCount);
                if (exhaleCount <= 0) {
                  clearInterval(exhaleInt);
                  runBreathingCycle();
                }
              }, 1000);
            }
          }, 1000);
        }
      }, 1000);
    };

    runBreathingCycle();
    return () => {};
  }, [showBreathing]);

  // ─── Stop Speaking Routine ───
  const stopSpeaking = useCallback(() => {
    speechAbortRef.current = true;
    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
      fetchAbortRef.current = null;
    }
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current.onended = null;
      audioPlayerRef.current.onplay = null;
      audioPlayerRef.current = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setIsThinking(false);
    setAvatarState('idle');
  }, []);

  // ─── Browser Fallback Speech ───
  const fallbackBrowserSpeech = useCallback((text: string, autoContinue = true) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);

    const voices = window.speechSynthesis.getVoices();
    const maleVoice = voices.find(v => v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('sardor') || v.name.toLowerCase().includes('david'))
      || voices.find(v => v.lang.startsWith('uz'))
      || voices.find(v => v.lang.startsWith('tr'))
      || voices[0];

    if (maleVoice) utterance.voice = maleVoice;
    utterance.rate = 0.92;
    utterance.pitch = 0.98;

    utterance.onstart = () => {
      setIsSpeaking(true);
      setAvatarState('speaking');
    };
    utterance.onend = () => {
      setIsSpeaking(false);
      setAvatarState('idle');
      if (liveVoiceActiveRef.current && autoContinue) {
        setTimeout(() => {
          if (!isThinkingRef.current && liveVoiceActiveRef.current) {
            startListening();
          }
        }, 400);
      }
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setAvatarState('idle');
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  // ─── Speak with VoiceLab / Neural TTS ───
  const speakAvatar = useCallback(async (text: string, autoContinue = true) => {
    stopSpeaking();
    speechAbortRef.current = false;
    setCurrentSpeechText(text);
    setIsThinking(true);
    setAvatarState('thinking');

    const cleanText = text
      .replace(/[\u{1F600}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{FE00}-\u{FE0F}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{200D}]|[\u{20E3}]|[\u{E0020}-\u{E007F}]/gu, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*/g, '')
      .trim();

    if (!cleanText) {
      setIsThinking(false);
      setAvatarState('idle');
      return;
    }

    try {
      const controller = new AbortController();
      fetchAbortRef.current = controller;

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText,
          figureId: 'muqimiy',
          voice: 'uz-UZ-SardorNeural',
          rate: '-2%',
          pitch: '-1Hz',
        }),
        signal: controller.signal,
      });

      setIsThinking(false);

      if (speechAbortRef.current) return;

      if (res.ok) {
        const data = await res.json();
        if (speechAbortRef.current) return;

        if (data.audioBase64) {
          const audio = new Audio(data.audioBase64);
          audioPlayerRef.current = audio;
          audio.onplay = () => {
            if (speechAbortRef.current) { audio.pause(); return; }
            setIsSpeaking(true);
            setAvatarState('speaking');
          };
          audio.onended = () => {
            setIsSpeaking(false);
            setAvatarState('idle');
            audioPlayerRef.current = null;
            if (liveVoiceActiveRef.current && autoContinue) {
              setTimeout(() => {
                if (!isThinkingRef.current && liveVoiceActiveRef.current) {
                  startListening();
                }
              }, 400);
            }
          };
          audio.onerror = () => {
            if (speechAbortRef.current) return;
            fallbackBrowserSpeech(cleanText, autoContinue);
          };
          await audio.play();
          return;
        }
      }
      fallbackBrowserSpeech(cleanText, autoContinue);
    } catch (e: any) {
      setIsThinking(false);
      if (e?.name === 'AbortError') return;
      fallbackBrowserSpeech(cleanText, autoContinue);
    }
  }, [stopSpeaking, fallbackBrowserSpeech]);

  // ─── Speech-to-Text: Continuous Friendly Voice Listening ───
  const startListening = () => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Brauzeringiz ovozli kiritishni qo'llab-quvvatlamaydi. Iltimos Google Chrome brauzeridan foydalaning.");
      return;
    }

    try {
      stopSpeaking();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'uz-UZ';
      recognition.interimResults = true;
      recognition.continuous = false;

      latestTranscriptRef.current = '';

      recognition.onstart = () => {
        setIsListening(true);
        setAvatarState('listening');
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        latestTranscriptRef.current = transcript;
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
        const spoken = latestTranscriptRef.current.trim();
        if (spoken) {
          latestTranscriptRef.current = '';
          handlePsychologyConversation(spoken);
        } else if (liveVoiceActiveRef.current) {
          // Retry if in live call mode
          setTimeout(() => {
            if (liveVoiceActiveRef.current && !isSpeaking && !isThinkingRef.current) {
              startListening();
            }
          }, 600);
        } else {
          setAvatarState('idle');
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
        recognitionRef.current = null;
        setAvatarState('idle');
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      setAvatarState('idle');
    }
  };

  // ─── Process User Voice Input through AI Psychologist ───
  const handlePsychologyConversation = async (userText: string) => {
    if (!userText || isThinking) return;

    // Boshqa bo'limga o'tish yoki bosh sahifaga qaytish buyrug'i tekshiruvi
    const navMatch = detectNavigationIntent(userText);
    if (navMatch && navMatch.targetRoute !== '/psychology') {
      setIsThinking(false);
      setIsListening(false);
      setLiveVoiceActive(false);
      speakAvatar(navMatch.confirmationSpeech, false);
      setTimeout(() => {
        stopSpeaking();
        router.push(navMatch.targetRoute);
      }, 1500);
      return;
    }

    setIsThinking(true);
    setAvatarState('thinking');

    try {
      const newHistory: AIMessage[] = [
        ...conversationHistory,
        { role: 'user', content: userText }
      ];

      const aiMessages: AIMessage[] = [
        {
          role: 'system',
          content: `Sen "Muqimiy Aql Markazi"ning mehribon, samimiy va xotirjam AI psixologisan. Isming Muqimiy AI. Tinglovchi (${userName}) bilan bevosita samimiy OVOZLI SUHBAT olib bormoqdasan.
QOIDALAR:
1. Juda samimiy, insoniy, muloyim va yupatuvchi do'stona ohangda gapir.
2. Gaplaringni qisqa, 2-3 ta chiroyli jumlada tuz (chunki bu ovozli suhbat).
3. Foydalanuvchini eshitayotganingni, uni tushunayotganingni his qildir ("Sizni juda yaxshi tushunib turibman", "Xavotir olmang, hammasi yaxshi bo'ladi").
4. Hech qachon yulduzcha (*) yoki tibbiy qiyin so'zlarni ishlatma. Oddiy insoniy mehr va xotirjamlik ber.`,
        },
        ...newHistory,
      ];

      const reply = await generateAIResponse(aiMessages, user, 'psychology');

      if (speechAbortRef.current) return;

      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: userText },
        { role: 'assistant', content: reply }
      ]);

      speakAvatar(reply, true);
    } catch {
      if (speechAbortRef.current) return;
      const fallbackReply = `Sizni eshitib turibman, ${userName}. Ko'nglingizdagi barcha og'riqlarni bemalol ayting, men sizni xotirjam tinglayman.`;
      speakAvatar(fallbackReply, true);
    } finally {
      setIsThinking(false);
    }
  };

  // Toggle Continuous Voice Mode (Go'shakni ko'tarish / qo'yish)
  const toggleLiveVoice = () => {
    if (liveVoiceActive) {
      setLiveVoiceActive(false);
      stopSpeaking();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    } else {
      setLiveVoiceActive(true);
      if (isSpeaking) {
        stopSpeaking();
      }
      startListening();
    }
  };

  // 1-bosishda tezkor suhbat boshlash
  const triggerQuickTopic = (promptText: string) => {
    setLiveVoiceActive(true);
    handlePsychologyConversation(promptText);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      stopSpeaking();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [stopSpeaking]);

  const activeTrack = HZ_TRACKS[currentHzIndex];

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1C1917] flex flex-col pt-16 select-none overflow-y-auto font-sans pb-4">
      {/* Header */}
      <KioskHeader 
        title={(t as any).psychologyTitle || "PSIXOLOGIK KO'MAK"} 
        subtitle="SAMIMIY VA MAXFIY RUHIY HAMROH" 
      />

      {/* Hidden YouTube Audio Player for Hz Music */}
      {isMusicPlaying && (
        <div className="hidden">
          <iframe
            src={`https://www.youtube.com/embed/${activeTrack.videoId}?autoplay=1&loop=1&playlist=${activeTrack.videoId}`}
            title="Solfeggio Soundwave"
            allow="autoplay"
          />
        </div>
      )}

      {/* ─── 4-7-8 Tinchlantiruvchi Nafas Mashqi Modali ─── */}
      {showBreathing && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#0B1120] border-2 border-emerald-500/40 rounded-3xl p-8 max-w-md w-full flex flex-col items-center text-center shadow-2xl relative">
            <button 
              onClick={() => setShowBreathing(false)}
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="flex items-center gap-2 text-emerald-400 font-black text-base mb-4">
              <Wind className="w-5 h-5 animate-pulse" />
              <span>4-7-8 Tinchlantiruvchi Nafas Mashqi</span>
            </div>

            <div className="relative w-56 h-56 flex items-center justify-center my-6">
              <div 
                className={`absolute inset-0 rounded-full transition-all duration-1000 ${
                  breathPhase === 'inhale' 
                    ? 'scale-110 bg-gradient-to-r from-emerald-500/40 to-teal-400/40 animate-pulse border-4 border-emerald-400'
                    : breathPhase === 'hold'
                    ? 'scale-100 bg-purple-500/30 border-4 border-purple-400'
                    : 'scale-75 bg-rose-500/30 border-4 border-rose-400'
                }`}
              />
              <div className="relative z-10 flex flex-col items-center">
                <span className="text-6xl font-black text-white">{breathCount}</span>
                <span className="text-base font-bold uppercase tracking-wider mt-2 text-teal-300">
                  {breathPhase === 'inhale' ? 'Nafas oling' : breathPhase === 'hold' ? 'Ushlab turing' : 'Sekin chiqaring'}
                </span>
              </div>
            </div>

            <p className="text-sm text-gray-300 font-medium leading-relaxed">
              Chuqur nafas oling va chiqaring. Bu mashq yurakni tinchlantiradi va miyadagi bosimni darhol yengillashtiradi.
            </p>
          </div>
        </div>
      )}

      {/* ─── MAIN CLEAN INTERFACE (ODDIY VA TUSHUNARLI) ─── */}
      <main className="flex-1 max-w-[1580px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-2 sm:py-4 flex flex-col justify-center">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-12 items-center">
          
          {/* ════════════════════════════════════════════════════════════
               CHAP TOMON: ULKAN MEHRIBON AVATAR
             ════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-6 xl:col-span-6 flex justify-center items-center">
            <div className="relative w-full max-w-[540px] xl:max-w-[580px] h-[520px] sm:h-[640px] lg:h-[720px] rounded-[36px] overflow-hidden shadow-2xl border-4 border-emerald-500/30 bg-stone-900 group">
              <RealisticVideoAvatar
                state={avatarState}
                rounded="rounded-[36px]"
                showAura={true}
                fit="cover"
                position="center 18%"
                className="w-full h-full"
              />

              {/* Status Badge */}
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-40 whitespace-nowrap">
                {isSpeaking ? (
                  <button
                    onClick={stopSpeaking}
                    className="bg-emerald-600/95 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-full flex items-center gap-2.5 shadow-xl border border-emerald-400/50 animate-pulse cursor-pointer transition-all active:scale-95"
                    title="Ovozni to'xtatish"
                  >
                    <Volume2 className="w-5 h-5 text-white" />
                    <span className="text-sm font-black">AI Psixolog gapirmoqda...</span>
                    <span className="flex items-center gap-0.5 ml-1">
                      <span className="w-1.5 h-3.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-5 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-2.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                    <span className="ml-1 text-xs bg-black/30 px-2 py-0.5 rounded-full font-bold">⏹️ To&apos;xtatish</span>
                  </button>
                ) : isListening ? (
                  <div className="bg-rose-600/95 text-white px-5 py-2.5 rounded-full flex items-center gap-2.5 shadow-xl border border-rose-400/50 animate-pulse">
                    <Mic className="w-5 h-5 text-white animate-bounce" />
                    <span className="text-sm font-black">Sizni eshitmoqdaman, bemalol gapiring...</span>
                  </div>
                ) : isThinking ? (
                  <div className="bg-amber-600/95 text-white px-5 py-2.5 rounded-full flex items-center gap-2 shadow-xl border border-amber-400/50">
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                    <span className="text-sm font-black">Sizni tushunib, javob tayyorlayapman...</span>
                  </div>
                ) : (
                  <div className="bg-black/60 backdrop-blur-md text-white px-5 py-2 rounded-full flex items-center gap-2.5 border border-white/20 shadow-lg">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-sm font-bold">Muqimiy AI • Psixologik Ko&apos;mak</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════
               O'NG TOMON: ODDIY, QULAY VA CHALG'ITMAYDIGAN MULOQOT
             ════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-6 xl:col-span-6 flex flex-col justify-center gap-5 my-auto max-w-xl">
            
            {/* 1. ASOSIY KATTA OVOZLI SUHBAT TUGMASI (Eng asosiysi!) */}
            <div className="bg-white rounded-[32px] p-6 sm:p-8 border border-[#EAE6DF] shadow-md flex flex-col items-center text-center">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-800 bg-emerald-50 px-4 py-1.5 rounded-full mb-4 border border-emerald-200">
                Jonli Ovozli Suhbat
              </span>

              <h3 className="text-xl sm:text-2xl lg:text-3xl font-black text-[#1C1917] tracking-tight mb-2">
                Dilingizdagini bemalol ayting
              </h3>
              <p className="text-sm text-[#78716C] font-semibold mb-6 max-w-md">
                Hech narsa yozish shart emas. Yashil tugmani bosing va xuddi yaqin do‘stingiz bilan gaplashgandek gapiravering.
              </p>

              {/* Ulkan Jonli Muloqot Tugmasi */}
              <button
                onClick={toggleLiveVoice}
                className={`w-full py-5 sm:py-6 px-6 rounded-2xl font-black text-base sm:text-lg flex items-center justify-center gap-3 transition-all cursor-pointer shadow-lg active:scale-95 ${
                  liveVoiceActive
                    ? 'bg-rose-600 hover:bg-rose-700 text-white ring-4 ring-rose-200 animate-pulse'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30 ring-4 ring-emerald-500/20'
                }`}
              >
                {liveVoiceActive ? (
                  <>
                    <MicOff className="w-6 h-6" />
                    <span>Suhbatni to&apos;xtatish</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-6 h-6 animate-bounce" />
                    <span>🎙️ Suhbatni boshlash (Bosing va gapiring)</span>
                  </>
                )}
              </button>
            </div>

            {/* 2. TEZKOR 3 TA ODDIY YORDAM TUGMASI */}
            <div className="space-y-3">
              <span className="text-xs font-black text-[#78716C] uppercase tracking-wider px-2">
                Yoki quyidagi tugmalardan birini tanlang:
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. Dardlashish */}
                <button
                  onClick={() => triggerQuickTopic("Assalomu alaykum! Ko'nglim juda to'lib ketdi, siz bilan dardlashmoqchiman.")}
                  className="p-4 rounded-2xl bg-white hover:bg-emerald-50 border border-[#EAE6DF] hover:border-emerald-400 text-left transition-all cursor-pointer shadow-xs active:scale-95 flex flex-col gap-1.5"
                >
                  <span className="text-2xl">💬</span>
                  <span className="text-xs sm:text-sm font-black text-[#1C1917]">Dardlashish</span>
                  <span className="text-[11px] text-[#78716C]">Ko‘nglingizdagini ochish</span>
                </button>

                {/* 2. Miyani Tozalash Musiqasi */}
                <button
                  onClick={() => setIsMusicPlaying(!isMusicPlaying)}
                  className={`p-4 rounded-2xl border text-left transition-all cursor-pointer shadow-xs active:scale-95 flex flex-col gap-1.5 ${
                    isMusicPlaying
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-md ring-2 ring-emerald-400/40'
                      : 'bg-white hover:bg-teal-50 border-[#EAE6DF] hover:border-teal-400 text-[#1C1917]'
                  }`}
                >
                  <span className="text-2xl">🧠</span>
                  <span className="text-xs sm:text-sm font-black">
                    {isMusicPlaying ? 'To\'xtatish' : 'Miyani tozalash'}
                  </span>
                  <span className={`text-[11px] ${isMusicPlaying ? 'text-emerald-100' : 'text-[#78716C]'}`}>
                    {isMusicPlaying ? '▶ Sokin musiqa yangramoqda' : 'Sokin shifobaxsh fon'}
                  </span>
                </button>

                {/* 3. Nafas Mashqi */}
                <button
                  onClick={() => setShowBreathing(true)}
                  className="p-4 rounded-2xl bg-white hover:bg-purple-50 border border-[#EAE6DF] hover:border-purple-400 text-left transition-all cursor-pointer shadow-xs active:scale-95 flex flex-col gap-1.5"
                >
                  <span className="text-2xl">🌬️</span>
                  <span className="text-xs sm:text-sm font-black text-[#1C1917]">Nafas mashqi</span>
                  <span className="text-[11px] text-[#78716C]">Tinchlanish va xotirjamlik</span>
                </button>
              </div>
            </div>

            {/* 3. MAXFIYLIK VA XAVFSIZLIK ISHONCHI */}
            <div className="flex items-center gap-2.5 px-4 py-3 bg-[#FAF8F5] border border-[#EAE6DF] rounded-2xl text-xs text-[#57534E] font-semibold">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>Suhbatingiz mutlaqo maxfiy. Hech qanday ovoz yoki shaxsiy ma’lumot saqlanmaydi.</span>
            </div>

          </div>

        </div>

      </main>
    </div>
  );
}
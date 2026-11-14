'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useKiosk } from '@/context/KioskContext';
import { KioskHeader } from '@/components/ui/KioskHeader';
import { getTranslation } from '@/lib/translations';
import { 
  ChevronUp, ChevronDown, ArrowRight, Lightbulb, 
  Sparkles, Globe, Briefcase, Compass, HeartHandshake, Bot,
  Mic, MicOff, Volume2, VolumeX, Loader2, PhoneCall, PhoneOff
} from 'lucide-react';
import { trackDirectionClick } from '@/lib/firebase/db';
import { generateAIResponse, AIMessage } from '@/lib/ai/aiService';
import { AIAvatar } from '@/components/ui/AIAvatar';
import { RealisticVideoAvatar } from '@/components/avatar/RealisticVideoAvatar';
import { detectNavigationIntent } from '@/lib/avatar/avatarNavigation';

interface DirectionCard {
  id: string;
  num: string;
  title: string;
  desc: string;
  badge: string;
  imageSrc: string;
  route: string;
  color: string;
  accentBg: string;
  accentBorder: string;
}

export default function MainDashboardScreen() {
  const router = useRouter();
  const { user, language } = useKiosk();
  const t = getTranslation(language);

  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Direct Voice States
  const [avatarState, setAvatarState] = useState<'greeting' | 'idle'>('idle');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [liveVoiceActive, setLiveVoiceActive] = useState(false);
  const [currentSpeechText, setCurrentSpeechText] = useState<string>('');
  const [lastUserSpeech, setLastUserSpeech] = useState<string>('');
  const [conversationHistory, setConversationHistory] = useState<AIMessage[]>([]);

  const recognitionRef = useRef<any>(null);
  const latestTranscriptRef = useRef<string>('');
  const liveVoiceActiveRef = useRef<boolean>(false);
  const isThinkingRef = useRef<boolean>(false);
  const speechAbortRef = useRef<boolean>(false);
  const fetchAbortRef = useRef<AbortController | null>(null);

  liveVoiceActiveRef.current = liveVoiceActive;
  isThinkingRef.current = isThinking;

  const userName = user?.name ? user.name.replace(/[0-9]/g, '').trim() : 'Farhodjon';
  const userAge = user?.age || 23;

  // ─── Text-to-Speech: Mohira speaks directly out loud ───
  const speakMohira = useCallback(async (text: string, autoContinue = true) => {
    // Clean text of markdown and emojis for speech engine
    const cleanText = text
      .replace(/[\u{1F600}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{FE00}-\u{FE0F}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{200D}]|[\u{20E3}]|[\u{E0020}-\u{E007F}]/gu, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*/g, '')
      .trim();

    if (!cleanText) return;

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
          rate: '+0%',
          pitch: '+0Hz',
        }),
        signal: controller.signal,
      });

      // Check abort flag AFTER fetch completes
      if (speechAbortRef.current) return;

      if (res.ok) {
        const data = await res.json();

        // Check abort flag AFTER parsing JSON
        if (speechAbortRef.current) return;

        if (data.audioBase64) {
          if (audioPlayerRef.current) {
            audioPlayerRef.current.pause();
            audioPlayerRef.current = null;
          }
          window.speechSynthesis?.cancel();

          // Final abort check before creating audio
          if (speechAbortRef.current) return;

          const audio = new Audio(data.audioBase64);
          audioPlayerRef.current = audio;
          audio.onplay = () => {
            if (speechAbortRef.current) { audio.pause(); return; }
            setIsSpeaking(true);
            setCurrentSpeechText(text);
          };
          audio.onended = () => {
            setIsSpeaking(false);
            setAvatarState('idle');
            audioPlayerRef.current = null;
            if (liveVoiceActiveRef.current && autoContinue) {
              setTimeout(() => {
                if (!isThinkingRef.current && liveVoiceActiveRef.current) {
                  startDirectListening();
                }
              }, 350);
            }
          };
          audio.onerror = () => {
            if (speechAbortRef.current) return;
            fallbackBrowserSynth(cleanText, text, autoContinue);
          };
          audio.play().catch(() => {
            if (speechAbortRef.current) return;
            fallbackBrowserSynth(cleanText, text, autoContinue);
          });
          return;
        }
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') return; // Intentionally aborted
      // fallback
    }

    if (speechAbortRef.current) return;
    fallbackBrowserSynth(cleanText, text, autoContinue);
  }, []);

  const fallbackBrowserSynth = (cleanText: string, fullText: string, autoContinue: boolean) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);

    const voices = window.speechSynthesis.getVoices();
    const uzVoice = voices.find(v => v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('sardor') || v.name.toLowerCase().includes('david'))
      || voices.find(v => v.lang.startsWith('uz'))
      || voices.find(v => v.lang.startsWith('tr'))
      || voices[0];

    if (uzVoice) utterance.voice = uzVoice;
    utterance.rate = 0.95;
    utterance.pitch = 0.95;
    utterance.volume = 1;

    utterance.onstart = () => {
      setIsSpeaking(true);
      setCurrentSpeechText(fullText);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setAvatarState('idle');
      if (liveVoiceActiveRef.current && autoContinue) {
        setTimeout(() => {
          if (!isThinkingRef.current && liveVoiceActiveRef.current) {
            startDirectListening();
          }
        }, 400);
      }
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  };

  // ─── Speech-to-Text: Real-Time Listening ───
  const startDirectListening = () => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Brauzeringiz ovozli kiritishni qo'llab-quvvatlamaydi. Iltimos Google Chrome brauzeridan foydalaning.");
      return;
    }

    try {
      window.speechSynthesis?.cancel();
      setIsSpeaking(false);

      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognition();
      // uz-UZ Chrome Web Speech API'da qo'llab-quvvatlanmaydi,
      // shuning uchun eng yaqin tillardan foydalanamiz
      const langPriority = ['uz-UZ', 'tr-TR', 'ru-RU', 'en-US'];
      recognition.lang = langPriority[0]; // Birinchi uz-UZ sinab ko'ramiz
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.maxAlternatives = 3;

      let langFallbackIndex = 0;

      latestTranscriptRef.current = '';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        latestTranscriptRef.current = transcript;
        setLastUserSpeech(transcript);
      };

      recognition.onend = () => {
        setIsListening(false);
        recognitionRef.current = null;
        const finalSpokenText = latestTranscriptRef.current.trim();
        if (finalSpokenText) {
          latestTranscriptRef.current = '';
          processVoiceInput(finalSpokenText);
        } else if (liveVoiceActiveRef.current) {
          // Retry if no speech was heard during live voice mode
          setTimeout(() => {
            if (liveVoiceActiveRef.current && !isSpeaking && !isThinkingRef.current) {
              startDirectListening();
            }
          }, 700);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        
        // Agar "language-not-supported" bo'lsa, keyingi tilga o'tamiz
        if (event.error === 'language-not-supported' || event.error === 'not-allowed') {
          langFallbackIndex++;
          if (langFallbackIndex < langPriority.length) {
            console.log(`Tilni o'zgartirmoqda: ${langPriority[langFallbackIndex]}`);
            setTimeout(() => {
              if (liveVoiceActiveRef.current || isListening) {
                try {
                  const retryRecognition = new SpeechRecognition();
                  retryRecognition.lang = langPriority[langFallbackIndex];
                  retryRecognition.interimResults = true;
                  retryRecognition.continuous = false;
                  retryRecognition.maxAlternatives = 3;
                  retryRecognition.onstart = recognition.onstart;
                  retryRecognition.onresult = recognition.onresult;
                  retryRecognition.onend = recognition.onend;
                  retryRecognition.onerror = recognition.onerror;
                  recognitionRef.current = retryRecognition;
                  retryRecognition.start();
                } catch (e2) {
                  console.warn('Fallback speech recognition failed:', e2);
                  setIsListening(false);
                }
              }
            }, 300);
            return;
          }
        }

        setIsListening(false);
        recognitionRef.current = null;
        if (event.error === 'no-speech' && liveVoiceActiveRef.current) {
          setTimeout(() => {
            if (liveVoiceActiveRef.current && !isSpeaking && !isThinkingRef.current) {
              startDirectListening();
            }
          }, 800);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.warn('Failed to start speech recognition:', e);
      setIsListening(false);
    }
  };

  const stopDirectListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // ─── Play Neural Audio from Python Server ───
  const playNeuralAudio = useCallback((audioBase64: string, text: string, autoContinue = true) => {
    // Don't play if speech was aborted
    if (speechAbortRef.current) return;

    try {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
        audioPlayerRef.current = null;
      }
      window.speechSynthesis?.cancel();

      // Final abort check before creating audio
      if (speechAbortRef.current) return;

      const audio = new Audio(audioBase64);
      audioPlayerRef.current = audio;

      audio.onplay = () => {
        if (speechAbortRef.current) { audio.pause(); return; }
        setIsSpeaking(true);
        setCurrentSpeechText(text);
      };

      audio.onended = () => {
        setIsSpeaking(false);
        audioPlayerRef.current = null;
        if (liveVoiceActiveRef.current && autoContinue) {
          setTimeout(() => {
            if (!isThinkingRef.current && liveVoiceActiveRef.current) {
              startDirectListening();
            }
          }, 350);
        }
      };

      audio.onerror = () => {
        setIsSpeaking(false);
        audioPlayerRef.current = null;
        if (speechAbortRef.current) return;
        speakMohira(text, autoContinue);
      };

      audio.play().catch(() => {
        if (speechAbortRef.current) return;
        speakMohira(text, autoContinue);
      });
    } catch {
      speakMohira(text, autoContinue);
    }
  }, [speakMohira]);

  // ─── Process Voice Input with Python Server (Real-Time Groq + Neural Edge-TTS) ───
  const processVoiceInput = async (userText: string) => {
    if (!userText || isThinking) return;

    setIsThinking(true);
    setLastUserSpeech(userText);

    // ── 0. OVOZLI NAVIGATSIYA: Istalgan bo'limga to'g'ridan-to'g'ri kirish ──
    const navMatch = detectNavigationIntent(userText, activeIndex);
    if (navMatch) {
      setActiveIndex(navMatch.activeIndex);
      const reply = navMatch.confirmationSpeech;

      // Ovozli tinglash rejimini to'xtatamiz
      stopDirectListening();
      setLiveVoiceActive(false);

      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: userText },
        { role: 'assistant', content: reply }
      ]);
      setCurrentSpeechText(reply);
      speakMohira(reply, false);

      // Avatar javobini boshlagach, yangi bo'lim sahifasiga o'tamiz
      setTimeout(() => {
        stopSpeaking();
        router.push(navMatch.targetRoute);
      }, 1500);

      setIsThinking(false);
      return;
    }

    const lowerUser = userText.toLowerCase();
    let directReply: string | null = null;

    // 0. Barcha yo'nalishlar haqida so'ralganda (Ketma-ketlikda tushuntirish)
    const isAskingAllDirections = 
      (lowerUser.includes('yonalish') || lowerUser.includes("yo'nalish") || lowerUser.includes('yunalish') || lowerUser.includes('bolim') || lowerUser.includes("bo'lim") || lowerUser.includes('tizim') || lowerUser.includes('platforma') || lowerUser.includes('imkoniyat')) &&
      (lowerUser.includes('qanday') || lowerUser.includes('nimalar') || lowerUser.includes('qanaqa') || lowerUser.includes('tushuntir') || lowerUser.includes('aytib ber') || lowerUser.includes('haqida') || lowerUser.includes('bor') || lowerUser.includes('qaysi') || lowerUser.includes('mavjud'));

    if (isAskingAllDirections || lowerUser.includes('barcha yo') || lowerUser.includes('hamma yo') || lowerUser.includes('nimalar qilsa') || lowerUser.includes('nima bor')) {
      setActiveIndex(0);
      directReply = `Muqimiy platformamizda jami 6 ta asosiy yo'nalish mavjud: Birinchisi — Til o'rganish, Ibrat Farzandlari orqali ingliz, rus, xitoy va nemis tillari. Ikkinchisi — Zamonaviy kasb o'rganish, Ustoz AI orqali dasturlash, dizayn va SMM. Uchinchisi — Xavfsiz migratsiya, xorijda qonuniy o'qish va ishlash. To'rtinchisi — Psixologik ko'mak, ruhiy tahlil va mutaxassis maslahatlari. Beshinchisi — Sun'iy intellekt Hubi bilan erkin muloqot. Oltinchisi — Buyuk allomalar va jadidlar bilan jonli ovozli suhbat. Istalgan bo'limga kirish uchun uning nomini ayting yoki ekrandagi kartochkani bosing!`;
    }
    // 1. Rasm va rasmiy kartalar bo'yicha qat'iy javoblar bazasi (o'zicha to'qimaslik uchun)
    else if (lowerUser.includes('til') || lowerUser.includes('ingliz') || lowerUser.includes('rus') || lowerUser.includes('nemis') || lowerUser.includes('xitoy') || lowerUser.includes('ibrat')) {
      setActiveIndex(0);
      directReply = "1-yo'nalish — Til o'rganish. Ibrat Farzandlari loyihasi bilan xorijiy tillarni: Ingliz, Rus, Xitoy va Nemis tillarini bepul o'rganing. Bo'limga kirish uchun 'bo'limga kir' deb ayting yoki o'rtadagi tugmani bosing.";
    } else if (lowerUser.includes('kasb') || lowerUser.includes('dastur') || lowerUser.includes('it') || lowerUser.includes('kurs') || lowerUser.includes('ustoz') || lowerUser.includes('smm') || lowerUser.includes('grafik') || lowerUser.includes('dizayn')) {
      setActiveIndex(1);
      directReply = "2-yo'nalish — Zamonaviy kasb o'rganish. Ustoz AI platformasi orqali Dasturlash, Grafik dizayn, SMM va Sun'iy intellekt sohalarini egallang. Kirish uchun 'bo'limga kir' deb ayting yoki tugmani bosing.";
    } else if (lowerUser.includes('migrats') || lowerUser.includes('viza') || lowerUser.includes('xorij') || lowerUser.includes('chet el') || lowerUser.includes('pasport') || lowerUser.includes('ish')) {
      setActiveIndex(2);
      directReply = "3-yo'nalish — Xavfsiz migratsiya. Xorijda qonuniy o'qish, ishlash va viza olish bo'yicha rasmiy davlat manbalaridan ma'lumot oling. Kirish uchun 'bo'limga kir' deb ayting yoki tugmani bosing.";
    } else if (lowerUser.includes('psixolog') || lowerUser.includes('stress') || lowerUser.includes('test') || lowerUser.includes('maslahat') || lowerUser.includes('yordam') || lowerUser.includes('kayfiyat')) {
      setActiveIndex(3);
      directReply = "4-yo'nalish — Psixologik ko'mak. O'z his-tuyg'ularingizni tahlil qiling, ruhiy testlardan o'ting va mutaxassis tavsiyalarini oling. Muloqotimiz mutlaqo maxfiy. Kirish uchun 'bo'limga kir' deb ayting yoki tugmani bosing.";
    } else if (lowerUser.includes('ai') || lowerUser.includes("sun'iy") || lowerUser.includes('bot') || lowerUser.includes('texnologiya') || lowerUser.includes('intellekt')) {
      setActiveIndex(4);
      directReply = "5-yo'nalish — Sun'iy intellekt bilan ochiq muloqot. Eng zamonaviy AI imkoniyatlari va raqamli vositalar katalogidan foydalaning. Kirish uchun 'bo'limga kir' deb ayting yoki tugmani bosing.";
    } else if (lowerUser.includes('tarix') || lowerUser.includes('temur') || lowerUser.includes('navoiy') || lowerUser.includes('ulug') || lowerUser.includes('jadid') || lowerUser.includes('shaxs') || lowerUser.includes('behbudiy') || lowerUser.includes('avloniy') || lowerUser.includes('bobur')) {
      setActiveIndex(5);
      directReply = "6-yo'nalish — Buyuk ajdodlarimiz va allomalar. Amir Temur, Alisher Navoiy, Mirzo Ulug'bek va boshqa buyuk siymolar bilan jonli muloqot qiling. Kirish uchun 'bo'limga kir' deb ayting yoki tugmani bosing.";
    }

    try {
      let reply = directReply;

      // Agar savol ushbu 6 ta rasmiy yo'nalishga to'g'ri kelsa, to'g'ridan-to'g'ri aniq rasmiy javob aytiladi
      if (!reply) {
        const newHistory: AIMessage[] = [
          ...conversationHistory,
          { role: 'user', content: userText }
        ];

        const aiMessages: AIMessage[] = [
          {
            role: 'system',
            content: `Sen "Muqimiy Aql Markazi" (Qo'qon Universiteti) kiosk platformasining rasmiy sun'iy intellekt yo'lboshchisi Muqimiy AIsan. Foydalanuvchi (${userName}, ${userAge} yosh) bilan bevosita jonli OVOZLI MULOQOT qilmoqdasan. Tizim, platforma va uning barcha 6 ta yo'nalishi (Til o'rganish, Kasb o'rganish, Xavfsiz migratsiya, Psixologik ko'mak, AI Hub va Tarixiy shaxslar) haqida berilgan har qanday savolga juda aniq, samimiy, dono va chiroyli tartibda javob ber. Hech qachon yulduzcha (*) yoki (**) ishlatma.`,
          },
          ...newHistory,
        ];

        reply = await generateAIResponse(aiMessages, user, 'general');
      }

      if (speechAbortRef.current) { setIsThinking(false); return; }

      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: userText },
        { role: 'assistant', content: reply! }
      ]);
      setCurrentSpeechText(reply!);
      speakMohira(reply!, true);
    } catch {
      if (speechAbortRef.current) { setIsThinking(false); return; }
      const fallbackMsg = `Kechirasiz ${userName}, aloqada sekinlashish bo'ldi. Qaytadan gapirib ko'ring!`;
      setCurrentSpeechText(fallbackMsg);
      speakMohira(fallbackMsg, true);
    } finally {
      setIsThinking(false);
    }
  };

  // ─── Instant Stop Speaking Routine (kills audio + aborts pending fetches) ───
  const stopSpeaking = useCallback(() => {
    // Set abort flag so any in-flight fetch won't play audio when it returns
    speechAbortRef.current = true;

    // Abort any pending fetch requests to Python server
    if (fetchAbortRef.current) {
      fetchAbortRef.current.abort();
      fetchAbortRef.current = null;
    }

    // Stop currently playing neural audio
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current.currentTime = 0;
      audioPlayerRef.current.onended = null;
      audioPlayerRef.current.onplay = null;
      audioPlayerRef.current = null;
    }

    // Stop browser speech synthesis
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    setIsSpeaking(false);
    setIsThinking(false);
  }, []);

  // Toggle Live Voice Call Mode
  const toggleLiveVoiceMode = () => {
    if (liveVoiceActive) {
      setLiveVoiceActive(false);
      stopDirectListening();
      stopSpeaking();
    } else {
      stopSpeaking();
      speechAbortRef.current = false; // Reset abort flag for new session
      setLiveVoiceActive(true);
      startDirectListening();
    }
  };

  // Push to talk mic button (Immediately cuts off speaking when mic is turned on or off)
  const handleMicClick = () => {
    stopSpeaking();
    if (isListening) {
      stopDirectListening();
      setLiveVoiceActive(false);
    } else {
      speechAbortRef.current = false; // Reset abort flag for new session
      setLiveVoiceActive(true);
      startDirectListening();
    }
  };

  // Initial state on mount: Avatar stays silent until user speaks/asks a question
  useEffect(() => {
    // Toki foydalanuvchi savol bermaguncha avatar mutlaqo jim turadi
    setCurrentSpeechText('');
  }, []);

  // Load speech synthesis voices
  useEffect(() => {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // 6 Main Direction Cards
  const directions: DirectionCard[] = [
    {
      id: 'language',
      num: '1',
      title: "1. TIL O'RGANISH",
      desc: "Xorijiy tillarni o'rganing (Ingliz, Rus, Xitoy, Nemis)",
      badge: 'Ibrat Farzandlari',
      imageSrc: '/images/ibrat.jpg',
      route: '/language',
      color: '#F97316',
      accentBg: '#FFF7ED',
      accentBorder: '#FED7AA',
    },
    {
      id: 'career',
      num: '2',
      title: "2. KASB O'RGANISH",
      desc: "Zamonaviy kasblarni egallang (IT, Dizayn, SMM, AI)",
      badge: 'Ustoz AI',
      imageSrc: '/images/ustoz.png',
      route: '/career',
      color: '#0284C7',
      accentBg: '#F0F9FF',
      accentBorder: '#BAE6FD',
    },
    {
      id: 'migration',
      num: '3',
      title: "3. MIGRATSIYA",
      desc: "Xorijga chiqishdan oldin kerakli rasmiy ma'lumotlarni oling",
      badge: 'Rasmiy Manba',
      imageSrc: '/images/card_migration.jpg',
      route: '/migration',
      color: '#D97706',
      accentBg: '#FFFBEB',
      accentBorder: '#FDE68A',
    },
    {
      id: 'psychology',
      num: '4',
      title: "4. PSIXOLOGIK KO'MAK",
      desc: "Suhbatlashing, testlardan o'ting va tavsiyalar oling",
      badge: 'Ehtiyotkor AI',
      imageSrc: '/images/card_psychology.jpg',
      route: '/psychology',
      color: '#E11D48',
      accentBg: '#FFF1F2',
      accentBorder: '#FECDD3',
    },
    {
      id: 'ai',
      num: '5',
      title: "5. AI MULOQOT",
      desc: "AI imkoniyatlaridan va AI Tools katalogidan foydalaning",
      badge: 'AI Hub 24/7',
      imageSrc: '/images/card_ai.jpg',
      route: '/ai',
      color: '#7C3AED',
      accentBg: '#F5F3FF',
      accentBorder: '#DDD6FE',
    },
    {
      id: 'history',
      num: '6',
      title: "6. TARIXIY SHAXSLAR",
      desc: "Buyuk allomalar va jadidlar bilan interaktiv jonli muloqot",
      badge: 'Buyuk Siymolar',
      imageSrc: '/images/card_history.jpg',
      route: '/history',
      color: '#B45309',
      accentBg: '#FEF3C7',
      accentBorder: '#FCD34D',
    },
  ];


  const currentDir = directions[activeIndex];

  const handlePrev = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : directions.length - 1));
    setTimeout(() => setIsTransitioning(false), 300);
  };

  const handleNext = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setActiveIndex((prev) => (prev < directions.length - 1 ? prev + 1 : 0));
    setTimeout(() => setIsTransitioning(false), 300);
  };

  const handleOpenDirection = (dir: DirectionCard) => {
    trackDirectionClick(dir.id);
    router.push(dir.route);
  };

  // Touch Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientY);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const touchEnd = e.changedTouches[0].clientY;
    const diff = touchStart - touchEnd;
    if (Math.abs(diff) > 40) {
      if (diff > 0) handleNext();
      else handlePrev();
    }
    setTouchStart(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaY) > 30) {
      if (e.deltaY > 0) handleNext();
      else handlePrev();
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1C1917] flex flex-col pt-16 select-none overflow-hidden font-sans">
      {/* Top Header */}
      <KioskHeader 
        title="MUQIMIY AQL MARKAZI" 
        subtitle="ASOSIY DASHBOARD" 
      />

      <main className="flex-1 max-w-[1580px] w-full mx-auto px-4 sm:px-8 lg:px-12 py-3 lg:py-6 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center">

          {/* ════════════════════════════════════════════════════════════
               LEFT COLUMN: LUXURY REAL-TIME AVATAR & MODERN VOICE CONTROLS
             ════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center space-y-4">
            
            {/* Grand Luxury Kiosk Avatar Display */}
            <div className="relative w-full max-w-[440px] sm:max-w-[460px] flex flex-col items-center justify-center">
              <div className="w-full h-[520px] sm:h-[580px] lg:h-[620px] xl:h-[650px] relative">
                <RealisticVideoAvatar
                  state={
                    isSpeaking
                      ? (avatarState === 'greeting' ? 'greeting' : 'speaking')
                      : isListening
                      ? 'listening'
                      : isThinking
                      ? 'thinking'
                      : avatarState
                  }
                  onGreetingEnd={() => setAvatarState('idle')}
                  rounded="rounded-[36px]"
                  showAura={true}
                  fit="cover"
                  position="center 18%"
                  className="w-full h-full"
                />

                {/* Real-time Status Overlay Badge on Avatar Display */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full text-xs font-black backdrop-blur-md shadow-lg flex items-center gap-1.5 whitespace-nowrap z-40">
                  {isSpeaking && avatarState === 'greeting' ? (
                    <div className="bg-gradient-to-r from-teal-600 to-emerald-600 text-white px-4 py-1.5 rounded-full flex items-center gap-2 animate-pulse shadow-md border border-emerald-300/40">
                      <Sparkles className="w-4 h-4 text-amber-300 animate-spin" />
                      <span>Muqimiy AI sizni qutlamoqda...</span>
                    </div>
                  ) : isSpeaking ? (
                    <div className="bg-emerald-600/95 text-white px-4 py-1.5 rounded-full flex items-center gap-2 animate-pulse shadow-md border border-emerald-400/40">
                      <Volume2 className="w-4 h-4 text-white" />
                      <span>Muqimiy AI gapirmoqda...</span>
                      <span className="flex items-center gap-0.5 ml-1">
                        <span className="w-1 h-3 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-1 h-4 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </span>
                    </div>
                  ) : isListening ? (
                    <div className="bg-rose-600/95 text-white px-4 py-1.5 rounded-full flex items-center gap-2 animate-pulse shadow-md border border-rose-400/40">
                      <Mic className="w-4 h-4 text-white animate-bounce" />
                      <span>Sizni eshitmoqdaman, gapiring...</span>
                    </div>
                  ) : isThinking ? (
                    <div className="bg-amber-600/95 text-white px-4 py-1.5 rounded-full flex items-center gap-2 shadow-md border border-amber-400/40">
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>AI Yo'lboshchi javob tayyorlamoqda...</span>
                    </div>
                  ) : (
                    <div className="bg-white/95 text-[#0F766E] px-4 py-1.5 rounded-full flex items-center gap-2 border border-[#EAE6DF] shadow-md">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-bold">Muqimiy AI • Ovozli muloqot</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Direct Voice Call Action Controls (Hands-free Voice Button) */}
            <div className="w-full max-w-[440px] sm:max-w-[460px] flex items-center justify-center gap-3">
              <button
                onClick={toggleLiveVoiceMode}
                className={`flex-1 py-3.5 px-6 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-md active:scale-95 ${
                  liveVoiceActive
                    ? 'bg-rose-500 hover:bg-rose-600 text-white ring-4 ring-rose-200 animate-pulse'
                    : 'bg-gradient-to-r from-[#0F766E] to-[#059669] hover:from-[#0D6B63] hover:to-[#047857] text-white shadow-emerald-200 hover:scale-102'
                }`}
              >
                {liveVoiceActive ? (
                  <>
                    <PhoneOff className="w-5 h-5" />
                    <span>Ovozli muloqotni yakunlash</span>
                  </>
                ) : (
                  <>
                    <PhoneCall className="w-5 h-5 animate-bounce" />
                    <span>🎙️ AI Yo'lboshchi bilan ovozli gaplashish</span>
                  </>
                )}
              </button>

              {/* Push-to-Talk Mic button */}
              <button
                onClick={handleMicClick}
                className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all cursor-pointer shadow-sm active:scale-95 ${
                  isListening 
                    ? 'bg-rose-500 text-white ring-4 ring-rose-200 animate-pulse' 
                    : 'bg-white border border-[#EAE6DF] text-[#0F766E] hover:bg-[#F5F2EC]'
                }`}
                title="Mikrofon orqali gapirish"
              >
                {isListening ? (
                  <MicOff className="w-6 h-6 animate-bounce" />
                ) : (
                  <Mic className="w-6 h-6" />
                )}
              </button>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════
               RIGHT COLUMN: VERTICAL DIRECTION SWIPER / SHOWCASE CARD
             ════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-6 flex justify-center">
            <div 
              className="w-full max-w-2xl bg-white rounded-[36px] border border-[#EAE6DF] shadow-sm p-8 sm:p-10 flex flex-col items-center justify-between relative select-none"
              style={{ minHeight: '640px' }}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onWheel={handleWheel}
            >

              {/* Top: Swipe Up Pill Button */}
              <button
                onClick={handlePrev}
                className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-[#FAF8F5] border border-[#EAE6DF] text-[#78716C] hover:text-[#1C1917] hover:bg-[#F5F2EC] text-xs font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-2xs group"
              >
                <ChevronUp className="w-4 h-4 text-orange-500 group-hover:-translate-y-0.5 transition-transform" />
                <span>Yuqoriga suring</span>
              </button>

              {/* Main Card Swiper Content (Animated) */}
              <div className="w-full my-auto flex items-center justify-between gap-4 py-6">
                
                {/* Center Content Card */}
                <div 
                  onClick={() => handleOpenDirection(currentDir)}
                  className={`w-full flex flex-col items-center text-center cursor-pointer transition-all duration-300 ${
                    isTransitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
                  }`}
                >
                  {/* Large Direction Badge/Logo */}
                  <div 
                    className="relative w-52 h-52 sm:w-64 sm:h-64 lg:w-72 lg:h-72 rounded-[32px] p-3 flex items-center justify-center mb-6 transition-transform duration-300 hover:scale-105 shadow-md overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${currentDir.accentBg} 0%, #FFFFFF 100%)`,
                      border: `2px solid ${currentDir.accentBorder}`,
                    }}
                  >
                    <img
                      src={currentDir.imageSrc}
                      alt={currentDir.title}
                      className="w-full h-full object-contain rounded-2xl"
                    />
                  </div>

                  {/* Direction Title */}
                  <h3 className="text-2xl sm:text-3xl lg:text-[2.5rem] font-black text-[#1C1917] tracking-tight mb-3 uppercase leading-tight">
                    {currentDir.title}
                  </h3>

                  {/* Direction Description */}
                  <p className="text-sm sm:text-base lg:text-lg text-[#57534E] font-semibold max-w-lg mx-auto mb-8 leading-relaxed">
                    {currentDir.desc}
                  </p>

                  {/* Large Circular Action CTA Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenDirection(currentDir);
                    }}
                    className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-amber-50 to-orange-100 border-2 border-orange-200 text-orange-600 flex items-center justify-center shadow-[0_8px_20px_rgba(249,115,22,0.2)] hover:scale-110 active:scale-95 transition-all cursor-pointer group"
                    title="Bo'limga o'tish"
                  >
                    <ArrowRight className="w-8 h-8 sm:w-9 sm:h-9 text-orange-600 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>

                {/* Right 5-Dots Vertical Indicator */}
                <div className="flex flex-col gap-2.5 py-4 pl-2 shrink-0">
                  {directions.map((dir, idx) => (
                    <button
                      key={dir.id}
                      onClick={() => setActiveIndex(idx)}
                      className={`transition-all duration-300 rounded-full cursor-pointer ${
                        activeIndex === idx
                          ? 'w-2.5 h-6 bg-orange-500 shadow-xs'
                          : 'w-2.5 h-2.5 bg-[#CBD5E1] hover:bg-[#94A3B8]'
                      }`}
                      title={dir.title}
                    />
                  ))}
                </div>
              </div>

              {/* Bottom: Swipe Down Pill Button */}
              <button
                onClick={handleNext}
                className="flex items-center gap-1.5 px-5 py-2 rounded-full bg-[#FAF8F5] border border-[#EAE6DF] text-[#78716C] hover:text-[#1C1917] hover:bg-[#F5F2EC] text-xs font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer shadow-2xs group"
              >
                <ChevronDown className="w-4 h-4 text-orange-500 group-hover:translate-y-0.5 transition-transform" />
                <span>Pastga suring</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

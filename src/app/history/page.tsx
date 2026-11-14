'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useKiosk } from '@/context/KioskContext';
import { KioskHeader } from '@/components/ui/KioskHeader';
import { getTranslation } from '@/lib/translations';
import { HISTORICAL_FIGURES } from '@/lib/historicalData';
import { HistoricalFigure, HistoricalTopic } from '@/types';
import { 
  Volume2, Mic, Sparkles, Loader2, ChevronRight
} from 'lucide-react';

export default function HistoryModuleScreen() {
  const router = useRouter();
  const { user, language } = useKiosk();
  const t = getTranslation(language);

  const [selectedFigure, setSelectedFigure] = useState<HistoricalFigure>(HISTORICAL_FIGURES[0]);
  const [activeTopic, setActiveTopic] = useState<HistoricalTopic | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [currentSpeechText, setCurrentSpeechText] = useState<string>('');
  const [lastUserQuestion, setLastUserQuestion] = useState<string>('');

  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const speechAbortRef = useRef<boolean>(false);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const userName = user?.name ? user.name.replace(/[0-9]/g, '').trim() : 'Farhodjon';
  const userAge = user?.age || 23;

  // Stop currently playing audio or browser synthesis
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
  }, []);

  // Fallback browser synthesis using Uzbek or Turkish voice
  const fallbackBrowserSpeech = useCallback((text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);

    const voices = window.speechSynthesis.getVoices();
    const maleVoice = voices.find(v => v.name.toLowerCase().includes('male') || v.name.toLowerCase().includes('sardor') || v.name.toLowerCase().includes('david') || v.name.toLowerCase().includes('pavel'))
      || voices.find(v => v.lang.startsWith('uz'))
      || voices.find(v => v.lang.startsWith('tr'))
      || voices[0];

    if (maleVoice) utterance.voice = maleVoice;
    utterance.rate = 0.88;
    utterance.pitch = 0.75;
    utterance.volume = 1;

    utterance.onstart = () => {
      setIsSpeaking(true);
    };
    utterance.onend = () => {
      setIsSpeaking(false);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  // Speak text using Pre-recorded Audio (ElevenLabs) OR VoiceLab Neural TTS
  const playHistoricalSpeech = useCallback(async (text: string, figure: HistoricalFigure, audioFile?: string) => {
    stopSpeaking();
    speechAbortRef.current = false;
    setCurrentSpeechText(text);
    setIsThinking(true);

    const cleanText = text
      .replace(/[\u{1F600}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{FE00}-\u{FE0F}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{200D}]|[\u{20E3}]|[\u{E0020}-\u{E007F}]/gu, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*/g, '')
      .trim();

    // 1. Agar oldindan tayyorlangan audio fayl (ElevenLabs) bo'lsa, darhol o'ynatish
    if (audioFile) {
      try {
        const audio = new Audio(audioFile);
        audioPlayerRef.current = audio;

        const canPlay = await new Promise<boolean>((resolve) => {
          audio.oncanplaythrough = () => resolve(true);
          audio.onerror = () => resolve(false);
          setTimeout(() => resolve(false), 350);
        });

        if (canPlay && !speechAbortRef.current) {
          setIsThinking(false);
          audio.onplay = () => {
            if (speechAbortRef.current) { audio.pause(); return; }
            setIsSpeaking(true);
          };
          audio.onended = () => {
            setIsSpeaking(false);
            audioPlayerRef.current = null;
          };
          audio.onerror = () => {
            if (speechAbortRef.current) return;
            fallbackBrowserSpeech(cleanText);
          };
          await audio.play();
          return;
        }
      } catch {
        // Fayl hali mavjud bo'lmasa, quyidagi VoiceLab TTS ga o'tadi
      }
    }

    if (!cleanText) {
      setIsThinking(false);
      return;
    }

    try {
      const controller = new AbortController();
      fetchAbortRef.current = controller;

      let rate = "+0%";
      let pitch = "+0Hz";
      if (figure.id === 'amir-temur') {
        rate = "-4%";
        pitch = "-3Hz";
      } else if (figure.id === 'alisher-navoiy') {
        rate = "-2%";
        pitch = "+0Hz";
      } else if (figure.id === 'mahmudxoja-behbudiy' || figure.id === 'abdulla-avloniy') {
        rate = "+1%";
        pitch = "+1Hz";
      }

      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText,
          figureId: figure.id,
          voice: 'uz-UZ-SardorNeural',
          rate,
          pitch,
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
          };
          audio.onended = () => {
            setIsSpeaking(false);
            audioPlayerRef.current = null;
          };
          audio.onerror = () => {
            if (speechAbortRef.current) return;
            fallbackBrowserSpeech(cleanText);
          };
          audio.play().catch(() => {
            if (speechAbortRef.current) return;
            fallbackBrowserSpeech(cleanText);
          });
          return;
        }
      }
      fallbackBrowserSpeech(cleanText);
    } catch (e: any) {
      setIsThinking(false);
      if (e?.name === 'AbortError') return;
      fallbackBrowserSpeech(cleanText);
    }
  }, [stopSpeaking, fallbackBrowserSpeech]);

  // Handle selecting a figure (Faqat suratlarni almashtiradi, o'zi gapirib ketmaydi)
  const handleSelectFigure = (figure: HistoricalFigure) => {
    stopSpeaking();
    setSelectedFigure(figure);
    setActiveTopic(null);
    setLastUserQuestion('');
  };

  // Handle clicking a topic button
  const handleSelectTopic = (topic: HistoricalTopic) => {
    if (activeTopic?.id === topic.id && isSpeaking) {
      stopSpeaking();
      setActiveTopic(null);
      return;
    }
    setActiveTopic(topic);
    setLastUserQuestion(topic.question);
    playHistoricalSpeech(topic.speechText, selectedFigure, topic.audioFile);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSpeaking();
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [stopSpeaking]);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-[#1C1917] flex flex-col pt-16 select-none overflow-y-auto font-sans pb-4">
      {/* Header */}
      <KioskHeader 
        title={t.historyModuleTitle || "TARIXIY SHAXSLAR"} 
        subtitle="BUYUK SIYMOLAR VA ALLOMALAR" 
      />

      <main className="flex-1 max-w-[1780px] w-full mx-auto px-4 sm:px-6 lg:px-10 py-2 sm:py-3 flex flex-col justify-center">
        
        {/* ════════════════════════════════════════════════════════════
             MAIN 2-COLUMN SHOWCASE:
             CHAPDA: AVATAR 100% TO'LIQ KORINISHDAGI ULKAN KARTA
             O'NGDA: YUQORISIDA ALLOMALAR STRIP VA PASTIDA MAVZULAR
           ════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 xl:gap-10 items-stretch">
          
          {/* ════════════════════════════════════════════════════════════
               CHAP TOMON: ULKAN AVATAR (100% To'liq Bo'y-Basti Bilan)
               Tepasida hech qanday to'siq yo'q, boshidan oxirigacha ko'rinadi!
             ════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-7 xl:col-span-7 flex justify-center items-center">
            <div 
              className="relative w-full max-w-[700px] xl:max-w-[760px] h-[600px] sm:h-[720px] lg:h-[800px] xl:h-[840px] rounded-[40px] overflow-hidden shadow-2xl border-4 transition-all duration-500 bg-stone-900 group"
              style={{ borderColor: selectedFigure.color }}
            >
              {/* Full-bleed historical portrait / video */}
              <img 
                src={selectedFigure.portrait} 
                alt={selectedFigure.fullName}
                className={`w-full h-full object-cover object-top transition-transform duration-700 ${
                  isSpeaking ? 'scale-105 filter saturate-110' : 'scale-100'
                }`}
              />

              {/* Subtle cinematic gradient overlays */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/30 pointer-events-none" />

              {/* Top Badges (Ism va Davr) */}
              <div className="absolute top-5 left-5 right-5 flex items-center justify-between z-10 pointer-events-none">
                <div className="bg-black/60 backdrop-blur-md text-white px-5 py-2 rounded-full text-xs sm:text-sm font-black flex items-center gap-2 border border-white/20 shadow-md">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>{selectedFigure.name}</span>
                </div>
                <span className="text-xs sm:text-sm font-bold text-white/90 bg-black/50 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/15">
                  {selectedFigure.period}
                </span>
              </div>

              {/* Bottom Status Pill (Avatar holati va gapirish animatsiyasi) */}
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap">
                {isSpeaking ? (
                  <button
                    onClick={stopSpeaking}
                    className="bg-emerald-600/95 hover:bg-emerald-700 text-white px-6 py-3 rounded-full flex items-center gap-3 shadow-xl border border-emerald-400/50 animate-pulse cursor-pointer transition-all active:scale-95"
                    title="Ovozni to'xtatish"
                  >
                    <Volume2 className="w-5 h-5 text-white" />
                    <span className="text-sm sm:text-base font-black">{selectedFigure.name} gapirmoqda...</span>
                    <span className="flex items-center gap-1 ml-1">
                      <span className="w-1.5 h-4 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-6 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-3 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                    <span className="ml-2 text-xs bg-black/30 px-3 py-1 rounded-full font-bold">⏹️ To&apos;xtatish</span>
                  </button>
                ) : isListening ? (
                  <div className="bg-rose-600/95 text-white px-6 py-3 rounded-full flex items-center gap-2.5 shadow-xl border border-rose-400/50 animate-pulse">
                    <Mic className="w-5 h-5 text-white animate-bounce" />
                    <span className="text-sm sm:text-base font-black">Sizni eshitmoqda, gapiring...</span>
                  </div>
                ) : isThinking ? (
                  <div className="bg-amber-600/95 text-white px-6 py-3 rounded-full flex items-center gap-2.5 shadow-xl border border-amber-400/50">
                    <Loader2 className="w-5 h-5 animate-spin text-white" />
                    <span className="text-sm sm:text-base font-black">Ovoz tayyorlanmoqda...</span>
                  </div>
                ) : (
                  <div className="bg-black/60 backdrop-blur-md text-white px-6 py-2.5 rounded-full flex items-center gap-2.5 border border-white/20 shadow-lg">
                    <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs sm:text-sm font-bold">{selectedFigure.name} • Suhbatga shay</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ════════════════════════════════════════════════════════════
               O'NG TOMON:
               1. TEPADA ALLOMALARNI TANLASH STRIP (Amir Temur, Navoiy...)
               2. PASTIDA 4 TA KATTA INTERAKTIV MAVZU TUGMASI
             ════════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-5 xl:col-span-5 flex flex-col justify-between my-auto gap-4 sm:gap-6 py-1">
            
            {/* 1. Allomalar Tanlash Qatori (To'liq ko'rinadigan qilib flex-wrap qilindi) */}
            <div className="w-full flex flex-wrap items-center gap-2 sm:gap-2.5 pb-1">
              {HISTORICAL_FIGURES.map((fig) => {
                const isSelected = selectedFigure.id === fig.id;
                return (
                  <button
                    key={fig.id}
                    onClick={() => handleSelectFigure(fig)}
                    className={`px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-full border transition-all duration-200 flex items-center gap-2 cursor-pointer active:scale-95 shadow-xs ${
                      isSelected
                        ? 'bg-[#1C1917] text-white border-[#1C1917] shadow-md ring-2 ring-amber-500/40 scale-102'
                        : 'bg-white hover:bg-stone-50 text-[#44403C] border-[#EAE6DF]'
                    }`}
                  >
                    <div 
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded-full overflow-hidden shrink-0 border-2"
                      style={{ borderColor: isSelected ? fig.color : '#EAE6DF' }}
                    >
                      <img 
                        src={fig.portrait} 
                        alt={fig.name} 
                        className="w-full h-full object-cover" 
                      />
                    </div>
                    <span className="text-xs sm:text-sm font-black whitespace-nowrap">
                      {fig.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 2. Tanlangan Allomaning 4 ta Yirik Mavzu Tugmasi */}
            <div className="flex flex-col gap-3.5 sm:gap-4 flex-1 justify-center">
              {selectedFigure.topics.map((topic) => {
                const isCurrentActive = activeTopic?.id === topic.id && isSpeaking;
                return (
                  <button
                    key={topic.id}
                    onClick={() => handleSelectTopic(topic)}
                    className={`w-full p-4 sm:p-5 lg:p-6 rounded-[28px] border text-left transition-all duration-200 cursor-pointer shadow-sm active:scale-[0.98] flex items-center gap-4 sm:gap-5 min-h-[100px] sm:min-h-[115px] group ${
                      isCurrentActive
                        ? 'bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 text-white border-amber-600 shadow-xl scale-102 ring-4 ring-orange-400/30'
                        : 'bg-white hover:bg-[#FAF8F5] text-[#1C1917] border-[#EAE6DF] hover:border-amber-400 hover:shadow-md'
                    }`}
                  >
                    {/* Topic Icon */}
                    <div 
                      className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-3xl sm:text-4xl shrink-0 transition-transform group-hover:scale-110 ${
                        isCurrentActive 
                          ? 'bg-white/20 text-white' 
                          : 'bg-[#FAF8F5] border border-[#EAE6DF] shadow-2xs'
                      }`}
                    >
                      {topic.icon}
                    </div>

                    {/* Title & Live indicator */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <h4 className={`text-sm sm:text-base lg:text-lg font-black tracking-tight ${
                          isCurrentActive ? 'text-white' : 'text-[#1C1917]'
                        }`}>
                          {topic.title}
                        </h4>
                        <ChevronRight className={`w-5 h-5 shrink-0 transition-transform group-hover:translate-x-1 ${
                          isCurrentActive ? 'text-white' : 'text-amber-600'
                        }`} />
                      </div>

                      {isCurrentActive && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <span className="text-xs font-bold text-amber-100 uppercase tracking-wider">Gapirmoqda:</span>
                          <span className="flex items-center gap-0.5">
                            <span className="w-1.5 h-3 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1.5 h-4.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1.5 h-2.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

          </div>

        </div>

      </main>
    </div>
  );
}
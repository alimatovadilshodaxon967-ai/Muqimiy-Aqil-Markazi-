'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, Wifi, WifiOff, Volume2, Sparkles } from 'lucide-react';

export type DIDPresenter = 'mohira' | 'ibrat' | 'ustoz' | 'migration';
export type DIDState = 'idle' | 'loading' | 'speaking' | 'listening' | 'thinking' | 'greeting' | 'error';

export interface DIDStreamingAvatarProps {
  state: DIDState;
  presenter?: DIDPresenter;
  text?: string;
  size?: number;
  width?: number | string;
  height?: number | string;
  rounded?: string;
  className?: string;
  showAura?: boolean;
  onVideoReady?: (videoUrl: string) => void;
  onSpeakEnd?: () => void;
  onError?: (error: string) => void;
}

// ─── Presenter konfiguratsiyasi ────────────────────────────────────
export const PRESENTER_CONFIG: Record<DIDPresenter, {
  name: string;
  role: string;
  badge: string;
  image: string;
  idleVideo: string;
  fallbackVideos: {
    greeting: string;
    idle: string;
    talking: string;
  };
}> = {
  mohira: {
    name: 'Mohira AI',
    role: 'Bosh Ovozli Yordamchi',
    badge: 'Mohira • Asosiy',
    image: 'https://clips-presenters.d-id.com/v2/Alyssa_NoHands_BlackShirt_Home/Mvn6Nalx90/y0J6MTfOaZ/image.png',
    idleVideo: 'https://clips-presenters.d-id.com/v2/Alyssa_NoHands_BlackShirt_Home/Mvn6Nalx90/y0J6MTfOaZ/idle.mp4',
    fallbackVideos: {
      greeting: '/avatar/greeting.mp4',
      idle: 'https://clips-presenters.d-id.com/v2/Alyssa_NoHands_BlackShirt_Home/Mvn6Nalx90/y0J6MTfOaZ/idle.mp4',
      talking: 'https://clips-presenters.d-id.com/v2/Alyssa_NoHands_BlackShirt_Home/Mvn6Nalx90/y0J6MTfOaZ/talkingPreview.mp4',
    },
  },
  ibrat: {
    name: 'Lana Ustoz',
    role: 'Ibrat Farzandlari Chet Tillari',
    badge: 'Ibrat Farzandlari • AI',
    image: '/images/ai_assistant.jpg',
    idleVideo: '/avatar/idle.mp4',
    fallbackVideos: {
      greeting: '/avatar/idle.mp4',
      idle: '/avatar/idle.mp4',
      talking: '/avatar/talking.mp4',
    },
  },
  ustoz: {
    name: 'Matt Ustoz',
    role: 'Ustoz AI Kasblar Yo‘naltiruvchi',
    badge: 'Ustoz AI • Mentor',
    image: 'https://clips-presenters.d-id.com/v2/Matt_NoHands_GreyTshirt_Outdoor/rwE9avfhZE/Kx_xEIPaws/image.png',
    idleVideo: 'https://clips-presenters.d-id.com/v2/Matt_NoHands_GreyTshirt_Outdoor/rwE9avfhZE/Kx_xEIPaws/idle.mp4',
    fallbackVideos: {
      greeting: 'https://clips-presenters.d-id.com/v2/Matt_NoHands_GreyTshirt_Outdoor/rwE9avfhZE/Kx_xEIPaws/idle.mp4',
      idle: 'https://clips-presenters.d-id.com/v2/Matt_NoHands_GreyTshirt_Outdoor/rwE9avfhZE/Kx_xEIPaws/idle.mp4',
      talking: 'https://clips-presenters.d-id.com/v2/Matt_NoHands_GreyTshirt_Outdoor/rwE9avfhZE/Kx_xEIPaws/talkingPreview.mp4',
    },
  },
  migration: {
    name: 'Diana Ekspert',
    role: 'Xalqaro Migratsiya & Viza Maslahatchisi',
    badge: 'Migratsiya AI • Maslahatchi',
    image: 'https://clips-presenters.d-id.com/v2/diana/so9Pg73d6N/T5Ts5WC1R0/image.png',
    idleVideo: 'https://clips-presenters.d-id.com/v2/diana/so9Pg73d6N/T5Ts5WC1R0/idle_video.mp4',
    fallbackVideos: {
      greeting: 'https://clips-presenters.d-id.com/v2/diana/so9Pg73d6N/T5Ts5WC1R0/idle_video.mp4',
      idle: 'https://clips-presenters.d-id.com/v2/diana/so9Pg73d6N/T5Ts5WC1R0/idle_video.mp4',
      talking: 'https://clips-presenters.d-id.com/v2/diana/so9Pg73d6N/T5Ts5WC1R0/diana_talking_preview_video_video.mp4',
    },
  },
};

export function DIDStreamingAvatar({
  state,
  presenter = 'mohira',
  text,
  width,
  height,
  size,
  rounded = 'rounded-3xl',
  className = '',
  showAura = true,
  onVideoReady,
  onSpeakEnd,
  onError,
}: DIDStreamingAvatarProps) {
  const currentConfig = PRESENTER_CONFIG[presenter] || PRESENTER_CONFIG.mohira;

  const [didVideoUrl, setDidVideoUrl] = useState<string | null>(null);
  const [isLoadingDID, setIsLoadingDID] = useState(false);
  const [didAvailable, setDidAvailable] = useState(true);
  const [activeVideo, setActiveVideo] = useState<'greeting' | 'idle' | 'talking' | 'did'>('idle');

  const didVideoRef = useRef<HTMLVideoElement>(null);
  const idleVideoRef = useRef<HTMLVideoElement>(null);
  const talkingVideoRef = useRef<HTMLVideoElement>(null);
  const greetingVideoRef = useRef<HTMLVideoElement>(null);
  const lastTextRef = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);

  const containerStyle: React.CSSProperties = {
    width: width || size || '100%',
    height: height || size || '100%',
  };

  // ─── D-ID orqali video olish ──────────────────────────────────────
  const fetchDIDVideo = useCallback(
    async (speakText: string) => {
      if (!speakText || speakText === lastTextRef.current) return;
      lastTextRef.current = speakText;

      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      setIsLoadingDID(true);

      try {
        const res = await fetch('/api/did', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: speakText,
            presenter,
          }),
          signal: abortRef.current.signal,
        });

        const data = await res.json();

        if (data.success && data.videoUrl) {
          setDidVideoUrl(data.videoUrl);
          setActiveVideo('did');
          setDidAvailable(true);
          onVideoReady?.(data.videoUrl);
        } else {
          // Fallback bo'lsa
          setDidAvailable(false);
          setActiveVideo(state === 'speaking' ? 'talking' : 'idle');
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setDidAvailable(false);
        setActiveVideo(state === 'speaking' ? 'talking' : 'idle');
        onError?.(String(err));
      } finally {
        setIsLoadingDID(false);
      }
    },
    [presenter, state, onVideoReady, onError]
  );

  // Text o'zgarganda D-ID trigger
  useEffect(() => {
    if (text && (state === 'speaking' || state === 'greeting')) {
      fetchDIDVideo(text);
    }
  }, [text, state, fetchDIDVideo]);

  // Video almashinuvi
  useEffect(() => {
    if (didVideoUrl && activeVideo === 'did') return;

    if (state === 'greeting') {
      setActiveVideo('greeting');
      if (greetingVideoRef.current) {
        greetingVideoRef.current.currentTime = 0;
        greetingVideoRef.current.play().catch(() => {});
      }
      idleVideoRef.current?.pause();
      talkingVideoRef.current?.pause();
    } else if (state === 'speaking') {
      setActiveVideo('talking');
      if (talkingVideoRef.current) {
        talkingVideoRef.current.currentTime = 0;
        talkingVideoRef.current.play().catch(() => {});
      }
      idleVideoRef.current?.pause();
      greetingVideoRef.current?.pause();
    } else {
      setActiveVideo('idle');
      idleVideoRef.current?.play().catch(() => {});
      talkingVideoRef.current?.pause();
      greetingVideoRef.current?.pause();
    }
  }, [state, didVideoUrl, activeVideo]);

  const handleDIDVideoEnded = () => {
    setActiveVideo('idle');
    setDidVideoUrl(null);
    lastTextRef.current = '';
    onSpeakEnd?.();
    idleVideoRef.current?.play().catch(() => {});
  };

  const auraClass = {
    speaking: 'bg-gradient-to-r from-emerald-500/40 via-teal-400/30 to-emerald-500/40',
    listening: 'bg-gradient-to-r from-rose-500/50 via-pink-400/40 to-rose-500/50',
    thinking: 'bg-purple-500/40',
    greeting: 'bg-gradient-to-r from-amber-400/40 via-teal-400/30 to-amber-400/40',
    loading: 'bg-blue-400/30',
    idle: '',
    error: 'bg-red-400/20',
  }[state];

  const borderClass =
    state === 'speaking' || activeVideo === 'did'
      ? 'border-emerald-400 ring-4 ring-emerald-200/60 shadow-emerald-500/25'
      : state === 'listening'
      ? 'border-rose-500 ring-4 ring-rose-300/60 shadow-rose-500/25 scale-[1.01]'
      : state === 'thinking'
      ? 'border-purple-400 ring-4 ring-purple-200/60'
      : state === 'greeting'
      ? 'border-amber-400 ring-4 ring-amber-200/60'
      : 'border-white/80 ring-1 ring-black/5 hover:border-emerald-300/80';

  return (
    <div
      className={`relative flex items-center justify-center select-none ${className}`}
      style={containerStyle}
    >
      {/* Dynamic Glowing Auras */}
      {showAura && auraClass && (
        <div
          className={`absolute -inset-1.5 ${rounded} ${auraClass} animate-pulse blur-xl pointer-events-none`}
        />
      )}

      {/* Main Container */}
      <div
        className={`w-full h-full ${rounded} overflow-hidden border-[3px] relative shadow-[0_25px_60px_rgba(0,0,0,0.18)] bg-[#0B1120] transition-all duration-500 ${borderClass}`}
      >
        {/* 1. D-ID Real-Time Generated Video */}
        <video
          ref={didVideoRef}
          src={didVideoUrl || undefined}
          playsInline
          autoPlay
          onEnded={handleDIDVideoEnded}
          onError={() => {
            setActiveVideo(state === 'speaking' ? 'talking' : 'idle');
            setDidVideoUrl(null);
          }}
          className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-300 ${
            activeVideo === 'did' && didVideoUrl ? 'opacity-100 z-30' : 'opacity-0 z-0 pointer-events-none'
          }`}
        />

        {/* 2. Fallback Greeting Video */}
        <video
          key={`greeting-${currentConfig.fallbackVideos.greeting}`}
          ref={greetingVideoRef}
          src={currentConfig.fallbackVideos.greeting}
          playsInline
          muted
          autoPlay={state === 'greeting' && !didVideoUrl}
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
          className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-300 ${
            activeVideo === 'greeting' && !didVideoUrl ? 'opacity-100 z-20' : 'opacity-0 z-0 pointer-events-none'
          }`}
        />

        {/* 3. Fallback / Idle Video (HD Studio loop) */}
        <video
          key={`idle-${currentConfig.fallbackVideos.idle}`}
          ref={idleVideoRef}
          src={currentConfig.fallbackVideos.idle}
          playsInline
          muted
          loop
          autoPlay
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
          className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-300 ${
            activeVideo === 'idle' ? 'opacity-100 z-20' : 'opacity-0 z-0 pointer-events-none'
          }`}
        />

        {/* 4. Fallback Talking Video */}
        <video
          key={`talking-${currentConfig.fallbackVideos.talking}`}
          ref={talkingVideoRef}
          src={currentConfig.fallbackVideos.talking}
          playsInline
          muted
          loop
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
          className={`absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-300 ${
            activeVideo === 'talking' ? 'opacity-100 z-20' : 'opacity-0 z-0 pointer-events-none'
          }`}
        />

        {/* Fallback Static Image */}
        <img
          src={currentConfig.image || '/images/ai_assistant.jpg'}
          alt={currentConfig.name}
          className="absolute inset-0 w-full h-full object-cover object-center -z-10"
        />

        {/* Non-intrusive Live Status Indicator */}
        <div className="absolute top-3.5 left-3.5 z-40 flex items-center gap-2">
          <div className="bg-black/60 backdrop-blur-md border border-white/15 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-md">
            <Sparkles className="w-3 h-3 text-amber-300" />
            <span>{currentConfig.badge}</span>
          </div>
        </div>

        {/* Mode Indicator (Top Right) */}
        <div className="absolute top-3.5 right-3.5 z-40">
          {didVideoUrl ? (
            <div className="bg-emerald-600/90 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-md border border-emerald-400/30">
              <Wifi className="w-3 h-3 text-white" />
              <span>D-ID LIVE</span>
            </div>
          ) : isLoadingDID ? (
            <div className="bg-amber-600/90 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-md animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin text-white" />
              <span>Sinxron...</span>
            </div>
          ) : (
            <div className="bg-slate-900/80 text-white/90 text-[10px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 shadow-md border border-white/10">
              <Volume2 className="w-3 h-3 text-emerald-400" />
              <span>HD Ovoz</span>
            </div>
          )}
        </div>

        {/* Bottom Vignette */}
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-black/60 via-black/20 to-transparent pointer-events-none z-30" />
      </div>
    </div>
  );
}

'use client';

import React, { useRef, useEffect, useState } from 'react';

export type VideoAvatarState = 'idle' | 'listening' | 'speaking' | 'thinking' | 'greeting';

export interface RealisticVideoAvatarProps {
  state: VideoAvatarState;
  size?: number;
  width?: number | string;
  height?: number | string;
  rounded?: string;
  className?: string;
  onGreetingEnd?: () => void;
  showAura?: boolean;
  fit?: 'cover' | 'contain';
  position?: string;
}

export function RealisticVideoAvatar({
  state,
  size,
  width,
  height,
  rounded = 'rounded-3xl',
  className = '',
  onGreetingEnd,
  showAura = true,
  fit = 'cover',
  position = 'center 18%',
}: RealisticVideoAvatarProps) {
  const idleVideoRef = useRef<HTMLVideoElement>(null);
  const talkingVideoRef = useRef<HTMLVideoElement>(null);

  const isSpeaking = state === 'speaking' || state === 'greeting';

  // Silliq va uzluksiz o'tish (0 qotish bilan)
  useEffect(() => {
    if (isSpeaking) {
      if (talkingVideoRef.current) {
        talkingVideoRef.current.play().catch(() => {});
      }
    } else {
      if (idleVideoRef.current) {
        idleVideoRef.current.play().catch(() => {});
      }
    }
  }, [isSpeaking]);

  const containerStyle: React.CSSProperties = {
    width: width || size || '100%',
    height: height || size || '100%',
  };

  return (
    <div 
      className={`relative flex items-center justify-center select-none ${className}`}
      style={containerStyle}
    >
      {/* Dynamic Glowing Auras for Card/Frame */}
      {showAura && (
        <>
          {isSpeaking && (
            <div className={`absolute -inset-1.5 ${rounded} bg-gradient-to-r from-emerald-500/40 via-teal-400/30 to-emerald-500/40 animate-pulse blur-xl pointer-events-none`} />
          )}

          {state === 'listening' && (
            <div className={`absolute -inset-1.5 ${rounded} bg-gradient-to-r from-rose-500/50 via-pink-400/40 to-rose-500/50 animate-pulse blur-xl pointer-events-none`} />
          )}

          {state === 'thinking' && (
            <div className={`absolute -inset-1.5 ${rounded} bg-purple-500/40 animate-pulse blur-xl pointer-events-none`} />
          )}
        </>
      )}

      {/* Main Luxury Kiosk Video Screen Container */}
      <div 
        className={`w-full h-full ${rounded} overflow-hidden border-[3px] relative shadow-[0_25px_60px_rgba(0,0,0,0.18)] bg-black transition-all duration-500 ${
          isSpeaking
            ? 'border-emerald-400 ring-4 ring-emerald-200/60 shadow-emerald-500/25'
            : state === 'listening'
            ? 'border-rose-500 ring-4 ring-rose-300/60 shadow-rose-500/25 scale-[1.01]'
            : state === 'thinking'
            ? 'border-purple-400 ring-4 ring-purple-200/60'
            : 'border-white/80 ring-1 ring-black/5 hover:border-emerald-300/80'
        }`}
      >
        {/* 1. Jim turgan holati (To'liq ekranni qora chiziqlarsiz to'ldirish uchun object-cover) */}
        <video
          ref={idleVideoRef}
          src="/avatar/Jim_turgan_holati.mp4"
          playsInline
          muted
          loop
          autoPlay
          preload="auto"
          style={{ objectFit: fit, objectPosition: position }}
          className={`absolute inset-0 w-full h-full transition-opacity duration-300 ${
            !isSpeaking ? 'opacity-100 z-20' : 'opacity-0 z-10 pointer-events-none'
          }`}
        />

        {/* 2. Gapirib turgan holati */}
        <video
          ref={talkingVideoRef}
          src="/avatar/Gapirib_turgan_holati.mp4"
          playsInline
          muted
          loop
          preload="auto"
          style={{ objectFit: fit, objectPosition: position }}
          className={`absolute inset-0 w-full h-full transition-opacity duration-300 ${
            isSpeaking ? 'opacity-100 z-20' : 'opacity-0 z-10 pointer-events-none'
          }`}
        />

        {/* Fallback Static Image if video loading */}
        <img
          src="/images/uzbek_boy_avatar.jpg"
          alt="Muqimiy AI Avatar"
          style={{ objectFit: fit, objectPosition: position }}
          className="absolute inset-0 w-full h-full -z-10"
        />

        {/* Cinematic Subtle Bottom Gradient Vignette */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/50 via-black/15 to-transparent pointer-events-none z-30" />
      </div>
    </div>
  );
}

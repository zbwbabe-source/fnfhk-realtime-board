'use client';

import { useState, useRef, useCallback } from 'react';

interface UseTTSOptions {
  language: 'ko' | 'en';
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

export function useTTS({ language, onStart, onEnd, onError }: UseTTSOptions) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const speak = useCallback(async (text: string) => {
    try {
      // 이미 재생 중이면 정지
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      setIsLoading(true);
      onStart?.();

      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, language }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'TTS generation failed');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => {
        setIsPlaying(true);
        setIsLoading(false);
      };

      audio.onended = () => {
        setIsPlaying(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        onEnd?.();
      };

      audio.onerror = () => {
        setIsPlaying(false);
        setIsLoading(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        onError?.('Audio playback failed');
      };

      await audio.play();
    } catch (error: any) {
      console.error('TTS Error:', error);
      setIsPlaying(false);
      setIsLoading(false);
      onError?.(error.message);
    }
  }, [language, onStart, onEnd, onError]);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsPlaying(false);
    }
  }, []);

  return { speak, stop, isPlaying, isLoading };
}

import { useCallback, useEffect, useState } from 'react';

export function usePlayback(length, voiceMode = false) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1200);
  // A newly generated lesson can have fewer steps than the previous one.
  // Clamp during render so consumers never see an out-of-range step while
  // the length-change effect below resets playback to the beginning.
  const safeLength = Math.max(1, length);
  const visibleStep = Math.max(0, Math.min(currentStep, safeLength - 1));
  useEffect(() => {
    if (!isPlaying || voiceMode || safeLength < 1) return undefined;
    const timer = window.setInterval(() => setCurrentStep((step) => {
      if (step >= safeLength - 1) { setPlaying(false); return step; }
      return step + 1;
    }), speed);
    return () => window.clearInterval(timer);
  }, [isPlaying, safeLength, speed, voiceMode]);
  useEffect(() => { setCurrentStep(0); setPlaying(false); }, [length]);
  const advanceStep = useCallback(() => setCurrentStep((step) => {
    if (step >= safeLength - 1) { setPlaying(false); return step; }
    return step + 1;
  }), [safeLength]);
  return {
    currentStep: visibleStep, isPlaying, speed,
    play: () => { if (visibleStep >= safeLength - 1) setCurrentStep(0); setPlaying(true); },
    pause: () => setPlaying(false),
    nextStep: () => { setPlaying(false); setCurrentStep((step) => Math.min(safeLength - 1, step + 1)); },
    advanceStep,
    previousStep: () => { setPlaying(false); setCurrentStep((step) => Math.max(0, Math.min(safeLength - 1, step - 1))); },
    restart: () => { setPlaying(false); setCurrentStep(0); },
    goToStep: (step) => { setPlaying(false); setCurrentStep(Math.max(0, Math.min(safeLength - 1, step))); },
    setSpeed,
  };
}

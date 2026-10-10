import { useCallback, useEffect, useState } from 'react';

export function usePlayback(length, voiceMode = false) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1200);
  useEffect(() => {
    if (!isPlaying || voiceMode || length < 1) return undefined;
    const timer = window.setInterval(() => setCurrentStep((step) => {
      if (step >= length - 1) { setPlaying(false); return step; }
      return step + 1;
    }), speed);
    return () => window.clearInterval(timer);
  }, [isPlaying, length, speed, voiceMode]);
  useEffect(() => { setCurrentStep(0); setPlaying(false); }, [length]);
  const advanceStep = useCallback(() => setCurrentStep((step) => {
    if (step >= length - 1) { setPlaying(false); return step; }
    return step + 1;
  }), [length]);
  return {
    currentStep, isPlaying, speed,
    play: () => { if (currentStep >= length - 1) setCurrentStep(0); setPlaying(true); },
    pause: () => setPlaying(false),
    nextStep: () => { setPlaying(false); setCurrentStep((step) => Math.min(length - 1, step + 1)); },
    advanceStep,
    previousStep: () => { setPlaying(false); setCurrentStep((step) => Math.max(0, step - 1)); },
    restart: () => { setPlaying(false); setCurrentStep(0); },
    goToStep: (step) => { setPlaying(false); setCurrentStep(Math.max(0, Math.min(length - 1, step))); },
    setSpeed,
  };
}

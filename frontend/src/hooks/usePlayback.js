import { useEffect, useState } from 'react';

export function usePlayback(length) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1200);
  useEffect(() => {
    if (!isPlaying || length < 1) return undefined;
    const timer = window.setInterval(() => setCurrentStep((step) => {
      if (step >= length - 1) { setPlaying(false); return step; }
      return step + 1;
    }), speed);
    return () => window.clearInterval(timer);
  }, [isPlaying, length, speed]);
  useEffect(() => { setCurrentStep(0); setPlaying(false); }, [length]);
  return {
    currentStep, isPlaying, speed,
    play: () => { if (currentStep >= length - 1) setCurrentStep(0); setPlaying(true); },
    pause: () => setPlaying(false),
    nextStep: () => { setPlaying(false); setCurrentStep((step) => Math.min(length - 1, step + 1)); },
    previousStep: () => { setPlaying(false); setCurrentStep((step) => Math.max(0, step - 1)); },
    restart: () => { setPlaying(false); setCurrentStep(0); },
    goToStep: (step) => { setPlaying(false); setCurrentStep(Math.max(0, Math.min(length - 1, step))); },
    setSpeed,
  };
}

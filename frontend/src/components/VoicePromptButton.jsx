import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';

export default function VoicePromptButton({ value, onChange, onError }) {
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef(null);
  const baseTextRef = useRef('');
  const supported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => () => {
    const recognition = recognitionRef.current;
    if (recognition) {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.abort();
    }
  }, []);

  function toggleRecording() {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    baseTextRef.current = value.trim();
    recognition.lang = navigator.language || 'en-US';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).map((result) => result[0].transcript).join(' ').trim();
      onChange([baseTextRef.current, transcript].filter(Boolean).join(' '));
    };
    recognition.onerror = (event) => {
      setRecording(false);
      const message = event.error === 'not-allowed' || event.error === 'service-not-allowed'
        ? 'Allow microphone access in your browser to dictate a lesson prompt.'
        : event.error === 'no-speech'
          ? 'No speech detected. Select the microphone and try again.'
          : 'Voice input stopped. Check your microphone and try again.';
      onError(message);
    };
    recognition.onend = () => setRecording(false);
    try {
      recognition.start();
      setRecording(true);
      onError('');
    } catch {
      setRecording(false);
      onError('Could not start voice input. Try selecting the microphone again.');
    }
  }

  return <button type="button" className={`prompt-voice-button ${recording ? 'recording' : ''}`} onClick={toggleRecording} disabled={!supported} aria-label={recording ? 'Stop voice input' : 'Dictate lesson prompt'} aria-pressed={recording} title={supported ? (recording ? 'Stop voice input' : 'Speak your lesson prompt') : 'Voice input is not supported in this browser'}>
    {recording ? <MicOff size={14} /> : <Mic size={14} />}
    <span>{recording ? 'Listening…' : 'Speak'}</span>
  </button>;
}

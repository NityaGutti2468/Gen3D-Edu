import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';

export default function PlaybackControls({ playback, voiceEnabled, onToggleVoice, voiceSupported }) {
  return <div className="controls">
    <button className="icon-button" onClick={playback.restart} title="Restart"><RotateCcw size={16} /></button>
    <button className="icon-button" onClick={playback.previousStep} title="Previous step"><ChevronLeft size={18} /></button>
    <button className="play-button" onClick={playback.isPlaying ? playback.pause : playback.play} title={playback.isPlaying ? 'Pause' : 'Play'}>{playback.isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
    <button className="icon-button" onClick={playback.nextStep} title="Next step"><ChevronRight size={18} /></button>
    <button className={`icon-button voice-button ${voiceEnabled ? 'voice-enabled' : ''}`} onClick={onToggleVoice} title={voiceSupported ? (voiceEnabled ? 'Turn voice guide off' : 'Turn voice guide on') : 'Voice narration is not supported in this browser'} aria-label={voiceEnabled ? 'Turn voice guide off' : 'Turn voice guide on'} aria-pressed={voiceEnabled} disabled={!voiceSupported}>{voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}<span>Voice {voiceEnabled ? 'on' : 'off'}</span></button>
    <label className="speed-control"><span>Speed</span><select value={playback.speed} onChange={(event) => playback.setSpeed(Number(event.target.value))}><option value="1800">0.75×</option><option value="1200">1×</option><option value="650">1.5×</option><option value="350">2×</option></select></label>
  </div>;
}

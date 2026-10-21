import { ChevronLeft, ChevronRight, Download, Pause, Play, RotateCcw, RotateCw, Volume2, VolumeX } from 'lucide-react';

export default function PlaybackControls({ playback, voiceEnabled, onToggleVoice, onReplayNarration, voiceSupported, voiceError = '', viewMode, onChangeViewMode, canToggleView = false, onDownloadLesson, canDownloadLesson = false }) {
  const voiceTitle = voiceError || (voiceSupported
    ? voiceEnabled ? 'Voice guide on. Play to narrate each step and advance after it finishes.' : 'Turn on narration for the active step.'
    : 'Voice narration is not supported in this browser');
  return <div className="controls">
    <button className="icon-button" onClick={playback.restart} title="Restart"><RotateCcw size={16} /></button>
    <button className="icon-button" onClick={playback.previousStep} title="Previous step"><ChevronLeft size={18} /></button>
    <button className="play-button" onClick={playback.isPlaying ? playback.pause : playback.play} title={playback.isPlaying ? 'Pause' : 'Play'}>{playback.isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}</button>
    <button className="icon-button" onClick={playback.nextStep} title="Next step"><ChevronRight size={18} /></button>
    {canDownloadLesson && <button className="icon-button download-lesson-button" onClick={onDownloadLesson} title="Download lesson for offline use" aria-label="Download lesson for offline use"><Download size={15} /><span>Download</span></button>}
    <button className="icon-button replay-narration-button" onClick={onReplayNarration} title="Hear the current step again" aria-label="Hear the current step again" disabled={!voiceSupported}><RotateCw size={15} /><span>Repeat</span></button>
    <button className={`icon-button voice-button ${voiceEnabled ? 'voice-enabled' : ''}`} onClick={onToggleVoice} title={voiceTitle} aria-label={voiceEnabled ? 'Turn voice guide off' : 'Turn voice guide on'} aria-pressed={voiceEnabled} disabled={!voiceSupported}>{voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}<span>Voice {voiceEnabled ? 'on' : 'off'}</span></button>
    <div className="playback-options">
      {canToggleView && <div className="view-mode-control" role="group" aria-label="Animation view">
        <button type="button" className={viewMode === '2d' ? 'active' : ''} onClick={() => onChangeViewMode('2d')} aria-pressed={viewMode === '2d'}>2D</button>
        <button type="button" className={viewMode === '3d' ? 'active' : ''} onClick={() => onChangeViewMode('3d')} aria-pressed={viewMode === '3d'}>3D</button>
      </div>}
      <label className="speed-control"><span>Speed</span><select value={playback.speed} onChange={(event) => playback.setSpeed(Number(event.target.value))}><option value="1800">0.75×</option><option value="1200">1×</option><option value="650">1.5×</option><option value="350">2×</option></select></label>
    </div>
  </div>;
}

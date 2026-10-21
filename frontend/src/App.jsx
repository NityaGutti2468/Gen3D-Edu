import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, BookOpen, Check, CircleHelp, Command, GraduationCap, Layers3, LoaderCircle, LogOut, Moon, Plus, Sparkles, Star, Sun, Trash2, Upload, X } from 'lucide-react';
import AuthScreen from './components/AuthScreen.jsx';
import StepList from './components/StepList.jsx';
import PlanScene from './components/PlanScene.jsx';
import PlaybackControls from './components/PlaybackControls.jsx';
import VoicePromptButton from './components/VoicePromptButton.jsx';
import { usePlayback } from './hooks/usePlayback.js';
import { buildStepNarration, chooseNarrationVoice, narrationRate } from './utils/narration.js';
import { deleteSavedLessons, generatePlan, getCurrentUser, getHealth, getLessonHistory, getSavedLesson, setLessonPinned, signOut } from './services/api.js';

const demo = {
  concept: 'Binary Search', domain: 'Computer Science · Algorithms', learning_objective: 'Find a target in a sorted array by repeatedly halving the search range.',
  objects: [{ id: 'numbers', type: 'array', label: 'Sorted values', properties: { values: ['3', '7', '11', '15', '19', '23', '27', '31', '35'] } }, { id: 'low', type: 'pointer', label: 'LOW', properties: { index: 0 } }, { id: 'high', type: 'pointer', label: 'HIGH', properties: { index: 8 } }, { id: 'middle', type: 'pointer', label: 'MID', properties: { index: 4 } }],
  steps: [
    { step: 1, title: 'Start with sorted data', explanation: 'Binary search requires sorted values. Set the search boundaries to the first and last indices. We are looking for 23.', actions: [{ action: 'show', target: 'numbers', parameters: {} }, { action: 'show', target: 'low', parameters: {} }, { action: 'show', target: 'high', parameters: {} }] },
    { step: 2, title: 'Check the midpoint', explanation: 'The midpoint is floor((0 + 8) / 2) = 4. The value at index 4 is 19. Compare it with the target, 23.', actions: [{ action: 'focus', target: 'middle', parameters: { index: 4 } }, { action: 'compare', target: 'numbers', parameters: { index: 4, value: '23' } }] },
    { step: 3, title: 'Discard the left half', explanation: '19 is less than 23. Sorted order tells us every value to its left is also too small. Move LOW to index 5.', actions: [{ action: 'move', target: 'low', parameters: { index: 5 } }, { action: 'highlight', target: 'numbers', parameters: { range_start: 5, range_end: 8 } }] },
    { step: 4, title: 'Compare the new middle', explanation: 'The midpoint of indices 5 to 8 is 6. The value there is 27, which is larger than the target.', actions: [{ action: 'focus', target: 'middle', parameters: { index: 6 } }, { action: 'compare', target: 'numbers', parameters: { index: 6, value: '23' } }] },
    { step: 5, title: 'Keep the left portion', explanation: '27 is greater than 23, so move HIGH to index 5. The remaining search range contains one value.', actions: [{ action: 'move', target: 'high', parameters: { index: 5 } }, { action: 'highlight', target: 'numbers', parameters: { range_start: 5, range_end: 5 } }] },
    { step: 6, title: 'Target found', explanation: 'The midpoint is index 5 and its value is 23. The target is found after three comparisons.', actions: [{ action: 'focus', target: 'middle', parameters: { index: 5 } }, { action: 'highlight', target: 'numbers', parameters: { index: 5, value: '23' } }] },
  ],
};

const lessonDraft = {
  concept: 'Your next lesson', domain: 'Interactive Learning', learning_objective: 'Enter a topic or question to generate a clear, step-by-step visual explanation.',
  objects: [{ id: 'lesson-prompt', type: 'text', label: 'Ready when you are', properties: { content: 'Your visual lesson will appear here.' } }],
  steps: [{ step: 1, title: 'Start with a question', explanation: 'Describe a concept in the box. Gen3D-Edu will build a visual walkthrough for that topic.', insight: 'Your generated lesson will replace this preview.', actions: [{ action: 'show', target: 'lesson-prompt', parameters: {} }] }],
};

function supportsDualView(plan) {
  return Boolean(plan?.objects?.length && plan?.steps?.length);
}

function defaultViewMode(plan) {
  return supportsDualView(plan) ? '3d' : '2d';
}

export default function App() {
  const [theme, setTheme] = useState(() => window.localStorage.getItem('gen3d-theme') || 'dark');
  const [plan, setPlan] = useState(demo);
  const [viewMode, setViewMode] = useState(defaultViewMode(demo));
  const [isSample, setIsSample] = useState(true);
  const [isDraft, setIsDraft] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [apiState, setApiState] = useState('checking');
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [history, setHistory] = useState([]);
  const [manageLessons, setManageLessons] = useState(false);
  const [selectedLessonIds, setSelectedLessonIds] = useState([]);
  const [libraryError, setLibraryError] = useState('');
  const [deletingLessons, setDeletingLessons] = useState(false);
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [page, setPage] = useState('dashboard');
  const voiceSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [narrationReplayKey, setNarrationReplayKey] = useState(0);
  const playback = usePlayback(plan.steps.length, voiceEnabled);
  const lessonFileInputRef = useRef(null);
  const playbackPlayingRef = useRef(playback.isPlaying);
  const playbackSpeedRef = useRef(playback.speed);
  const wasPlayingRef = useRef(false);
  playbackPlayingRef.current = playback.isPlaying;
  playbackSpeedRef.current = playback.speed;
  const step = plan.steps[playback.currentStep] || plan.steps[0];
  const validation = useMemo(() => isDraft ? { valid: true, label: 'Ready for prompt' } : isSample ? { valid: true, label: 'Sample plan' } : { valid: true, label: 'Plan validated' }, [isDraft, isSample]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('gen3d-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!voiceEnabled || !voiceSupported || !step) return undefined;
    const speech = window.speechSynthesis;
    speech.cancel();
    const narration = buildStepNarration(step, plan.steps[playback.currentStep + 1]);
    if (!narration) return undefined;
    const utterance = new SpeechSynthesisUtterance(narration);
    utterance.lang = navigator.language || 'en-US';
    utterance.voice = chooseNarrationVoice(speech, utterance.lang);
    utterance.rate = narrationRate(playbackSpeedRef.current);
    utterance.pitch = 1;
    utterance.volume = 1;
    let cancelled = false;
    utterance.onend = () => {
      if (!cancelled && playbackPlayingRef.current) playback.advanceStep();
    };
    utterance.onerror = (event) => {
      if (cancelled || event.error === 'canceled' || event.error === 'interrupted') return;
      setVoiceError('Speech playback failed; continuing without voice. Check your browser audio settings.');
      setVoiceEnabled(false);
    };
    speech.speak(utterance);
    return () => {
      cancelled = true;
      speech.cancel();
    };
  }, [voiceEnabled, voiceSupported, step, playback.currentStep, playback.advanceStep, narrationReplayKey, plan.steps]);

  useEffect(() => {
    if (!voiceEnabled || !voiceSupported) { wasPlayingRef.current = false; return; }
    const speech = window.speechSynthesis;
    if (playback.isPlaying) speech.resume();
    else if (wasPlayingRef.current && speech.speaking) speech.pause();
    wasPlayingRef.current = playback.isPlaying;
  }, [voiceEnabled, voiceSupported, playback.isPlaying]);

  useEffect(() => () => {
    if (voiceSupported) window.speechSynthesis.cancel();
  }, [voiceSupported]);

  function toggleTheme() { setTheme((current) => current === 'dark' ? 'light' : 'dark'); }

  function toggleVoice() {
    setVoiceError('');
    setVoiceEnabled((enabled) => !enabled);
  }

  function downloadCurrentLesson() {
    if (!plan?.objects?.length || !plan?.steps?.length || isDraft) return;
    const payload = {
      format: 'gen3d-edu-lesson',
      version: 1,
      exported_at: new Date().toISOString(),
      view_mode: viewMode,
      plan,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const filename = String(plan.concept || 'lesson').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lesson';
    anchor.href = href;
    anchor.download = `${filename}.gen3d.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  async function importLessonFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setLibraryError('');
    try {
      const data = JSON.parse(await file.text());
      const importedPlan = data?.format === 'gen3d-edu-lesson' && data.version === 1 ? data.plan : null;
      if (!importedPlan || typeof importedPlan.concept !== 'string' || !Array.isArray(importedPlan.objects) || !Array.isArray(importedPlan.steps) || importedPlan.steps.length === 0 || importedPlan.steps.some((item) => !Array.isArray(item.actions))) {
        throw new Error('This file is not a supported Gen3D-Edu lesson.');
      }
      setPlan(importedPlan);
      setViewMode(data.view_mode === '2d' || data.view_mode === '3d' ? data.view_mode : defaultViewMode(importedPlan));
      setIsSample(false);
      setIsDraft(false);
      setActiveLessonId(null);
      setError('');
      playback.restart();
      setPage('studio');
    } catch (err) {
      setLibraryError(err instanceof SyntaxError ? 'Could not read that file. Choose a valid .gen3d.json lesson file.' : err.message || 'Could not import this lesson.');
    }
  }

  useEffect(() => {
    getHealth().then(() => setApiState('online')).catch(() => setApiState('offline'));
    getCurrentUser().then(async (current) => {
      setUser(current);
      try { setHistory(await getLessonHistory()); } catch { setHistory([]); }
    }).catch(() => setUser(null)).finally(() => setAuthChecked(true));
  }, []);

  async function onAuthenticated(current) {
    setUser(current);
    setPage('dashboard');
    try { setHistory(await getLessonHistory()); } catch { setHistory([]); }
  }

  async function openSavedLesson(id) {
    setError('');
    try {
      const saved = await getSavedLesson(id);
      setPlan(saved.plan); setViewMode(defaultViewMode(saved.plan)); setIsSample(false); setIsDraft(false); setActiveLessonId(saved.id); playback.restart(); setPage('studio');
    } catch (err) { setError(err.message || 'Could not open this lesson.'); }
  }

  async function onSignOut() {
    try { await signOut(); } catch { /* Clear the local view even if the session expired. */ }
    setUser(null); setHistory([]); setActiveLessonId(null); setPlan(demo); setViewMode(defaultViewMode(demo)); setIsSample(true); setIsDraft(false);
    setPage('dashboard');
  }

  async function toggleLessonPin(item) {
    setLibraryError('');
    try {
      await setLessonPinned(item.id, !item.is_pinned);
      setHistory(await getLessonHistory());
    } catch (err) { setLibraryError(err.message || 'Could not update the pin.'); }
  }

  function toggleLessonSelection(id) {
    setSelectedLessonIds((selected) => selected.includes(id) ? selected.filter((selectedId) => selectedId !== id) : [...selected, id]);
  }

  async function removeSelectedLessons() {
    if (!selectedLessonIds.length || deletingLessons) return;
    const confirmed = window.confirm(`Delete ${selectedLessonIds.length} selected ${selectedLessonIds.length === 1 ? 'lesson' : 'lessons'}? This cannot be undone.`);
    if (!confirmed) return;
    setDeletingLessons(true); setLibraryError('');
    try {
      const deleted = new Set(selectedLessonIds);
      await deleteSavedLessons(selectedLessonIds);
      setHistory((items) => items.filter((item) => !deleted.has(item.id)));
      if (deleted.has(activeLessonId)) setActiveLessonId(null);
      setSelectedLessonIds([]); setManageLessons(false);
    } catch (err) { setLibraryError(err.message || 'Could not delete the selected lessons.'); }
    finally { setDeletingLessons(false); }
  }

  function startNewLesson() {
    setError(''); setPrompt(''); setPlan(lessonDraft); setViewMode('3d'); setIsSample(false); setIsDraft(true); setActiveLessonId(null); playback.restart(); setPage('studio');
  }

  async function onGenerate(event) {
    event.preventDefault();
    if (!prompt.trim()) { setError('Enter an educational prompt first.'); return; }
    setGenerating(true); setError('');
    try {
      const result = await generatePlan(prompt.trim());
      setPlan(result.plan); setViewMode(defaultViewMode(result.plan)); setIsSample(false); setIsDraft(false); setActiveLessonId(result.lesson_id); setPrompt(''); playback.restart();
      setHistory(await getLessonHistory());
      setPage('studio');
    } catch (err) { setError(err.message || 'Lesson generation failed.'); }
    finally { setGenerating(false); }
  }

  if (!authChecked) return <main className="auth-page"><div className="auth-loading"><span className="brand-mark"><Layers3 size={19} /></span><p>Opening your learning studio…</p></div></main>;
  if (!user) return <AuthScreen onAuthenticated={onAuthenticated} apiState={apiState} theme={theme} onToggleTheme={toggleTheme} />;

  const canToggleView = supportsDualView(plan);

  if (page === 'dashboard') return <main className="dashboard-shell">
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark"><Layers3 size={19} /></span><span>gen3d<span className="brand-light">·edu</span></span></a><div className="topbar-right"><span className={`connection ${apiState}`}><i />{apiState === 'online' ? 'API connected' : apiState === 'offline' ? 'API offline' : 'Checking API'}</span><span className="account-name">{user.name}</span><button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}<span>{theme === 'dark' ? 'Light' : 'Dark'} mode</span></button><button className="signout-button" onClick={onSignOut} title="Sign out"><LogOut size={15} /><span>Sign out</span></button></div></header>
    <section className="dashboard-content"><div className="dashboard-welcome-row"><div><div className="kicker"><Sparkles size={13} /> YOUR LEARNING STUDIO</div><h1>Welcome back, {user.name.split(' ')[0]}.</h1><p className="dashboard-intro">Pick up where you left off, or turn a new question into an interactive lesson.</p></div><button className="dashboard-signout signout-button" onClick={onSignOut}><LogOut size={15} /><span>Sign out</span></button></div>
      <button className="dashboard-create" onClick={startNewLesson}><span><Plus size={19} /></span><div><strong>Create a new lesson</strong><small>Ask about any topic and explore it step by step.</small></div><ArrowUpRight size={17} /></button>
      <section className="dashboard-lessons"><div className="dashboard-section-head"><div><div className="panel-label">YOUR LIBRARY</div><h2>Saved lessons</h2></div><div className="library-actions"><span>{history.length} {history.length === 1 ? 'lesson' : 'lessons'}</span><button className="library-manage-button library-import-button" onClick={() => lessonFileInputRef.current?.click()}><Upload size={13} /> Import lesson</button><input ref={lessonFileInputRef} type="file" accept=".json,.gen3d.json,application/json" onChange={importLessonFile} hidden />{history.length > 0 && <button className="library-manage-button" onClick={() => { setManageLessons((value) => !value); setSelectedLessonIds([]); setLibraryError(''); }}>{manageLessons ? 'Done' : 'Manage'}</button>}</div></div>
        {manageLessons && history.length > 0 && <div className="library-selection-bar"><button onClick={() => setSelectedLessonIds(selectedLessonIds.length === history.length ? [] : history.map((item) => item.id))}>{selectedLessonIds.length === history.length ? 'Clear selection' : 'Select all'}</button><span>{selectedLessonIds.length} selected</span><button className="library-delete-button" onClick={removeSelectedLessons} disabled={!selectedLessonIds.length || deletingLessons}><Trash2 size={14} />{deletingLessons ? 'Deleting…' : 'Delete selected'}</button></div>}
        {libraryError && <div className="error-message"><X size={13} />{libraryError}</div>}
        {history.length ? <div className="dashboard-grid">{history.map((item) => <article key={item.id} className={`dashboard-lesson ${item.is_pinned ? 'pinned' : ''} ${selectedLessonIds.includes(item.id) ? 'selected' : ''}`}>
          <button className="dashboard-lesson-open" onClick={() => openSavedLesson(item.id)}><span className="lesson-icon"><BookOpen size={17} /></span><span className="lesson-date">{new Date(item.created_at).toLocaleDateString()}</span><strong>{item.concept}</strong><small>{item.domain}</small><span className="lesson-open">Open lesson <ArrowUpRight size={13} /></span></button>
          <button className={`lesson-pin-button ${item.is_pinned ? 'active' : ''}`} onClick={() => toggleLessonPin(item)} aria-label={item.is_pinned ? `Unpin ${item.concept}` : `Pin ${item.concept}`} aria-pressed={Boolean(item.is_pinned)} title={item.is_pinned ? 'Unpin lesson' : 'Pin lesson'}><Star size={15} fill={item.is_pinned ? 'currentColor' : 'none'} /></button>
          {manageLessons && <label className="lesson-select"><input type="checkbox" checked={selectedLessonIds.includes(item.id)} onChange={() => toggleLessonSelection(item.id)} aria-label={`Select ${item.concept} for deletion`} /><span>Select</span></label>}
        </article>)}</div> : <div className="dashboard-empty"><BookOpen size={20} /><strong>Your lessons will live here</strong><span>Create your first visual lesson and it will be saved to this library.</span></div>}
      </section>
    </section>
    <footer className="footer"><span><span className="footer-pulse" /> A workspace for curious minds</span><span>Ask <b>→</b> understand <b>→</b> remember</span></footer>
  </main>;

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark"><Layers3 size={19} /></span><span>gen3d<span className="brand-light">·edu</span></span></a><div className="topbar-right"><button className="dashboard-back" onClick={() => setPage('dashboard')}><BookOpen size={14} /> Dashboard</button><span className={`connection ${apiState}`}><i />{apiState === 'online' ? 'API connected' : apiState === 'offline' ? 'API offline' : 'Checking API'}</span><button className="help-button" title="About this prototype"><CircleHelp size={17} /></button><span className="account-name">{user.name}</span><button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>{theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}<span>{theme === 'dark' ? 'Light' : 'Dark'} mode</span></button><button className="signout-button" onClick={onSignOut} title="Sign out"><LogOut size={15} /><span>Sign out</span></button></div></header>
    <section className="welcome"><div><div className="kicker"><Sparkles size={13} /> INTERACTIVE LEARNING STUDIO</div><h1>Ideas are better in motion.</h1><p>Turn an educational question into a visual, step-by-step lesson.</p></div><div className="sample-stamp"><span>✳</span> {isDraft ? 'NEW LESSON' : isSample ? 'SAMPLE LESSON' : 'GENERATED LESSON'}</div></section>
    <section className="workbench">
      <aside className="panel lesson-nav"><div className="panel-label">LESSON OUTLINE <span>{String(plan.steps.length).padStart(2, '0')}</span></div><StepList steps={plan.steps} current={playback.currentStep} onSelect={playback.goToStep} /><section className="history-block"><div className="panel-label">SAVED LESSONS <span>{history.length}</span></div><div className="history-items">{history.length ? history.map((item) => <button key={item.id} className={`history-item ${activeLessonId === item.id ? 'active' : ''}`} onClick={() => openSavedLesson(item.id)}><strong>{item.concept}</strong><span>{item.domain}</span><time>{new Date(item.created_at).toLocaleDateString()}</time></button>) : <div className="history-empty">Generated lessons will be saved here for next time.</div>}</div></section><div className="objective-block"><div className="panel-label">LEARNING OBJECTIVE</div><h3>{plan.concept}</h3><p>{plan.learning_objective}</p><div className="domain-chip"><GraduationCap size={13} /> {plan.domain}</div></div></aside>
      <section className="panel visualization"><div className="visual-top"><div><div className="visual-title">{plan.concept}</div><div className="visual-sub">Structured plan <span>/</span> {viewMode === '3d' ? (plan.concept.toLowerCase().includes('projectile motion') ? 'Blender GLB · 3D scene' : 'Interactive 3D scene') : '2D scene view'}</div></div><div className="visual-status"><span className="status-dot" /> {isDraft ? 'AWAITING PROMPT' : isSample ? 'EXAMPLE' : 'PLAN READY'}</div></div><div className="scene-grid" /><PlanScene key={activeLessonId ?? (isDraft ? 'draft' : isSample ? 'sample' : plan.concept)} plan={plan} stepIndex={playback.currentStep} isPlaying={playback.isPlaying} speed={playback.speed} viewMode={viewMode} /><div className="visual-bottom"><span><Command size={12} /> STEP {String(playback.currentStep + 1).padStart(2, '0')} / {String(plan.steps.length).padStart(2, '0')}</span><span>{isDraft ? 'ENTER A TOPIC TO BEGIN' : 'SCHEMA · VALIDATED'}</span></div><div className="playback-wrap"><PlaybackControls playback={playback} voiceEnabled={voiceEnabled} onToggleVoice={toggleVoice} voiceSupported={voiceSupported} voiceError={voiceError} onReplayNarration={() => { if (!voiceEnabled) setVoiceEnabled(true); setNarrationReplayKey((key) => key + 1); }} viewMode={viewMode} onChangeViewMode={setViewMode} canToggleView={canToggleView} onDownloadLesson={downloadCurrentLesson} canDownloadLesson={!isDraft && canToggleView} /></div><div className="progress-track"><i style={{ width: `${((playback.currentStep + 1) / plan.steps.length) * 100}%` }} /></div></section>
      <aside className="right-rail"><section className="panel explain-panel"><div className="explain-heading"><span>THE WALKTHROUGH</span><span>{String(playback.currentStep + 1).padStart(2, '0')} — {String(plan.steps.length).padStart(2, '0')}</span></div><div className="walkthrough-copy" key={`${activeLessonId ?? plan.concept}-${playback.currentStep}`}><h2>{step.title}</h2><p>{step.explanation}</p></div><div className="key-insight"><span>✳ &nbsp; THE TAKEAWAY</span><p>{step.insight || plan.learning_objective}</p></div><div className="metrics"><div><span>PLAN STEPS</span><b>{String(plan.steps.length).padStart(2, '0')}</b></div><div><span>VALIDATION</span><b className="valid-text"><Check size={13} /> {validation.label}</b></div></div></section>
        <section className="panel generate-panel"><div className="generate-head"><span className="spark-icon"><Sparkles size={14} /></span><div><h3>Make a new lesson</h3><p>What would you like to understand?</p></div></div><form onSubmit={onGenerate}><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g. Show how gradient descent finds a minimum…" maxLength={1500} /><div className="form-footer"><span>{prompt.length}/1500</span><VoicePromptButton value={prompt} onChange={setPrompt} onError={setError} /><button className="generate-button" disabled={generating}>{generating ? <><LoaderCircle className="spin" size={14} /> Planning</> : <>Generate <ArrowUpRight size={14} /></>}</button></div></form>{error && <div className="error-message"><X size={13} />{error}</div>}<div className="pipeline"><span><i /> REASON</span><b>→</b><span><i /> VALIDATE</span><b>→</b><span><i /> VISUALIZE</span></div></section>
      </aside>
    </section>
    <footer className="footer"><span><span className="footer-pulse" /> {isDraft ? 'Waiting for your lesson topic' : isSample ? 'Exploring a sample AnimationPlan' : 'AnimationPlan generated and validated'}</span><span>Educational reasoning <b>→</b> structured plan <b>→</b> visual execution</span></footer>
  </main>;
}

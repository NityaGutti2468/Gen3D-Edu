function cleanForSpeech(value) {
  return String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*|__|[*_#]/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[×✕]/g, ' times ')
    .replace(/÷/g, ' divided by ')
    .replace(/½/g, ' one half ')
    .replace(/ρ/g, ' rho ')
    .replace(/θ/g, ' theta ')
    .replace(/π/g, ' pi ')
    .replace(/²/g, ' squared ')
    .replace(/³/g, ' cubed ')
    .replace(/≥/g, ' is greater than or equal to ')
    .replace(/≤/g, ' is less than or equal to ')
    .replace(/≠/g, ' is not equal to ')
    .replace(/≈/g, ' is approximately ')
    .replace(/→|⇒/g, ' goes to ')
    .replace(/\//g, ' divided by ')
    .replace(/\+/g, ' plus ')
    .replace(/[−–]/g, ' minus ')
    .replace(/=/g, ' equals ')
    .replace(/[()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function teachingCue(step) {
  const actions = Array.isArray(step?.actions) ? step.actions : [];
  const actionNames = actions.map((action) => String(action?.action || '').toLowerCase());
  if (actionNames.includes('compare')) return 'Watch the highlighted values as we compare them.';
  if (actionNames.includes('move')) return 'Follow the pointer as it moves to the next position.';
  if (actionNames.includes('create')) return 'Watch the new object appear in the scene.';
  if (actionNames.includes('remove') || actionNames.includes('hide')) return 'Notice which object leaves the scene.';
  if (actionNames.includes('highlight')) return 'Look at the highlighted part of the scene.';
  if (actionNames.includes('rotate')) return 'Notice how the object changes orientation.';
  if (actionNames.includes('focus')) return 'Keep your attention on the highlighted object.';
  return 'Follow the scene as we work through this idea.';
}

export function buildStepNarration(step, nextStep) {
  const title = cleanForSpeech(step?.title);
  let explanation = cleanForSpeech(step?.explanation);
  if (title && explanation.toLowerCase().startsWith(title.toLowerCase())) {
    explanation = explanation.slice(title.length).replace(/^[\s:,.—-]+/, '');
  }
  const nextTitle = cleanForSpeech(nextStep?.title);
  const narration = [
    title ? `Let's look at ${title.toLowerCase()}.` : '',
    teachingCue(step),
    explanation,
    nextTitle ? `Next, we'll look at ${nextTitle.toLowerCase()}.` : 'Pause here and make sure the idea is clear.',
  ].filter(Boolean).join(' ');
  if (narration.length <= 680) return narration;
  const shortened = narration.slice(0, 677);
  return `${shortened.slice(0, shortened.lastIndexOf(' '))}…`;
}

export function chooseNarrationVoice(speech, language) {
  const voices = speech?.getVoices?.() || [];
  if (!voices.length) return null;
  const requested = String(language || '').toLowerCase();
  const languageOnly = requested.split('-')[0];
  const voiceLanguage = (voice) => String(voice.lang || '').toLowerCase();
  return voices.find((voice) => voiceLanguage(voice) === requested)
    || voices.find((voice) => voiceLanguage(voice).startsWith(`${languageOnly}-`))
    || voices.find((voice) => voice.default)
    || voices[0];
}

export function narrationRate(playbackSpeed) {
  const rateByDelay = { 1800: 0.88, 1200: 1, 650: 1.14, 350: 1.28 };
  return rateByDelay[playbackSpeed] || 1;
}

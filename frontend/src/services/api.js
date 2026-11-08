const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

export async function generatePlan(prompt) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 75_000);
  let response;
  try {
    response = await fetch(apiUrl('/api/generate'), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Lesson generation timed out. Check that the backend is running and your LLM provider is available, then try again.');
    throw new Error('Could not reach the lesson service. Check that the backend is running, then try again.');
  } finally {
    window.clearTimeout(timeout);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || 'The lesson could not be generated. Please try again.');
  return data;
}

async function authRequest(path, options = {}) {
  const response = await fetch(apiUrl(path), {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || 'The request could not be completed.');
  return data;
}

export function getCurrentUser() {
  return authRequest('/api/auth/me');
}

export function signIn(email, password) {
  return authRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function signUp(name, email, password) {
  return authRequest('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, password }) });
}

export function signOut() {
  return authRequest('/api/auth/logout', { method: 'POST' });
}

export function getLessonHistory() {
  return authRequest('/api/lessons');
}

export function getSavedLesson(id) {
  return authRequest(`/api/lessons/${encodeURIComponent(id)}`);
}

export function downloadLessonLibraryBackup() {
  return authRequest('/api/lessons/export');
}

export function restoreLessonLibraryBackup(backup) {
  return authRequest('/api/lessons/import', { method: 'POST', body: JSON.stringify(backup) });
}


export function setLessonPinned(id, isPinned) {
  return authRequest(`/api/lessons/${encodeURIComponent(id)}/pin`, {
    method: 'PATCH', body: JSON.stringify({ is_pinned: isPinned }),
  });
}

export function deleteSavedLessons(lessonIds) {
  return authRequest('/api/lessons/bulk-delete', {
    method: 'POST', body: JSON.stringify({ lesson_ids: lessonIds }),
  });
}

export async function getHealth({ signal } = {}) {
  const response = await fetch(apiUrl('/api/health'), { cache: 'no-store', signal });
  if (!response.ok) throw new Error('API unavailable');
  return response.json();
}

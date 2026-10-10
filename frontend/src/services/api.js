export async function generatePlan(prompt) {
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || 'The lesson could not be generated. Please try again.');
  return data;
}

async function authRequest(path, options = {}) {
  const response = await fetch(path, {
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

export async function getHealth() {
  const response = await fetch('/api/health');
  if (!response.ok) throw new Error('API unavailable');
  return response.json();
}

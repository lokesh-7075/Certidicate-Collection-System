import { getToken } from './session.js';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function authedFetch(path, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

export async function registerStudentStudent(payload) {
  const res = await fetch(`${BASE_URL}/auth/register/student`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

export async function loginStudent(payload) {
  const res = await fetch(`${BASE_URL}/auth/login/student`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

export async function loginFaculty(payload) {
  const res = await fetch(`${BASE_URL}/auth/login/faculty`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Request failed: ${res.status}`);
  return data;
}

export async function fetchNotifications() {
  return authedFetch('/notifications');
}

export async function fetchApplicationsForCurrentUser() {
  // server expects userUid optionally; token contains uid
  return authedFetch('/applications');
}

export async function fetchApplicationsByStatus(status) {
  return authedFetch(`/applications?status=${encodeURIComponent(status)}`);
}

export async function submitApplication(payload) {
  return authedFetch('/applications', { method: 'POST', body: JSON.stringify(payload) });
}

export async function bosaProcessApplication(appId, bosaDecision, odGrant, bosaComment) {
  return authedFetch(`/applications/${encodeURIComponent(appId)}/bosa`, {
    method: 'POST',
    body: JSON.stringify({ bosaDecision, odGrant, bosaComment }),
  });
}

export async function hodProcessApplication(appId, hodDecision, odGrant, hodComment) {
  return authedFetch(`/applications/${encodeURIComponent(appId)}/hod`, {
    method: 'POST',
    body: JSON.stringify({ hodDecision, odGrant, hodComment }),
  });
}

export async function updateFacultyProfile(payload) {
  return authedFetch('/faculty/profile', { method: 'POST', body: JSON.stringify(payload) });
}

export async function registerBosaMember(payload) {
  return authedFetch('/auth/register/bosa', { method: 'POST', body: JSON.stringify(payload) });
}

export async function changeFacultyPassword(payload) {
  return authedFetch('/auth/change-password', { method: 'POST', body: JSON.stringify(payload) });
}

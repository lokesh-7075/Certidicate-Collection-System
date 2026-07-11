const TOKEN_KEY = 'itcerti-od-jwt';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (!token) localStorage.removeItem(TOKEN_KEY);
  else localStorage.setItem(TOKEN_KEY, token);
}

export function signOut() {
  localStorage.removeItem(TOKEN_KEY);
}


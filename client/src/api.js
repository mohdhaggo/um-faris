const TOKEN_KEY = 'umfaris_token';

// API base URL: empty = same-origin (web served by the backend).
// For the Android build (Capacitor) set VITE_API_BASE to the public API URL, e.g.
//   VITE_API_BASE=https://api.example.com npm run build
export const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function request(path, { method = 'GET', body, params } = {}) {
  let url = API_BASE + path;
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null)
    ).toString();
    if (qs) url += `?${qs}`;
  }
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    setToken(null);
    if (!path.endsWith('/login')) window.location.reload();
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || 'حدث خطأ');
  return data;
}

export const api = {
  get: (p, params) => request(p, { params }),
  post: (p, body) => request(p, { method: 'POST', body }),
  put: (p, body) => request(p, { method: 'PUT', body }),
  del: (p) => request(p, { method: 'DELETE' }),
};

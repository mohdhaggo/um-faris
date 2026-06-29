// API layer. The public surface (api.get/post/put/del, getToken/setToken) is unchanged;
// requests are now served by the Firebase adapter instead of a remote Express server.
import { handle } from './fb/adapter';

const TOKEN_KEY = 'umfaris_token';

// Kept for backward-compat with existing imports; no longer used for networking.
export const API_BASE = '';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

async function request(path, { method = 'GET', body, params } = {}) {
  try {
    const data = await handle(method, path, { params, body });
    // mirror the old behavior: a successful login persists its token
    if (path.endsWith('/auth/login') && data?.token) setToken(data.token);
    return data;
  } catch (err) {
    if (err.status === 401 && !path.endsWith('/login')) setToken(null);
    throw new Error(err.message || 'حدث خطأ');
  }
}

export const api = {
  get: (p, params) => request(p, { params }),
  post: (p, body) => request(p, { method: 'POST', body }),
  put: (p, body) => request(p, { method: 'PUT', body }),
  del: (p) => request(p, { method: 'DELETE' }),
};

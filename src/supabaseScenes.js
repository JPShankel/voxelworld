const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const SCENES_TABLE = process.env.REACT_APP_SUPABASE_SCENES_TABLE || 'scenes';
const SESSION_STORAGE_KEY = 'voxelworld.supabaseSession';

function getHeaders(session, extraHeaders = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session?.access_token ?? SUPABASE_ANON_KEY}`,
    ...extraHeaders,
  };
}

function requireSupabaseConfig() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.');
  }
}

function requireSession(session) {
  if (!session?.access_token || !session?.user?.id) {
    throw new Error('Sign in to save, load, or delete scenes.');
  }
}

async function readError(response, fallbackMessage) {
  const message = await response.text();
  throw new Error(message || fallbackMessage);
}

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export function getStoredSession() {
  try {
    const storedSession = window.localStorage.getItem(SESSION_STORAGE_KEY);
    return storedSession ? JSON.parse(storedSession) : null;
  } catch {
    return null;
  }
}

export function storeSession(session) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearStoredSession() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

async function authRequest(path, body) {
  requireSupabaseConfig();

  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: 'POST',
    headers: getHeaders(null, {
      'Content-Type': 'application/json',
    }),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    await readError(response, `Supabase auth failed with status ${response.status}.`);
  }

  const session = await response.json();
  if (session.access_token) {
    storeSession(session);
  }
  return session;
}

export async function signInWithPassword({ email, password }) {
  return authRequest('token?grant_type=password', { email, password });
}

export async function signUpWithPassword({ email, password }) {
  return authRequest('signup', { email, password });
}

export async function signOut(session) {
  requireSupabaseConfig();

  if (session?.access_token) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: getHeaders(session),
    });

    if (!response.ok) {
      await readError(response, `Supabase sign out failed with status ${response.status}.`);
    }
  }

  clearStoredSession();
}

export async function saveScene({ name, payload, session }) {
  requireSupabaseConfig();
  requireSession(session);

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SCENES_TABLE}`, {
    method: 'POST',
    headers: getHeaders(session, {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    }),
    body: JSON.stringify({
      name,
      payload,
      user_id: session.user.id,
    }),
  });

  if (!response.ok) {
    await readError(response, `Supabase save failed with status ${response.status}.`);
  }

  const [savedScene] = await response.json();
  return savedScene;
}

export async function listScenes(limit = 20, session) {
  requireSupabaseConfig();
  requireSession(session);

  const query = new URLSearchParams({
    select: 'id,name,created_at',
    order: 'created_at.desc',
    limit: String(limit),
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SCENES_TABLE}?${query}`, {
    method: 'GET',
    headers: getHeaders(session),
  });

  if (!response.ok) {
    await readError(response, `Supabase list failed with status ${response.status}.`);
  }

  return response.json();
}

export async function loadScene(id, session) {
  requireSupabaseConfig();
  requireSession(session);

  const query = new URLSearchParams({
    select: 'id,name,payload,created_at',
    id: `eq.${id}`,
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SCENES_TABLE}?${query}`, {
    method: 'GET',
    headers: getHeaders(session),
  });

  if (!response.ok) {
    await readError(response, `Supabase load failed with status ${response.status}.`);
  }

  const [scene] = await response.json();

  if (!scene) {
    throw new Error('Scene not found.');
  }

  return scene;
}

export async function deleteScene(id, session) {
  requireSupabaseConfig();
  requireSession(session);

  const query = new URLSearchParams({
    id: `eq.${id}`,
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SCENES_TABLE}?${query}`, {
    method: 'DELETE',
    headers: getHeaders(session, {
      Prefer: 'return=minimal',
    }),
  });

  if (!response.ok) {
    await readError(response, `Supabase delete failed with status ${response.status}.`);
  }
}

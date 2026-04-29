const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;
const SCENES_TABLE = process.env.REACT_APP_SUPABASE_SCENES_TABLE || 'scenes';

function getHeaders(extraHeaders = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...extraHeaders,
  };
}

function requireSupabaseConfig() {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured. Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_ANON_KEY.');
  }
}

async function readError(response, fallbackMessage) {
  const message = await response.text();
  throw new Error(message || fallbackMessage);
}

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

export async function saveScene({ name, payload }) {
  requireSupabaseConfig();

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SCENES_TABLE}`, {
    method: 'POST',
    headers: getHeaders({
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    }),
    body: JSON.stringify({
      name,
      payload,
    }),
  });

  if (!response.ok) {
    await readError(response, `Supabase save failed with status ${response.status}.`);
  }

  const [savedScene] = await response.json();
  return savedScene;
}

export async function listScenes(limit = 20) {
  requireSupabaseConfig();

  const query = new URLSearchParams({
    select: 'id,name,created_at',
    order: 'created_at.desc',
    limit: String(limit),
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SCENES_TABLE}?${query}`, {
    method: 'GET',
    headers: getHeaders(),
  });

  if (!response.ok) {
    await readError(response, `Supabase list failed with status ${response.status}.`);
  }

  return response.json();
}

export async function loadScene(id) {
  requireSupabaseConfig();

  const query = new URLSearchParams({
    select: 'id,name,payload,created_at',
    id: `eq.${id}`,
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SCENES_TABLE}?${query}`, {
    method: 'GET',
    headers: getHeaders(),
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

export async function deleteScene(id) {
  requireSupabaseConfig();

  const query = new URLSearchParams({
    id: `eq.${id}`,
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SCENES_TABLE}?${query}`, {
    method: 'DELETE',
    headers: getHeaders({
      Prefer: 'return=minimal',
    }),
  });

  if (!response.ok) {
    await readError(response, `Supabase delete failed with status ${response.status}.`);
  }
}

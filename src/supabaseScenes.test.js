describe('supabase scene saving', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  const session = {
    access_token: 'user-token',
    user: { id: 'user-1', email: 'user@example.com' },
  };

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
    const storage = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn((key) => storage[key] ?? null),
        setItem: jest.fn((key, value) => {
          storage[key] = value;
        }),
        removeItem: jest.fn((key) => {
          delete storage[key];
        }),
      },
      configurable: true,
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  test('reports missing Supabase configuration', async () => {
    delete process.env.REACT_APP_SUPABASE_URL;
    delete process.env.REACT_APP_SUPABASE_ANON_KEY;
    const { isSupabaseConfigured, saveScene } = require('./supabaseScenes');

    expect(isSupabaseConfigured()).toBe(false);
    await expect(saveScene({ name: 'Test', payload: {}, session })).rejects.toThrow('Supabase is not configured');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('requires a signed in user for scene operations', async () => {
    process.env.REACT_APP_SUPABASE_URL = 'https://example.supabase.co';
    process.env.REACT_APP_SUPABASE_ANON_KEY = 'anon-key';
    const { saveScene } = require('./supabaseScenes');

    await expect(saveScene({ name: 'Test', payload: {} })).rejects.toThrow('Sign in');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('saves scene payloads through Supabase REST', async () => {
    process.env.REACT_APP_SUPABASE_URL = 'https://example.supabase.co';
    process.env.REACT_APP_SUPABASE_ANON_KEY = 'anon-key';
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ([{ id: 'scene-1', name: 'Test' }]),
    });
    const { isSupabaseConfigured, saveScene } = require('./supabaseScenes');

    const savedScene = await saveScene({
      name: 'Test',
      payload: { voxels: [{ x: 0, y: 0, z: 0, type: 'grass' }] },
      session,
    });

    expect(isSupabaseConfigured()).toBe(true);
    expect(savedScene).toEqual({ id: 'scene-1', name: 'Test' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/scenes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'Test',
          payload: { voxels: [{ x: 0, y: 0, z: 0, type: 'grass' }] },
          user_id: 'user-1',
        }),
        headers: expect.objectContaining({
          Authorization: 'Bearer user-token',
        }),
      })
    );
  });

  test('lists recent scenes', async () => {
    process.env.REACT_APP_SUPABASE_URL = 'https://example.supabase.co';
    process.env.REACT_APP_SUPABASE_ANON_KEY = 'anon-key';
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ([{ id: 'scene-1', name: 'Test' }]),
    });
    const { listScenes } = require('./supabaseScenes');

    const scenes = await listScenes(5, session);

    expect(scenes).toEqual([{ id: 'scene-1', name: 'Test' }]);
    expect(global.fetch.mock.calls[0][0]).toBe(
      'https://example.supabase.co/rest/v1/scenes?select=id%2Cname%2Ccreated_at&order=created_at.desc&limit=5'
    );
  });

  test('loads a scene payload by id', async () => {
    process.env.REACT_APP_SUPABASE_URL = 'https://example.supabase.co';
    process.env.REACT_APP_SUPABASE_ANON_KEY = 'anon-key';
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ([{ id: 'scene-1', name: 'Test', payload: { voxels: [] } }]),
    });
    const { loadScene } = require('./supabaseScenes');

    const scene = await loadScene('scene-1', session);

    expect(scene.payload).toEqual({ voxels: [] });
    expect(global.fetch.mock.calls[0][0]).toBe(
      'https://example.supabase.co/rest/v1/scenes?select=id%2Cname%2Cpayload%2Ccreated_at&id=eq.scene-1'
    );
  });

  test('deletes a scene by id', async () => {
    process.env.REACT_APP_SUPABASE_URL = 'https://example.supabase.co';
    process.env.REACT_APP_SUPABASE_ANON_KEY = 'anon-key';
    global.fetch.mockResolvedValue({
      ok: true,
      text: async () => '',
    });
    const { deleteScene } = require('./supabaseScenes');

    await deleteScene('scene-1', session);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/scenes?id=eq.scene-1',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({
          Authorization: 'Bearer user-token',
        }),
      })
    );
  });

  test('signs in with Supabase auth and stores the session', async () => {
    process.env.REACT_APP_SUPABASE_URL = 'https://example.supabase.co';
    process.env.REACT_APP_SUPABASE_ANON_KEY = 'anon-key';
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => session,
    });
    const { getStoredSession, signInWithPassword } = require('./supabaseScenes');

    const signedIn = await signInWithPassword({
      email: 'user@example.com',
      password: 'secret',
    });

    expect(signedIn).toBe(session);
    expect(window.localStorage.setItem).toHaveBeenCalled();
    expect(getStoredSession()).toEqual(session);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.supabase.co/auth/v1/token?grant_type=password',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });
});

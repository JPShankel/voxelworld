describe('supabase scene saving', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    global.fetch = jest.fn();
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
    await expect(saveScene({ name: 'Test', payload: {} })).rejects.toThrow('Supabase is not configured');
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

    const scenes = await listScenes(5);

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

    const scene = await loadScene('scene-1');

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

    await deleteScene('scene-1');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.supabase.co/rest/v1/scenes?id=eq.scene-1',
      expect.objectContaining({
        method: 'DELETE',
      })
    );
  });
});

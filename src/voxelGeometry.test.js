import {
  createMidpointDisplacementHeightfield,
  createVoxelMesh,
  createVoxelTerrain,
  disposeVoxelMesh,
  VOXEL_PALETTE,
  VOXEL_SIZE,
} from './voxelGeometry';

test('creates terrain voxel data', () => {
  const terrain = createVoxelTerrain(2, { seed: 7 });

  expect(terrain.length).toBeGreaterThan(0);
  expect(terrain.some((voxel) => voxel.type === 'grass')).toBe(true);
});

test('creates seeded midpoint displacement heightfields', () => {
  const heightfield = createMidpointDisplacementHeightfield(5, { seed: 42 });
  const repeatedHeightfield = createMidpointDisplacementHeightfield(5, { seed: 42 });
  const values = heightfield.flat();

  expect(heightfield).toEqual(repeatedHeightfield);
  expect(heightfield).toHaveLength(5);
  expect(heightfield[0]).toHaveLength(5);
  expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
  expect(Math.max(...values)).toBeLessThanOrEqual(1);
  expect(new Set(values.map((value) => value.toFixed(3))).size).toBeGreaterThan(3);
});

test('creates varied terrain heights from midpoint displacement', () => {
  const terrain = createVoxelTerrain(4, { seed: 11 });
  const topHeights = new Map();

  terrain.forEach((voxel) => {
    const key = `${voxel.x},${voxel.z}`;
    topHeights.set(key, Math.max(topHeights.get(key) ?? 0, voxel.y + 1));
  });

  expect(new Set([...topHeights.values()]).size).toBeGreaterThan(2);
});

test('creates vertical surface strata by terrain elevation', () => {
  const terrain = createVoxelTerrain(8, { seed: 21, minHeight: 1, maxHeight: 10 });
  const topVoxels = new Map();

  terrain.forEach((voxel) => {
    const key = `${voxel.x},${voxel.z}`;
    const current = topVoxels.get(key);

    if (!current || voxel.y > current.y) {
      topVoxels.set(key, voxel);
    }
  });

  const surfaceTypes = new Set([...topVoxels.values()].map((voxel) => voxel.type));

  expect(surfaceTypes.has('sand')).toBe(true);
  expect(surfaceTypes.has('grass')).toBe(true);
  expect(surfaceTypes.has('dirt')).toBe(true);
  expect(surfaceTypes.has('snow')).toBe(true);
  expect(VOXEL_PALETTE.sand).toBeDefined();
  expect(VOXEL_PALETTE.rock).toBeDefined();
  expect(VOXEL_PALETTE.snow).toBeDefined();
});

test('keeps dirt and stone below the terrain surface', () => {
  const terrain = createVoxelTerrain(8, { seed: 11, minHeight: 4, maxHeight: 10 });
  const topHeights = new Map();

  terrain.forEach((voxel) => {
    const key = `${voxel.x},${voxel.z}`;
    topHeights.set(key, Math.max(topHeights.get(key) ?? 0, voxel.y));
  });

  const subsurfaceTypes = new Set(
    terrain
      .filter((voxel) => voxel.y < topHeights.get(`${voxel.x},${voxel.z}`))
      .map((voxel) => voxel.type)
  );

  expect(subsurfaceTypes.has('dirt')).toBe(true);
  expect(subsurfaceTypes.has('stone')).toBe(true);
});

test('builds exposed-face voxel geometry', () => {
  const voxelMesh = createVoxelMesh([
    { x: 0, y: 0, z: 0, type: 'grass' },
    { x: 1, y: 0, z: 0, type: 'grass' },
  ]);
  const mesh = voxelMesh.children[0];

  expect(mesh.geometry.attributes.position.count).toBe(40);
  expect(mesh.geometry.index.count).toBe(60);
  expect(mesh.geometry.userData.faceLookup).toHaveLength(20);
  expect(VOXEL_SIZE).toBe(10);

  disposeVoxelMesh(voxelMesh);
});

test('builds outward-facing side faces', () => {
  const voxelMesh = createVoxelMesh([{ x: 0, y: 0, z: 0, type: 'grass' }]);
  const mesh = voxelMesh.children[0];
  const positions = mesh.geometry.attributes.position.array;
  const indices = mesh.geometry.index.array;

  const faceNormalX = (triangleIndex) => {
    const vertexIndex = indices[triangleIndex] * 3;
    const nextVertexIndex = indices[triangleIndex + 1] * 3;
    const lastVertexIndex = indices[triangleIndex + 2] * 3;
    const ax = positions[nextVertexIndex] - positions[vertexIndex];
    const ay = positions[nextVertexIndex + 1] - positions[vertexIndex + 1];
    const az = positions[nextVertexIndex + 2] - positions[vertexIndex + 2];
    const bx = positions[lastVertexIndex] - positions[vertexIndex];
    const by = positions[lastVertexIndex + 1] - positions[vertexIndex + 1];
    const bz = positions[lastVertexIndex + 2] - positions[vertexIndex + 2];

    return ay * bz - az * by;
  };

  expect(faceNormalX(0)).toBeGreaterThan(0);
  expect(faceNormalX(6)).toBeLessThan(0);

  disposeVoxelMesh(voxelMesh);
});

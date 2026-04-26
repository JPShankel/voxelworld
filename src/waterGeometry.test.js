import {
  WATER_FLOW_AMOUNT,
  WATER_SOURCE_AMOUNT,
  addWaterDrop,
  applyWaterEffects,
  createWaterMap,
  createWaterMesh,
  disposeWaterMesh,
  flowWater,
  removeWaterDrop,
  validateWater,
  waterKey,
} from './waterGeometry';

const voxelKey = (x, y, z) => `${x},${y},${z}`;

const createVoxelMap = (voxels) => new Map(voxels.map((voxel) => [voxelKey(voxel.x, voxel.y, voxel.z), voxel]));
const getTotalWater = (waterMap) => [...waterMap.values()]
  .reduce((total, cell) => total + cell.level, 0);

test('drops water onto the top voxel in a column', () => {
  const voxelMap = createVoxelMap([
    { x: 0, y: 0, z: 0, type: 'grass' },
    { x: 0, y: 1, z: 0, type: 'grass' },
  ]);
  const waterMap = createWaterMap();

  expect(addWaterDrop(waterMap, voxelMap, 0, 0)).toBe(true);

  expect(waterMap.get(waterKey(0, 0))).toMatchObject({
    x: 0,
    y: 2,
    z: 0,
    level: 1,
  });
});

test('removes water one level at a time', () => {
  const voxelMap = createVoxelMap([{ x: 0, y: 0, z: 0, type: 'grass' }]);
  const waterMap = createWaterMap();

  addWaterDrop(waterMap, voxelMap, 0, 0);
  addWaterDrop(waterMap, voxelMap, 0, 0);

  expect(removeWaterDrop(waterMap, 0, 0)).toBe(true);
  expect(waterMap.get(waterKey(0, 0)).level).toBe(1);
  expect(removeWaterDrop(waterMap, 0, 0)).toBe(true);
  expect(waterMap.has(waterKey(0, 0))).toBe(false);
});

test('fountains add water and drains remove water', () => {
  const voxelMap = createVoxelMap([
    { x: 0, y: 0, z: 0, type: 'grass' },
    { x: 1, y: 0, z: 0, type: 'grass' },
  ]);
  const waterMap = createWaterMap();

  expect(applyWaterEffects(waterMap, voxelMap, [
    { x: 0, z: 0, type: 'fountain' },
    { x: 1, z: 0, type: 'drain' },
  ])).toBe(true);
  expect(waterMap.get(waterKey(0, 0)).level).toBeCloseTo(WATER_SOURCE_AMOUNT);

  addWaterDrop(waterMap, voxelMap, 1, 0);
  expect(applyWaterEffects(waterMap, voxelMap, [
    { x: 1, z: 0, type: 'drain' },
  ])).toBe(true);
  expect(waterMap.get(waterKey(1, 0)).level).toBeLessThan(1);
});

test('flows water from higher terrain to lower neighboring terrain', () => {
  const voxelMap = createVoxelMap([
    { x: 0, y: 0, z: 0, type: 'grass' },
    { x: 0, y: 1, z: 0, type: 'grass' },
    { x: 1, y: 0, z: 0, type: 'grass' },
  ]);
  const waterMap = createWaterMap();

  addWaterDrop(waterMap, voxelMap, 0, 0);

  expect(flowWater(waterMap, voxelMap)).toBe(true);
  expect(waterMap.get(waterKey(0, 0)).level).toBeCloseTo(1 - WATER_FLOW_AMOUNT);
  expect(waterMap.get(waterKey(1, 0))).toMatchObject({
    x: 1,
    y: 1,
    z: 0,
  });
  expect(waterMap.get(waterKey(1, 0)).level).toBeCloseTo(WATER_FLOW_AMOUNT);
});

test('flows one downhill step by default', () => {
  const voxelMap = createVoxelMap([
    { x: 0, y: 0, z: 0, type: 'grass' },
    { x: 0, y: 1, z: 0, type: 'grass' },
    { x: 0, y: 2, z: 0, type: 'grass' },
    { x: 1, y: 0, z: 0, type: 'grass' },
    { x: 1, y: 1, z: 0, type: 'grass' },
    { x: 2, y: 0, z: 0, type: 'grass' },
  ]);
  const waterMap = createWaterMap();

  addWaterDrop(waterMap, voxelMap, 0, 0);
  addWaterDrop(waterMap, voxelMap, 0, 0);

  expect(flowWater(waterMap, voxelMap)).toBe(true);
  expect(waterMap.has(waterKey(2, 0))).toBe(false);
  expect(waterMap.get(waterKey(1, 0))).toMatchObject({
    x: 1,
    y: 2,
    z: 0,
  });
  expect(waterMap.get(waterKey(0, 0)).level).toBeCloseTo(2 - WATER_FLOW_AMOUNT);
  expect(waterMap.get(waterKey(1, 0)).level).toBeCloseTo(WATER_FLOW_AMOUNT);

  expect(flowWater(waterMap, voxelMap)).toBe(true);
  expect(waterMap.get(waterKey(0, 0)).level).toBeCloseTo(2 - WATER_FLOW_AMOUNT * 2);
  expect(waterMap.get(waterKey(1, 0)).level).toBeCloseTo(WATER_FLOW_AMOUNT);
  expect(waterMap.get(waterKey(2, 0))).toMatchObject({
    x: 2,
    y: 1,
    z: 0,
  });
  expect(waterMap.get(waterKey(2, 0)).level).toBeCloseTo(WATER_FLOW_AMOUNT);
});

test('allows downhill flow to drain the last water unit from a voxel', () => {
  const voxelMap = createVoxelMap([
    { x: 0, y: 0, z: 0, type: 'grass' },
    { x: 0, y: 1, z: 0, type: 'grass' },
    { x: 1, y: 0, z: 0, type: 'grass' },
  ]);
  const waterMap = createWaterMap();

  addWaterDrop(waterMap, voxelMap, 0, 0);

  for (let step = 0; step < 25; step += 1) {
    flowWater(waterMap, voxelMap);
  }

  expect(waterMap.has(waterKey(0, 0))).toBe(false);
  expect(waterMap.get(waterKey(1, 0)).level).toBeCloseTo(1);
});

test('flows downhill through every qualified neighboring face', () => {
  const voxelMap = createVoxelMap([
    { x: 0, y: 0, z: 0, type: 'grass' },
    { x: 0, y: 1, z: 0, type: 'grass' },
    { x: 1, y: 0, z: 0, type: 'grass' },
    { x: -1, y: 0, z: 0, type: 'grass' },
    { x: 0, y: 0, z: 1, type: 'grass' },
    { x: 0, y: 0, z: -1, type: 'grass' },
  ]);
  const waterMap = createWaterMap();

  addWaterDrop(waterMap, voxelMap, 0, 0);
  addWaterDrop(waterMap, voxelMap, 0, 0);

  expect(flowWater(waterMap, voxelMap)).toBe(true);
  expect(waterMap.get(waterKey(0, 0)).level).toBeCloseTo(2 - WATER_FLOW_AMOUNT);

  [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].forEach(([x, z]) => {
    expect(waterMap.get(waterKey(x, z))).toMatchObject({ x, y: 1, z });
    expect(waterMap.get(waterKey(x, z)).level).toBeCloseTo(WATER_FLOW_AMOUNT / 4);
  });
});

test('keeps the total water amount constant while spreading', () => {
  const voxelMap = createVoxelMap([
    { x: 0, y: 0, z: 0, type: 'grass' },
    { x: 1, y: 0, z: 0, type: 'grass' },
    { x: -1, y: 0, z: 0, type: 'grass' },
    { x: 0, y: 0, z: 1, type: 'grass' },
    { x: 0, y: 0, z: -1, type: 'grass' },
  ]);
  const waterMap = createWaterMap();

  addWaterDrop(waterMap, voxelMap, 0, 0);
  const beforeTotal = getTotalWater(waterMap);

  flowWater(waterMap, voxelMap);
  flowWater(waterMap, voxelMap);
  flowWater(waterMap, voxelMap);

  expect(getTotalWater(waterMap)).toBeCloseTo(beforeTotal);
});

test('does not lose water when several sources flow into a nearly full cell', () => {
  const voxelMap = createVoxelMap([
    { x: -1, y: 0, z: 0, type: 'grass' },
    { x: -1, y: 1, z: 0, type: 'grass' },
    { x: 0, y: 0, z: 0, type: 'grass' },
    { x: 1, y: 0, z: 0, type: 'grass' },
    { x: 1, y: 1, z: 0, type: 'grass' },
  ]);
  const waterMap = createWaterMap();

  waterMap.set(waterKey(-1, 0), { key: waterKey(-1, 0), x: -1, y: 2, z: 0, level: 1.1 });
  waterMap.set(waterKey(0, 0), { key: waterKey(0, 0), x: 0, y: 1, z: 0, level: 3.95 });
  waterMap.set(waterKey(1, 0), { key: waterKey(1, 0), x: 1, y: 2, z: 0, level: 1.1 });
  const beforeTotal = getTotalWater(waterMap);

  expect(flowWater(waterMap, voxelMap)).toBe(true);
  expect(getTotalWater(waterMap)).toBeCloseTo(beforeTotal);
  expect(waterMap.get(waterKey(0, 0)).level).toBeCloseTo(4);
});

test('does not flow the last water unit across same-height terrain', () => {
  const voxelMap = createVoxelMap([
    { x: 0, y: 0, z: 0, type: 'grass' },
    { x: 1, y: 0, z: 0, type: 'grass' },
  ]);
  const waterMap = createWaterMap();

  addWaterDrop(waterMap, voxelMap, 0, 0);

  expect(flowWater(waterMap, voxelMap)).toBe(false);
  expect(waterMap.get(waterKey(0, 0)).level).toBe(1);
  expect(waterMap.has(waterKey(1, 0))).toBe(false);
});

test('keeps flowing same-height water until neighboring levels equalize', () => {
  const voxelMap = createVoxelMap([
    { x: 0, y: 0, z: 0, type: 'grass' },
    { x: 1, y: 0, z: 0, type: 'grass' },
  ]);
  const waterMap = createWaterMap();

  addWaterDrop(waterMap, voxelMap, 0, 0);
  addWaterDrop(waterMap, voxelMap, 0, 0);

  for (let step = 0; step < 25; step += 1) {
    flowWater(waterMap, voxelMap);
  }

  expect(waterMap.get(waterKey(0, 0)).level).toBeCloseTo(1);
  expect(waterMap.get(waterKey(1, 0)).level).toBeCloseTo(1);
  expect(flowWater(waterMap, voxelMap)).toBe(false);
});

test('does not flow between same-height terrain with equal water levels', () => {
  const voxelMap = createVoxelMap([
    { x: 0, y: 0, z: 0, type: 'grass' },
    { x: 1, y: 0, z: 0, type: 'grass' },
  ]);
  const waterMap = createWaterMap();

  addWaterDrop(waterMap, voxelMap, 0, 0);
  addWaterDrop(waterMap, voxelMap, 1, 0);

  expect(flowWater(waterMap, voxelMap)).toBe(false);
  expect(waterMap.get(waterKey(0, 0)).level).toBe(1);
  expect(waterMap.get(waterKey(1, 0)).level).toBe(1);
});

test('updates water height when terrain changes underneath it', () => {
  const voxelMap = createVoxelMap([{ x: 0, y: 0, z: 0, type: 'grass' }]);
  const waterMap = createWaterMap();

  addWaterDrop(waterMap, voxelMap, 0, 0);
  voxelMap.set(voxelKey(0, 1, 0), { x: 0, y: 1, z: 0, type: 'stone' });

  expect(validateWater(waterMap, voxelMap)).toBe(true);
  expect(waterMap.get(waterKey(0, 0)).y).toBe(2);
});

test('builds disposable water geometry', () => {
  const waterMesh = createWaterMesh([{ x: 0, y: 1, z: 0, level: 2 }]);

  expect(waterMesh.children).toHaveLength(1);
  expect(waterMesh.children[0].material.transparent).toBe(true);

  disposeWaterMesh(waterMesh);
});

test('adds a thin waterfall sheet between adjacent water cells at different heights', () => {
  const waterMesh = createWaterMesh([
    { x: 0, y: 2, z: 0, level: 0.88 },
    { x: 1, y: 1, z: 0, level: 0.12 },
  ]);
  const waterfallSheet = waterMesh.children.find((child) => child.name === 'waterfall-sheet');

  expect(waterMesh.children).toHaveLength(3);
  expect(waterfallSheet).toBeDefined();
  expect(waterfallSheet.scale.x).toBeLessThan(waterfallSheet.scale.z);
  expect(waterfallSheet.scale.y).toBeGreaterThan(0);

  disposeWaterMesh(waterMesh);
});

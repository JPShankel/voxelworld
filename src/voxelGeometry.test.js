import {
  createVoxelMesh,
  createVoxelTerrain,
  disposeVoxelMesh,
  VOXEL_SIZE,
} from './voxelGeometry';

test('creates terrain voxel data', () => {
  const terrain = createVoxelTerrain(2);

  expect(terrain.length).toBeGreaterThan(0);
  expect(terrain.some((voxel) => voxel.type === 'grass')).toBe(true);
});

test('builds exposed-face voxel geometry', () => {
  const voxelMesh = createVoxelMesh([
    { x: 0, y: 0, z: 0, type: 'grass' },
    { x: 1, y: 0, z: 0, type: 'grass' },
  ]);
  const mesh = voxelMesh.children[0];

  expect(mesh.geometry.attributes.position.count).toBe(40);
  expect(mesh.geometry.index.count).toBe(60);
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

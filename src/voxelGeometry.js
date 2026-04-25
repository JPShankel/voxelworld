import * as THREE from 'three';

export const VOXEL_SIZE = 10;

export const VOXEL_PALETTE = {
  grass: 0x66a84f,
  dirt: 0x8a5a35,
  stone: 0x8b9294,
};

const FACE_DEFINITIONS = [
  {
    normal: [1, 0, 0],
    corners: [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [1, 0, 1],
    ],
  },
  {
    normal: [-1, 0, 0],
    corners: [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
      [0, 0, 0],
    ],
  },
  {
    normal: [0, 1, 0],
    corners: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    normal: [0, -1, 0],
    corners: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    normal: [0, 0, 1],
    corners: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
  {
    normal: [0, 0, -1],
    corners: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  },
];

const voxelKey = (x, y, z) => `${x},${y},${z}`;

export function createVoxelTerrain(radius = 16) {
  const voxels = [];

  for (let x = -radius; x <= radius; x += 1) {
    for (let z = -radius; z <= radius; z += 1) {
      const distance = Math.sqrt(x * x + z * z);
      const ripple = Math.sin(x * 0.85) * 0.4 + Math.cos(z * 0.7) * 0.35;
      const height = Math.max(1, Math.floor(radius * 0.45 - distance * 0.24 + ripple));

      for (let y = 0; y < height; y += 1) {
        let type = 'stone';

        if (y === height - 1) {
          type = 'grass';
        } else if (y >= height - 3) {
          type = 'dirt';
        }

        voxels.push({ x, y, z, type });
      }
    }
  }

  return voxels;
}

export function createVoxelMesh(voxels, options = {}) {
  const size = options.voxelSize ?? VOXEL_SIZE;
  const palette = options.palette ?? VOXEL_PALETTE;
  const voxelSet = new Set(voxels.map(({ x, y, z }) => voxelKey(x, y, z)));
  const faceBuffers = new Map();

  const getBuffer = (type) => {
    if (!faceBuffers.has(type)) {
      faceBuffers.set(type, {
        positions: [],
        normals: [],
        indices: [],
        faceLookup: [],
      });
    }

    return faceBuffers.get(type);
  };

  voxels.forEach(({ x, y, z, type = 'stone' }) => {
    FACE_DEFINITIONS.forEach(({ normal, corners }) => {
      const [normalX, normalY, normalZ] = normal;
      const neighborKey = voxelKey(x + normalX, y + normalY, z + normalZ);

      if (voxelSet.has(neighborKey)) {
        return;
      }

      const buffer = getBuffer(type);
      const vertexOffset = buffer.positions.length / 3;

      corners.forEach(([cornerX, cornerY, cornerZ]) => {
        buffer.positions.push((x + cornerX) * size, (y + cornerY) * size, (z + cornerZ) * size);
        buffer.normals.push(normalX, normalY, normalZ);
      });

      buffer.indices.push(
        vertexOffset,
        vertexOffset + 1,
        vertexOffset + 2,
        vertexOffset,
        vertexOffset + 2,
        vertexOffset + 3
      );
      buffer.faceLookup.push(
        { x, y, z, normal: [normalX, normalY, normalZ] },
        { x, y, z, normal: [normalX, normalY, normalZ] }
      );
    });
  });

  const group = new THREE.Group();
  group.name = 'voxel-geometry';

  faceBuffers.forEach((buffer, type) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffer.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(buffer.normals, 3));
    geometry.setIndex(buffer.indices);
    geometry.userData.faceLookup = buffer.faceLookup;
    geometry.computeBoundingSphere();

    const material = new THREE.MeshStandardMaterial({
      color: palette[type] ?? palette.stone,
      roughness: 0.8,
      metalness: 0,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  return group;
}

export function disposeVoxelMesh(voxelMesh) {
  voxelMesh.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.geometry.dispose();
    child.material.dispose();
  });
}

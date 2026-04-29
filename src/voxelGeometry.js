import * as THREE from 'three';

export const VOXEL_SIZE = 10;

export const VOXEL_PALETTE = {
  snow: 0xf4f7fb,
  rock: 0x9a9f9f,
  grass: 0x66a84f,
  sand: 0xd8c07a,
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

function getSurfaceTerrainType(normalizedHeight) {
  if (normalizedHeight < 0.22) {
    return 'sand';
  }

  if (normalizedHeight < 0.66) {
    return 'grass';
  }

  if (normalizedHeight < 0.84) {
    return 'dirt';
  }

  return 'snow';
}

const createRandom = (seed) => {
  if (seed === undefined || seed === null) {
    return Math.random;
  }

  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const getDisplacementGridSize = (sampleSize) => {
  let segmentCount = 1;

  while (segmentCount < sampleSize - 1) {
    segmentCount *= 2;
  }

  return segmentCount + 1;
};

export function createMidpointDisplacementHeightfield(size, options = {}) {
  const gridSize = getDisplacementGridSize(size);
  const lastIndex = gridSize - 1;
  const random = createRandom(options.seed);
  const roughness = options.roughness ?? 0.58;
  const initialRange = options.initialRange ?? 1;
  const heightfield = Array.from({ length: gridSize }, () => Array(gridSize).fill(0));
  let displacement = initialRange;

  heightfield[0][0] = random();
  heightfield[0][lastIndex] = random();
  heightfield[lastIndex][0] = random();
  heightfield[lastIndex][lastIndex] = random();

  for (let stepSize = lastIndex; stepSize > 1; stepSize /= 2) {
    const halfStep = stepSize / 2;

    for (let x = halfStep; x < lastIndex; x += stepSize) {
      for (let z = halfStep; z < lastIndex; z += stepSize) {
        const average = (
          heightfield[x - halfStep][z - halfStep]
          + heightfield[x + halfStep][z - halfStep]
          + heightfield[x - halfStep][z + halfStep]
          + heightfield[x + halfStep][z + halfStep]
        ) / 4;

        heightfield[x][z] = average + (random() * 2 - 1) * displacement;
      }
    }

    for (let x = 0; x <= lastIndex; x += halfStep) {
      const zStart = (x / halfStep) % 2 === 0 ? halfStep : 0;

      for (let z = zStart; z <= lastIndex; z += stepSize) {
        let total = 0;
        let count = 0;

        [
          [x - halfStep, z],
          [x + halfStep, z],
          [x, z - halfStep],
          [x, z + halfStep],
        ].forEach(([neighborX, neighborZ]) => {
          if (
            neighborX >= 0
            && neighborX <= lastIndex
            && neighborZ >= 0
            && neighborZ <= lastIndex
          ) {
            total += heightfield[neighborX][neighborZ];
            count += 1;
          }
        });

        heightfield[x][z] = total / count + (random() * 2 - 1) * displacement;
      }
    }

    displacement *= roughness;
  }

  let minHeight = Infinity;
  let maxHeight = -Infinity;

  heightfield.forEach((row) => {
    row.forEach((height) => {
      minHeight = Math.min(minHeight, height);
      maxHeight = Math.max(maxHeight, height);
    });
  });

  const heightRange = maxHeight - minHeight || 1;
  const offset = Math.floor((gridSize - size) / 2);

  return Array.from({ length: size }, (_, x) => (
    Array.from({ length: size }, (_, z) => (
      (heightfield[x + offset][z + offset] - minHeight) / heightRange
    ))
  ));
}

export function createVoxelTerrain(radius = 16, options = {}) {
  const voxels = [];
  const size = radius * 2 + 1;
  const heightfield = createMidpointDisplacementHeightfield(size, options);
  const minHeight = options.minHeight ?? 1;
  const maxHeight = options.maxHeight ?? Math.max(3, Math.round(radius * 0.72));

  for (let x = -radius; x <= radius; x += 1) {
    for (let z = -radius; z <= radius; z += 1) {
      const normalizedHeight = heightfield[x + radius][z + radius];
      const height = Math.max(
        minHeight,
        Math.round(minHeight + normalizedHeight * (maxHeight - minHeight))
      );

      for (let y = 0; y < height; y += 1) {
        let type = 'stone';

        if (y === height - 1) {
          type = getSurfaceTerrainType(normalizedHeight);
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

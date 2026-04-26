import * as THREE from 'three';
import { VOXEL_SIZE } from './voxelGeometry';

export const MAX_WATER_LEVEL = 4;
export const WATER_COLOR = 0x2f9fe8;
export const WATER_FLOW_AMOUNT = 0.04;
export const WATER_SOURCE_AMOUNT = 0.08;
export const WATER_DRAIN_AMOUNT = 0.12;

const MAX_WATER_HEIGHT = VOXEL_SIZE * 0.72;
const WATER_LEVEL_EPSILON = 0.001;
const WATER_RENDER_LEVEL_EPSILON = 0.02;
const MIN_RETAINED_WATER_LEVEL = 1;
const WATERFALL_WIDTH = VOXEL_SIZE * 0.46;
const WATERFALL_THICKNESS = VOXEL_SIZE * 0.08;

export const waterKey = (x, z) => `${x},${z}`;

const getWaterHeight = (level) => {
  const normalizedLevel = Math.min(MAX_WATER_LEVEL, Math.max(0, level)) / MAX_WATER_LEVEL;

  return MAX_WATER_HEIGHT * normalizedLevel;
};

export function createWaterMap() {
  return new Map();
}

export function getColumnSurface(voxelMap, x, z) {
  let highestY = -1;

  voxelMap.forEach((voxel) => {
    if (voxel.x === x && voxel.z === z && voxel.y > highestY) {
      highestY = voxel.y;
    }
  });

  return highestY < 0 ? null : { x, y: highestY + 1, z };
}

export function addWaterDrop(waterMap, voxelMap, x, z) {
  return addWaterAmount(waterMap, voxelMap, x, z, 1);
}

export function addWaterAmount(waterMap, voxelMap, x, z, amount) {
  const surface = getColumnSurface(voxelMap, x, z);

  if (!surface || amount <= 0) {
    return false;
  }

  const key = waterKey(x, z);
  const existingCell = waterMap.get(key);
  const currentLevel = existingCell?.level ?? 0;

  waterMap.set(key, {
    key,
    x,
    y: surface.y,
    z,
    level: Math.min(MAX_WATER_LEVEL, currentLevel + amount),
  });

  return true;
}

export function removeWaterDrop(waterMap, x, z) {
  return removeWaterAmount(waterMap, x, z, 1);
}

export function removeWaterAmount(waterMap, x, z, amount) {
  const key = waterKey(x, z);
  const cell = waterMap.get(key);

  if (!cell || amount <= 0) {
    return false;
  }

  if (cell.level <= amount) {
    waterMap.delete(key);
  } else {
    waterMap.set(key, { ...cell, level: cell.level - amount });
  }

  return true;
}

export function applyWaterEffects(waterMap, voxelMap, effects) {
  let changed = false;

  effects.forEach((effect) => {
    if (effect.type === 'fountain') {
      changed = addWaterAmount(waterMap, voxelMap, effect.x, effect.z, WATER_SOURCE_AMOUNT) || changed;
      return;
    }

    if (effect.type === 'drain') {
      changed = removeWaterAmount(waterMap, effect.x, effect.z, WATER_DRAIN_AMOUNT) || changed;
    }
  });

  return changed;
}

export function validateWater(waterMap, voxelMap) {
  let changed = false;

  waterMap.forEach((cell, key) => {
    const surface = getColumnSurface(voxelMap, cell.x, cell.z);

    if (!surface) {
      waterMap.delete(key);
      changed = true;
      return;
    }

    if (surface.y !== cell.y) {
      waterMap.set(key, { ...cell, y: surface.y });
      changed = true;
    }
  });

  return changed;
}

export function flowWater(waterMap, voxelMap, maxSteps = 1) {
  let changed = false;
  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  for (let step = 0; step < maxSteps; step += 1) {
    let movedThisStep = false;
    const waterSnapshot = new Map([...waterMap.entries()].map(([key, cell]) => [key, { ...cell }]));
    const waterDeltas = new Map();
    const cells = [...waterSnapshot.values()]
      .filter((cell) => cell.level > 0)
      .sort((a, b) => b.y - a.y);

    for (const cell of cells) {
      const sourceKey = waterKey(cell.x, cell.z);
      const source = waterSnapshot.get(sourceKey);

      if (!source || source.level <= 0) {
        continue;
      }

      const lowerNeighbors = directions
        .map(([offsetX, offsetZ]) => {
          const surface = getColumnSurface(voxelMap, source.x + offsetX, source.z + offsetZ);

          if (!surface) {
            return null;
          }

          const key = waterKey(surface.x, surface.z);
          const neighborCell = waterSnapshot.get(key);
          const neighborLevel = neighborCell?.level ?? 0;
          const plannedNeighborLevel = neighborLevel + Math.max(0, waterDeltas.get(key) ?? 0);

          if (plannedNeighborLevel >= MAX_WATER_LEVEL) {
            return null;
          }

          if (surface.y < source.y) {
            return {
              ...surface,
              key,
              level: neighborLevel,
              plannedLevel: plannedNeighborLevel,
              maxTransfer: MAX_WATER_LEVEL - plannedNeighborLevel,
            };
          }

          return null;
        })
        .filter(Boolean);
      const sameHeightNeighbors = lowerNeighbors.length > 0
        ? []
        : directions
          .map(([offsetX, offsetZ]) => {
            const surface = getColumnSurface(voxelMap, source.x + offsetX, source.z + offsetZ);

            if (!surface || surface.y !== source.y) {
              return null;
            }

            const key = waterKey(surface.x, surface.z);
            const neighborCell = waterSnapshot.get(key);
            const neighborLevel = neighborCell?.level ?? 0;
            const plannedNeighborLevel = neighborLevel + Math.max(0, waterDeltas.get(key) ?? 0);

            if (
              plannedNeighborLevel >= MAX_WATER_LEVEL
              || neighborLevel >= source.level - WATER_LEVEL_EPSILON
            ) {
              return null;
            }

            return {
              ...surface,
              key,
              level: neighborLevel,
              plannedLevel: plannedNeighborLevel,
              maxTransfer: Math.max(0, (source.level - neighborLevel) / 2),
            };
          })
          .filter(Boolean);
      const qualifiedNeighbors = lowerNeighbors.length > 0 ? lowerNeighbors : sameHeightNeighbors;
      const retainedSourceLevel = lowerNeighbors.length > 0 ? 0 : MIN_RETAINED_WATER_LEVEL;

      if (qualifiedNeighbors.length === 0) {
        continue;
      }

      if (source.level <= retainedSourceLevel + WATER_LEVEL_EPSILON) {
        continue;
      }

      let remainingSourceLevel = source.level;
      const transferBudget = Math.min(
        WATER_FLOW_AMOUNT,
        source.level - retainedSourceLevel
      );
      const transferPerNeighbor = transferBudget / qualifiedNeighbors.length;

      for (const neighborSurface of qualifiedNeighbors) {
        if (remainingSourceLevel <= retainedSourceLevel + WATER_LEVEL_EPSILON) {
          break;
        }

        const transferAmount = Math.min(
          transferPerNeighbor,
          remainingSourceLevel - retainedSourceLevel,
          MAX_WATER_LEVEL - neighborSurface.plannedLevel,
          neighborSurface.maxTransfer
        );

        if (transferAmount <= WATER_LEVEL_EPSILON) {
          continue;
        }

        remainingSourceLevel -= transferAmount;
        waterDeltas.set(sourceKey, (waterDeltas.get(sourceKey) ?? 0) - transferAmount);
        waterDeltas.set(neighborSurface.key, (waterDeltas.get(neighborSurface.key) ?? 0) + transferAmount);
        movedThisStep = true;
        changed = true;
      }
    }

    waterDeltas.forEach((delta, key) => {
      if (Math.abs(delta) <= WATER_LEVEL_EPSILON) {
        return;
      }

      const existingCell = waterSnapshot.get(key);
      const nextLevel = (existingCell?.level ?? 0) + delta;

      if (nextLevel <= WATER_LEVEL_EPSILON) {
        waterMap.delete(key);
        return;
      }

      if (existingCell) {
        waterMap.set(key, {
          ...existingCell,
          level: Math.min(MAX_WATER_LEVEL, nextLevel),
        });
        return;
      }

      const [x, z] = key.split(',').map(Number);
      const surface = getColumnSurface(voxelMap, x, z);

      if (surface) {
        waterMap.set(key, {
          key,
          x,
          y: surface.y,
          z,
          level: Math.min(MAX_WATER_LEVEL, nextLevel),
        });
      }
    });

    if (!movedThisStep) {
      break;
    }
  }

  return changed;
}

export function createWaterMesh(waterCells, options = {}) {
  const size = options.voxelSize ?? VOXEL_SIZE;
  const visibleWaterCells = waterCells.filter((cell) => cell.level > WATER_RENDER_LEVEL_EPSILON);
  const poolGeometry = new THREE.BoxGeometry(
    size,
    MAX_WATER_HEIGHT,
    size
  );
  const waterfallGeometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshStandardMaterial({
    color: options.color ?? WATER_COLOR,
    transparent: true,
    opacity: 0.58,
    roughness: 0.22,
    metalness: 0,
    depthWrite: false,
  });
  const group = new THREE.Group();
  group.name = 'water-geometry';
  const cellLookup = new Map(visibleWaterCells.map((cell) => [waterKey(cell.x, cell.z), cell]));

  visibleWaterCells.forEach(({ x, y, z, level }) => {
    const waterHeight = getWaterHeight(level);
    const mesh = new THREE.Mesh(poolGeometry, material);

    mesh.position.set(
      (x + 0.5) * size,
      y * size + waterHeight / 2,
      (z + 0.5) * size
    );
    mesh.scale.y = waterHeight / MAX_WATER_HEIGHT;
    mesh.receiveShadow = true;
    group.add(mesh);
  });

  visibleWaterCells.forEach((source) => {
    const neighbors = [
      { offsetX: 1, offsetZ: 0, rotationY: 0 },
      { offsetX: -1, offsetZ: 0, rotationY: 0 },
      { offsetX: 0, offsetZ: 1, rotationY: Math.PI / 2 },
      { offsetX: 0, offsetZ: -1, rotationY: Math.PI / 2 },
    ];

    neighbors.forEach(({ offsetX, offsetZ, rotationY }) => {
      const neighbor = cellLookup.get(waterKey(source.x + offsetX, source.z + offsetZ));

      if (!neighbor || source.y <= neighbor.y) {
        return;
      }

      const sourceTopY = source.y * size + getWaterHeight(source.level);
      const neighborTopY = neighbor.y * size + getWaterHeight(neighbor.level);
      const spillHeight = sourceTopY - neighborTopY;

      if (spillHeight <= WATERFALL_THICKNESS) {
        return;
      }

      const mesh = new THREE.Mesh(waterfallGeometry, material);
      const boundaryX = offsetX === 0
        ? (source.x + 0.5) * size
        : (source.x + (offsetX > 0 ? 1 : 0)) * size;
      const boundaryZ = offsetZ === 0
        ? (source.z + 0.5) * size
        : (source.z + (offsetZ > 0 ? 1 : 0)) * size;

      mesh.position.set(boundaryX, neighborTopY + spillHeight / 2, boundaryZ);
      mesh.rotation.y = rotationY;
      mesh.scale.set(WATERFALL_THICKNESS, spillHeight, WATERFALL_WIDTH);
      mesh.name = 'waterfall-sheet';
      group.add(mesh);
    });
  });

  return group;
}

export function disposeWaterMesh(waterMesh) {
  const geometries = new Set();
  const materials = new Set();

  waterMesh.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    geometries.add(child.geometry);
    materials.add(child.material);
  });

  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
}

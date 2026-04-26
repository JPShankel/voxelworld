import * as THREE from 'three';
import { VOXEL_SIZE } from './voxelGeometry';

export const FISH_WATER_LEVEL_THRESHOLD = 2;

const MAX_WATER_HEIGHT = VOXEL_SIZE * 0.72;
const SWIM_RADIUS = VOXEL_SIZE * 0.23;
const SWIM_SPEED = 1.15;
const fishMaterial = new THREE.MeshStandardMaterial({
  color: 0xf2b84b,
  roughness: 0.5,
  metalness: 0,
});
const finMaterial = new THREE.MeshStandardMaterial({
  color: 0xe66a3a,
  roughness: 0.55,
  metalness: 0,
});

function createFishMesh(cell) {
  const fish = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.35, 12, 8), fishMaterial);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.4, 3), finMaterial);
  const waterHeight = MAX_WATER_HEIGHT * Math.min(1, cell.level / 4);
  const swimHeight = Math.max(0.8, waterHeight * 0.48);

  body.scale.set(1.4, 0.55, 0.7);
  body.castShadow = true;
  fish.add(body);

  tail.position.set(1.75, 0, 0);
  tail.rotation.z = -Math.PI / 2;
  tail.scale.set(0.85, 1, 1);
  tail.castShadow = true;
  fish.add(tail);

  const basePosition = new THREE.Vector3(
    (cell.x + 0.5) * VOXEL_SIZE,
    cell.y * VOXEL_SIZE + swimHeight,
    (cell.z + 0.5) * VOXEL_SIZE
  );
  const swimPhase = (cell.x * 1.73 + cell.z * 2.41) % (Math.PI * 2);

  fish.position.copy(basePosition);
  fish.rotation.y = swimPhase;
  fish.userData.waterKey = cell.key;
  fish.userData.basePosition = basePosition;
  fish.userData.swimPhase = swimPhase;

  return fish;
}

export function createFishGroup(waterCells, hiddenFishKeys = new Set()) {
  const group = new THREE.Group();
  group.name = 'fish';

  waterCells
    .filter((cell) => cell.level >= FISH_WATER_LEVEL_THRESHOLD && !hiddenFishKeys.has(cell.key))
    .forEach((cell) => {
      group.add(createFishMesh(cell));
    });

  return group;
}

export function updateFishGroup(group, elapsedSeconds) {
  group.children.forEach((fish) => {
    const basePosition = fish.userData.basePosition;
    const swimPhase = fish.userData.swimPhase ?? 0;

    if (!basePosition) {
      return;
    }

    const phase = swimPhase + elapsedSeconds * SWIM_SPEED;
    const nextX = basePosition.x + Math.cos(phase) * SWIM_RADIUS;
    const nextZ = basePosition.z + Math.sin(phase * 0.84) * SWIM_RADIUS;
    const bob = Math.sin(phase * 1.8) * 0.18;
    const tangentX = -Math.sin(phase) * SWIM_RADIUS;
    const tangentZ = Math.cos(phase * 0.84) * 0.84 * SWIM_RADIUS;

    fish.position.set(nextX, basePosition.y + bob, nextZ);
    fish.rotation.y = Math.atan2(tangentX, tangentZ);
  });
}

export function disposeFishGroup(group) {
  group.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.geometry.dispose();
  });
}

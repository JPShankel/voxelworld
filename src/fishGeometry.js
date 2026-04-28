import * as THREE from 'three';
import { VOXEL_SIZE } from './voxelGeometry';

export const FISH_WATER_LEVEL_THRESHOLD = 2;

const MAX_WATER_HEIGHT = VOXEL_SIZE * 0.72;
const FISH_SWIM_WATER_LEVEL_THRESHOLD = 0.18;
const FISH_SPEED = VOXEL_SIZE * 0.72;
const FISH_TURN_RATE = 5.5;
const TARGET_REACHED_DISTANCE = VOXEL_SIZE * 0.18;
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

const waterCellKey = (cell) => cell.key ?? `${cell.x},${cell.z}`;

function getSwimHeight(cell) {
  const waterHeight = MAX_WATER_HEIGHT * Math.min(1, cell.level / 4);
  return Math.max(0.8, waterHeight * 0.48);
}

function cellWorldPosition(cell) {
  return new THREE.Vector3(
    (cell.x + 0.5) * VOXEL_SIZE,
    cell.y * VOXEL_SIZE + getSwimHeight(cell),
    (cell.z + 0.5) * VOXEL_SIZE
  );
}

function yawForVelocity(velocity) {
  return Math.atan2(velocity.z, -velocity.x);
}

function createFishMesh() {
  const fish = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.35, 12, 8), fishMaterial);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.4, 3), finMaterial);

  body.scale.set(1.4, 0.55, 0.7);
  body.castShadow = true;
  fish.add(body);

  tail.position.set(1.75, 0, 0);
  tail.rotation.z = -Math.PI / 2;
  tail.scale.set(0.85, 1, 1);
  tail.castShadow = true;
  fish.add(tail);

  return fish;
}

function createFish(cell, index) {
  const position = cellWorldPosition(cell);
  const angle = (cell.x * 1.73 + cell.z * 2.41 + index) % (Math.PI * 2);
  const mesh = createFishMesh();
  mesh.position.copy(position);
  mesh.rotation.y = angle;
  mesh.userData.waterKey = waterCellKey(cell);

  return {
    key: waterCellKey(cell),
    cell,
    targetCell: null,
    position,
    velocity: new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(FISH_SPEED * 0.18),
    swimPhase: angle,
    mesh,
  };
}

function eligibleWaterCells(waterCells, hiddenFishKeys) {
  return waterCells.filter((cell) => (
    cell.level >= FISH_WATER_LEVEL_THRESHOLD
    && !hiddenFishKeys.has(waterCellKey(cell))
  ));
}

function swimmableWaterCells(waterCells) {
  return waterCells.filter((cell) => cell.level >= FISH_SWIM_WATER_LEVEL_THRESHOLD);
}

function chooseNextCell(fish, waterMap) {
  const current = fish.cell;
  const candidates = [
    { x: current.x + 1, z: current.z },
    { x: current.x - 1, z: current.z },
    { x: current.x, z: current.z + 1 },
    { x: current.x, z: current.z - 1 },
    { x: current.x, z: current.z },
  ]
    .map(({ x, z }) => waterMap.get(`${x},${z}`))
    .filter(Boolean);

  if (candidates.length === 0) {
    return current;
  }

  const onwardCandidates = candidates.filter((cell) => waterCellKey(cell) !== waterCellKey(current));
  const pool = onwardCandidates.length === 1 || (onwardCandidates.length > 0 && Math.random() < 0.72)
    ? onwardCandidates
    : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function createFishGroup(waterCells, hiddenFishKeys = new Set()) {
  const group = new THREE.Group();
  group.name = 'fish';
  group.userData.fish = [];

  syncFishShoal(group.userData.fish, group, waterCells, hiddenFishKeys);

  return group;
}

export function syncFishShoal(fishShoal, fishGroup, waterCells, hiddenFishKeys = new Set()) {
  const eligibleCells = eligibleWaterCells(waterCells, hiddenFishKeys);
  const eligibleMap = new Map(eligibleCells.map((cell) => [waterCellKey(cell), cell]));
  const swimmableMap = new Map(swimmableWaterCells(waterCells).map((cell) => [waterCellKey(cell), cell]));

  for (let index = fishShoal.length - 1; index >= 0; index -= 1) {
    const fish = fishShoal[index];
    const currentCell = swimmableMap.get(waterCellKey(fish.cell));
    const sourceCell = eligibleMap.get(fish.key);

    if (hiddenFishKeys.has(fish.key) || (!currentCell && !sourceCell)) {
      fishGroup.remove(fish.mesh);
      fishShoal.splice(index, 1);
      continue;
    }

    fish.cell = currentCell ?? sourceCell;
    fish.targetCell = fish.targetCell && swimmableMap.get(waterCellKey(fish.targetCell))
      ? swimmableMap.get(waterCellKey(fish.targetCell))
      : fish.cell;
  }

  eligibleCells.forEach((cell, index) => {
    const key = waterCellKey(cell);

    if (fishShoal.some((fish) => fish.key === key)) {
      return;
    }

    const fish = createFish(cell, index);
    fishShoal.push(fish);
    fishGroup.add(fish.mesh);
  });

  fishGroup.userData.fish = fishShoal;
}

export function updateFishShoal(fishShoal, waterCells, deltaSeconds) {
  const waterMap = new Map(
    swimmableWaterCells(waterCells).map((cell) => [waterCellKey(cell), cell])
  );
  const deltaScale = Math.min(deltaSeconds, 0.05);

  fishShoal.forEach((fish, index) => {
    const currentCell = waterMap.get(waterCellKey(fish.cell));

    if (!currentCell) {
      return;
    }

    fish.cell = currentCell;

    if (!fish.targetCell || !waterMap.has(waterCellKey(fish.targetCell))) {
      fish.targetCell = chooseNextCell(fish, waterMap);
    }

    const targetPosition = cellWorldPosition(fish.targetCell);
    const toTarget = targetPosition.clone().sub(fish.position);

    if (toTarget.length() < TARGET_REACHED_DISTANCE) {
      fish.cell = fish.targetCell;
      fish.targetCell = chooseNextCell(fish, waterMap);
    }

    const desiredVelocity = targetPosition.sub(fish.position);
    if (desiredVelocity.length() > 0.001) {
      desiredVelocity.setLength(FISH_SPEED);
      fish.velocity.lerp(desiredVelocity, Math.min(deltaSeconds * FISH_TURN_RATE, 1));
    }

    fish.position.addScaledVector(fish.velocity, deltaScale);
    fish.swimPhase += deltaSeconds * (5.8 + index * 0.13);

    const swimWobble = Math.sin(fish.swimPhase) * 0.06;
    const bob = Math.sin(fish.swimPhase * 0.72) * 0.14;
    fish.mesh.position.copy(fish.position);
    fish.mesh.position.y += bob;

    if (fish.velocity.length() > 0.001) {
      fish.mesh.rotation.y = yawForVelocity(fish.velocity) + swimWobble;
    }
    fish.mesh.children[1].rotation.y = Math.sin(fish.swimPhase * 1.8) * 0.45;
    fish.mesh.userData.waterKey = fish.key;
  });
}

export function updateFishGroup(group, elapsedSecondsOrDeltaSeconds, waterCells = null) {
  const fishShoal = group.userData.fish ?? group.children.map((mesh) => ({
    key: mesh.userData.waterKey,
    cell: null,
    targetCell: null,
    position: mesh.position.clone(),
    velocity: new THREE.Vector3(),
    swimPhase: mesh.userData.swimPhase ?? 0,
    mesh,
  }));

  if (!waterCells) {
    const cells = group.children.map((mesh) => ({
      key: mesh.userData.waterKey,
      x: Math.floor(mesh.position.x / VOXEL_SIZE),
      y: Math.floor(mesh.position.y / VOXEL_SIZE),
      z: Math.floor(mesh.position.z / VOXEL_SIZE),
      level: FISH_WATER_LEVEL_THRESHOLD,
    }));
    updateFishShoal(fishShoal, cells, elapsedSecondsOrDeltaSeconds);
    return;
  }

  updateFishShoal(fishShoal, waterCells, elapsedSecondsOrDeltaSeconds);
}

export function disposeFishGroup(group) {
  group.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.geometry.dispose();
  });
}

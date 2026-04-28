import * as THREE from 'three';
import { VOXEL_SIZE } from './voxelGeometry';

export const RABBITS_PER_HUTCH = 3;
export const RABBIT_DRINK_AMOUNT = 0.08;

const MAX_TREE_FRUIT = 6;
const getFruitCount = (tree) => {
  const fallbackCount = (tree?.fruitLevel ?? 1) >= 1 ? MAX_TREE_FRUIT : 0;
  return Math.max(0, Math.min(MAX_TREE_FRUIT, Math.floor(tree?.fruitCount ?? fallbackCount)));
};
const treeHasFruit = (tree) => getFruitCount(tree) > 0;

const rabbitMaterial = new THREE.MeshStandardMaterial({
  color: 0xf2f0e8,
  roughness: 0.78,
});

const earMaterial = new THREE.MeshStandardMaterial({
  color: 0xf7c9d0,
  roughness: 0.82,
});

const rabbitBodyGeometry = new THREE.BoxGeometry(3.4, 2.1, 4.4);
const rabbitHeadGeometry = new THREE.BoxGeometry(2.2, 1.8, 2);
const rabbitEarGeometry = new THREE.BoxGeometry(0.55, 2.1, 0.45);

const objectPosition = (object) => new THREE.Vector3(
  (object.x + 0.5) * VOXEL_SIZE,
  object.y * VOXEL_SIZE,
  (object.z + 0.5) * VOXEL_SIZE
);

function makePart(geometry, material, position) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createRabbitMesh() {
  const group = new THREE.Group();
  group.add(makePart(rabbitBodyGeometry, rabbitMaterial, [0, 1.2, 0]));
  group.add(makePart(rabbitHeadGeometry, rabbitMaterial, [0, 2, -2.6]));
  group.add(makePart(rabbitEarGeometry, earMaterial, [-0.55, 3.6, -2.8]));
  group.add(makePart(rabbitEarGeometry, earMaterial, [0.55, 3.6, -2.8]));
  return group;
}

function createRabbit(hutch, index, getSurfaceCell) {
  const cell = getSurfaceCell(hutch.x, hutch.z) ?? { x: hutch.x, y: hutch.y - 1, z: hutch.z };
  const position = objectPosition({ x: cell.x, y: cell.y + 1, z: cell.z });
  const mesh = createRabbitMesh();
  mesh.position.copy(position);

  return {
    key: `${hutch.key}:${index}`,
    hutchKey: hutch.key,
    cell,
    targetTreeKey: null,
    eatingTimer: 0,
    moveTimer: index * 0.22,
    hopPhase: index,
    position,
    facingYaw: 0,
    mesh,
  };
}

function chooseTree(rabbit, trees) {
  const fruitingTrees = trees.filter(treeHasFruit);

  if (fruitingTrees.length === 0) {
    rabbit.targetTreeKey = null;
    return null;
  }

  const sortedTrees = [...fruitingTrees].sort((a, b) => {
    const distanceA = Math.abs(a.x - rabbit.cell.x) + Math.abs(a.z - rabbit.cell.z);
    const distanceB = Math.abs(b.x - rabbit.cell.x) + Math.abs(b.z - rabbit.cell.z);
    return distanceA - distanceB;
  });
  const choiceIndex = Math.min(sortedTrees.length - 1, Math.floor(Math.random() * Math.min(sortedTrees.length, 3)));
  const tree = sortedTrees[choiceIndex];
  rabbit.targetTreeKey = tree.key;
  return tree;
}

function chooseNextCell(rabbit, targetTree, getSurfaceCell) {
  const current = rabbit.cell;
  const candidates = [
    { x: current.x + 1, z: current.z },
    { x: current.x - 1, z: current.z },
    { x: current.x, z: current.z + 1 },
    { x: current.x, z: current.z - 1 },
  ]
    .map(({ x, z }) => getSurfaceCell(x, z))
    .filter((cell) => cell && Math.abs(cell.y - current.y) <= 1);

  if (candidates.length === 0) {
    return current;
  }

  if (!targetTree) {
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  candidates.sort((a, b) => {
    const distanceA = Math.abs(a.x - targetTree.x) + Math.abs(a.z - targetTree.z);
    const distanceB = Math.abs(b.x - targetTree.x) + Math.abs(b.z - targetTree.z);
    return distanceA - distanceB;
  });

  return Math.random() < 0.82
    ? candidates[0]
    : candidates[Math.floor(Math.random() * candidates.length)];
}

function cellWorldPosition(cell) {
  return new THREE.Vector3(
    (cell.x + 0.5) * VOXEL_SIZE,
    (cell.y + 1) * VOXEL_SIZE,
    (cell.z + 0.5) * VOXEL_SIZE
  );
}

function yawTowardCell(fromCell, toCell) {
  const deltaX = toCell.x - fromCell.x;
  const deltaZ = toCell.z - fromCell.z;

  if (deltaX === 0 && deltaZ === 0) {
    return null;
  }

  return Math.atan2(-deltaX, -deltaZ);
}

export function syncRabbitWarren(rabbits, rabbitGroup, hutches, getSurfaceCell) {
  const hutchMap = new Map(hutches.map((hutch) => [hutch.key, hutch]));

  for (let index = rabbits.length - 1; index >= 0; index -= 1) {
    if (!hutchMap.has(rabbits[index].hutchKey)) {
      rabbitGroup.remove(rabbits[index].mesh);
      rabbits.splice(index, 1);
    }
  }

  hutchMap.forEach((hutch) => {
    for (let index = 0; index < RABBITS_PER_HUTCH; index += 1) {
      const key = `${hutch.key}:${index}`;

      if (rabbits.some((rabbit) => rabbit.key === key)) {
        return;
      }

      const rabbit = createRabbit(hutch, index, getSurfaceCell);
      rabbits.push(rabbit);
      rabbitGroup.add(rabbit.mesh);
    }
  });
}

export function updateRabbitWarren(
  rabbits,
  trees,
  getSurfaceCell,
  deltaSeconds,
  onRabbitHop = () => {},
  onFruitEaten = () => {}
) {
  const treeMap = new Map(trees.map((tree) => [tree.key, tree]));
  const deltaScale = Math.min(deltaSeconds, 0.05);

  rabbits.forEach((rabbit) => {
    let targetTree = treeMap.get(rabbit.targetTreeKey);

    if (targetTree && !treeHasFruit(targetTree) && rabbit.eatingTimer <= 0) {
      rabbit.targetTreeKey = null;
      targetTree = null;
    }

    if (!targetTree) {
      targetTree = chooseTree(rabbit, trees);
    }

    const atTree = targetTree && rabbit.cell.x === targetTree.x && rabbit.cell.z === targetTree.z;

    if (atTree && rabbit.eatingTimer <= 0) {
      rabbit.eatingTimer = 2.2 + Math.random() * 2.3;
      targetTree.fruitCount = Math.max(0, getFruitCount(targetTree) - 1);
      targetTree.fruitLevel = targetTree.fruitCount;
      onFruitEaten(targetTree, rabbit);
    }

    if (rabbit.eatingTimer > 0) {
      rabbit.eatingTimer -= deltaSeconds;

      if (rabbit.eatingTimer <= 0) {
        rabbit.targetTreeKey = null;
      }
    } else {
      rabbit.moveTimer -= deltaSeconds;

      if (rabbit.moveTimer <= 0) {
        const nextCell = chooseNextCell(rabbit, targetTree, getSurfaceCell);
        const facingYaw = yawTowardCell(rabbit.cell, nextCell);

        if (facingYaw !== null) {
          rabbit.facingYaw = facingYaw;
        }

        rabbit.cell = nextCell;
        onRabbitHop(nextCell, rabbit);
        rabbit.moveTimer = 0.34 + Math.random() * 0.2;
        rabbit.hopPhase = 0;
      }
    }

    const desiredPosition = cellWorldPosition(rabbit.cell);
    rabbit.position.lerp(desiredPosition, Math.min(deltaScale * 9, 1));
    rabbit.hopPhase += deltaSeconds * 9;
    rabbit.mesh.position.copy(rabbit.position);
    rabbit.mesh.position.y += Math.max(0, Math.sin(rabbit.hopPhase) * 1.35);
    rabbit.mesh.rotation.y = rabbit.facingYaw;
  });
}

export function disposeRabbitWarren() {
  rabbitBodyGeometry.dispose();
  rabbitHeadGeometry.dispose();
  rabbitEarGeometry.dispose();
  rabbitMaterial.dispose();
  earMaterial.dispose();
}

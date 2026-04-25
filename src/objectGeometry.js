import * as THREE from 'three';
import { VOXEL_SIZE } from './voxelGeometry';

export const OBJECT_TYPES = [
  { id: 'tree', label: 'Tree', color: 0x2f7d32 },
  { id: 'boulder', label: 'Boulder', color: 0x7f8588 },
  { id: 'birdNest', label: 'Bird Nest', color: 0x9a6a3a },
  { id: 'rabbitHutch', label: 'Rabbit Hutch', color: 0xb98252 },
];

const MATERIALS = {
  trunk: new THREE.MeshStandardMaterial({ color: 0x7a4b28, roughness: 0.85 }),
  leaves: new THREE.MeshStandardMaterial({ color: 0x2f7d32, roughness: 0.8 }),
  stone: new THREE.MeshStandardMaterial({ color: 0x7f8588, roughness: 0.9 }),
  twigs: new THREE.MeshStandardMaterial({ color: 0x9a6a3a, roughness: 0.9 }),
  hutch: new THREE.MeshStandardMaterial({ color: 0xb98252, roughness: 0.82 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x5f3821, roughness: 0.85 }),
};

function makePart(geometry, material, position, scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createTree() {
  const group = new THREE.Group();
  group.add(makePart(new THREE.BoxGeometry(2.2, 8, 2.2), MATERIALS.trunk, [0, 4, 0]));
  group.add(makePart(new THREE.BoxGeometry(7.5, 6, 7.5), MATERIALS.leaves, [0, 10, 0]));
  group.add(makePart(new THREE.BoxGeometry(5.5, 4, 5.5), MATERIALS.leaves, [0, 14, 0]));
  return group;
}

function createBoulder() {
  const group = new THREE.Group();
  group.add(makePart(new THREE.DodecahedronGeometry(4.2, 0), MATERIALS.stone, [0, 4, 0], [1.25, 0.85, 1]));
  return group;
}

function createBirdNest() {
  const group = new THREE.Group();
  group.add(makePart(new THREE.TorusGeometry(3.2, 0.8, 8, 16), MATERIALS.twigs, [0, 3.2, 0]));
  group.add(makePart(new THREE.CylinderGeometry(2.2, 2.8, 1.2, 12), MATERIALS.twigs, [0, 2.6, 0]));
  return group;
}

function createRabbitHutch() {
  const group = new THREE.Group();
  group.add(makePart(new THREE.BoxGeometry(7, 4.5, 6), MATERIALS.hutch, [0, 3.2, 0]));
  group.add(makePart(new THREE.ConeGeometry(5.2, 3.2, 4), MATERIALS.roof, [0, 6.8, 0], [1, 1, 0.75]));
  group.children[1].rotation.y = Math.PI * 0.25;
  return group;
}

function createObjectByType(type) {
  if (type === 'tree') {
    return createTree();
  }

  if (type === 'boulder') {
    return createBoulder();
  }

  if (type === 'birdNest') {
    return createBirdNest();
  }

  return createRabbitHutch();
}

export function createObjectGroup(objects) {
  const group = new THREE.Group();
  group.name = 'placed-objects';

  objects.forEach((object) => {
    const mesh = createObjectByType(object.type);
    mesh.position.set(
      (object.x + 0.5) * VOXEL_SIZE,
      object.y * VOXEL_SIZE,
      (object.z + 0.5) * VOXEL_SIZE
    );
    mesh.userData.objectKey = object.key;
    group.add(mesh);
  });

  return group;
}

export function disposeObjectGroup(group) {
  group.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.geometry.dispose();
  });
}

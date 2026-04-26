import * as THREE from 'three';
import { VOXEL_SIZE } from './voxelGeometry';

export const FLUID_EFFECT_TYPES = [
  { id: 'fountain', label: 'Fountain', color: 0x43bff2 },
  { id: 'drain', label: 'Drain', color: 0x25333a },
];

const MATERIALS = {
  fountainBase: new THREE.MeshStandardMaterial({ color: 0x566b72, roughness: 0.7, metalness: 0.05 }),
  fountainWater: new THREE.MeshStandardMaterial({
    color: 0x43bff2,
    transparent: true,
    opacity: 0.72,
    roughness: 0.18,
    metalness: 0,
  }),
  drain: new THREE.MeshStandardMaterial({ color: 0x25333a, roughness: 0.86, metalness: 0.1 }),
};

function makePart(geometry, material, position, scale = [1, 1, 1]) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createFountain() {
  const group = new THREE.Group();
  group.add(makePart(new THREE.CylinderGeometry(2.5, 2.8, 1, 18), MATERIALS.fountainBase, [0, 0.5, 0]));
  group.add(makePart(new THREE.CylinderGeometry(0.7, 0.7, 5.2, 12), MATERIALS.fountainWater, [0, 3.2, 0]));
  group.add(makePart(new THREE.SphereGeometry(1.2, 12, 8), MATERIALS.fountainWater, [0, 6.1, 0], [1, 0.55, 1]));
  return group;
}

function createDrain() {
  const group = new THREE.Group();
  group.add(makePart(new THREE.CylinderGeometry(3.2, 3.2, 0.5, 20), MATERIALS.drain, [0, 0.25, 0]));
  group.add(makePart(new THREE.BoxGeometry(5.4, 0.18, 0.45), MATERIALS.drain, [0, 0.62, 0]));
  group.add(makePart(new THREE.BoxGeometry(0.45, 0.18, 5.4), MATERIALS.drain, [0, 0.64, 0]));
  return group;
}

function createEffectByType(type) {
  return type === 'drain' ? createDrain() : createFountain();
}

export function createFluidEffectGroup(effects) {
  const group = new THREE.Group();
  group.name = 'fluid-effects';

  effects.forEach((effect) => {
    const mesh = createEffectByType(effect.type);
    mesh.position.set(
      (effect.x + 0.5) * VOXEL_SIZE,
      effect.y * VOXEL_SIZE,
      (effect.z + 0.5) * VOXEL_SIZE
    );
    mesh.userData.effectKey = effect.key;
    group.add(mesh);
  });

  return group;
}

export function disposeFluidEffectGroup(group) {
  group.traverse((child) => {
    if (!child.isMesh) {
      return;
    }

    child.geometry.dispose();
  });
}

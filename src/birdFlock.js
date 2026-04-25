import * as THREE from 'three';
import { VOXEL_SIZE } from './voxelGeometry';

export const BIRDS_PER_NEST = 6;

const birdMaterial = new THREE.MeshStandardMaterial({
  color: 0x2f80ed,
  roughness: 0.65,
});

const wingMaterial = new THREE.MeshStandardMaterial({
  color: 0x1554a6,
  roughness: 0.7,
  side: THREE.DoubleSide,
});

const birdBodyGeometry = new THREE.ConeGeometry(0.9, 2.4, 8);
birdBodyGeometry.rotateX(Math.PI * 0.5);

const wingGeometry = new THREE.BufferGeometry();
wingGeometry.setAttribute(
  'position',
  new THREE.Float32BufferAttribute([
    0, 0, 0,
    -2.2, 0, -0.35,
    -0.5, 0, 1.2,
    0, 0, 0,
    2.2, 0, -0.35,
    0.5, 0, 1.2,
  ], 3)
);
wingGeometry.computeVertexNormals();

const nestPosition = (nest) => new THREE.Vector3(
  (nest.x + 0.5) * VOXEL_SIZE,
  nest.y * VOXEL_SIZE + 8,
  (nest.z + 0.5) * VOXEL_SIZE
);

function createBirdMesh() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(birdBodyGeometry, birdMaterial);
  const wings = new THREE.Mesh(wingGeometry, wingMaterial);

  body.castShadow = true;
  wings.castShadow = true;
  group.add(body, wings);

  return group;
}

function createBird(nest, index) {
  const home = nestPosition(nest);
  const angle = (Math.PI * 2 * index) / BIRDS_PER_NEST;
  const radius = 10 + index * 2;
  const position = home.clone().add(new THREE.Vector3(
    Math.cos(angle) * radius,
    12 + index,
    Math.sin(angle) * radius
  ));
  const velocity = new THREE.Vector3(
    Math.sin(angle) * 0.16,
    0.025,
    Math.cos(angle) * 0.16
  );

  const mesh = createBirdMesh();
  mesh.position.copy(position);

  return {
    key: `${nest.key}:${index}`,
    nestKey: nest.key,
    position,
    velocity,
    mesh,
  };
}

export function syncBirdFlock(birds, birdGroup, nests) {
  const nestMap = new Map(nests.map((nest) => [nest.key, nest]));

  for (let index = birds.length - 1; index >= 0; index -= 1) {
    if (!nestMap.has(birds[index].nestKey)) {
      birdGroup.remove(birds[index].mesh);
      birds.splice(index, 1);
    }
  }

  nestMap.forEach((nest) => {
    for (let index = 0; index < BIRDS_PER_NEST; index += 1) {
      const key = `${nest.key}:${index}`;

      if (birds.some((bird) => bird.key === key)) {
        return;
      }

      const bird = createBird(nest, index);
      birds.push(bird);
      birdGroup.add(bird.mesh);
    }
  });
}

export function updateBirdFlock(birds, nests, getSurfaceHeight, deltaSeconds) {
  const nestMap = new Map(nests.map((nest) => [nest.key, nest]));
  const positions = birds.map((bird) => bird.position.clone());
  const velocities = birds.map((bird) => bird.velocity.clone());
  const deltaScale = Math.min(deltaSeconds * 60, 2);

  birds.forEach((bird, index) => {
    const separation = new THREE.Vector3();
    const alignment = new THREE.Vector3();
    const cohesion = new THREE.Vector3();
    let neighborCount = 0;

    positions.forEach((position, neighborIndex) => {
      if (index === neighborIndex) {
        return;
      }

      const distance = bird.position.distanceTo(position);

      if (distance > 42) {
        return;
      }

      const away = bird.position.clone().sub(position);

      if (distance < 14) {
        separation.add(away.divideScalar(Math.max(distance * distance, 0.001)));
      }

      alignment.add(velocities[neighborIndex]);
      cohesion.add(position);
      neighborCount += 1;
    });

    if (neighborCount > 0) {
      alignment.divideScalar(neighborCount).sub(bird.velocity).multiplyScalar(0.018);
      cohesion.divideScalar(neighborCount).sub(bird.position).multiplyScalar(0.004);
    }

    const homeNest = nestMap.get(bird.nestKey);
    const home = homeNest ? nestPosition(homeNest) : bird.position;
    const homeForce = home.clone().sub(bird.position);
    homeForce.y *= 0.15;

    if (homeForce.length() > 90) {
      homeForce.setLength(0.032);
    } else {
      homeForce.setLength(0.007);
    }

    const terrainFloor = getSurfaceHeight(bird.position.x, bird.position.z) + 12;
    const lift = new THREE.Vector3(0, bird.position.y < terrainFloor ? 0.045 : 0, 0);
    const drift = new THREE.Vector3(
      Math.sin(performance.now() * 0.001 + index) * 0.003,
      Math.cos(performance.now() * 0.0013 + index) * 0.006,
      Math.cos(performance.now() * 0.0008 + index) * 0.003
    );

    bird.velocity
      .add(separation.multiplyScalar(1.2))
      .add(alignment)
      .add(cohesion)
      .add(homeForce)
      .add(lift)
      .add(drift);

    if (bird.velocity.length() > 0.58) {
      bird.velocity.setLength(0.58);
    }

    if (bird.velocity.length() < 0.22) {
      bird.velocity.setLength(0.22);
    }

    bird.position.addScaledVector(bird.velocity, deltaScale);

    const minimumY = getSurfaceHeight(bird.position.x, bird.position.z) + 8;
    if (bird.position.y < minimumY) {
      bird.position.y = minimumY;
      bird.velocity.y = Math.abs(bird.velocity.y) + 0.06;
    }

    bird.mesh.position.copy(bird.position);
    bird.mesh.lookAt(bird.position.clone().add(bird.velocity));
    bird.mesh.children[1].rotation.z = Math.sin(performance.now() * 0.018 + index) * 0.35;
  });
}

export function disposeBirdFlock() {
  birdBodyGeometry.dispose();
  wingGeometry.dispose();
  birdMaterial.dispose();
  wingMaterial.dispose();
}

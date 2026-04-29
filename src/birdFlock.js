import * as THREE from 'three';
import { VOXEL_SIZE } from './voxelGeometry';

export const BIRDS_PER_NEST = 6;
export const FISH_EATEN_COOLDOWN_SECONDS = 10;

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

const treePerchPosition = (tree) => new THREE.Vector3(
  (tree.x + 0.5) * VOXEL_SIZE,
  tree.y * VOXEL_SIZE + 13,
  (tree.z + 0.5) * VOXEL_SIZE
);

function setPerchedPose(bird, index) {
  const perchYaw = Math.sin(index * 1.7) * 0.45;
  bird.mesh.position.copy(bird.position);
  bird.mesh.rotation.set(-Math.PI * 0.5, perchYaw, 0);
  bird.mesh.children[1].rotation.z = 0;
}

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
    diveCooldown: 2 + index * 1.1,
    diveTarget: null,
    diveHasEaten: false,
    fruitCooldown: 1 + index * 0.7,
    fruitTarget: null,
    fruitHasEaten: false,
    perchTimer: 0,
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

export function updateBirdFlock(birds, nests, getSurfaceHeight, deltaSeconds, options = {}) {
  const nestMap = new Map(nests.map((nest) => [nest.key, nest]));
  const positions = birds.map((bird) => bird.position.clone());
  const velocities = birds.map((bird) => bird.velocity.clone());
  const deltaScale = Math.min(deltaSeconds * 60, 2);
  const getFishTargets = options.getFishTargets ?? (() => []);
  const onFishEaten = options.onFishEaten ?? (() => {});
  const getFruitTargets = options.getFruitTargets ?? (() => []);
  const onFruitEaten = options.onFruitEaten ?? (() => {});

  birds.forEach((bird, index) => {
    bird.diveCooldown = Math.max(0, (bird.diveCooldown ?? 0) - deltaSeconds);
    bird.fruitCooldown = Math.max(0, (bird.fruitCooldown ?? 0) - deltaSeconds);

    if (bird.perchTimer > 0) {
      bird.perchTimer = Math.max(0, bird.perchTimer - deltaSeconds);

      if (bird.fruitTarget) {
        const perchPosition = treePerchPosition(bird.fruitTarget);
        bird.position.lerp(perchPosition, Math.min(deltaSeconds * 4, 1));
      }

      bird.velocity.multiplyScalar(0.78);
      setPerchedPose(bird, index);

      if (bird.perchTimer <= 0) {
        bird.fruitTarget = null;
        bird.fruitHasEaten = false;
        bird.fruitCooldown = 5 + Math.random() * 7;
        bird.velocity.set(0.16 + Math.random() * 0.08, 0.12, 0.08 - Math.random() * 0.16);
      }

      return;
    }

    if (!bird.diveTarget && bird.diveCooldown <= 0) {
      const fishTargets = getFishTargets(bird);

      if (fishTargets.length > 0 && Math.random() < 0.018) {
        const targetIndex = Math.floor(Math.random() * fishTargets.length);
        bird.diveTarget = fishTargets[targetIndex];
        bird.diveHasEaten = false;
      }
    }

    if (!bird.diveTarget && !bird.fruitTarget && bird.fruitCooldown <= 0) {
      const fruitTargets = getFruitTargets(bird);

      if (fruitTargets.length > 0 && Math.random() < 0.014) {
        const targetIndex = Math.floor(Math.random() * fruitTargets.length);
        bird.fruitTarget = fruitTargets[targetIndex];
        bird.fruitHasEaten = false;
      }
    }

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

    if (bird.diveTarget) {
      const targetPosition = new THREE.Vector3(
        (bird.diveTarget.x + 0.5) * VOXEL_SIZE,
        bird.diveTarget.y * VOXEL_SIZE + 4,
        (bird.diveTarget.z + 0.5) * VOXEL_SIZE
      );
      const diveForce = targetPosition.sub(bird.position);
      const distanceToTarget = diveForce.length();

      if (distanceToTarget > 0.001) {
        bird.velocity.add(diveForce.setLength(0.09));
      }

      if (!bird.diveHasEaten && distanceToTarget < 7) {
        bird.diveHasEaten = true;
        onFishEaten(bird.diveTarget, bird);
      }

      if (bird.diveHasEaten || distanceToTarget < 4) {
        const homeNest = nestMap.get(bird.nestKey);
        const home = homeNest ? nestPosition(homeNest) : bird.position;

        if (bird.position.distanceTo(home) < 28 || bird.diveHasEaten) {
          bird.diveTarget = null;
          bird.diveCooldown = 5 + Math.random() * 7;
        }
      }
    }

    if (bird.fruitTarget) {
      const targetPosition = treePerchPosition(bird.fruitTarget);
      const perchForce = targetPosition.sub(bird.position);
      const distanceToTarget = perchForce.length();

      if (distanceToTarget > 0.001) {
        bird.velocity.add(perchForce.setLength(0.07));
      }

      if (distanceToTarget < 6) {
        if (!bird.fruitHasEaten) {
          bird.fruitHasEaten = true;
          onFruitEaten(bird.fruitTarget, bird);
        }

        bird.perchTimer = 4 + Math.random() * 5;
        bird.velocity.set(0, 0, 0);
        bird.position.copy(treePerchPosition(bird.fruitTarget));
        setPerchedPose(bird, index);
        return;
      }
    }

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

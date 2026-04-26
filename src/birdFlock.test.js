import * as THREE from 'three';
import { BIRDS_PER_NEST, syncBirdFlock, updateBirdFlock } from './birdFlock';

test('syncs birds from bird nests', () => {
  const birds = [];
  const birdGroup = new THREE.Group();
  const nest = { key: '0,1,0', x: 0, y: 1, z: 0, type: 'birdNest' };

  syncBirdFlock(birds, birdGroup, [nest]);

  expect(birds).toHaveLength(BIRDS_PER_NEST);
  expect(birdGroup.children).toHaveLength(BIRDS_PER_NEST);

  syncBirdFlock(birds, birdGroup, []);

  expect(birds).toHaveLength(0);
  expect(birdGroup.children).toHaveLength(0);
});

test('updates bird movement above terrain', () => {
  const birds = [];
  const birdGroup = new THREE.Group();
  const nest = { key: '0,1,0', x: 0, y: 1, z: 0, type: 'birdNest' };

  syncBirdFlock(birds, birdGroup, [nest]);
  birds[0].position.y = 2;
  updateBirdFlock(birds, [nest], () => 10, 1 / 60);

  expect(birds[0].position.y).toBeGreaterThanOrEqual(18);
});

test('birds eat fish when they dive close to a fish target', () => {
  const birds = [];
  const birdGroup = new THREE.Group();
  const nest = { key: '0,1,0', x: 0, y: 1, z: 0, type: 'birdNest' };
  const fishTarget = { key: '0,0', x: 0, y: 1, z: 0 };
  const eatenFish = [];

  syncBirdFlock(birds, birdGroup, [nest]);
  birds[0].diveTarget = fishTarget;
  birds[0].diveHasEaten = false;
  birds[0].position.set(5, 14, 5);

  updateBirdFlock(birds, [nest], () => 0, 1 / 60, {
    onFishEaten: (cell) => eatenFish.push(cell),
  });

  expect(eatenFish).toEqual([fishTarget]);
  expect(birds[0].diveTarget).toBeNull();
});

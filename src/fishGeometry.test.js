import {
  FISH_WATER_LEVEL_THRESHOLD,
  createFishGroup,
  disposeFishGroup,
  updateFishGroup,
} from './fishGeometry';

test('creates fish only in water deep enough to support them', () => {
  const fishGroup = createFishGroup([
    { key: '0,0', x: 0, y: 1, z: 0, level: FISH_WATER_LEVEL_THRESHOLD - 0.1 },
    { key: '1,0', x: 1, y: 1, z: 0, level: FISH_WATER_LEVEL_THRESHOLD },
    { key: '2,0', x: 2, y: 1, z: 0, level: FISH_WATER_LEVEL_THRESHOLD + 1 },
  ]);

  expect(fishGroup.children).toHaveLength(2);
  expect(fishGroup.children.map((fish) => fish.userData.waterKey)).toEqual(['1,0', '2,0']);

  disposeFishGroup(fishGroup);
});

test('removes fish when water drops below the depth threshold', () => {
  const deepFishGroup = createFishGroup([
    { key: '0,0', x: 0, y: 1, z: 0, level: FISH_WATER_LEVEL_THRESHOLD },
  ]);
  const shallowFishGroup = createFishGroup([
    { key: '0,0', x: 0, y: 1, z: 0, level: FISH_WATER_LEVEL_THRESHOLD - 0.01 },
  ]);

  expect(deepFishGroup.children).toHaveLength(1);
  expect(shallowFishGroup.children).toHaveLength(0);

  disposeFishGroup(deepFishGroup);
  disposeFishGroup(shallowFishGroup);
});

test('hides fish that were recently eaten', () => {
  const fishGroup = createFishGroup([
    { key: '0,0', x: 0, y: 1, z: 0, level: FISH_WATER_LEVEL_THRESHOLD },
    { key: '1,0', x: 1, y: 1, z: 0, level: FISH_WATER_LEVEL_THRESHOLD },
  ], new Set(['0,0']));

  expect(fishGroup.children).toHaveLength(1);
  expect(fishGroup.children[0].userData.waterKey).toBe('1,0');

  disposeFishGroup(fishGroup);
});

test('animates fish swimming inside deep water cells', () => {
  const fishGroup = createFishGroup([
    { key: '0,0', x: 0, y: 1, z: 0, level: FISH_WATER_LEVEL_THRESHOLD },
  ]);
  const fish = fishGroup.children[0];
  const initialPosition = fish.position.clone();

  updateFishGroup(fishGroup, 1);

  expect(fish.position.equals(initialPosition)).toBe(false);

  disposeFishGroup(fishGroup);
});

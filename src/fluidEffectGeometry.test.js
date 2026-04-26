import {
  FLUID_EFFECT_TYPES,
  createFluidEffectGroup,
  disposeFluidEffectGroup,
} from './fluidEffectGeometry';

test('lists fountain and drain effect tools', () => {
  expect(FLUID_EFFECT_TYPES.map((type) => type.id)).toEqual(['fountain', 'drain']);
});

test('builds disposable fountain and drain markers', () => {
  const group = createFluidEffectGroup([
    { key: '0,0', x: 0, y: 1, z: 0, type: 'fountain' },
    { key: '1,0', x: 1, y: 1, z: 0, type: 'drain' },
  ]);

  expect(group.children).toHaveLength(2);
  expect(group.children[0].userData.effectKey).toBe('0,0');
  expect(group.children[1].userData.effectKey).toBe('1,0');

  disposeFluidEffectGroup(group);
});

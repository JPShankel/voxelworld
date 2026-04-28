import { createObjectGroup, disposeObjectGroup, OBJECT_TYPES } from './objectGeometry';

test('creates placed object meshes with editable keys', () => {
  const objectGroup = createObjectGroup([
    { key: '0,1,0', x: 0, y: 1, z: 0, type: 'tree' },
    { key: '1,1,0', x: 1, y: 1, z: 0, type: 'boulder' },
  ]);

  expect(OBJECT_TYPES).toHaveLength(4);
  expect(objectGroup.children).toHaveLength(2);
  expect(objectGroup.children[0].userData.objectKey).toBe('0,1,0');

  disposeObjectGroup(objectGroup);
});

test('renders up to six large fruit on trees', () => {
  const fruitingGroup = createObjectGroup([
    { key: '0,1,0', x: 0, y: 1, z: 0, type: 'tree', fruitCount: 6 },
  ]);
  const partialGroup = createObjectGroup([
    { key: '1,1,0', x: 1, y: 1, z: 0, type: 'tree', fruitCount: 3 },
  ]);
  const emptyGroup = createObjectGroup([
    { key: '2,1,0', x: 2, y: 1, z: 0, type: 'tree', fruitCount: 0 },
  ]);

  expect(fruitingGroup.children[0].children).toHaveLength(9);
  expect(partialGroup.children[0].children).toHaveLength(6);
  expect(emptyGroup.children[0].children).toHaveLength(3);
  expect(fruitingGroup.children[0].children[3].geometry.parameters.radius).toBeCloseTo(1.08);

  disposeObjectGroup(fruitingGroup);
  disposeObjectGroup(partialGroup);
  disposeObjectGroup(emptyGroup);
});

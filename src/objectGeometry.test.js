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

import * as THREE from 'three';
import { RABBITS_PER_HUTCH, syncRabbitWarren, updateRabbitWarren } from './rabbitWarren';

const flatSurface = (x, z) => ({ x, y: 0, z });

test('syncs rabbits from rabbit hutches', () => {
  const rabbits = [];
  const rabbitGroup = new THREE.Group();
  const hutch = { key: '0,1,0', x: 0, y: 1, z: 0, type: 'rabbitHutch' };

  syncRabbitWarren(rabbits, rabbitGroup, [hutch], flatSurface);

  expect(rabbits).toHaveLength(RABBITS_PER_HUTCH);
  expect(rabbitGroup.children).toHaveLength(RABBITS_PER_HUTCH);

  syncRabbitWarren(rabbits, rabbitGroup, [], flatSurface);

  expect(rabbits).toHaveLength(0);
  expect(rabbitGroup.children).toHaveLength(0);
});

test('rabbits choose trees and move across one-level terrain steps', () => {
  jest.spyOn(Math, 'random').mockReturnValue(0);
  const rabbits = [];
  const rabbitGroup = new THREE.Group();
  const hutch = { key: '0,1,0', x: 0, y: 1, z: 0, type: 'rabbitHutch' };
  const tree = { key: '2,1,0', x: 2, y: 1, z: 0, type: 'tree' };

  syncRabbitWarren(rabbits, rabbitGroup, [hutch], flatSurface);
  rabbits[0].moveTimer = 0;
  updateRabbitWarren(rabbits, [tree], flatSurface, 1);

  expect(rabbits[0].targetTreeKey).toBe(tree.key);
  expect(rabbits[0].cell.x).toBe(1);
  expect(rabbits[0].mesh.rotation.y).toBeCloseTo(-Math.PI / 2);

  Math.random.mockRestore();
});

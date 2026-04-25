jest.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: jest.fn().mockImplementation(() => ({
    update: jest.fn(),
    dispose: jest.fn(),
  })),
}));

const App = require('./App').default;

test('exports the voxel world app component', () => {
  expect(typeof App).toBe('function');
});

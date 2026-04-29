import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  VOXEL_PALETTE,
  VOXEL_SIZE,
  createVoxelMesh,
  createVoxelTerrain,
  disposeVoxelMesh,
} from './voxelGeometry';
import { OBJECT_TYPES, createObjectGroup, disposeObjectGroup } from './objectGeometry';
import {
  FLUID_EFFECT_TYPES,
  createFluidEffectGroup,
  disposeFluidEffectGroup,
} from './fluidEffectGeometry';
import {
  FISH_WATER_LEVEL_THRESHOLD,
  createFishGroup,
  disposeFishGroup,
  syncFishShoal,
  updateFishShoal,
} from './fishGeometry';
import {
  FISH_EATEN_COOLDOWN_SECONDS,
  syncBirdFlock,
  updateBirdFlock,
} from './birdFlock';
import {
  RABBIT_DRINK_AMOUNT,
  syncRabbitWarren,
  updateRabbitWarren,
} from './rabbitWarren';
import {
  WATER_COLOR,
  addWaterDrop,
  applyWaterEffects,
  createWaterMap,
  createWaterMesh,
  disposeWaterMesh,
  flowWater,
  removeWaterAmount,
  removeWaterDrop,
  validateWater,
} from './waterGeometry';
import {
  clearStoredSession,
  deleteScene,
  getStoredSession,
  isSupabaseConfigured,
  listScenes,
  loadScene,
  saveScene,
  signInWithPassword,
  signOut,
  signUpWithPassword,
} from './supabaseScenes';
import './App.css';

const VOXEL_TYPES = [
  { id: 'snow', label: 'Snow' },
  { id: 'rock', label: 'Rock' },
  { id: 'grass', label: 'Grass' },
  { id: 'sand', label: 'Sand' },
  { id: 'dirt', label: 'Dirt' },
  { id: 'stone', label: 'Stone' },
];

const EFFECT_TOOLS = [
  { id: 'water', label: 'Water', color: WATER_COLOR },
  ...FLUID_EFFECT_TYPES,
];

const PLACEABLE_TOOLS = [
  ...OBJECT_TYPES.map((objectType) => ({ ...objectType, kind: 'object' })),
  ...EFFECT_TOOLS.map((effectTool) => ({ ...effectTool, kind: 'effect' })),
];

const DEFAULT_SCENE_COUNTS = {
  trees: 10,
  hutches: 2,
  nests: 4,
};

const WATER_FLOW_INTERVAL_SECONDS = 0.05;
const MAX_TREE_FRUIT = 6;
const TREE_FRUIT_REGROW_SECONDS = 6;
const voxelKey = (x, y, z) => `${x},${y},${z}`;
const columnKey = (x, z) => `${x},${z}`;
const getTimeOfDaySeed = (date = new Date()) => (
  date.getHours() * 60 * 60 * 1000
  + date.getMinutes() * 60 * 1000
  + date.getSeconds() * 1000
  + date.getMilliseconds()
);

function createGroundGrid(size, divisions, lineWidth = 0.12) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
  });
  const xLineGeometry = new THREE.PlaneGeometry(size, lineWidth);
  const zLineGeometry = new THREE.PlaneGeometry(lineWidth, size);
  const step = size / divisions;
  const halfSize = size / 2;

  group.name = 'ground-grid';
  xLineGeometry.rotateX(-Math.PI / 2);
  zLineGeometry.rotateX(-Math.PI / 2);

  for (let index = 0; index <= divisions; index += 1) {
    const offset = -halfSize + index * step;
    const xLine = new THREE.Mesh(xLineGeometry, material);
    const zLine = new THREE.Mesh(zLineGeometry, material);

    xLine.position.z = offset;
    zLine.position.x = offset;
    group.add(xLine, zLine);
  }

  group.userData.gridGeometries = [xLineGeometry, zLineGeometry];
  group.userData.gridMaterial = material;

  return group;
}

function disposeGroundGrid(grid) {
  grid.userData.gridGeometries?.forEach((geometry) => geometry.dispose());
  grid.userData.gridMaterial?.dispose();
}

function formatSavedScene(scene, index) {
  const date = scene.created_at ? new Date(scene.created_at).toLocaleString() : 'unknown date';
  return `${index + 1}. ${scene.name} (${date})`;
}

function chooseSavedScene(scenes, action) {
  if (scenes.length === 0) {
    throw new Error('No saved scenes found.');
  }

  const menu = scenes.map(formatSavedScene).join('\n');
  const choice = window.prompt(`${action} which scene?\n${menu}`, '1');
  const selectedIndex = Number.parseInt(choice, 10) - 1;

  if (choice === null) {
    return null;
  }

  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= scenes.length) {
    throw new Error('Choose a valid scene number.');
  }

  return scenes[selectedIndex];
}

function App() {
  const mountRef = useRef(null);
  const controlPanelRef = useRef(null);
  const generateSceneRef = useRef(null);
  const clearSceneRef = useRef(null);
  const saveSceneRef = useRef(null);
  const loadSceneRef = useRef(null);
  const [selectedTool, setSelectedTool] = useState({ kind: 'voxel', id: 'grass' });
  const [sceneCounts, setSceneCounts] = useState(DEFAULT_SCENE_COUNTS);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [saveStatus, setSaveStatus] = useState('');
  const [authStatus, setAuthStatus] = useState('');
  const [supabaseSession, setSupabaseSession] = useState(() => getStoredSession());
  const selectedToolRef = useRef(selectedTool);
  const sceneCountsRef = useRef(sceneCounts);
  const supabaseSessionRef = useRef(supabaseSession);

  useEffect(() => {
    selectedToolRef.current = selectedTool;
  }, [selectedTool]);

  useEffect(() => {
    sceneCountsRef.current = sceneCounts;
  }, [sceneCounts]);

  useEffect(() => {
    supabaseSessionRef.current = supabaseSession;
  }, [supabaseSession]);

  useEffect(() => {
    const revealDistance = 96;

    const handleWindowPointerMove = (event) => {
      const panelBounds = controlPanelRef.current?.getBoundingClientRect();
      const pointerInPanel = panelBounds
        && event.clientX >= panelBounds.left
        && event.clientX <= panelBounds.right
        && event.clientY >= panelBounds.top
        && event.clientY <= panelBounds.bottom;

      setControlsVisible(event.clientY <= revealDistance || pointerInPanel);
    };

    window.addEventListener('pointermove', handleWindowPointerMove);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
    };
  }, []);

  useEffect(() => {
    const gridSize = 1200;
    const gridDivisions = 120;
    const gridCellSize = gridSize / gridDivisions;

    const mount = mountRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9fc9e8);
    scene.fog = new THREE.Fog(0x9fc9e8, 420, 1600);

    const camera = new THREE.PerspectiveCamera(
      65,
      mount.clientWidth / mount.clientHeight,
      0.1,
      2000
    );
    camera.position.set(80, 125, 120);
    camera.lookAt(0, 45, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.screenSpacePanning = false;
    controls.minDistance = 18;
    controls.maxDistance = 360;
    controls.maxPolarAngle = Math.PI * 0.48;
    controls.target.set(0, 35, 0);
    controls.update();

    const hemiLight = new THREE.HemisphereLight(0xddeeff, 0x4b6444, 2.8);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 3.5);
    sunLight.position.set(80, 120, 40);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 1;
    sunLight.shadow.camera.far = 260;
    sunLight.shadow.camera.left = -120;
    sunLight.shadow.camera.right = 120;
    sunLight.shadow.camera.top = 120;
    sunLight.shadow.camera.bottom = -120;
    scene.add(sunLight);

    const groundGeometry = new THREE.PlaneGeometry(2200, 2200, 1, 1);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      metalness: 0,
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = createGroundGrid(gridSize, gridDivisions, 0.18);
    grid.position.y = 0.02;
    scene.add(grid);

    const voxelMap = new Map();
    createVoxelTerrain(17).forEach((voxel) => {
      voxelMap.set(voxelKey(voxel.x, voxel.y, voxel.z), voxel);
    });

    let voxelMesh = createVoxelMesh([...voxelMap.values()]);
    scene.add(voxelMesh);

    const waterMap = createWaterMap();
    let waterMesh = createWaterMesh([...waterMap.values()]);
    scene.add(waterMesh);

    let fishGroup = createFishGroup([...waterMap.values()]);
    const fishShoal = fishGroup.userData.fish;
    scene.add(fishGroup);
    const eatenFishTimers = new Map();

    const fluidEffectMap = new Map();
    let fluidEffectGroup = createFluidEffectGroup([...fluidEffectMap.values()]);
    scene.add(fluidEffectGroup);

    const objectMap = new Map();
    let objectGroup = createObjectGroup([...objectMap.values()]);
    scene.add(objectGroup);

    const birdGroup = new THREE.Group();
    birdGroup.name = 'bird-flock';
    const birds = [];
    scene.add(birdGroup);

    const rabbitGroup = new THREE.Group();
    rabbitGroup.name = 'rabbit-warren';
    const rabbits = [];
    scene.add(rabbitGroup);

    const getBirdNests = () => [...objectMap.values()].filter((object) => object.type === 'birdNest');
    const getRabbitHutches = () => [...objectMap.values()].filter((object) => object.type === 'rabbitHutch');
    const getTrees = () => [...objectMap.values()].filter((object) => object.type === 'tree');

    const getTreeFruitCount = (tree) => {
      const fallbackCount = (tree?.fruitLevel ?? 1) >= 1 ? MAX_TREE_FRUIT : 0;
      return Math.max(0, Math.min(MAX_TREE_FRUIT, Math.floor(tree?.fruitCount ?? fallbackCount)));
    };

    const setTreeFruitCount = (tree, fruitCount) => {
      const currentTree = objectMap.get(tree.key);

      if (!currentTree || currentTree.type !== 'tree') {
        return false;
      }

      const nextFruitCount = Math.max(0, Math.min(MAX_TREE_FRUIT, Math.floor(fruitCount)));

      objectMap.set(tree.key, {
        ...currentTree,
        fruitCount: nextFruitCount,
        fruitLevel: nextFruitCount,
        fruitRegrowTimer: nextFruitCount >= MAX_TREE_FRUIT ? 0 : TREE_FRUIT_REGROW_SECONDS,
      });

      return true;
    };

    const getSurfaceCell = (x, z) => {
      let highestY = -1;

      voxelMap.forEach((voxel) => {
        if (voxel.x === x && voxel.z === z && voxel.y > highestY) {
          highestY = voxel.y;
        }
      });

      if (highestY < 0) {
        return null;
      }

      return { x, y: highestY, z };
    };

    const rebuildVoxelMesh = () => {
      const oldVoxelMesh = voxelMesh;
      voxelMesh = createVoxelMesh([...voxelMap.values()]);
      scene.add(voxelMesh);
      scene.remove(oldVoxelMesh);
      disposeVoxelMesh(oldVoxelMesh);
    };

    const rebuildTerrain = (seed) => {
      voxelMap.clear();
      createVoxelTerrain(17, { seed }).forEach((voxel) => {
        voxelMap.set(voxelKey(voxel.x, voxel.y, voxel.z), voxel);
      });

      waterMap.clear();
      eatenFishTimers.clear();
      fluidEffectMap.clear();
      objectMap.clear();
      rebuildVoxelMesh();
      rebuildWaterMesh();
      rebuildFluidEffectGroup();
    };

    const rebuildFishGroup = () => {
      syncFishShoal(fishShoal, fishGroup, [...waterMap.values()], new Set(eatenFishTimers.keys()));
    };

    const rebuildWaterMesh = () => {
      const oldWaterMesh = waterMesh;
      waterMesh = createWaterMesh([...waterMap.values()]);
      scene.add(waterMesh);
      scene.remove(oldWaterMesh);
      disposeWaterMesh(oldWaterMesh);
      rebuildFishGroup();
    };

    const rebuildFluidEffectGroup = () => {
      const oldFluidEffectGroup = fluidEffectGroup;
      fluidEffectGroup = createFluidEffectGroup([...fluidEffectMap.values()]);
      scene.add(fluidEffectGroup);
      scene.remove(oldFluidEffectGroup);
      disposeFluidEffectGroup(oldFluidEffectGroup);
    };

    const rebuildObjectGroup = () => {
      const oldObjectGroup = objectGroup;
      objectGroup = createObjectGroup([...objectMap.values()]);
      scene.add(objectGroup);
      scene.remove(oldObjectGroup);
      disposeObjectGroup(oldObjectGroup);
      syncBirdFlock(birds, birdGroup, getBirdNests());
      syncRabbitWarren(rabbits, rabbitGroup, getRabbitHutches(), getSurfaceCell);
    };

    const removeUnsupportedObjects = () => {
      let removed = false;

      objectMap.forEach((object, key) => {
        const supportKey = voxelKey(object.x, object.y - 1, object.z);

        if (!voxelMap.has(supportKey) || voxelMap.has(key)) {
          objectMap.delete(key);
          removed = true;
        }
      });

      return removed;
    };

    const removeUnsupportedFluidEffects = () => {
      let changed = false;

      fluidEffectMap.forEach((effect, key) => {
        const surface = getSurfaceCell(effect.x, effect.z);

        if (!surface) {
          fluidEffectMap.delete(key);
          changed = true;
          return;
        }

        const nextY = surface.y + 1;

        if (effect.y !== nextY) {
          fluidEffectMap.set(key, { ...effect, y: nextY });
          changed = true;
        }
      });

      return changed;
    };

    const settleWater = () => {
      if (removeUnsupportedFluidEffects()) {
        rebuildFluidEffectGroup();
      }

      if (validateWater(waterMap, voxelMap)) {
        rebuildWaterMesh();
      }
    };

    const getFishTargets = () => fishShoal
      .filter((fish) => !eatenFishTimers.has(fish.key))
      .map((fish) => ({
        key: fish.key,
        x: fish.cell.x,
        y: fish.cell.y,
        z: fish.cell.z,
      }));

    const getFruitTargets = () => getTrees()
      .filter((tree) => getTreeFruitCount(tree) > 0)
      .map((tree) => ({
        key: tree.key,
        x: tree.x,
        y: tree.y,
        z: tree.z,
        fruitCount: getTreeFruitCount(tree),
      }));

    const getAvailableSurfaceCells = () => [...voxelMap.values()]
      .filter((voxel) => voxel.type === 'grass' && !voxelMap.has(voxelKey(voxel.x, voxel.y + 1, voxel.z)))
      .map((voxel) => ({ x: voxel.x, y: voxel.y + 1, z: voxel.z }));

    const shuffleCells = (cells) => {
      const shuffled = [...cells];

      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
      }

      return shuffled;
    };

    const generateScene = ({ trees, hutches, nests }, options = {}) => {
      if (options.reseedTerrain) {
        rebuildTerrain(getTimeOfDaySeed());
      }

      const objectQueue = [
        ...Array.from({ length: trees }, () => 'tree'),
        ...Array.from({ length: hutches }, () => 'rabbitHutch'),
        ...Array.from({ length: nests }, () => 'birdNest'),
      ];
      const availableCells = shuffleCells(getAvailableSurfaceCells());

      objectMap.clear();

      objectQueue.forEach((type, index) => {
        const cell = availableCells[index];

        if (!cell) {
          return;
        }

        const key = voxelKey(cell.x, cell.y, cell.z);
        objectMap.set(key, {
          key,
          x: cell.x,
          y: cell.y,
          z: cell.z,
          type,
          ...(type === 'tree' ? { fruitCount: MAX_TREE_FRUIT, fruitLevel: MAX_TREE_FRUIT, fruitRegrowTimer: 0 } : {}),
        });
      });

      rebuildObjectGroup();
    };

    const createSceneSnapshot = () => ({
      version: 1,
      savedAt: new Date().toISOString(),
      sceneCounts: sceneCountsRef.current,
      voxels: [...voxelMap.values()],
      water: [...waterMap.values()],
      fluidEffects: [...fluidEffectMap.values()],
      objects: [...objectMap.values()],
      eatenFishTimers: [...eatenFishTimers.entries()].map(([key, remainingSeconds]) => ({
        key,
        remainingSeconds,
      })),
    });

    const applySceneSnapshot = (payload = {}) => {
      voxelMap.clear();
      (payload.voxels ?? []).forEach((voxel) => {
        voxelMap.set(voxelKey(voxel.x, voxel.y, voxel.z), voxel);
      });

      waterMap.clear();
      (payload.water ?? []).forEach((cell) => {
        waterMap.set(columnKey(cell.x, cell.z), cell);
      });

      fluidEffectMap.clear();
      (payload.fluidEffects ?? []).forEach((effect) => {
        fluidEffectMap.set(effect.key ?? columnKey(effect.x, effect.z), effect);
      });

      objectMap.clear();
      (payload.objects ?? []).forEach((object) => {
        objectMap.set(object.key ?? voxelKey(object.x, object.y, object.z), object);
      });

      eatenFishTimers.clear();
      (payload.eatenFishTimers ?? []).forEach(({ key, remainingSeconds }) => {
        eatenFishTimers.set(key, remainingSeconds);
      });

      if (payload.sceneCounts) {
        const nextSceneCounts = {
          ...DEFAULT_SCENE_COUNTS,
          ...payload.sceneCounts,
        };
        sceneCountsRef.current = nextSceneCounts;
        setSceneCounts(nextSceneCounts);
      }

      rebuildVoxelMesh();
      rebuildWaterMesh();
      rebuildFluidEffectGroup();
      rebuildObjectGroup();
    };

    generateSceneRef.current = generateScene;
    saveSceneRef.current = (name) => saveScene({
      name,
      payload: createSceneSnapshot(),
      session: supabaseSessionRef.current,
    });
    loadSceneRef.current = applySceneSnapshot;
    clearSceneRef.current = () => {
      waterMap.clear();
      eatenFishTimers.clear();
      fluidEffectMap.clear();
      objectMap.clear();
      rebuildWaterMesh();
      rebuildFluidEffectGroup();
      rebuildObjectGroup();
    };
    generateScene(DEFAULT_SCENE_COUNTS);

    const getSurfaceHeight = (worldX, worldZ) => {
      const x = Math.floor(worldX / VOXEL_SIZE);
      const z = Math.floor(worldZ / VOXEL_SIZE);
      const cell = getSurfaceCell(x, z);

      return cell ? (cell.y + 1) * VOXEL_SIZE : 0;
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerActive = false;
    const faceHighlightGeometry = new THREE.PlaneGeometry(VOXEL_SIZE, VOXEL_SIZE);
    const faceHighlightMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd84d,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const faceHighlight = new THREE.Mesh(faceHighlightGeometry, faceHighlightMaterial);
    faceHighlight.visible = false;
    scene.add(faceHighlight);

    const updatePointer = (event) => {
      const bounds = renderer.domElement.getBoundingClientRect();

      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    };

    const getGroundFace = () => {
      const [groundHit] = raycaster.intersectObject(ground, false);

      if (!groundHit) {
        return null;
      }

      const x = Math.floor(groundHit.point.x / VOXEL_SIZE);
      const z = Math.floor(groundHit.point.z / VOXEL_SIZE);

      if (voxelMap.has(voxelKey(x, 0, z))) {
        return null;
      }

      return {
        x,
        y: -1,
        z,
        normal: [0, 1, 0],
        ground: true,
      };
    };

    const handlePointerMove = (event) => {
      pointerActive = true;
      updatePointer(event);
    };

    const handlePointerLeave = () => {
      pointerActive = false;
      faceHighlight.visible = false;
    };

    const handlePointerDown = (event) => {
      pointerStart.x = event.clientX;
      pointerStart.y = event.clientY;
    };

    const handlePointerUp = (event) => {
      if (event.button !== 0) {
        return;
      }

      const dragDistance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);

      if (dragDistance > 4 || !hoveredFace) {
        return;
      }

      const { x, y, z, normal } = hoveredFace;
      const selectedTool = selectedToolRef.current;
      const normalIsUp = normal[0] === 0 && normal[1] === 1 && normal[2] === 0;
      const targetX = x + normal[0];
      const targetY = y + normal[1];
      const targetZ = z + normal[2];
      const targetKey = voxelKey(targetX, targetY, targetZ);

      if (event.shiftKey) {
        if (selectedTool.kind === 'effect' && selectedTool.id === 'water') {
          if (removeWaterDrop(waterMap, targetX, targetZ)) {
            rebuildWaterMesh();
          }

          hoveredFace = null;
          faceHighlight.visible = false;
          return;
        }

        if (selectedTool.kind === 'effect') {
          if (fluidEffectMap.delete(columnKey(targetX, targetZ))) {
            rebuildFluidEffectGroup();
          }

          hoveredFace = null;
          faceHighlight.visible = false;
          return;
        }

        if (selectedTool.kind === 'object') {
          if (normalIsUp) {
            objectMap.delete(targetKey);
            rebuildObjectGroup();
          }

          hoveredFace = null;
          faceHighlight.visible = false;
          return;
        }

        voxelMap.delete(voxelKey(x, y, z));
        settleWater();

        if (removeUnsupportedObjects()) {
          rebuildObjectGroup();
        }

        rebuildVoxelMesh();
        hoveredFace = null;
        faceHighlight.visible = false;
        return;
      }

      if (hoveredFace.ground && selectedTool.kind !== 'voxel') {
        hoveredFace = null;
        faceHighlight.visible = false;
        return;
      }

      if (selectedTool.kind === 'effect' && selectedTool.id === 'water') {
        if (addWaterDrop(waterMap, voxelMap, targetX, targetZ)) {
          rebuildWaterMesh();
        }

        hoveredFace = null;
        faceHighlight.visible = false;
        return;
      }

      if (selectedTool.kind === 'effect') {
        const surface = getSurfaceCell(targetX, targetZ);

        if (surface) {
          const effectKey = columnKey(targetX, targetZ);
          const effectY = surface.y + 1;

          objectMap.delete(voxelKey(targetX, effectY, targetZ));
          fluidEffectMap.set(effectKey, {
            key: effectKey,
            x: targetX,
            y: effectY,
            z: targetZ,
            type: selectedTool.id,
          });
          rebuildObjectGroup();
          rebuildFluidEffectGroup();
        }

        hoveredFace = null;
        faceHighlight.visible = false;
        return;
      }

      if (selectedTool.kind === 'object') {
        if (normalIsUp && !voxelMap.has(targetKey)) {
          fluidEffectMap.delete(columnKey(targetX, targetZ));
          objectMap.set(targetKey, {
            key: targetKey,
            x: targetX,
            y: targetY,
            z: targetZ,
            type: selectedTool.id,
            ...(selectedTool.id === 'tree' ? { fruitCount: MAX_TREE_FRUIT, fruitLevel: MAX_TREE_FRUIT, fruitRegrowTimer: 0 } : {}),
          });
          rebuildFluidEffectGroup();
          rebuildObjectGroup();
        }

        hoveredFace = null;
        faceHighlight.visible = false;
        return;
      }

      if (selectedTool.kind !== 'voxel' || !VOXEL_PALETTE[selectedTool.id]) {
        hoveredFace = null;
        faceHighlight.visible = false;
        return;
      }

      if (!voxelMap.has(targetKey)) {
        objectMap.delete(targetKey);
        fluidEffectMap.delete(columnKey(targetX, targetZ));
        voxelMap.set(targetKey, {
          x: targetX,
          y: targetY,
          z: targetZ,
          type: selectedTool.id,
        });
        settleWater();
        removeUnsupportedObjects();
        rebuildObjectGroup();
        rebuildVoxelMesh();
      }

      hoveredFace = null;
      faceHighlight.visible = false;
    };

    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointerup', handlePointerUp);

    const handleResize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    let animationFrameId;
    let hoveredFace = null;
    const pointerStart = new THREE.Vector2();
    const clock = new THREE.Clock();
    let waterFlowElapsed = 0;

    const animate = () => {
      const deltaSeconds = clock.getDelta();

      grid.position.x = Math.round(camera.position.x / gridCellSize) * gridCellSize;
      grid.position.z = Math.round(camera.position.z / gridCellSize) * gridCellSize;
      ground.position.x = grid.position.x;
      ground.position.z = grid.position.z;

      let hit;

      if (pointerActive) {
        raycaster.setFromCamera(pointer, camera);
        [hit] = raycaster.intersectObjects(voxelMesh.children, false);
      }

      if (hit) {
        const faceData = hit.object.geometry.userData.faceLookup?.[hit.faceIndex];

        if (faceData) {
          const normal = new THREE.Vector3(...faceData.normal);
          const center = new THREE.Vector3(
            (faceData.x + 0.5) * VOXEL_SIZE,
            (faceData.y + 0.5) * VOXEL_SIZE,
            (faceData.z + 0.5) * VOXEL_SIZE
          );

          hoveredFace = faceData;
          faceHighlight.position.copy(center).addScaledVector(normal, VOXEL_SIZE * 0.501);
          faceHighlight.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
          faceHighlight.visible = true;
        }
      } else {
        const groundFace = pointerActive ? getGroundFace() : null;

        if (groundFace && selectedToolRef.current.kind === 'voxel') {
          const normal = new THREE.Vector3(...groundFace.normal);
          const center = new THREE.Vector3(
            (groundFace.x + 0.5) * VOXEL_SIZE,
            (groundFace.y + 0.5) * VOXEL_SIZE,
            (groundFace.z + 0.5) * VOXEL_SIZE
          );

          hoveredFace = groundFace;
          faceHighlight.position.copy(center).addScaledVector(normal, VOXEL_SIZE * 0.501);
          faceHighlight.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
          faceHighlight.visible = true;
        } else {
          hoveredFace = null;
          faceHighlight.visible = false;
        }
      }

      updateFishShoal(fishShoal, [...waterMap.values()], deltaSeconds);
      let fishChanged = false;

      eatenFishTimers.forEach((remainingSeconds, key) => {
        const waterCell = waterMap.get(key);
        const nextRemainingSeconds = remainingSeconds - deltaSeconds;

        if (!waterCell || waterCell.level < FISH_WATER_LEVEL_THRESHOLD) {
          eatenFishTimers.delete(key);
          return;
        }

        if (nextRemainingSeconds <= 0) {
          eatenFishTimers.delete(key);
          fishChanged = true;
          return;
        }

        eatenFishTimers.set(key, nextRemainingSeconds);
      });

      let treeFruitChanged = false;

      updateBirdFlock(
        birds,
        getBirdNests(),
        getSurfaceHeight,
        deltaSeconds,
        {
          getFishTargets,
          onFishEaten: (cell) => {
            if (!eatenFishTimers.has(cell.key)) {
              eatenFishTimers.set(cell.key, FISH_EATEN_COOLDOWN_SECONDS);
              fishChanged = true;
            }
          },
          getFruitTargets,
          getTreeTargets: getTrees,
          onFruitEaten: (tree) => {
            const currentTree = objectMap.get(tree.key);
            const currentFruitCount = getTreeFruitCount(currentTree);

            if (currentFruitCount > 0) {
              treeFruitChanged = setTreeFruitCount(tree, currentFruitCount - 1) || treeFruitChanged;
            }
          },
        }
      );

      if (fishChanged) {
        rebuildFishGroup();
      }

      objectMap.forEach((object) => {
        if (object.type !== 'tree') {
          return;
        }

        const fruitCount = getTreeFruitCount(object);

        if (fruitCount >= MAX_TREE_FRUIT) {
          return;
        }

        const nextTimer = Math.max(0, (object.fruitRegrowTimer ?? TREE_FRUIT_REGROW_SECONDS) - deltaSeconds);

        if (nextTimer <= 0) {
          const nextFruitCount = fruitCount + 1;

          objectMap.set(object.key, {
            ...object,
            fruitCount: nextFruitCount,
            fruitLevel: nextFruitCount,
            fruitRegrowTimer: nextFruitCount >= MAX_TREE_FRUIT ? 0 : TREE_FRUIT_REGROW_SECONDS,
          });
          treeFruitChanged = true;
          return;
        }

        objectMap.set(object.key, {
          ...object,
          fruitCount,
          fruitLevel: fruitCount,
          fruitRegrowTimer: nextTimer,
        });
      });

      let rabbitsDrankWater = false;
      updateRabbitWarren(
        rabbits,
        getTrees(),
        getSurfaceCell,
        deltaSeconds,
        (cell) => {
          rabbitsDrankWater = removeWaterAmount(waterMap, cell.x, cell.z, RABBIT_DRINK_AMOUNT)
            || rabbitsDrankWater;
        },
        (tree) => {
          treeFruitChanged = setTreeFruitCount(tree, tree.fruitCount ?? 0) || treeFruitChanged;
        }
      );

      if (treeFruitChanged) {
        rebuildObjectGroup();
      }

      if (rabbitsDrankWater) {
        rebuildWaterMesh();
      }

      waterFlowElapsed += Math.min(deltaSeconds, WATER_FLOW_INTERVAL_SECONDS);

      if (waterFlowElapsed >= WATER_FLOW_INTERVAL_SECONDS) {
        waterFlowElapsed = 0;

        const effectsChanged = applyWaterEffects(waterMap, voxelMap, [...fluidEffectMap.values()]);
        const flowChanged = flowWater(waterMap, voxelMap, 1);

        if (effectsChanged || flowChanged) {
          rebuildWaterMesh();
        }
      }

      controls.update();
      renderer.render(scene, camera);
      animationFrameId = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointerup', handlePointerUp);
      mount.removeChild(renderer.domElement);
      controls.dispose();
      renderer.dispose();
      groundGeometry.dispose();
      groundMaterial.dispose();
      disposeGroundGrid(grid);
      faceHighlightGeometry.dispose();
      faceHighlightMaterial.dispose();
      disposeVoxelMesh(voxelMesh);
      disposeWaterMesh(waterMesh);
      disposeFishGroup(fishGroup);
      disposeFluidEffectGroup(fluidEffectGroup);
      disposeObjectGroup(objectGroup);
      generateSceneRef.current = null;
      clearSceneRef.current = null;
      saveSceneRef.current = null;
      loadSceneRef.current = null;
    };
  }, []);

  const handleSceneCountChange = (key, value) => {
    setSceneCounts((currentCounts) => ({
      ...currentCounts,
      [key]: Math.max(0, Number.parseInt(value, 10) || 0),
    }));
  };

  const handleGenerateScene = (event) => {
    event.preventDefault();
    generateSceneRef.current?.(sceneCounts, { reseedTerrain: true });
  };

  const handleClearScene = () => {
    clearSceneRef.current?.();
  };

  const handleSaveScene = async () => {
    if (!isSupabaseConfigured()) {
      setSaveStatus('Add Supabase env vars to save scenes.');
      return;
    }

    if (!supabaseSession) {
      setSaveStatus('Sign in to save scenes.');
      return;
    }

    const name = window.prompt('Scene name', `Voxel scene ${new Date().toLocaleString()}`);

    if (!name) {
      return;
    }

    setSaveStatus('Saving...');

    try {
      await saveSceneRef.current?.(name);
      setSaveStatus('Saved');
    } catch (error) {
      setSaveStatus(error.message || 'Save failed');
    }
  };

  const handleLoadScene = async () => {
    if (!isSupabaseConfigured()) {
      setSaveStatus('Add Supabase env vars to load scenes.');
      return;
    }

    if (!supabaseSession) {
      setSaveStatus('Sign in to load scenes.');
      return;
    }

    setSaveStatus('Loading...');

    try {
      const scenes = await listScenes(20, supabaseSession);
      const selectedScene = chooseSavedScene(scenes, 'Load');

      if (!selectedScene) {
        setSaveStatus('');
        return;
      }

      const savedScene = await loadScene(selectedScene.id, supabaseSession);
      loadSceneRef.current?.(savedScene.payload);
      setSaveStatus(`Loaded ${savedScene.name}`);
    } catch (error) {
      setSaveStatus(error.message || 'Load failed');
    }
  };

  const handleDeleteScene = async () => {
    if (!isSupabaseConfigured()) {
      setSaveStatus('Add Supabase env vars to delete scenes.');
      return;
    }

    if (!supabaseSession) {
      setSaveStatus('Sign in to delete scenes.');
      return;
    }

    setSaveStatus('Loading saved scenes...');

    try {
      const scenes = await listScenes(20, supabaseSession);
      const selectedScene = chooseSavedScene(scenes, 'Delete');

      if (!selectedScene) {
        setSaveStatus('');
        return;
      }

      if (!window.confirm(`Delete "${selectedScene.name}"?`)) {
        setSaveStatus('');
        return;
      }

      await deleteScene(selectedScene.id, supabaseSession);
      setSaveStatus(`Deleted ${selectedScene.name}`);
    } catch (error) {
      setSaveStatus(error.message || 'Delete failed');
    }
  };

  const promptForCredentials = () => {
    const email = window.prompt('Email');

    if (!email) {
      return null;
    }

    const password = window.prompt('Password');

    if (!password) {
      return null;
    }

    return { email, password };
  };

  const handleSignIn = async () => {
    if (!isSupabaseConfigured()) {
      setAuthStatus('Add Supabase env vars to sign in.');
      return;
    }

    const credentials = promptForCredentials();

    if (!credentials) {
      return;
    }

    setAuthStatus('Signing in...');

    try {
      const session = await signInWithPassword(credentials);
      setSupabaseSession(session);
      setAuthStatus(`Signed in as ${session.user?.email ?? credentials.email}`);
    } catch (error) {
      setAuthStatus(error.message || 'Sign in failed');
    }
  };

  const handleSignUp = async () => {
    if (!isSupabaseConfigured()) {
      setAuthStatus('Add Supabase env vars to sign up.');
      return;
    }

    const credentials = promptForCredentials();

    if (!credentials) {
      return;
    }

    setAuthStatus('Creating account...');

    try {
      const session = await signUpWithPassword(credentials);
      if (session.access_token) {
        setSupabaseSession(session);
        setAuthStatus(`Signed in as ${session.user?.email ?? credentials.email}`);
      } else {
        setSupabaseSession(null);
        setAuthStatus('Check your email to confirm.');
      }
    } catch (error) {
      setAuthStatus(error.message || 'Sign up failed');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(supabaseSession);
    } catch {
      clearStoredSession();
    }

    setSupabaseSession(null);
    setAuthStatus('Signed out');
  };

  return (
    <>
      <main className="world" ref={mountRef} aria-label="Voxel world scene" />
      <form
        ref={controlPanelRef}
        className={controlsVisible ? 'control-panel visible' : 'control-panel'}
        aria-label="World controls"
        onFocusCapture={() => setControlsVisible(true)}
        onSubmit={handleGenerateScene}
      >
        <section className="control-section" aria-labelledby="tool-heading">
          <h2 id="tool-heading">Build</h2>
          <div className="tool-selectors" aria-label="Tool palette">
            <label className="tool-field">
              <span>Terrain</span>
              <select
                value={selectedTool.kind === 'voxel' ? selectedTool.id : VOXEL_TYPES[0].id}
                onChange={(event) => {
                  setSelectedTool({ kind: 'voxel', id: event.target.value });
                }}
              >
                {VOXEL_TYPES.map((voxelType) => (
                  <option key={voxelType.id} value={voxelType.id}>
                    {voxelType.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="tool-field">
              <span>Place</span>
              <select
                value={selectedTool.kind === 'object' || selectedTool.kind === 'effect'
                  ? `${selectedTool.kind}:${selectedTool.id}`
                  : `${PLACEABLE_TOOLS[0].kind}:${PLACEABLE_TOOLS[0].id}`}
                onChange={(event) => {
                  const [kind, id] = event.target.value.split(':');
                  setSelectedTool({ kind, id });
                }}
              >
                {PLACEABLE_TOOLS.map((placeableTool) => (
                  <option
                    key={`${placeableTool.kind}:${placeableTool.id}`}
                    value={`${placeableTool.kind}:${placeableTool.id}`}
                  >
                    {placeableTool.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>
        <section className="control-section" aria-labelledby="scene-heading">
          <h2 id="scene-heading">Generate</h2>
          <div className="scene-controls">
            <label className="scene-field">
              <span>Trees</span>
              <input
                type="number"
                min="0"
                max="120"
                value={sceneCounts.trees}
                onChange={(event) => handleSceneCountChange('trees', event.target.value)}
              />
            </label>
            <label className="scene-field">
              <span>Hutches</span>
              <input
                type="number"
                min="0"
                max="120"
                value={sceneCounts.hutches}
                onChange={(event) => handleSceneCountChange('hutches', event.target.value)}
              />
            </label>
            <label className="scene-field">
              <span>Nests</span>
              <input
                type="number"
                min="0"
                max="120"
                value={sceneCounts.nests}
                onChange={(event) => handleSceneCountChange('nests', event.target.value)}
              />
            </label>
            <button className="generate-button" type="submit">Generate</button>
            <button className="clear-button" type="button" onClick={handleClearScene}>Clear</button>
          </div>
        </section>
      </form>
      <aside className="database-toolbar" aria-label="Database controls">
        <section className="database-toolbar-section" aria-labelledby="database-heading">
          <h2 id="database-heading">Database</h2>
          <div className="database-actions">
            <button className="save-button" type="button" onClick={handleSaveScene}>Save</button>
            <button className="load-button" type="button" onClick={handleLoadScene}>Load</button>
            <button className="delete-button" type="button" onClick={handleDeleteScene}>Delete</button>
            {saveStatus && <span className="save-status">{saveStatus}</span>}
          </div>
        </section>
        <section className="database-toolbar-section" aria-labelledby="account-heading">
          <h2 id="account-heading">Account</h2>
          <div className="auth-controls">
            {supabaseSession ? (
              <>
                <span className="account-email">{supabaseSession.user?.email ?? 'Signed in'}</span>
                <button className="auth-button" type="button" onClick={handleSignOut}>Sign Out</button>
              </>
            ) : (
              <>
                <button className="auth-button primary" type="button" onClick={handleSignIn}>Sign In</button>
                <button className="auth-button" type="button" onClick={handleSignUp}>Sign Up</button>
              </>
            )}
            {authStatus && <span className="auth-status">{authStatus}</span>}
          </div>
        </section>
      </aside>
    </>
  );
}

export default App;

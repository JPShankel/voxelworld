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
import './App.css';

const VOXEL_TYPES = [
  { id: 'grass', label: 'Grass' },
  { id: 'dirt', label: 'Dirt' },
  { id: 'stone', label: 'Stone' },
];

const EFFECT_TOOLS = [
  { id: 'water', label: 'Water', color: WATER_COLOR },
  ...FLUID_EFFECT_TYPES,
];

const DEFAULT_SCENE_COUNTS = {
  trees: 10,
  hutches: 2,
  nests: 4,
};

const WATER_FLOW_INTERVAL_SECONDS = 0.05;
const voxelKey = (x, y, z) => `${x},${y},${z}`;
const columnKey = (x, z) => `${x},${z}`;
const toolKey = (kind, id) => `${kind}:${id}`;
const getTimeOfDaySeed = (date = new Date()) => (
  date.getHours() * 60 * 60 * 1000
  + date.getMinutes() * 60 * 1000
  + date.getSeconds() * 1000
  + date.getMilliseconds()
);

function App() {
  const mountRef = useRef(null);
  const controlPanelRef = useRef(null);
  const generateSceneRef = useRef(null);
  const [selectedTool, setSelectedTool] = useState({ kind: 'voxel', id: 'grass' });
  const [sceneCounts, setSceneCounts] = useState(DEFAULT_SCENE_COUNTS);
  const [controlsVisible, setControlsVisible] = useState(true);
  const selectedToolRef = useRef(selectedTool);

  useEffect(() => {
    selectedToolRef.current = selectedTool;
  }, [selectedTool]);

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

    const grid = new THREE.GridHelper(gridSize, gridDivisions, 0x000000, 0x000000);
    grid.position.y = 0.02;
    grid.material.opacity = 0.35;
    grid.material.transparent = true;
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
        });
      });

      rebuildObjectGroup();
    };

    generateSceneRef.current = generateScene;
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
        hoveredFace = null;
        faceHighlight.visible = false;
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
        }
      );

      if (fishChanged) {
        rebuildFishGroup();
      }
      let rabbitsDrankWater = false;
      updateRabbitWarren(
        rabbits,
        getTrees(),
        getSurfaceCell,
        deltaSeconds,
        (cell) => {
          rabbitsDrankWater = removeWaterAmount(waterMap, cell.x, cell.z, RABBIT_DRINK_AMOUNT)
            || rabbitsDrankWater;
        }
      );

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
      faceHighlightGeometry.dispose();
      faceHighlightMaterial.dispose();
      disposeVoxelMesh(voxelMesh);
      disposeWaterMesh(waterMesh);
      disposeFishGroup(fishGroup);
      disposeFluidEffectGroup(fluidEffectGroup);
      disposeObjectGroup(objectGroup);
      generateSceneRef.current = null;
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
          <div className="tool-grid" aria-label="Tool palette">
            {VOXEL_TYPES.map((voxelType) => (
              <button
                key={voxelType.id}
                className={toolKey('voxel', voxelType.id) === toolKey(selectedTool.kind, selectedTool.id) ? 'tool active' : 'tool'}
                type="button"
                onClick={() => setSelectedTool({ kind: 'voxel', id: voxelType.id })}
                aria-pressed={toolKey('voxel', voxelType.id) === toolKey(selectedTool.kind, selectedTool.id)}
                title={voxelType.label}
              >
                <span
                  className="swatch"
                  style={{ backgroundColor: `#${VOXEL_PALETTE[voxelType.id].toString(16).padStart(6, '0')}` }}
                />
                <span>{voxelType.label}</span>
              </button>
            ))}
            {OBJECT_TYPES.map((objectType) => (
              <button
                key={objectType.id}
                className={toolKey('object', objectType.id) === toolKey(selectedTool.kind, selectedTool.id) ? 'tool active' : 'tool'}
                type="button"
                onClick={() => setSelectedTool({ kind: 'object', id: objectType.id })}
                aria-pressed={toolKey('object', objectType.id) === toolKey(selectedTool.kind, selectedTool.id)}
                title={objectType.label}
              >
                <span
                  className="swatch"
                  style={{ backgroundColor: `#${objectType.color.toString(16).padStart(6, '0')}` }}
                />
                <span>{objectType.label}</span>
              </button>
            ))}
            {EFFECT_TOOLS.map((effectTool) => (
              <button
                key={effectTool.id}
                className={toolKey('effect', effectTool.id) === toolKey(selectedTool.kind, selectedTool.id) ? 'tool active' : 'tool'}
                type="button"
                onClick={() => setSelectedTool({ kind: 'effect', id: effectTool.id })}
                aria-pressed={toolKey('effect', effectTool.id) === toolKey(selectedTool.kind, selectedTool.id)}
                title={effectTool.label}
              >
                <span
                  className="swatch"
                  style={{ backgroundColor: `#${effectTool.color.toString(16).padStart(6, '0')}` }}
                />
                <span>{effectTool.label}</span>
              </button>
            ))}
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
          </div>
        </section>
      </form>
    </>
  );
}

export default App;

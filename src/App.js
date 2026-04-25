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
import { syncBirdFlock, updateBirdFlock } from './birdFlock';
import './App.css';

const VOXEL_TYPES = [
  { id: 'grass', label: 'Grass' },
  { id: 'dirt', label: 'Dirt' },
  { id: 'stone', label: 'Stone' },
];

const voxelKey = (x, y, z) => `${x},${y},${z}`;
const toolKey = (kind, id) => `${kind}:${id}`;

function App() {
  const mountRef = useRef(null);
  const [selectedTool, setSelectedTool] = useState({ kind: 'voxel', id: 'grass' });
  const selectedToolRef = useRef(selectedTool);

  useEffect(() => {
    selectedToolRef.current = selectedTool;
  }, [selectedTool]);

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

    const objectMap = new Map();
    let objectGroup = createObjectGroup([...objectMap.values()]);
    scene.add(objectGroup);

    const birdGroup = new THREE.Group();
    birdGroup.name = 'bird-flock';
    const birds = [];
    scene.add(birdGroup);

    const getBirdNests = () => [...objectMap.values()].filter((object) => object.type === 'birdNest');

    const rebuildVoxelMesh = () => {
      const oldVoxelMesh = voxelMesh;
      voxelMesh = createVoxelMesh([...voxelMap.values()]);
      scene.add(voxelMesh);
      scene.remove(oldVoxelMesh);
      disposeVoxelMesh(oldVoxelMesh);
    };

    const rebuildObjectGroup = () => {
      const oldObjectGroup = objectGroup;
      objectGroup = createObjectGroup([...objectMap.values()]);
      scene.add(objectGroup);
      scene.remove(oldObjectGroup);
      disposeObjectGroup(oldObjectGroup);
      syncBirdFlock(birds, birdGroup, getBirdNests());
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

    const getSurfaceHeight = (worldX, worldZ) => {
      const x = Math.floor(worldX / VOXEL_SIZE);
      const z = Math.floor(worldZ / VOXEL_SIZE);
      let highestY = -1;

      voxelMap.forEach((voxel) => {
        if (voxel.x === x && voxel.z === z && voxel.y > highestY) {
          highestY = voxel.y;
        }
      });

      return (highestY + 1) * VOXEL_SIZE;
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

        if (removeUnsupportedObjects()) {
          rebuildObjectGroup();
        }

        rebuildVoxelMesh();
        hoveredFace = null;
        faceHighlight.visible = false;
        return;
      }

      if (selectedTool.kind === 'object') {
        if (normalIsUp && !voxelMap.has(targetKey)) {
          objectMap.set(targetKey, {
            key: targetKey,
            x: targetX,
            y: targetY,
            z: targetZ,
            type: selectedTool.id,
          });
          rebuildObjectGroup();
        }

        hoveredFace = null;
        faceHighlight.visible = false;
        return;
      }

      if (!voxelMap.has(targetKey)) {
        objectMap.delete(targetKey);
        voxelMap.set(targetKey, {
          x: targetX,
          y: targetY,
          z: targetZ,
          type: selectedTool.id,
        });
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

      updateBirdFlock(birds, getBirdNests(), getSurfaceHeight, deltaSeconds);
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
      disposeObjectGroup(objectGroup);
    };
  }, []);

  return (
    <>
      <main className="world" ref={mountRef} aria-label="Voxel world scene" />
      <div className="tool-palette" aria-label="Tool palette">
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
        <span className="tool-divider" aria-hidden="true" />
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
      </div>
    </>
  );
}

export default App;

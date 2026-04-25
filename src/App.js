import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createVoxelMesh, createVoxelTerrain, disposeVoxelMesh } from './voxelGeometry';
import './App.css';

function App() {
  const mountRef = useRef(null);

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
    camera.position.set(34, 28, 46);
    camera.lookAt(0, 0, 0);

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
    controls.target.set(0, 2, 0);
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

    const voxelMesh = createVoxelMesh(createVoxelTerrain(9));
    scene.add(voxelMesh);

    const handleResize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    let animationFrameId;
    const animate = () => {
      grid.position.x = Math.round(camera.position.x / gridCellSize) * gridCellSize;
      grid.position.z = Math.round(camera.position.z / gridCellSize) * gridCellSize;
      ground.position.x = grid.position.x;
      ground.position.z = grid.position.z;

      controls.update();
      renderer.render(scene, camera);
      animationFrameId = window.requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      mount.removeChild(renderer.domElement);
      controls.dispose();
      renderer.dispose();
      groundGeometry.dispose();
      groundMaterial.dispose();
      disposeVoxelMesh(voxelMesh);
    };
  }, []);

  return <main className="world" ref={mountRef} aria-label="Voxel world scene" />;
}

export default App;

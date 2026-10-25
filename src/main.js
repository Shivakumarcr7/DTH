// src/main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BUILDING_DIMENSIONS as DIM, PALETTE, ROOM_MANIFEST, TELEPORT_ZONES } from './config/buildingConfig.js';

// ============================================================================
// 1. SCENE, RENDERER & HARDWARE OPTIMIZATION (RTX 3050 4GB VRAM)
// ============================================================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
container.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 220);
const orbitControls = new OrbitControls(camera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.06;
orbitControls.maxPolarAngle = Math.PI / 2 - 0.03;
orbitControls.target.set(0, 3.8, 0);
orbitControls.enabled = false;

// ============================================================================
// 2. PROCEDURAL ARCHITECTURAL TEXTURES (MATCHING UPLOADED PHOTOS)
// ============================================================================
function createCorridorTileTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#6A524A';
  ctx.fillRect(0, 0, 256, 256);

  // Subtle ceramic variation
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const shade = 98 + ((x + y) % 2) * 7;
      ctx.fillStyle = `rgb(${shade + 12}, ${shade - 10}, ${shade - 18})`;
      ctx.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(22, 6);
  return tex;
}

function createClassroomTileTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#C5C2BA';
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#E2E0D8';
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      ctx.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 4);
  return tex;
}

function createSignboardTexture(lines, bgColor = '#18509E', textColor = '#FFFFFF') {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 320;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  lines.forEach((line, idx) => {
    ctx.font = idx === 0 ? 'bold 46px Arial, sans-serif' : 'bold 34px Arial, sans-serif';
    const yOffset = canvas.height / 2 + (idx - (lines.length - 1) / 2) * 68;
    ctx.fillText(line, canvas.width / 2, yOffset);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function createWeatheredWoodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#E5E2DC';
  ctx.fillRect(0, 0, 256, 64);
  // Distressed brown wood streaks matching Photo 1 staircase handrail
  ctx.fillStyle = '#7C6252';
  for (let i = 0; i < 45; i++) {
    ctx.fillRect(Math.random() * 240, Math.random() * 58, 12 + Math.random() * 35, 3);
  }
  return new THREE.CanvasTexture(canvas);
}

// Shared Materials
const MAT = {
  facadeCream: new THREE.MeshStandardMaterial({ color: PALETTE.facadeCream, roughness: 0.85 }),
  terracotta: new THREE.MeshStandardMaterial({ color: PALETTE.terracottaTrim, roughness: 0.75 }),
  interiorUpper: new THREE.MeshStandardMaterial({ color: PALETTE.interiorUpper, roughness: 0.85 }),
  interiorDado: new THREE.MeshStandardMaterial({ color: PALETTE.interiorDado, roughness: 0.65 }),
  corridorTile: new THREE.MeshStandardMaterial({ map: createCorridorTileTexture(), roughness: 0.35, metalness: 0.08 }),
  roomTile: new THREE.MeshStandardMaterial({ map: createClassroomTileTexture(), roughness: 0.3, metalness: 0.05 }),
  lowerGranite: new THREE.MeshStandardMaterial({ color: PALETTE.lowerStairGranite, roughness: 0.25, metalness: 0.15 }),
  upperCement: new THREE.MeshStandardMaterial({ color: PALETTE.upperStairCement, roughness: 0.6 }),
  railingSteel: new THREE.MeshStandardMaterial({ color: PALETTE.railingSteel, roughness: 0.4, metalness: 0.7 }),
  handrailWood: new THREE.MeshStandardMaterial({ map: createWeatheredWoodTexture(), roughness: 0.65 }),
  doorWood: new THREE.MeshStandardMaterial({ color: PALETTE.woodDoor, roughness: 0.5 }),
  shoeRackWood: new THREE.MeshStandardMaterial({ color: PALETTE.shoeRackWood, roughness: 0.4 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0x93C5FD, transparent: true, opacity: 0.36, roughness: 0.1, metalness: 0.1 }),
  aluminum: new THREE.MeshStandardMaterial({ color: PALETTE.aluminumFrame, metalness: 0.65, roughness: 0.3 }),
  porticoPillar: new THREE.MeshStandardMaterial({ color: PALETTE.porticoPillar, roughness: 0.3, metalness: 0.2 }),
  copingWhite: new THREE.MeshStandardMaterial({ color: 0xF8FAFC, roughness: 0.5 })
};

// ============================================================================
// 3. LIGHTING & SKY ENVIRONMENT
// ============================================================================
const ambientLight = new THREE.HemisphereLight(0xFFF7ED, 0x6B7280, 0.85);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xFFE4B5, 2.1);
sunLight.position.set(28, 36, 32);
sunLight.castShadow = true;
sunLight.shadow.mapSize.width = 2048;
sunLight.shadow.mapSize.height = 2048;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 110;
const d = 32;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);

let isGoldenHour = true;
function applyLightingPreset(golden) {
  if (golden) {
    scene.background = new THREE.Color(0xE89D54);
    scene.fog = new THREE.FogExp2(0xE89D54, 0.0065);
    sunLight.color.setHex(0xFFD29D);
    sunLight.intensity = 2.1;
    ambientLight.intensity = 0.85;
  } else {
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.005);
    sunLight.color.setHex(0xFFFFFF);
    sunLight.intensity = 2.4;
    ambientLight.intensity = 1.05;
  }
}
applyLightingPreset(true);

// ============================================================================
// 4. COLLISION & INTERACTION REGISTRIES
// ============================================================================
const wallColliders = []; // Array of THREE.Box3
const interactiveDoors = []; // Hinged door pivots
const cutawayMeshes = []; // Front facade walls that can be toggled for inspection

function addBoxMesh(w, h, d, mat, x, y, z, collide = true, castShadow = true, isCutaway = false) {
  const geom = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  scene.add(mesh);

  if (collide) {
    const box = new THREE.Box3().setFromObject(mesh);
    wallColliders.push(box);
  }
  if (isCutaway) {
    cutawayMeshes.push(mesh);
  }
  return mesh;
}

// Helper for two-tone interior wall (Grey Dado bottom + Cream upper)
function addTwoToneWall(w, h, d, x, floorY, z, collide = true, isCutaway = false) {
  const dadoH = Math.min(DIM.dadoHeight, h);
  const upperH = h - dadoH;
  addBoxMesh(w, dadoH, d, MAT.interiorDado, x, floorY + dadoH / 2, z, collide, true, isCutaway);
  if (upperH > 0.01) {
    addBoxMesh(w, upperH, d, MAT.interiorUpper, x, floorY + dadoH + upperH / 2, z, collide, true, isCutaway);
  }
}

// ============================================================================
// 5. ARCHITECTURAL RECONSTRUCTION — EXTERIOR, FLOORS, CORRIDORS & 8 ROOMS
// ============================================================================
function buildCampusGround() {
  // Campus lawn
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 180),
    new THREE.MeshStandardMaterial({ color: 0x748B54, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  scene.add(ground);

  // Paved approach driveway with terracotta curb stripes (matching Reference UI)
  addBoxMesh(6.5, 0.08, 22, new THREE.MeshStandardMaterial({ color: 0xEDE9E0, roughness: 0.8 }), 0, 0.0, 16.5, false);
  addBoxMesh(0.35, 0.1, 22, MAT.terracotta, -3.25, 0.01, 16.5, false);
  addBoxMesh(0.35, 0.1, 22, MAT.terracotta, 3.25, 0.01, 16.5, false);

  // Left-side adjacent red metal roof shed seen in Photo 2 (looking out from 1st floor corridor)
  const shedRoof = new THREE.Mesh(
    new THREE.BoxGeometry(14, 0.25, 9),
    new THREE.MeshStandardMaterial({ color: 0xD94E47, roughness: 0.5 })
  );
  shedRoof.position.set(-32, 3.0, 4.0);
  shedRoof.rotation.z = 0.12;
  scene.add(shedRoof);

  // Stylized campus trees on left & right
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6B4F3A, roughness: 0.9 });
  const foliageMat = new THREE.MeshStandardMaterial({ color: 0x4E7A45, roughness: 0.8 });
  [[-19, 13], [-14, 10], [-25, 8], [19, 13], [24, 9]].forEach(([tx, tz]) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 4.5, 8), trunkMat);
    trunk.position.set(tx, 2.25, tz);
    scene.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(2.8, 12, 12), foliageMat);
    crown.position.set(tx, 5.5, tz);
    crown.castShadow = true;
    scene.add(crown);
  });
}

function buildSlabsAndCorridors() {
  // Ground Floor Slab (Y = 0) & First Floor Slab (Y = 4.2m) & Roof Slab (Y = 8.4m)
  // On First Floor & Roof, leave opening in Central Stair Bay (x: -3 to +3, z: -5.8 to +1.8)
  addBoxMesh(DIM.totalWidth, 0.25, DIM.totalDepth, MAT.facadeCream, 0, -0.125, 0, false);

  // First Floor Left & Right Wing Slabs
  addBoxMesh(20.0, 0.26, DIM.totalDepth, MAT.facadeCream, -13.0, DIM.floorHeight - 0.13, 0, false);
  addBoxMesh(20.0, 0.26, DIM.totalDepth, MAT.facadeCream, 13.0, DIM.floorHeight - 0.13, 0, false);
  // First Floor Central Corridor Bridge connecting Left & Right wings in front of staircase
  addBoxMesh(6.0, 0.26, 4.0, MAT.facadeCream, 0, DIM.floorHeight - 0.13, 3.8, false);

  // Vitrified Corridor Tile Overlays (Ground & First Floor)
  addBoxMesh(DIM.totalWidth - 0.4, 0.03, DIM.corridorDepth, MAT.corridorTile, 0, 0.015, 4.2, false);
  addBoxMesh(DIM.totalWidth - 0.4, 0.03, DIM.corridorDepth, MAT.corridorTile, 0, DIM.floorHeight + 0.015, 4.2, false);

  // Corridor Split-Level 3-Step Visual Marker & Doormat (from Photo 2)
  const matMesh = addBoxMesh(1.6, 0.03, 0.7, new THREE.MeshStandardMaterial({ color: 0x27272A }), -3.4, DIM.floorHeight + 0.03, 4.2, false);

  // Roof Slab (Y = 8.4m)
  addBoxMesh(DIM.totalWidth + 0.6, 0.3, DIM.totalDepth + 0.6, MAT.facadeCream, 0, DIM.floorHeight * 2 + 0.15, 0, false);
}

function buildFrontElevationAndParapets() {
  const zFront = DIM.totalDepth / 2; // +5.8m

  // 1. Ground Floor Front Parapet Wall (Leave central entrance open X: -2.6 to +2.6)
  addBoxMesh(20.4, DIM.parapetHeight, 0.25, MAT.facadeCream, -12.8, DIM.parapetHeight / 2, zFront, true, true, true);
  addBoxMesh(20.4, DIM.parapetHeight, 0.25, MAT.facadeCream, 12.8, DIM.parapetHeight / 2, zFront, true, true, true);
  // Sloped white coping on Ground Parapet
  addBoxMesh(20.4, 0.08, 0.34, MAT.copingWhite, -12.8, DIM.parapetHeight + 0.04, zFront, false, true, true);
  addBoxMesh(20.4, 0.08, 0.34, MAT.copingWhite, 12.8, DIM.parapetHeight + 0.04, zFront, false, true, true);

  // 2. First Floor Front Parapet Wall (Continuous across entire front corridor, matching Photo 2 & 3)
  addBoxMesh(DIM.totalWidth, DIM.parapetHeight, 0.25, MAT.facadeCream, 0, DIM.floorHeight + DIM.parapetHeight / 2, zFront, true, true, true);
  // Interior grey finish on inside of 1st floor parapet (Photo 2)
  addBoxMesh(DIM.totalWidth - 0.2, DIM.parapetHeight - 0.05, 0.04, MAT.interiorDado, 0, DIM.floorHeight + DIM.parapetHeight / 2, zFront - 0.14, false, false, true);
  // Sloped white coping ledge on 1st Floor Parapet (Photo 2 left side)
  addBoxMesh(DIM.totalWidth, 0.09, 0.36, MAT.copingWhite, 0, DIM.floorHeight + DIM.parapetHeight + 0.045, zFront, false, true, true);

  // 3. Upper Facade Spandrel / Header Band (Matches Photo 3 deep upper cream band)
  addBoxMesh(DIM.totalWidth, 1.35, 0.25, MAT.facadeCream, 0, DIM.floorHeight - 0.675, zFront, false, true, true);
  addBoxMesh(DIM.totalWidth, 1.55, 0.25, MAT.facadeCream, 0, DIM.floorHeight * 2 - 0.775, zFront, false, true, true);

  // 4. Vertical Structural Columns & Terracotta Red-Oxide Pilasters (7 Grid Lines)
  const columnXPositions = [-23.0, -13.0, -3.0, 3.0, 13.0, 23.0];
  columnXPositions.forEach((cx) => {
    // Structural white column
    addBoxMesh(0.48, DIM.floorHeight * 2, 0.45, MAT.facadeCream, cx, DIM.floorHeight, zFront - 0.05, true);
    // Terracotta vertical pilaster strip on front face (Photo 3)
    addBoxMesh(0.24, DIM.floorHeight * 2 + 0.4, 0.08, MAT.terracotta, cx, DIM.floorHeight, zFront + 0.18, false);
  });

  // Intermediate corridor window mullions (Photo 2 & 3)
  [-18.0, -8.0, 8.0, 18.0].forEach((mx) => {
    addBoxMesh(0.35, DIM.floorHeight * 2, 0.3, MAT.facadeCream, mx, DIM.floorHeight, zFront, false, true, true);
    addBoxMesh(0.16, DIM.floorHeight * 2 + 0.4, 0.06, MAT.terracotta, mx, DIM.floorHeight, zFront + 0.16, false, true, true);
  });

  // 5. Horizontal Terracotta Slab Bands & Roof Coping Trim (Photo 3)
  addBoxMesh(DIM.totalWidth + 0.4, 0.18, 0.1, MAT.terracotta, 0, DIM.parapetHeight, zFront + 0.16, false);
  addBoxMesh(DIM.totalWidth + 0.4, 0.22, 0.12, MAT.terracotta, 0, DIM.floorHeight, zFront + 0.16, false);
  addBoxMesh(DIM.totalWidth + 0.4, 0.18, 0.1, MAT.terracotta, 0, DIM.floorHeight + DIM.parapetHeight, zFront + 0.16, false);
  addBoxMesh(DIM.totalWidth + 0.7, 0.26, 0.14, MAT.terracotta, 0, DIM.floorHeight * 2 + 0.25, zFront + 0.18, false);

  // 6. Terracotta Rainwater Downpipes with swan-neck offsets at top (Photo 3)
  [-6.2, 6.2, 15.5].forEach((px) => {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, DIM.floorHeight * 2, 8), MAT.terracotta);
    pipe.position.set(px, DIM.floorHeight, zFront + 0.22);
    scene.add(pipe);
  });

  // 7. Department Signboards (Exact Match to Photo 3)
  // Top Center Blue Signboard: "COMPUTER SCIENCE & ENGINEERING (Artificial Intelligence & Machine Learning)"
  const aimlSignTex = createSignboardTexture([
    'COMPUTER SCIENCE & ENGINEERING',
    '( Artificial Intelligence & Machine Learning )'
  ]);
  const aimlSign = new THREE.Mesh(
    new THREE.BoxGeometry(5.8, 1.55, 0.12),
    new THREE.MeshStandardMaterial({ map: aimlSignTex, roughness: 0.4 })
  );
  aimlSign.position.set(0, DIM.floorHeight * 2 - 0.78, zFront + 0.22);
  scene.add(aimlSign);

  // Lower Right Wing Blue Signboard: "DEPARTMENT OF ELECTRONICS & COMMUNICATION..."
  const eceSignTex = createSignboardTexture([
    'DEPARTMENT OF',
    'ELECTRONICS & COMMUNICATION ENGINEERING',
    '( VLSI DESIGN & TECHNOLOGY )'
  ]);
  const eceSign = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 1.15, 0.1),
    new THREE.MeshStandardMaterial({ map: eceSignTex, roughness: 0.4 })
  );
  eceSign.position.set(8.0, 2.2, zFront + 0.22);
  scene.add(eceSign);
}

function buildEntrancePortico() {
  const zFront = DIM.totalDepth / 2; // 5.8m
  const porticoZ = zFront + 2.2;    // 8.0m

  // Portico raised platform
  addBoxMesh(6.2, 0.16, 4.6, MAT.corridorTile, 0, 0.08, zFront + 2.1, false);

  // Two Dark Granite Front Pillars (Photo 3)
  addBoxMesh(0.45, 3.2, 0.45, MAT.porticoPillar, -2.4, 1.6, porticoZ, true);
  addBoxMesh(0.45, 3.2, 0.45, MAT.porticoPillar, 2.4, 1.6, porticoZ, true);

  // Portico Pitched Gable Roof with Red-Oxide Fascia Trim (Photo 3)
  const leftSlope = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.18, 4.8), MAT.facadeCream);
  leftSlope.position.set(-1.5, 3.65, zFront + 2.1);
  leftSlope.rotation.z = 0.24;
  scene.add(leftSlope);

  const rightSlope = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.18, 4.8), MAT.facadeCream);
  rightSlope.position.set(1.5, 3.65, zFront + 2.1);
  rightSlope.rotation.z = -0.24;
  scene.add(rightSlope);

  // Terracotta gable fascia trim
  const leftTrim = new THREE.Mesh(new THREE.BoxGeometry(3.55, 0.22, 0.18), MAT.terracotta);
  leftTrim.position.set(-1.5, 3.66, porticoZ + 0.35);
  leftTrim.rotation.z = 0.24;
  scene.add(leftTrim);

  const rightTrim = new THREE.Mesh(new THREE.BoxGeometry(3.55, 0.22, 0.18), MAT.terracotta);
  rightTrim.position.set(1.5, 3.66, porticoZ + 0.35);
  rightTrim.rotation.z = -0.24;
  scene.add(rightTrim);

  // Portico Blue Signboard ("AUTOMOBILE ENGG. DEPARTMENT" in Kannada & English per Photo 3)
  const autoSignTex = createSignboardTexture([
    'ಆಟೋಮೊಬೈಲ್ ಇಂಜಿನಿಯರಿಂಗ್ ವಿಭಾಗ',
    'AUTOMOBILE ENGG. DEPARTMENT'
  ], '#3874B8');
  const porticoSign = new THREE.Mesh(
    new THREE.BoxGeometry(4.6, 0.78, 0.1),
    new THREE.MeshStandardMaterial({ map: autoSignTex })
  );
  porticoSign.position.set(0, 2.95, porticoZ + 0.26);
  scene.add(porticoSign);

  // Decorative terracotta plant pots flanking the entrance (matching Reference UI)
  [-3.2, -2.5, 2.5, 3.2, 4.5, 5.8].forEach((px) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.18, 0.4, 10), MAT.terracotta);
    pot.position.set(px, 0.2, zFront + 0.9);
    scene.add(pot);
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshStandardMaterial({ color: 0x3E7B3B }));
    bush.position.set(px, 0.5, zFront + 0.9);
    scene.add(bush);
  });
}

// ============================================================================
// 6. CENTRAL SWITCHBACK STAIRCASE (EXACT MATCH TO PHOTO 1)
// ============================================================================
function buildCentralStaircase() {
  // Staircase sits inside Central Bay (X: -3.0m to +3.0m, Z: -5.5m to +1.8m)
  // Back & side enclosure walls of stairwell (Two-tone grey dado + cream upper per Photo 1)
  addTwoToneWall(6.0, DIM.floorHeight * 2, 0.25, 0, 0, -5.65, true);
  addTwoToneWall(0.25, DIM.floorHeight * 2, 8.2, -3.0, 0, -1.5, true);
  addTwoToneWall(0.25, DIM.floorHeight * 2, 8.2, 3.0, 0, -1.5, true);

  // Mid-Landing Slab at Y = 2.1m (Z: -5.5m to -3.3m, X: -2.85m to +2.85m)
  addBoxMesh(5.7, 0.22, 2.2, MAT.lowerGranite, 0, 2.1 - 0.11, -4.4, false);

  const numSteps = 10;
  const flightRun = 4.5; // Z: +1.2m to -3.3m
  const stepDepth = flightRun / numSteps; // 0.45m
  const stepRise = 2.1 / numSteps;        // 0.21m

  // 1. LOWER FLIGHT (Right/Left side depend on perspective; Photo 1 shows dark granite going down on right, light cement going up on left)
  // Let's place Flight 1 (Ground Y=0 -> Mid-landing Y=2.1m) on X: +0.15m to +2.75m (Dark Granite Treads)
  for (let i = 0; i < numSteps; i++) {
    const stepY = (i + 0.5) * stepRise;
    const stepZ = 1.2 - (i + 0.5) * stepDepth;
    addBoxMesh(2.5, stepRise, stepDepth, MAT.lowerGranite, 1.45, stepY, stepZ, false);
  }

  // 2. UPPER FLIGHT (Mid-landing Y=2.1m -> First Floor Y=4.2m) on X: -2.75m to -0.15m (Light Grey Cement Treads)
  for (let i = 0; i < numSteps; i++) {
    const stepY = 2.1 + (i + 0.5) * stepRise;
    const stepZ = -3.3 + (i + 0.5) * stepDepth;
    addBoxMesh(2.5, stepRise, stepDepth, MAT.upperCement, -1.45, stepY, stepZ, false);
  }

  // 3. Black Metal Balusters & Weathered White Wooden Handrail (Photo 1)
  function buildRailing(xPos, yStart, zStart, yEnd, zEnd) {
    const posts = 9;
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      const py = THREE.MathUtils.lerp(yStart, yEnd, t);
      const pz = THREE.MathUtils.lerp(zStart, zEnd, t);
      addBoxMesh(0.04, 0.92, 0.04, MAT.railingSteel, xPos, py + 0.46, pz, false);
    }
    const dy = yEnd - yStart;
    const dz = zEnd - zStart;
    const length = Math.hypot(dy, dz);
    const angle = Math.atan2(dy, dz);

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, length + 0.2), MAT.handrailWood);
    rail.position.set(xPos, (yStart + yEnd) / 2 + 0.94, (zStart + zEnd) / 2);
    rail.rotation.x = -angle;
    scene.add(rail);
  }

  buildRailing(0.22, 0.1, 1.2, 2.1, -3.3);
  buildRailing(-0.22, 2.1, -3.3, 4.2, 1.2);

  // Red safety instructions board & green Fire Exit sign on stairwell wall (Photo 1 right edge)
  addBoxMesh(0.04, 1.1, 0.75, new THREE.MeshStandardMaterial({ color: PALETTE.fireRed }), 2.84, 3.2, -1.2, false);
  addBoxMesh(0.04, 0.22, 0.35, new THREE.MeshStandardMaterial({ color: 0x15803D }), 2.84, 4.1, -2.0, false);
}

// ============================================================================
// 7. EIGHT ROOMS (4 GROUND, 4 FIRST FLOOR) + CORRIDOR FIXTURES & FURNITURE
// ============================================================================
function buildRoomsAndInteriors() {
  const zBack = -DIM.totalDepth / 2; // -5.8m
  const zPartition = 2.6;            // Corridor-to-room wall

  // Outer Back Wall & Side Gable Walls
  addBoxMesh(DIM.totalWidth, DIM.floorHeight * 2, 0.25, MAT.facadeCream, 0, DIM.floorHeight, zBack, true);
  addBoxMesh(0.25, DIM.floorHeight * 2, DIM.totalDepth, MAT.facadeCream, -DIM.totalWidth / 2, DIM.floorHeight, 0, true);
  addBoxMesh(0.25, DIM.floorHeight * 2, DIM.totalDepth, MAT.facadeCream, DIM.totalWidth / 2, DIM.floorHeight, 0, true);

  ROOM_MANIFEST.forEach((room) => {
    const floorY = room.floor * DIM.floorHeight;
    const centerX = (room.xMin + room.xMax) / 2;
    const centerZ = (zBack + zPartition) / 2; // -1.6m

    // 1. Room Floor Tile
    addBoxMesh(DIM.roomWidth - 0.3, 0.03, DIM.roomDepth - 0.3, MAT.roomTile, centerX, floorY + 0.02, centerZ, false);

    // 2. Interior Partition Wall between rooms (at X = -13m and X = +13m)
    if (room.xMax === -13.0 || room.xMax === 13.0) {
      addTwoToneWall(0.22, DIM.floorHeight - 0.25, DIM.roomDepth, room.xMax, floorY, centerZ, true);
    }

    // 3. Corridor Partition Wall with Doorway Opening + Sliding Glass Window
    const leftSegWidth = (room.doorX - DIM.doorWidth / 2) - room.xMin;
    const rightSegWidth = room.xMax - (room.doorX + DIM.doorWidth / 2);

    if (leftSegWidth > 0.1) {
      addTwoToneWall(leftSegWidth, DIM.floorHeight - 0.25, 0.24, room.xMin + leftSegWidth / 2, floorY, zPartition, true);
    }
    if (rightSegWidth > 0.1) {
      addTwoToneWall(rightSegWidth, DIM.floorHeight - 0.25, 0.24, room.doorX + DIM.doorWidth / 2 + rightSegWidth / 2, floorY, zPartition, true);
    }
    // Header above doorway
    const headerH = (DIM.floorHeight - 0.25) - DIM.doorHeight;
    addBoxMesh(DIM.doorWidth, headerH, 0.24, MAT.interiorUpper, room.doorX, floorY + DIM.doorHeight + headerH / 2, zPartition, false);

    // 4. Interactive Hinged Wooden Door + Green Room Nameplate above door
    const doorPivot = new THREE.Group();
    doorPivot.position.set(room.doorX - DIM.doorWidth / 2, floorY, zPartition);
    const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(DIM.doorWidth, DIM.doorHeight, 0.06), MAT.doorWood);
    doorPanel.position.set(DIM.doorWidth / 2, DIM.doorHeight / 2, 0);
    doorPanel.castShadow = true;
    doorPivot.add(doorPanel);
    scene.add(doorPivot);

    // Start doors slightly open (25 deg) for effortless exploration, toggleable via [E]
    doorPivot.rotation.y = -0.55;
    interactiveDoors.push({
      pivot: doorPivot,
      mesh: doorPanel,
      isOpen: true,
      pos: new THREE.Vector3(room.doorX, floorY + 1.2, zPartition),
      roomName: room.name
    });

    // Green/White Room Signboard above door
    const roomSignTex = createSignboardTexture([room.code, room.name], '#14532D', '#FFFFFF');
    const roomSign = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.42, 0.05),
      new THREE.MeshStandardMaterial({ map: roomSignTex })
    );
    roomSign.position.set(room.doorX, floorY + DIM.doorHeight + 0.35, zPartition + 0.15);
    scene.add(roomSign);

    // 5. Aluminum-Framed Corridor Window (Photo 2 right wall)
    const winX = centerX + 1.4;
    addBoxMesh(2.2, 1.35, 0.28, MAT.aluminum, winX, floorY + 1.95, zPartition, false);
    addBoxMesh(2.05, 1.2, 0.3, MAT.glass, winX, floorY + 1.95, zPartition, false);

    // 6. Corridor Shoe Rack Cubbies outside Labs/Classrooms (Photo 2 right wall)
    const rackX = centerX + 1.4;
    const rackZ = zPartition + 0.35;
    addBoxMesh(2.4, 0.78, 0.42, MAT.shoeRackWood, rackX, floorY + 0.44, rackZ, true);

    // 7. Wall-Mounted Red Fire Extinguisher (Photo 2)
    const ext = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.48, 10), new THREE.MeshStandardMaterial({ color: PALETTE.fireRed }));
    ext.position.set(room.doorX + 0.95, floorY + 1.4, zPartition + 0.18);
    scene.add(ext);

    // 8. Modular Room Interior Furnishings (Labs vs Classrooms)
    populateRoomInterior(room, floorY, centerX, centerZ);
  });
}

function populateRoomInterior(room, floorY, centerX, centerZ) {
  // Ceiling LED Tube Lights
  const roomLight = new THREE.PointLight(0xFFFBEB, 0.85, 11);
  roomLight.position.set(centerX, floorY + 3.6, centerZ);
  scene.add(roomLight);

  // Blackboard / Smart Display on Side/Back Wall
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 1.5, 0.08),
    new THREE.MeshStandardMaterial({ color: room.type === 'lab' ? 0x0F172A : 0x1E3A2F, roughness: 0.3 })
  );
  board.position.set(centerX, floorY + 2.1, -5.55);
  scene.add(board);

  // Podium / Instructor Desk
  addBoxMesh(1.4, 0.8, 0.7, MAT.shoeRackWood, centerX - 2.8, floorY + 0.4, -4.2, true);

  // Student Desks / Computer Workstations (2 rows x 3 columns)
  const deskMat = new THREE.MeshStandardMaterial({ color: 0xC89D66, roughness: 0.6 });
  const monitorMat = new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.3 });

  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const dx = centerX - 2.6 + col * 2.6;
      const dz = -2.2 + row * 2.3;
      addBoxMesh(1.8, 0.75, 0.7, deskMat, dx, floorY + 0.375, dz, true);

      if (room.type === 'lab') {
        // Dual Monitors on Lab Desks
        addBoxMesh(0.52, 0.36, 0.05, monitorMat, dx - 0.42, floorY + 0.95, dz - 0.15, false);
        addBoxMesh(0.52, 0.36, 0.05, monitorMat, dx + 0.42, floorY + 0.95, dz - 0.15, false);
      }
    }
  }
}

function buildRooftopSolarAndPenthouse() {
  const roofY = DIM.floorHeight * 2 + 0.3;

  // Central Staircase Penthouse Headroom Tower (Seen in Photo 3 & Reference UI)
  addBoxMesh(6.2, 2.8, 5.5, MAT.facadeCream, 0, roofY + 1.4, -2.5, false);

  // Rooftop Solar Panel Arrays on Left & Right Wings (Photo 3 & Reference UI)
  const solarMat = new THREE.MeshStandardMaterial({ color: 0x1E3A5F, metalness: 0.6, roughness: 0.25 });
  [-16, -11, 7, 12, 17].forEach((sx) => {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.1, 2.2), solarMat);
    panel.position.set(sx, roofY + 0.55, 2.8);
    panel.rotation.x = 0.28;
    scene.add(panel);
  });
}

// Build complete architectural scene
buildCampusGround();
buildSlabsAndCorridors();
buildFrontElevationAndParapets();
buildEntrancePortico();
buildCentralStaircase();
buildRoomsAndInteriors();
buildRooftopSolarAndPenthouse();

// ============================================================================
// 8. PLAYER AVATAR, 1P/3P CAMERA, COLLISION & STAIR TRAVERSAL ENGINE
// ============================================================================
const player = {
  pos: new THREE.Vector3(0, 0, 12.5),
  vel: new THREE.Vector3(),
  yaw: 0,
  pitch: -0.08,
  speed: 5.5,
  sprintMultiplier: 1.65,
  radius: 0.38,
  thirdPerson: true,
  orbitMode: false
};

// Stylized Player Avatar for 3rd-Person Mode
const avatarGroup = new THREE.Group();
const bodyMesh = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.28, 0.85, 8, 16),
  new THREE.MeshStandardMaterial({ color: 0x3B82F6, roughness: 0.4 })
);
bodyMesh.position.y = 0.72;
bodyMesh.castShadow = true;
avatarGroup.add(bodyMesh);

const headMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.22, 16, 16),
  new THREE.MeshStandardMaterial({ color: 0xFDE68A, roughness: 0.5 })
);
headMesh.position.y = 1.45;
avatarGroup.add(headMesh);
scene.add(avatarGroup);

// Keyboard & Mouse Input
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyV') toggleViewMode();
  if (e.code === 'KeyE') interactNearestDoor();
  if (e.code === 'KeyC') toggleCutaway();
  if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].includes(e.code)) {
    teleportToZone(Number(e.code.replace('Digit', '')));
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

let isDraggingLook = false;
let prevMouse = { x: 0, y: 0 };
renderer.domElement.addEventListener('mousedown', (e) => {
  if (player.orbitMode) return;
  isDraggingLook = true;
  prevMouse = { x: e.clientX, y: e.clientY };
});
window.addEventListener('mouseup', () => { isDraggingLook = false; });
window.addEventListener('mousemove', (e) => {
  if (!isDraggingLook || player.orbitMode) return;
  const dx = e.clientX - prevMouse.x;
  const dy = e.clientY - prevMouse.y;
  prevMouse = { x: e.clientX, y: e.clientY };
  player.yaw -= dx * 0.0045;
  player.pitch = THREE.MathUtils.clamp(player.pitch - dy * 0.0035, -0.85, 0.85);
});

// Mobile Virtual Joystick
const joyZone = document.getElementById('joystick-zone');
const joyKnob = document.getElementById('joystick-knob');
let joyVec = { x: 0, y: 0 };

joyZone.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = joyZone.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const maxR = 36;
  let dx = touch.clientX - cx;
  let dy = touch.clientY - cy;
  const dist = Math.hypot(dx, dy);
  if (dist > maxR) {
    dx = (dx / dist) * maxR;
    dy = (dy / dist) * maxR;
  }
  joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  joyVec.x = dx / maxR;
  joyVec.y = dy / maxR;
});
joyZone.addEventListener('touchend', () => {
  joyKnob.style.transform = 'translate(0px, 0px)';
  joyVec = { x: 0, y: 0 };
});

// Exact Elevation & Switchback Staircase Heightfield Solver
function computeTargetFloorHeight(x, z, currentY) {
  // 1. Inside Central Stair Bay (X: -2.85m to +2.85m)
  if (x >= -2.85 && x <= 2.85) {
    // Mid-landing (Z: -5.6m to -3.3m)
    if (z >= -5.6 && z <= -3.3 && currentY >= 1.1 && currentY <= 3.2) {
      return 2.1;
    }
    // Lower Flight (Right side X >= 0, Z: -3.3m to +1.2m) -> Ground (0m) to Mid-Landing (2.1m)
    if (x >= 0.0 && z >= -3.3 && z <= 1.2 && currentY < 2.6) {
      const t = (1.2 - z) / (1.2 - (-3.3));
      return THREE.MathUtils.clamp(t, 0, 1) * 2.1;
    }
    // Upper Flight (Left side X < 0, Z: -3.3m to +1.2m) -> Mid-Landing (2.1m) to First Floor (4.2m)
    if (x < 0.0 && z >= -3.3 && z <= 1.2 && currentY >= 1.5) {
      const t = (z - (-3.3)) / (1.2 - (-3.3));
      return 2.1 + THREE.MathUtils.clamp(t, 0, 1) * 2.1;
    }
  }

  // 2. Standard Ground vs First Floor Slab retention
  return currentY >= 2.95 ? DIM.floorHeight : 0.0;
}

function checkHorizontalCollision(nextX, nextZ, y) {
  const playerBox = new THREE.Box3(
    new THREE.Vector3(nextX - player.radius, y + 0.35, nextZ - player.radius),
    new THREE.Vector3(nextX + player.radius, y + 1.65, nextZ + player.radius)
  );
  for (const box of wallColliders) {
    if (playerBox.intersectsBox(box)) return true;
  }
  return false;
}

// Door Interaction
const toastEl = document.getElementById('interaction-toast');
function interactNearestDoor() {
  let nearest = null;
  let minDist = 2.8;
  for (const d of interactiveDoors) {
    const dist = d.pos.distanceTo(player.pos);
    if (dist < minDist) {
      minDist = dist;
      nearest = d;
    }
  }
  if (nearest) {
    nearest.isOpen = !nearest.isOpen;
    nearest.pivot.rotation.y = nearest.isOpen ? -1.45 : 0;
  }
}

// ============================================================================
// 9. UI CONTROLS, ZONE TELEPORTATION & HUD TELEMETRY
// ============================================================================
function teleportToZone(zoneId) {
  const z = TELEPORT_ZONES[zoneId];
  if (!z) return;

  document.querySelectorAll('.zone-btn').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.zone) === zoneId);
  });

  if (z.orbit) {
    setOrbitMode(true);
    camera.position.set(16, 13, 28);
    orbitControls.target.set(0, 3.5, 0);
  } else {
    setOrbitMode(false);
    player.pos.set(z.pos[0], z.pos[1], z.pos[2]);
    player.yaw = z.yaw;
  }
}

function setOrbitMode(enabled) {
  player.orbitMode = enabled;
  orbitControls.enabled = enabled;
  const btn = document.getElementById('btn-orbit');
  btn.classList.toggle('active', enabled);
  document.getElementById('mode-title').textContent = enabled
    ? '🛰️ Exterior Orbit Inspection Mode'
    : '🚶 Interactive Walkthrough Mode';
}

function toggleViewMode() {
  player.thirdPerson = !player.thirdPerson;
  avatarGroup.visible = player.thirdPerson;
  document.getElementById('btn-view-mode').textContent = player.thirdPerson
    ? '🚶 View: 3rd Person'
    : '👁️ View: 1st Person';
}

let isCutaway = false;
function toggleCutaway() {
  isCutaway = !isCutaway;
  cutawayMeshes.forEach((m) => { m.visible = !isCutaway; });
  const btn = document.getElementById('btn-cutaway');
  btn.textContent = isCutaway ? '🏛️ Front Cutaway: On' : '🏛️ Front Cutaway: Off';
  btn.classList.toggle('active', isCutaway);
}

// Bind HUD Buttons
document.querySelectorAll('.zone-btn').forEach((btn) => {
  btn.addEventListener('click', () => teleportToZone(Number(btn.dataset.zone)));
});
document.getElementById('btn-view-mode').addEventListener('click', toggleViewMode);
document.getElementById('btn-cutaway').addEventListener('click', toggleCutaway);
document.getElementById('btn-orbit').addEventListener('click', () => setOrbitMode(!player.orbitMode));
document.getElementById('btn-lighting').addEventListener('click', (e) => {
  isGoldenHour = !isGoldenHour;
  applyLightingPreset(isGoldenHour);
  e.currentTarget.textContent = isGoldenHour ? '🌅 Golden Hour' : '☀️ Daylight';
});
document.getElementById('btn-reset-pos').addEventListener('click', () => teleportToZone(2));
document.getElementById('btn-mobile-door').addEventListener('click', interactNearestDoor);
document.getElementById('btn-mobile-view').addEventListener('click', toggleViewMode);

// Update Zone & Elevation Telemetry
const roomInd = document.getElementById('room-indicator');
const elevInd = document.getElementById('elevation-indicator');

function updateHUDTelemetry() {
  const floorLabel = player.pos.y >= 3.8 ? '1st Floor' : player.pos.y > 0.3 ? 'Staircase' : 'Ground';
  elevInd.textContent = `Elev: ${player.pos.y.toFixed(1)}m (${floorLabel})`;

  let currentZone = 'Campus Exterior';
  if (player.pos.z <= 5.8 && player.pos.z >= -5.8 && Math.abs(player.pos.x) <= 23) {
    if (player.pos.z > 2.6) {
      currentZone = player.pos.y >= 3.8 ? '1st Floor Corridor' : 'Ground Floor Corridor';
    } else if (Math.abs(player.pos.x) <= 3.0) {
      currentZone = 'Central Switchback Staircase';
    } else {
      const floorIdx = player.pos.y >= 3.0 ? 1 : 0;
      const match = ROOM_MANIFEST.find(
        (r) => r.floor === floorIdx && player.pos.x >= r.xMin && player.pos.x <= r.xMax
      );
      if (match) currentZone = `${match.code}: ${match.name}`;
    }
  }
  roomInd.textContent = `Zone: ${currentZone}`;

  // Door proximity prompt
  const nearDoor = interactiveDoors.find((d) => d.pos.distanceTo(player.pos) < 2.4);
  toastEl.style.opacity = nearDoor ? '1' : '0';
  if (nearDoor) {
    toastEl.textContent = `Press [E] to ${nearDoor.isOpen ? 'Close' : 'Open'} ${nearDoor.roomName}`;
  }
}

// ============================================================================
// 10. MAIN RENDER & PHYSICS LOOP
// ============================================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  if (player.orbitMode) {
    orbitControls.update();
  } else {
    // Movement Input Vector
    let moveForward = 0;
    let moveRight = 0;
    if (keys['KeyW'] || keys['ArrowUp']) moveForward += 1;
    if (keys['KeyS'] || keys['ArrowDown']) moveForward -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) moveRight += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) moveRight -= 1;

    if (Math.abs(joyVec.x) > 0.05 || Math.abs(joyVec.y) > 0.05) {
      moveForward -= joyVec.y;
      moveRight += joyVec.x;
    }

    const len = Math.hypot(moveForward, moveRight);
    if (len > 0) {
      moveForward /= len;
      moveRight /= len;

      const speed = player.speed * (keys['ShiftLeft'] || keys['ShiftRight'] ? player.sprintMultiplier : 1.0);
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);

      const dx = (-sin * moveForward + cos * moveRight) * speed * dt;
      const dz = (-cos * moveForward - sin * moveRight) * speed * dt;

      // Sliding X / Z Axis Collision Resolution
      if (!checkHorizontalCollision(player.pos.x + dx, player.pos.z, player.pos.y)) {
        player.pos.x += dx;
      }
      if (!checkHorizontalCollision(player.pos.x, player.pos.z + dz, player.pos.y)) {
        player.pos.z += dz;
      }
    }

    // Smooth Vertical Stair & Floor Elevation Tracking
    const targetY = computeTargetFloorHeight(player.pos.x, player.pos.z, player.pos.y);
    player.pos.y = THREE.MathUtils.lerp(player.pos.y, targetY, 0.25);

    // Update Avatar Transform
    avatarGroup.position.copy(player.pos);
    avatarGroup.rotation.y = player.yaw;

    // Update Camera (1st-Person vs 3rd-Person)
    const eyePos = new THREE.Vector3(player.pos.x, player.pos.y + 1.62, player.pos.z);
    const lookDir = new THREE.Vector3(
      -Math.sin(player.yaw) * Math.cos(player.pitch),
      Math.sin(player.pitch),
      -Math.cos(player.yaw) * Math.cos(player.pitch)
    );

    if (player.thirdPerson) {
      const camOffset = lookDir.clone().multiplyScalar(-3.4);
      camOffset.y += 0.65;
      camera.position.copy(eyePos).add(camOffset);
      camera.lookAt(eyePos.clone().add(lookDir.clone().multiplyScalar(4.0)));
    } else {
      camera.position.copy(eyePos);
      camera.lookAt(eyePos.clone().add(lookDir));
    }
  }

  updateHUDTelemetry();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();

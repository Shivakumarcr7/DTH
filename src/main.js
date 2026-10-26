// src/main.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  onSnapshot
} from 'firebase/firestore';

import {
  FIREBASE_CONFIG,
  BUILDING_DIMENSIONS as DIM,
  PALETTE,
  CAMPUS_BUILDINGS,
  FOOTBALL_FIELD_CONFIG,
  LOCAL_FLOOR_ROOMS,
  TELEPORT_ZONES,
  QUEST_RULES,
  PUBLIC_FLAG_MANIFEST,
  REGISTERED_TEAMS
} from './config/buildingConfig.js';

// ============================================================================
// 1. FIREBASE CLOUD SERVICE (WITH OFFLINE / LOCAL FALLBACK)
// ============================================================================
const DEV_PINS = Object.freeze({
  'FLAG-01': '0047',
  'FLAG-02': '1962',
  'FLAG-03': '3084',
  'FLAG-04': '7410',
  'FLAG-05': '9526'
});

class FirebaseGameService {
  constructor() {
    this.connected = false;
    this.decoyCooldowns = new Map();
    try {
      this.app = initializeApp(FIREBASE_CONFIG);
      this.db = getFirestore(this.app);
      this.connected = true;
    } catch (err) {
      console.warn('Firebase init error:', err);
    }
    this._ensureTeamsSeeded();
  }

  async _ensureTeamsSeeded() {
    if (!this.connected) return;
    const now = Date.now();
    const waypoints = [
      [0, 0, 12.5], [-16.0, 0, 4.1], [-66.0, 0, 12.5], [66.0, 0, 12.5],
      [22.0, 0, 52.0], [-1.4, 2.1, -4.2], [-66.0, 4.2, 4.2], [66.0, 4.2, 4.2],
      [7.5, 4.2, 4.2], [-66.0, 8.4, 4.2], [0.0, 4.2, 4.0], [18.0, 0, 64.0]
    ];

    for (let i = 0; i < REGISTERED_TEAMS.length; i++) {
      const t = REGISTERED_TEAMS[i];
      const wp = waypoints[i % waypoints.length];
      const ref = doc(this.db, 'teams', t.teamId);
      try {
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, {
            teamId: t.teamId,
            teamName: t.teamName,
            color: t.color,
            shirtColor: t.shirtColor,
            flagsCollected: 0,
            collectedFlagIds: [],
            collectionTimestamps: {},
            penaltySeconds: 0,
            penaltyActiveUntil: 0,
            startedAt: now,
            completedAt: null,
            status: 'IN_PROGRESS',
            position: { x: wp[0], y: wp[1], z: wp[2], yaw: 0, anim: 'IDLE' },
            lastUpdatedAt: now
          });
        }
      } catch {
        // Ignore seed error if rules restrict creation
      }
    }
  }

  subscribeTeam(teamId, cb) {
    if (!this.connected) return () => {};
    const ref = doc(this.db, 'teams', teamId);
    return onSnapshot(ref, (snap) => {
      if (snap.exists()) cb(snap.data());
    });
  }

  subscribeSpectator(cb) {
    if (!this.connected) return () => {};
    const colRef = collection(this.db, 'teams');
    return onSnapshot(colRef, (snap) => {
      const list = [];
      const now = Date.now();
      snap.forEach((d) => {
        const t = d.data();
        const endRef = t.completedAt || now;
        const rawSec = Math.max(0, Math.floor((endRef - (t.startedAt || now)) / 1000));
        const effSec = rawSec + (t.penaltySeconds || 0);
        list.push({
          teamId: t.teamId,
          teamName: t.teamName,
          flagsCollected: t.flagsCollected || 0,
          penaltySeconds: t.penaltySeconds || 0,
          status: t.status || 'IN_PROGRESS',
          rawSec,
          effSec,
          position: t.position || { x: 0, y: 0, z: 12, yaw: 0 }
        });
      });
      list.sort((a, b) => (b.flagsCollected !== a.flagsCollected)
        ? (b.flagsCollected - a.flagsCollected)
        : (a.effSec - b.effSec));
      cb(list);
    });
  }

  async updatePosition(teamId, x, y, z, yaw, anim) {
    if (!this.connected) return;
    try {
      await updateDoc(doc(this.db, 'teams', teamId), {
        position: {
          x: Number(x.toFixed(2)),
          y: Number(y.toFixed(2)),
          z: Number(z.toFixed(2)),
          yaw: Number(yaw.toFixed(2)),
          anim
        },
        lastUpdatedAt: Date.now()
      });
    } catch {}
  }

  async validateAndCollect(teamId, flagId, rawPin) {
    const pin = typeof rawPin === 'string' ? rawPin.trim() : '';
    if (!/^\d{4}$/.test(pin)) {
      return { ok: false, message: 'Enter an exact 4-digit numeric code (e.g., 0047).' };
    }
    if (DEV_PINS[flagId] !== pin) {
      return { ok: false, message: 'Access Denied: Incorrect 4-digit PIN.' };
    }
    try {
      const ref = doc(this.db, 'teams', teamId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return { ok: false, message: 'Team record not found.' };
      const data = snap.data();
      if (data.status === 'COMPLETED') return { ok: false, message: 'Run already locked.' };
      if (data.collectedFlagIds?.includes(flagId)) {
        return { ok: false, message: 'Flag already in your backpack.' };
      }
      const now = Date.now();
      const updated = [...(data.collectedFlagIds || []), flagId];
      await updateDoc(ref, {
        collectedFlagIds: updated,
        flagsCollected: updated.length,
        collectionTimestamps: { ...(data.collectionTimestamps || {}), [flagId]: now },
        lastUpdatedAt: now
      });
      return { ok: true, flagsCollected: updated.length, message: `Unlocked! Added to backpack (${updated.length}/5).` };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  async applyDecoy(teamId, decoyFlagId) {
    const now = Date.now();
    const key = `${teamId}:${decoyFlagId}`;
    if (now - (this.decoyCooldowns.get(key) || 0) < 8000) {
      return { ok: false, message: 'Decoy cooldown active.' };
    }
    this.decoyCooldowns.set(key, now);
    try {
      const ref = doc(this.db, 'teams', teamId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return { ok: false, message: 'Team not found.' };
      const data = snap.data();
      const pen = QUEST_RULES.decoyPenaltySeconds;
      const totalPen = (data.penaltySeconds || 0) + pen;
      const base = Math.max(now, data.penaltyActiveUntil || 0);
      await updateDoc(ref, {
        penaltySeconds: totalPen,
        penaltyActiveUntil: base + pen * 1000,
        lastUpdatedAt: now
      });
      return { ok: true, message: `DECOY TRAP! +${pen}s penalty applied to ${data.teamName}.` };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  async submitRun(teamId) {
    try {
      const ref = doc(this.db, 'teams', teamId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return { ok: false, message: 'Team not found.' };
      const data = snap.data();
      if (data.status === 'COMPLETED') return { ok: true, message: 'Run already finalized.' };
      if ((data.flagsCollected || 0) < 5) return { ok: false, message: 'Collect all 5 flags first.' };
      await updateDoc(ref, { completedAt: Date.now(), status: 'COMPLETED', lastUpdatedAt: Date.now() });
      return { ok: true, message: 'Congratulations! 5/5 Run Finalized & Locked.' };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }
}

const gameService = new FirebaseGameService();

// ============================================================================
// 2. SCENE, RENDERER & CAMERAS
// ============================================================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
container.appendChild(renderer.domElement);

const playerCamera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 450);

// Wide Campus Orthographic Spectator Camera
const orthoSize = 95;
const aspect = window.innerWidth / window.innerHeight;
const spectatorCamera = new THREE.OrthographicCamera(
  -orthoSize * aspect, orthoSize * aspect, orthoSize, -orthoSize, 1, 260
);
spectatorCamera.position.set(0, 140, 25);
spectatorCamera.up.set(0, 0, -1);
spectatorCamera.lookAt(0, 0, 25);

const orbitControls = new OrbitControls(playerCamera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.06;
orbitControls.maxPolarAngle = Math.PI / 2 - 0.02;
orbitControls.enabled = false;

const ambientLight = new THREE.HemisphereLight(0xFFFDF9, 0x6B7280, 0.95);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xFFF3D6, 2.3);
sunLight.position.set(45, 75, 55);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
const d = 115;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
sunLight.shadow.camera.far = 260;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);

let isDaylight = true;
function applyLightingPreset(day) {
  scene.background = new THREE.Color(day ? 0x7EC8E3 : 0xE89D54);
  scene.fog = new THREE.FogExp2(day ? 0x7EC8E3 : 0xE89D54, 0.0022);
  sunLight.color.setHex(day ? 0xFFF9E6 : 0xFFD29D);
}
applyLightingPreset(true);

// ============================================================================
// 3. PROCEDURAL TEXTURES (EXACT MATCH TO REFERENCE IMAGE 2)
// ============================================================================
function createCreamGridPlasterTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#F3EFE0';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(180, 170, 150, 0.28)';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(16, 4);
  return t;
}

function createTileTexture(baseHex, tileHex, repsX, repsY) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = tileHex;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      ctx.fillRect(x * 64 + 2, y * 64 + 2, 60, 60);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repsX, repsY);
  return t;
}

function createSignTexture(lines, bg = '#1D5B9E') {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 320;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#F8FAFC';
  ctx.lineWidth = 14;
  ctx.strokeRect(10, 10, c.width - 20, c.height - 20);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => {
    ctx.font = i === 0 ? 'bold 42px Arial, sans-serif' : 'bold 30px Arial, sans-serif';
    ctx.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * 64);
  });
  return new THREE.CanvasTexture(c);
}

function createFootballPitchTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 640;
  const ctx = c.getContext('2d');

  // Alternating mown artificial turf stripes
  const stripes = 16;
  const sw = c.width / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#2E7D32' : '#388E3C';
    ctx.fillRect(i * sw, 0, sw, c.height);
  }

  // White pitch markings
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 8;
  const pad = 40;
  const pw = c.width - pad * 2;
  const ph = c.height - pad * 2;

  // Outer touchline & goal lines
  ctx.strokeRect(pad, pad, pw, ph);

  // Halfway line & Center circle
  ctx.beginPath();
  ctx.moveTo(c.width / 2, pad);
  ctx.lineTo(c.width / 2, c.height - pad);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(c.width / 2, c.height / 2, 78, 0, Math.PI * 2);
  ctx.stroke();

  // Left & Right Penalty Boxes
  ctx.strokeRect(pad, c.height / 2 - 140, 135, 280);
  ctx.strokeRect(c.width - pad - 135, c.height / 2 - 140, 135, 280);

  // Goal areas
  ctx.strokeRect(pad, c.height / 2 - 68, 52, 136);
  ctx.strokeRect(c.width - pad - 52, c.height / 2 - 68, 52, 136);

  return new THREE.CanvasTexture(c);
}

const MAT = {
  facadeCream: new THREE.MeshStandardMaterial({ map: createCreamGridPlasterTexture(), roughness: 0.8 }),
  interiorUpper: new THREE.MeshStandardMaterial({ color: PALETTE.interiorUpper, roughness: 0.85 }),
  interiorDado: new THREE.MeshStandardMaterial({ color: PALETTE.interiorDado, roughness: 0.65 }),
  corridorTile: new THREE.MeshStandardMaterial({ map: createTileTexture('#6A524A', '#7A6056', 22, 6), roughness: 0.35 }),
  drivewayTile: new THREE.MeshStandardMaterial({ map: createTileTexture('#DCD6C8', '#EAE4D7', 8, 16), roughness: 0.6 }),
  roomTile: new THREE.MeshStandardMaterial({ map: createTileTexture('#C5C2BA', '#E2E0D8', 5, 4), roughness: 0.3 }),
  lowerGranite: new THREE.MeshStandardMaterial({ color: PALETTE.lowerStairGranite, roughness: 0.25 }),
  upperCement: new THREE.MeshStandardMaterial({ color: PALETTE.upperStairCement, roughness: 0.6 }),
  railingSteel: new THREE.MeshStandardMaterial({ color: PALETTE.railingSteel, roughness: 0.4, metalness: 0.7 }),
  porticoPillar: new THREE.MeshStandardMaterial({ color: 0x16181A, roughness: 0.3, metalness: 0.2 }),
  woodDoor: new THREE.MeshStandardMaterial({ color: PALETTE.woodDoor, roughness: 0.5 }),
  shoeRackWood: new THREE.MeshStandardMaterial({ color: PALETTE.shoeRackWood, roughness: 0.4 }),
  solarPanel: new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.65, roughness: 0.25 }),
  fireRed: new THREE.MeshStandardMaterial({ color: PALETTE.fireRed, roughness: 0.3 }),
  roadAsphalt: new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.9 })
};

const wallColliders = [];
const wallMeshesForOcclusion = [];
const interactiveDoors = [];
const cutawayMeshes = [];
const roofMeshesForSpectator = [];

function addBoxMesh(w, h, d, mat, x, y, z, collide = true, isCutaway = false, isRoof = false) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  if (collide) {
    wallColliders.push(new THREE.Box3().setFromObject(mesh));
    wallMeshesForOcclusion.push(mesh);
  }
  if (isCutaway) cutawayMeshes.push(mesh);
  if (isRoof) roofMeshesForSpectator.push(mesh);
  return mesh;
}

function addTwoToneWall(w, h, d, x, floorY, z, collide = true, isCutaway = false) {
  const dadoH = Math.min(DIM.dadoHeight, h);
  const upperH = h - dadoH;
  addBoxMesh(w, dadoH, d, MAT.interiorDado, x, floorY + dadoH / 2, z, collide, isCutaway);
  if (upperH > 0.01) {
    addBoxMesh(w, upperH, d, MAT.interiorUpper, x, floorY + dadoH + upperH / 2, z, collide, isCutaway);
  }
}

// ============================================================================
// 4. MULTI-BUILDING GENERATOR (MATCHES REFERENCE IMAGE 2 + CRC 3F + GBL 2F)
// ============================================================================
function buildDepartmentBuilding(bCfg) {
  const ox = bCfg.offsetX;
  const oz = bCfg.offsetZ;
  const numFloors = bCfg.floors;
  const totalH = numFloors * DIM.floorHeight;
  const zFront = oz + DIM.totalDepth / 2; // +5.8m local
  const zBack = oz - DIM.totalDepth / 2;  // -5.8m local
  const zPart = oz + 2.6;

  const trimMat = new THREE.MeshStandardMaterial({ color: bCfg.trimColor, roughness: 0.7 });

  // 1. Paved Driveway with Trim Curbs leading to the Portico (Matches Reference Image 2)
  addBoxMesh(6.4, 0.08, 22, MAT.drivewayTile, ox, 0.02, zFront + 12.0, false);
  addBoxMesh(0.32, 0.14, 22, trimMat, ox - 3.2, 0.05, zFront + 12.0, false);
  addBoxMesh(0.32, 0.14, 22, trimMat, ox + 3.2, 0.05, zFront + 12.0, false);

  // 2. Floor Slabs & Vitrified Corridor Tiles for each floor
  addBoxMesh(DIM.totalWidth, 0.25, DIM.totalDepth, MAT.facadeCream, ox, -0.125, oz, false);

  for (let f = 0; f < numFloors; f++) {
    const fY = f * DIM.floorHeight;
    if (f > 0) {
      // Left & Right Wing Slabs + Central Corridor Bridge (leaving stairwell open)
      addBoxMesh(20.0, 0.26, DIM.totalDepth, MAT.facadeCream, ox - 13.0, fY - 0.13, oz, false);
      addBoxMesh(20.0, 0.26, DIM.totalDepth, MAT.facadeCream, ox + 13.0, fY - 0.13, oz, false);
      addBoxMesh(6.0, 0.26, 4.0, MAT.facadeCream, ox, fY - 0.13, oz + 3.8, false);
    }

    // Corridor Tile Overlay
    addBoxMesh(DIM.totalWidth - 0.4, 0.03, DIM.corridorDepth, MAT.corridorTile, ox, fY + 0.015, oz + 4.2, false);

    // Front Parapet Wall
    if (f === 0) {
      // Ground floor leaves central portico entrance open
      addBoxMesh(20.4, DIM.parapetHeight, 0.25, MAT.facadeCream, ox - 12.8, fY + DIM.parapetHeight / 2, zFront, true, true);
      addBoxMesh(20.4, DIM.parapetHeight, 0.25, MAT.facadeCream, ox + 12.8, fY + DIM.parapetHeight / 2, zFront, true, true);
    } else {
      addBoxMesh(DIM.totalWidth, DIM.parapetHeight, 0.25, MAT.facadeCream, ox, fY + DIM.parapetHeight / 2, zFront, true, true);
    }

    // Deep Upper Cream Spandrel Wall Band above corridor openings (Critical detail from Reference Image 2!)
    const spandrelH = f === numFloors - 1 ? 1.55 : 1.35;
    addBoxMesh(DIM.totalWidth, spandrelH, 0.25, MAT.facadeCream, ox, (f + 1) * DIM.floorHeight - spandrelH / 2, zFront, false, true);

    // Horizontal Trim Bands (Parapet Top Band & Floor Slab Band — Matches Reference Image 2)
    addBoxMesh(DIM.totalWidth + 0.4, 0.18, 0.12, trimMat, ox, fY + DIM.parapetHeight, zFront + 0.15, false, true);
    addBoxMesh(DIM.totalWidth + 0.5, 0.22, 0.14, trimMat, ox, (f + 1) * DIM.floorHeight, zFront + 0.16, false, true);
  }

  // Roof Slab
  addBoxMesh(DIM.totalWidth + 0.6, 0.3, DIM.totalDepth + 0.6, MAT.facadeCream, ox, totalH + 0.15, oz, false, false, true);
  addBoxMesh(DIM.totalWidth + 0.8, 0.26, 0.16, trimMat, ox, totalH + 0.25, zFront + 0.18, false, false, true);

  // 3. Vertical Structural Columns & Intermediate Mullions with Trim Strips (Matches Reference Image 2)
  [-23.0, -13.0, -3.0, 3.0, 13.0, 23.0].forEach((cx) => {
    addBoxMesh(0.48, totalH, 0.45, MAT.facadeCream, ox + cx, totalH / 2, zFront - 0.05, true);
    addBoxMesh(0.24, totalH + 0.3, 0.1, trimMat, ox + cx, totalH / 2, zFront + 0.18, false);
  });

  // Intermediate Window Mullions (Creates the exact 2-opening-per-bay rhythm in Reference Image 2)
  [-18.0, -8.0, 8.0, 18.0].forEach((mx) => {
    addBoxMesh(0.32, totalH, 0.28, MAT.facadeCream, ox + mx, totalH / 2, zFront, false, true);
    addBoxMesh(0.16, totalH + 0.3, 0.08, trimMat, ox + mx, totalH / 2, zFront + 0.16, false, true);
  });

  // 4. Top Center Signboard & Lower Right Wing Signboard (Matches Reference Image 2)
  const mainSign = new THREE.Mesh(
    new THREE.BoxGeometry(5.8, 1.48, 0.12),
    new THREE.MeshStandardMaterial({ map: createSignTexture(bCfg.signLines) })
  );
  mainSign.position.set(ox, totalH - 0.76, zFront + 0.24);
  scene.add(mainSign);

  const subSign = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 1.15, 0.1),
    new THREE.MeshStandardMaterial({ map: createSignTexture(bCfg.subSignLines) })
  );
  subSign.position.set(ox + 8.0, 2.25, zFront + 0.24);
  scene.add(subSign);

  // 5. Gabled Entrance Portico with Black Pillars & Pitched Roof Trim (Matches Reference Image 2)
  const porticoZ = zFront + 2.2;
  addBoxMesh(6.2, 0.18, 4.6, MAT.corridorTile, ox, 0.09, zFront + 2.1, false);
  addBoxMesh(0.46, 3.25, 0.46, MAT.porticoPillar, ox - 2.4, 1.62, porticoZ, true);
  addBoxMesh(0.46, 3.25, 0.46, MAT.porticoPillar, ox + 2.4, 1.62, porticoZ, true);

  // Pitched Gable Roof Slopes
  const leftSlope = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.18, 4.8), MAT.facadeCream);
  leftSlope.position.set(ox - 1.55, 3.65, zFront + 2.1);
  leftSlope.rotation.z = 0.24;
  leftSlope.castShadow = true;
  scene.add(leftSlope);

  const rightSlope = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.18, 4.8), MAT.facadeCream);
  rightSlope.position.set(ox + 1.55, 3.65, zFront + 2.1);
  rightSlope.rotation.z = -0.24;
  rightSlope.castShadow = true;
  scene.add(rightSlope);

  // Red-Oxide Ridge & Eave Trim Strips on Portico Roof
  const ridgeStrip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 4.85), trimMat);
  ridgeStrip.position.set(ox, 4.02, zFront + 2.1);
  scene.add(ridgeStrip);

  const leftFascia = new THREE.Mesh(new THREE.BoxGeometry(3.65, 0.22, 0.16), trimMat);
  leftFascia.position.set(ox - 1.55, 3.66, porticoZ + 0.32);
  leftFascia.rotation.z = 0.24;
  scene.add(leftFascia);

  const rightFascia = new THREE.Mesh(new THREE.BoxGeometry(3.65, 0.22, 0.16), trimMat);
  rightFascia.position.set(ox + 1.55, 3.66, porticoZ + 0.32);
  rightFascia.rotation.z = -0.24;
  scene.add(rightFascia);

  // Terracotta Pots with Green Bushes flanking the Portico (Matches Reference Image 2)
  const potMat = new THREE.MeshStandardMaterial({ color: 0xC84B31, roughness: 0.7 });
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x2E7D32, roughness: 0.8 });
  [-3.2, -2.5, 2.9, 3.5, 4.8, 6.0].forEach((px) => {
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.38, 10), potMat);
    pot.position.set(ox + px, 0.19, zFront + 0.85);
    scene.add(pot);
    const bush = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), bushMat);
    bush.position.set(ox + px, 0.48, zFront + 0.85);
    scene.add(bush);
  });

  // 6. Rooftop Staircase Penthouse Box & Angled Solar Panel Arrays (Matches Reference Image 2)
  addBoxMesh(6.2, 2.7, 5.4, MAT.facadeCream, ox, totalH + 1.5, oz - 2.3, false, false, true);
  if (bCfg.hasSolarPanels) {
    [-16.5, -11.5, 6.8, 11.8, 16.8].forEach((sx) => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.12, 2.3), MAT.solarPanel);
      panel.position.set(ox + sx, totalH + 0.6, oz + 2.8);
      panel.rotation.x = 0.28;
      panel.castShadow = true;
      scene.add(panel);
      roofMeshesForSpectator.push(panel);
    });
  }

  // 7. Central Switchback Staircase (Connects all floors: Ground -> 1st -> 2nd Floor)
  addTwoToneWall(6.0, totalH, 0.25, ox, 0, oz - 5.65, true);
  addTwoToneWall(0.25, totalH, 8.2, ox - 3.0, 0, oz - 1.5, true);
  addTwoToneWall(0.25, totalH, 8.2, ox + 3.0, 0, oz - 1.5, true);

  for (let f = 0; f < numFloors - 1; f++) {
    const baseY = f * DIM.floorHeight;
    const midY = baseY + 2.1;

    // Mid-Landing Slab
    addBoxMesh(5.7, 0.22, 2.2, MAT.lowerGranite, ox, midY - 0.11, oz - 4.4, false);

    const stepRise = 2.1 / 10;
    const stepDepth = 4.5 / 10;
    for (let i = 0; i < 10; i++) {
      // Lower flight (Right side of stairwell X: +0.2 to +2.7)
      addBoxMesh(2.5, stepRise, stepDepth, MAT.lowerGranite, ox + 1.45, baseY + (i + 0.5) * stepRise, oz + 1.2 - (i + 0.5) * stepDepth, false);
      // Upper flight (Left side of stairwell X: -2.7 to -0.2)
      addBoxMesh(2.5, stepRise, stepDepth, MAT.upperCement, ox - 1.45, midY + (i + 0.5) * stepRise, oz - 3.3 + (i + 0.5) * stepDepth, false);
    }

    // Diagonal Black Handrail Bars
    const rail1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 4.9), MAT.railingSteel);
    rail1.position.set(ox + 0.2, baseY + 1.9, oz - 1.05);
    rail1.rotation.x = 0.43;
    scene.add(rail1);

    const rail2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 4.9), MAT.railingSteel);
    rail2.position.set(ox - 0.2, midY + 1.9, oz - 1.05);
    rail2.rotation.x = -0.43;
    scene.add(rail2);
  }

  // 8. Outer Walls & Rooms on Every Floor
  addBoxMesh(DIM.totalWidth, totalH, 0.25, MAT.facadeCream, ox, totalH / 2, zBack, true);
  addBoxMesh(0.25, totalH, DIM.totalDepth, MAT.facadeCream, ox - DIM.totalWidth / 2, totalH / 2, oz, true);
  addBoxMesh(0.25, totalH, DIM.totalDepth, MAT.facadeCream, ox + DIM.totalWidth / 2, totalH / 2, oz, true);

  for (let f = 0; f < numFloors; f++) {
    const fY = f * DIM.floorHeight;
    LOCAL_FLOOR_ROOMS.forEach((r) => {
      const cX = ox + (r.xMin + r.xMax) / 2;
      const cZ = (zBack + zPart) / 2;
      const dX = ox + r.doorX;

      addBoxMesh(DIM.roomWidth - 0.3, 0.03, DIM.roomDepth - 0.3, MAT.roomTile, cX, fY + 0.02, cZ, false);
      if (r.xMax === -13.0 || r.xMax === 13.0) {
        addTwoToneWall(0.22, DIM.floorHeight - 0.25, DIM.roomDepth, ox + r.xMax, fY, cZ, true);
      }

      const leftW = (r.doorX - DIM.doorWidth / 2) - r.xMin;
      const rightW = r.xMax - (r.doorX + DIM.doorWidth / 2);
      if (leftW > 0.1) addTwoToneWall(leftW, DIM.floorHeight - 0.25, 0.24, ox + r.xMin + leftW / 2, fY, zPart, true);
      if (rightW > 0.1) addTwoToneWall(rightW, DIM.floorHeight - 0.25, 0.24, dX + DIM.doorWidth / 2 + rightW / 2, fY, zPart, true);

      // Header above door
      const headH = (DIM.floorHeight - 0.25) - DIM.doorHeight;
      addBoxMesh(DIM.doorWidth, headH, 0.24, MAT.interiorUpper, dX, fY + DIM.doorHeight + headH / 2, zPart, false);

      // Hinged Door
      const pivot = new THREE.Group();
      pivot.position.set(dX - DIM.doorWidth / 2, fY, zPart);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(DIM.doorWidth, DIM.doorHeight, 0.06), MAT.woodDoor);
      panel.position.set(DIM.doorWidth / 2, DIM.doorHeight / 2, 0);
      pivot.add(panel);
      scene.add(pivot);
      pivot.rotation.y = -1.25;
      interactiveDoors.push({
        pivot,
        isOpen: true,
        pos: new THREE.Vector3(dX, fY + 1.2, zPart),
        name: `${bCfg.id} ${f}F-${r.suffix}`
      });

      // Red Fire Extinguisher on Corridor Wall (Seen in Reference Image 2!)
      const ext = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.46, 10), MAT.fireRed);
      ext.position.set(dX + 0.9, fY + 1.35, zPart + 0.18);
      scene.add(ext);

      // Corridor Shoe Rack & Interior Desks/Blackboard
      addBoxMesh(2.3, 0.78, 0.4, MAT.shoeRackWood, cX + 1.4, fY + 0.44, zPart + 0.35, true);
      const board = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.45, 0.08), new THREE.MeshStandardMaterial({ color: 0x111827 }));
      board.position.set(cX, fY + 2.0, zBack + 0.2);
      scene.add(board);

      addBoxMesh(1.3, 0.8, 0.65, MAT.shoeRackWood, cX - 2.6, fY + 0.4, oz - 3.5, true);
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          addBoxMesh(1.7, 0.75, 0.65, MAT.shoeRackWood, cX - 1.5 + col * 3.0, fY + 0.375, oz - 1.8 + row * 2.1, true);
        }
      }
    });
  }

  // Left-side cluster of 3 spherical dark green trees (Matches Reference Image 2!)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5C4033, roughness: 0.9 });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x2D5A27, roughness: 0.75 });
  [[-26.5, 4.8, 3.2], [-23.2, 2.2, 3.4], [-25.8, -1.2, 3.0]].forEach(([tx, tz, rad]) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.52, 4.2, 10), trunkMat);
    trunk.position.set(ox + tx, 2.1, oz + tz);
    trunk.castShadow = true;
    scene.add(trunk);

    const crown = new THREE.Mesh(new THREE.SphereGeometry(rad, 16, 16), crownMat);
    crown.position.set(ox + tx, 5.2, oz + tz);
    crown.castShadow = true;
    scene.add(crown);
  });
}

// ============================================================================
// 5. EXPANDED CAMPUS MAP, ROADS & PESCE FOOTBALL TURF STADIUM
// ============================================================================
function buildExpandedCampusAndFootballField() {
  // 1. Huge 450m x 450m Campus Ground Plane
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(450, 450),
    new THREE.MeshStandardMaterial({ color: 0x688048, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  scene.add(ground);

  // 2. Main East-West Campus Avenue connecting CRC (-66m), AIML (0m), and GBL (+66m)
  addBoxMesh(210, 0.06, 8.0, MAT.roadAsphalt, 0, 0.0, 29.0, false);
  // North-South Connector Road to Annex & Football Stadium
  addBoxMesh(7.5, 0.06, 75.0, MAT.roadAsphalt, -32.0, 0.0, 52.0, false);

  // 3. Build all 4 Campus Buildings (AIML, CRC 3-Floor, GBL 2-Floor, Annex 2-Floor)
  CAMPUS_BUILDINGS.forEach((bCfg) => buildDepartmentBuilding(bCfg));

  // 4. Build Full-Size PESCE Football Turf Field
  const fx = FOOTBALL_FIELD_CONFIG.centerX;
  const fz = FOOTBALL_FIELD_CONFIG.centerZ;
  const pLen = FOOTBALL_FIELD_CONFIG.pitchLength; // 76m
  const pWid = FOOTBALL_FIELD_CONFIG.pitchWidth;  // 48m

  // Red athletic track border around turf
  addBoxMesh(pLen + 8.0, 0.05, pWid + 8.0, new THREE.MeshStandardMaterial({ color: 0x993322, roughness: 0.85 }), fx, 0.0, fz, false);

  // Artificial Turf Surface with white markings
  const pitchMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(pLen, pWid),
    new THREE.MeshStandardMaterial({ map: createFootballPitchTexture(), roughness: 0.75 })
  );
  pitchMesh.rotation.x = -Math.PI / 2;
  pitchMesh.position.set(fx, 0.04, fz);
  pitchMesh.receiveShadow = true;
  scene.add(pitchMesh);

  // 3D Goalposts (West & East ends of the pitch)
  const postMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.2, metalness: 0.3 });
  const netMat = new THREE.MeshBasicMaterial({ color: 0xE2E8F0, wireframe: true, transparent: true, opacity: 0.45 });

  [-1, 1].forEach((dir) => {
    const gx = fx + dir * (pLen / 2 - 2.6);
    // Left & Right Goalposts + Crossbar
    addBoxMesh(0.16, 2.6, 0.16, postMat, gx, 1.3, fz - 3.6, true);
    addBoxMesh(0.16, 2.6, 0.16, postMat, gx, 1.3, fz + 3.6, true);
    addBoxMesh(0.16, 0.16, 7.36, postMat, gx, 2.6, fz, false);

    // Goal Net Cage
    const net = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.55, 7.2), netMat);
    net.position.set(gx + dir * 0.9, 1.28, fz);
    scene.add(net);
  });

  // 4 Stadium Floodlight Towers at the corners of the Football Field
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.3 });
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, emissive: 0xFEF08A, emissiveIntensity: 0.9 });
  [
    [fx - pLen / 2 - 3, fz - pWid / 2 - 3],
    [fx + pLen / 2 + 3, fz - pWid / 2 - 3],
    [fx - pLen / 2 - 3, fz + pWid / 2 + 3],
    [fx + pLen / 2 + 3, fz + pWid / 2 + 3]
  ].forEach(([lx, lz]) => {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 16, 8), poleMat);
    tower.position.set(lx, 8.0, lz);
    tower.castShadow = true;
    scene.add(tower);

    const head = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 0.4), lampMat);
    head.position.set(lx, 16.2, lz);
    head.lookAt(fx, 0, fz);
    scene.add(head);
  });

  // Spectator Bleacher Steps along North Sideline of Football Field
  for (let s = 0; s < 3; s++) {
    addBoxMesh(36.0, 0.45 * (s + 1), 1.2, MAT.upperCement, fx, 0.225 * (s + 1), fz - pWid / 2 - 5.2 - s * 1.25, true);
  }
}

buildExpandedCampusAndFootballField();

// ============================================================================
// 6. ARTICULATED HUMAN CHARACTER WITH SKELETON & 3D BACKPACK
// ============================================================================
class ArticulatedHumanCharacter {
  constructor(opt = {}) {
    this.shirtColor = opt.shirtColor || 0x0D9488;
    this.accentColor = opt.accentColor || 0x14B8A6;
    this.root = new THREE.Group();
    this.pelvis = new THREE.Group();
    this.pelvis.position.y = 0.94;
    this.root.add(this.pelvis);

    this.joints = {};
    this.backpackSlots = [];
    this.animClock = Math.random() * 10;
    this.blendWeight = 0;

    this._initMaterials();
    this._initSkeleton();
    this._initBackpack();
  }

  _initMaterials() {
    this.mat = {
      skin: new THREE.MeshStandardMaterial({ color: 0xE0AC8B, roughness: 0.65 }),
      hair: new THREE.MeshStandardMaterial({ color: 0x1E1B18 }),
      shirt: new THREE.MeshStandardMaterial({ color: this.shirtColor, roughness: 0.7 }),
      pants: new THREE.MeshStandardMaterial({ color: 0x1E293B, roughness: 0.8 }),
      pack: new THREE.MeshStandardMaterial({ color: 0x1F2937, roughness: 0.6 }),
      packTrim: new THREE.MeshStandardMaterial({ color: this.accentColor, emissive: this.accentColor, emissiveIntensity: 0.5 })
    };
  }

  _initSkeleton() {
    const hips = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.22), this.mat.pants);
    hips.castShadow = true;
    this.pelvis.add(hips);

    this.joints.spine = new THREE.Group();
    this.joints.spine.position.y = 0.08;
    this.pelvis.add(this.joints.spine);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.48, 0.24), this.mat.shirt);
    torso.position.y = 0.24;
    torso.castShadow = true;
    this.joints.spine.add(torso);

    this.joints.head = new THREE.Group();
    this.joints.head.position.y = 0.54;
    this.joints.spine.add(this.joints.head);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.22), this.mat.skin);
    head.position.y = 0.12;
    head.castShadow = true;
    this.joints.head.add(head);

    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.08, 0.23), this.mat.hair);
    hair.position.y = 0.22;
    this.joints.head.add(hair);

    [-0.05, 0.05].forEach((ex) => {
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.02, 0.015), new THREE.MeshBasicMaterial({ color: 0x111827 }));
      eye.position.set(ex, 0.14, -0.114);
      this.joints.head.add(eye);
    });

    ['Left', 'Right'].forEach((side) => {
      const sX = side === 'Left' ? -0.24 : 0.24;
      const sh = new THREE.Group();
      sh.position.set(sX, 0.44, 0);
      this.joints.spine.add(sh);
      this.joints[`arm${side}`] = sh;

      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.24, 0.09), this.mat.skin);
      upper.position.y = -0.12;
      sh.add(upper);

      const el = new THREE.Group();
      el.position.y = -0.24;
      sh.add(el);
      this.joints[`elbow${side}`] = el;

      const lower = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 0.08), this.mat.skin);
      lower.position.y = -0.12;
      el.add(lower);
    });

    ['Left', 'Right'].forEach((side) => {
      const hX = side === 'Left' ? -0.1 : 0.1;
      const hip = new THREE.Group();
      hip.position.set(hX, -0.04, 0);
      this.pelvis.add(hip);
      this.joints[`hip${side}`] = hip;

      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.14), this.mat.pants);
      thigh.position.y = -0.21;
      thigh.castShadow = true;
      hip.add(thigh);

      const kn = new THREE.Group();
      kn.position.y = -0.42;
      hip.add(kn);
      this.joints[`knee${side}`] = kn;

      const shin = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.40, 0.12), this.mat.pants);
      shin.position.y = -0.20;
      kn.add(shin);

      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.22), new THREE.MeshStandardMaterial({ color: 0xF8FAFC }));
      foot.position.set(0, -0.44, -0.04);
      kn.add(foot);
    });
  }

  _initBackpack() {
    const pack = new THREE.Group();
    pack.position.set(0, 0.24, 0.18);
    this.joints.spine.add(pack);

    const mainBody = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.38, 0.16), this.mat.pack);
    pack.add(mainBody);

    const led = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.015), this.mat.packTrim);
    led.position.set(0, 0.12, 0.085);
    pack.add(led);

    for (let i = 0; i < 5; i++) {
      const slotX = (i - 2) * 0.06;
      const miniFlag = new THREE.Group();
      miniFlag.position.set(slotX, 0.22, 0);
      miniFlag.visible = false;

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.32), new THREE.MeshStandardMaterial({ color: 0xE2E8F0 }));
      pole.position.y = 0.16;
      miniFlag.add(pole);

      const pennant = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.08, 0.012),
        new THREE.MeshStandardMaterial({ color: PUBLIC_FLAG_MANIFEST[i].color, emissive: PUBLIC_FLAG_MANIFEST[i].color, emissiveIntensity: 0.8 })
      );
      pennant.position.set(0.06, 0.26, 0);
      miniFlag.add(pennant);

      pack.add(miniFlag);
      this.backpackSlots.push({ flagId: PUBLIC_FLAG_MANIFEST[i].flagId, group: miniFlag });
    }
  }

  syncInventory(collectedIds = []) {
    const s = new Set(collectedIds);
    this.backpackSlots.forEach((slot) => {
      slot.group.visible = s.has(slot.flagId);
    });
  }

  update(dt, speed) {
    this.animClock += dt;
    const isMoving = speed > 0.2;
    const targetW = isMoving ? (speed > 6.5 ? 1.3 : 0.85) : 0;
    this.blendWeight = THREE.MathUtils.lerp(this.blendWeight, targetW, dt * 10);

    const freq = isMoving ? 8.5 : 2.2;
    const p = this.animClock * freq;
    const sin = Math.sin(p);
    const w = this.blendWeight;

    this.joints.spine.rotation.x = Math.sin(this.animClock * 2.2) * 0.02 + w * 0.08;
    this.pelvis.position.y = 0.94 + Math.abs(Math.cos(p)) * 0.04 * w;

    this.joints.hipLeft.rotation.x = sin * 0.6 * w;
    this.joints.hipRight.rotation.x = -sin * 0.6 * w;
    this.joints.kneeLeft.rotation.x = -Math.max(0, -sin) * 0.9 * w;
    this.joints.kneeRight.rotation.x = -Math.max(0, sin) * 0.9 * w;

    this.joints.armLeft.rotation.x = -sin * 0.5 * w;
    this.joints.armRight.rotation.x = sin * 0.5 * w;
  }
}

// ============================================================================
// 7. FLAGS & DECOYS SYSTEM
// ============================================================================
class FlagSystem {
  constructor(scene, wallMeshes) {
    this.scene = scene;
    this.wallMeshes = wallMeshes;
    this.raycaster = new THREE.Raycaster();
    this.nodes = new Map();
    this.clock = 0;
    this._init();
  }

  _init() {
    PUBLIC_FLAG_MANIFEST.forEach((m) => {
      const g = new THREE.Group();
      g.position.set(m.position[0], m.position[1], m.position[2]);

      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.14, 6), MAT.lowerGranite);
      base.position.y = 0.07;
      g.add(base);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.85), new THREE.MeshStandardMaterial({ color: 0xE2E8F0, emissive: m.color, emissiveIntensity: 0.3 }));
      pole.position.y = 0.98;
      g.add(pole);

      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(0.75, 0.45),
        new THREE.MeshStandardMaterial({ color: m.color, emissive: m.color, emissiveIntensity: 0.85, side: THREE.DoubleSide })
      );
      banner.position.set(0.4, 1.55, 0);
      g.add(banner);

      const light = new THREE.PointLight(m.color, 1.3, 4.5);
      light.position.set(0, 1.5, 0);
      g.add(light);

      this.scene.add(g);
      this.nodes.set(m.flagId, { meta: m, group: g, banner, light, isCollected: false });
    });
  }

  syncCollected(collectedIds = []) {
    const s = new Set(collectedIds);
    for (const [id, n] of this.nodes.entries()) {
      if (n.meta.kind === 'LEGITIMATE') {
        n.isCollected = s.has(id);
        n.group.visible = !n.isCollected;
      }
    }
  }

  findInteractable(playerPos) {
    const eye = new THREE.Vector3(playerPos.x, playerPos.y + 1.2, playerPos.z);
    for (const n of this.nodes.values()) {
      if (n.isCollected || !n.group.visible) continue;
      if (Math.abs(n.meta.position[1] - playerPos.y) > 1.6) continue;
      const target = new THREE.Vector3(n.meta.position[0], n.meta.position[1] + 1.1, n.meta.position[2]);
      const dist = eye.distanceTo(target);
      if (dist <= QUEST_RULES.interactionRadius) {
        this.raycaster.set(eye, target.clone().sub(eye).normalize());
        this.raycaster.far = dist - 0.15;
        if (this.raycaster.intersectObjects(this.wallMeshes, false).length === 0) {
          return n.meta;
        }
      }
    }
    return null;
  }

  setSpectator(isSpec) {
    for (const n of this.nodes.values()) {
      n.group.visible = isSpec ? false : !n.isCollected;
    }
  }

  update(dt) {
    this.clock += dt;
    for (const n of this.nodes.values()) {
      if (!n.group.visible) continue;
      n.banner.rotation.y = Math.sin(this.clock * 3.5) * 0.15;
      n.light.intensity = 1.0 + Math.sin(this.clock * 4.0) * 0.3;
    }
  }
}

const flagSystem = new FlagSystem(scene, wallMeshesForOcclusion);

// ============================================================================
// 8. MULTI-BUILDING STAIRCASE & FLOOR HEIGHTFIELD SOLVER (SUPPORTS 2F & 3F)
// ============================================================================
function computeCampusHeight(x, z, curY) {
  for (const bCfg of CAMPUS_BUILDINGS) {
    const lx = x - bCfg.offsetX;
    const lz = z - bCfg.offsetZ;

    // Check if inside this building's footprint
    if (Math.abs(lx) <= DIM.totalWidth / 2 + 0.5 && Math.abs(lz) <= DIM.totalDepth / 2 + 0.5) {
      const maxFloorY = (bCfg.floors - 1) * DIM.floorHeight;

      // Inside Central Stairwell Bay (lx: -2.85 to +2.85)
      if (lx >= -2.85 && lx <= 2.85) {
        for (let f = 0; f < bCfg.floors - 1; f++) {
          const baseY = f * DIM.floorHeight;
          const midY = baseY + 2.1;
          const topY = (f + 1) * DIM.floorHeight;

          // Mid-landing
          if (lz >= -5.6 && lz <= -3.3 && curY >= baseY + 1.0 && curY <= topY - 0.9) {
            return midY;
          }
          // Lower Flight (lx >= 0, lz: -3.3 to +1.2) -> baseY to midY
          if (lx >= 0.0 && lz >= -3.3 && lz <= 1.2 && curY >= baseY - 0.4 && curY < midY + 0.55) {
            return baseY + THREE.MathUtils.clamp((1.2 - lz) / 4.5, 0, 1) * 2.1;
          }
          // Upper Flight (lx < 0, lz: -3.3 to +1.2) -> midY to topY
          if (lx < 0.0 && lz >= -3.3 && lz <= 1.2 && curY >= midY - 0.6 && curY <= topY + 0.5) {
            return midY + THREE.MathUtils.clamp((lz + 3.3) / 4.5, 0, 1) * 2.1;
          }
        }
      }

      // Snap to nearest active floor slab inside this building
      let bestFloorY = 0;
      for (let f = 0; f < bCfg.floors; f++) {
        const fY = f * DIM.floorHeight;
        if (curY >= fY - 1.25) bestFloorY = fY;
      }
      return Math.min(bestFloorY, maxFloorY);
    }
  }
  return 0.0;
}

function getCampusZoneLabel(pos) {
  // Check Football Field
  const fx = FOOTBALL_FIELD_CONFIG.centerX;
  const fz = FOOTBALL_FIELD_CONFIG.centerZ;
  if (Math.abs(pos.x - fx) <= 42 && Math.abs(pos.z - fz) <= 28) {
    return '⚽ PESCE Football Turf Stadium';
  }

  // Check Buildings
  for (const bCfg of CAMPUS_BUILDINGS) {
    const lx = pos.x - bCfg.offsetX;
    const lz = pos.z - bCfg.offsetZ;
    if (Math.abs(lx) <= 23.5 && Math.abs(lz) <= 8.5) {
      const fIdx = Math.round(pos.y / DIM.floorHeight);
      const fName = fIdx === 0 ? 'GF' : `${fIdx}F`;
      if (lz > 5.8) return `${bCfg.id} Entrance Portico`;
      if (lz > 2.6) return `${bCfg.id} ${fName} Corridor`;
      if (Math.abs(lx) <= 3.0) return `${bCfg.id} Central Staircase`;
      const room = LOCAL_FLOOR_ROOMS.find((r) => lx >= r.xMin && lx <= r.xMax);
      if (room) return `${bCfg.id} ${fName}-${room.suffix}`;
    }
  }
  return 'Campus Quad & Avenue';
}

// ============================================================================
// 9. PLAYER & HUD CONTROLLER
// ============================================================================
let activeTeamId = REGISTERED_TEAMS[0].teamId;
let currentTeamState = null;

const player = {
  pos: new THREE.Vector3(0, 0, 11.5),
  yaw: 0,
  pitch: -0.08,
  speed: 6.2,
  sprintMultiplier: 1.75,
  radius: 0.36,
  thirdPerson: true,
  spectatorMode: false,
  orbitMode: false
};

const playerAvatar = new ArticulatedHumanCharacter({
  shirtColor: REGISTERED_TEAMS[0].shirtColor,
  accentColor: REGISTERED_TEAMS[0].color
});
scene.add(playerAvatar.root);

function createMarkerSprite(label, hex) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.fillRect(8, 16, 496, 96);
  ctx.strokeStyle = `#${hex.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 8;
  ctx.strokeRect(8, 16, 496, 96);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.position.set(0, 2.35, 0);
  s.scale.set(3.2, 0.8, 1);
  return s;
}

const otherTeamNodes = new Map();
REGISTERED_TEAMS.forEach((t) => {
  const char = new ArticulatedHumanCharacter({ shirtColor: t.shirtColor, accentColor: t.color });
  char.root.add(createMarkerSprite(t.teamName.split('•')[1].trim(), t.color));
  scene.add(char.root);
  otherTeamNodes.set(t.teamId, char);
});

const teamSelEl = document.getElementById('team-selector');
const flagCountEl = document.getElementById('hud-flag-counter');
const timerEl = document.getElementById('hud-timer');
const penaltyEl = document.getElementById('penalty-banner');
const submitBtn = document.getElementById('btn-submit-run');
const toastEl = document.getElementById('interaction-toast');
const feedbackEl = document.getElementById('feedback-banner');
const connBadgeEl = document.getElementById('conn-badge');

const pinModal = document.getElementById('pin-modal');
const pinInput = document.getElementById('pin-input-field');
const pinError = document.getElementById('pin-modal-error');
const pinSubmitBtn = document.getElementById('btn-pin-submit');
const invModal = document.getElementById('inventory-modal');
const submitModal = document.getElementById('submit-modal');
let activeFlagForPin = null;

function showBanner(text, border = '#38bdf8') {
  feedbackEl.textContent = text;
  feedbackEl.style.borderColor = border;
  feedbackEl.style.opacity = '1';
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => { feedbackEl.style.opacity = '0'; }, 3200);
}

function formatSec(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

REGISTERED_TEAMS.forEach((t) => {
  const opt = document.createElement('option');
  opt.value = t.teamId;
  opt.textContent = t.teamName;
  teamSelEl.appendChild(opt);
});

let unsubTeam = null;
function bindTeam(teamId) {
  activeTeamId = teamId;
  if (unsubTeam) unsubTeam();

  const cfg = REGISTERED_TEAMS.find((t) => t.teamId === teamId);
  if (cfg) {
    playerAvatar.mat.shirt.color.setHex(cfg.shirtColor);
    playerAvatar.mat.packTrim.color.setHex(cfg.color);
    playerAvatar.mat.packTrim.emissive.setHex(cfg.color);
  }

  unsubTeam = gameService.subscribeTeam(teamId, (state) => {
    currentTeamState = state;
    flagCountEl.textContent = `🚩 Flags: ${state.flagsCollected || 0} / 5`;
    submitBtn.style.display = (state.flagsCollected || 0) >= 5 ? 'inline-flex' : 'none';
    playerAvatar.syncInventory(state.collectedFlagIds || []);
    flagSystem.syncCollected(state.collectedFlagIds || []);
  });
}
teamSelEl.addEventListener('change', (e) => bindTeam(e.target.value));
bindTeam(activeTeamId);

if (gameService.connected) {
  connBadgeEl.textContent = '⚡ FIREBASE CLOUD (dtth-f2c8e)';
  connBadgeEl.className = 'pill firebase-connected';
}

function openPin(meta) {
  activeFlagForPin = meta;
  document.getElementById('pin-modal-code').textContent = `${meta.code} • ${meta.roomCode}`;
  document.getElementById('pin-modal-title').textContent = meta.title;
  document.getElementById('pin-modal-desc').textContent = meta.clueHint;
  pinInput.value = '';
  pinError.textContent = '';
  pinModal.classList.add('open');
  setTimeout(() => pinInput.focus(), 30);
}

pinInput.addEventListener('input', () => {
  pinInput.value = pinInput.value.replace(/\D/g, '').slice(0, 4);
});

pinSubmitBtn.addEventListener('click', async () => {
  if (!activeFlagForPin) return;
  const res = await gameService.validateAndCollect(activeTeamId, activeFlagForPin.flagId, pinInput.value);
  if (!res.ok) {
    pinError.textContent = res.message;
  } else {
    pinModal.classList.remove('open');
    showBanner(res.message, '#10b981');
  }
});
document.getElementById('btn-pin-cancel').addEventListener('click', () => pinModal.classList.remove('open'));

function openInventory() {
  if (!currentTeamState) return;
  document.getElementById('inv-team-title').textContent = `${currentTeamState.teamName} (${currentTeamState.flagsCollected || 0}/5)`;
  const c = document.getElementById('inventory-slots-container');
  c.innerHTML = '';
  PUBLIC_FLAG_MANIFEST.filter((f) => f.kind === 'LEGITIMATE').forEach((f, i) => {
    const col = currentTeamState.collectedFlagIds?.includes(f.flagId);
    const div = document.createElement('div');
    div.className = `inv-slot ${col ? 'collected' : ''}`;
    div.innerHTML = `
      <div><b>Slot #${i + 1}: ${f.code}</b> — ${f.title} <span style="color:#38bdf8;">(${f.roomCode})</span></div>
      <div style="color:${col ? '#34d399' : '#64748b'}; font-weight:700;">${col ? '✅ IN BACKPACK' : '🔒 LOCKED'}</div>
    `;
    c.appendChild(div);
  });
  invModal.classList.add('open');
}
document.getElementById('btn-backpack').addEventListener('click', openInventory);
document.getElementById('btn-inv-close').addEventListener('click', () => invModal.classList.remove('open'));

submitBtn.addEventListener('click', () => {
  if (!currentTeamState) return;
  const raw = Math.floor((Date.now() - (currentTeamState.startedAt || Date.now())) / 1000);
  const pen = currentTeamState.penaltySeconds || 0;
  document.getElementById('submit-summary-box').innerHTML = `
    <div><b>Team:</b> ${currentTeamState.teamName}</div>
    <div><b>Flags:</b> ${currentTeamState.flagsCollected || 0} / 5</div>
    <div><b>Raw Time:</b> ${formatSec(raw)} | <b>Penalties:</b> +${pen}s</div>
    <div><b>Final Time:</b> <span style="color:#34d399; font-weight:700;">${formatSec(raw + pen)}</span></div>
  `;
  submitModal.classList.add('open');
});
document.getElementById('btn-submit-confirm').addEventListener('click', async () => {
  const res = await gameService.submitRun(activeTeamId);
  submitModal.classList.remove('open');
  showBanner(res.message, res.ok ? '#10b981' : '#f43f5e');
});
document.getElementById('btn-submit-cancel').addEventListener('click', () => submitModal.classList.remove('open'));

async function interact() {
  if (pinModal.classList.contains('open') || invModal.classList.contains('open')) return;
  const f = flagSystem.findInteractable(player.pos);
  if (f) {
    if (f.kind === 'DECOY') {
      const res = await gameService.applyDecoy(activeTeamId, f.flagId);
      showBanner(res.message, '#f43f5e');
    } else {
      openPin(f);
    }
    return;
  }
  const d = interactiveDoors.find((door) => door.pos.distanceTo(player.pos) < 2.3);
  if (d) {
    d.isOpen = !d.isOpen;
    d.pivot.rotation.y = d.isOpen ? -1.35 : 0;
  }
}

function toggleSpectator() {
  player.spectatorMode = !player.spectatorMode;
  document.getElementById('btn-spectator').classList.toggle('active', player.spectatorMode);
  document.getElementById('spectator-panel').style.display = player.spectatorMode ? 'block' : 'none';
  document.getElementById('player-info-panel').style.display = player.spectatorMode ? 'none' : 'block';
  roofMeshesForSpectator.forEach((m) => { m.visible = !player.spectatorMode; });
  flagSystem.setSpectator(player.spectatorMode);
}
document.getElementById('btn-spectator').addEventListener('click', toggleSpectator);

gameService.subscribeSpectator((list) => {
  const tb = document.getElementById('spectator-tbody');
  tb.innerHTML = '';
  list.forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="color:#38bdf8; font-weight:700;">#${idx + 1}</td>
      <td>${item.teamName.replace(/^Team \d+ • /, '')}</td>
      <td style="color:${item.flagsCollected === 5 ? '#10b981' : '#fff'}; font-weight:700;">${item.flagsCollected}/5</td>
      <td style="color:${item.penaltySeconds > 0 ? '#f43f5e' : '#94a3b8'};">+${item.penaltySeconds}s</td>
      <td>${item.status === 'COMPLETED' ? `✅ ${formatSec(item.effSec)}` : formatSec(item.effSec)}</td>
    `;
    tb.appendChild(tr);

    const c = otherTeamNodes.get(item.teamId);
    if (c) {
      if (item.teamId === activeTeamId && !player.spectatorMode) {
        c.root.visible = false;
      } else {
        c.root.visible = true;
        c.root.position.set(item.position.x, item.position.y, item.position.z);
        c.root.rotation.y = item.position.yaw || 0;
      }
    }
  });
});

// Teleport to any of the 8 Campus Zones
function teleportToZone(zoneId) {
  const z = TELEPORT_ZONES[zoneId];
  if (!z) return;
  document.querySelectorAll('.zone-btn').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.zone) === zoneId);
  });

  player.orbitMode = Boolean(z.orbit);
  orbitControls.enabled = player.orbitMode;
  if (z.orbit) {
    playerCamera.position.set(z.pos[0], z.pos[1], z.pos[2]);
    orbitControls.target.set(z.target[0], z.target[1], z.target[2]);
    orbitControls.update();
  } else {
    player.pos.set(z.pos[0], z.pos[1], z.pos[2]);
    player.yaw = z.yaw;
  }
}

document.querySelectorAll('.zone-btn').forEach((btn) => {
  btn.addEventListener('click', () => teleportToZone(Number(btn.dataset.zone)));
});

const keys = {};
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    pinModal.classList.remove('open');
    invModal.classList.remove('open');
    submitModal.classList.remove('open');
  }
  if (pinModal.classList.contains('open') && e.code === 'Enter') {
    pinSubmitBtn.click();
    return;
  }
  keys[e.code] = true;
  if (e.code === 'KeyE') interact();
  if (e.code === 'KeyI') openInventory();
  if (e.code === 'KeyG') toggleSpectator();
  if (e.code === 'KeyV') {
    player.thirdPerson = !player.thirdPerson;
    playerAvatar.root.visible = player.thirdPerson;
    document.getElementById('btn-view-mode').textContent = player.thirdPerson ? '🚶 View: 3rd Person' : '👁️ View: 1st Person';
  }
  if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'].includes(e.code)) {
    teleportToZone(Number(e.code.replace('Digit', '')));
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

let isDrag = false, prevM = { x: 0, y: 0 };
renderer.domElement.addEventListener('mousedown', (e) => { isDrag = true; prevM = { x: e.clientX, y: e.clientY }; });
window.addEventListener('mouseup', () => { isDrag = false; });
window.addEventListener('mousemove', (e) => {
  if (!isDrag || player.spectatorMode || player.orbitMode) return;
  player.yaw -= (e.clientX - prevM.x) * 0.0045;
  player.pitch = THREE.MathUtils.clamp(player.pitch - (e.clientY - prevM.y) * 0.0035, -0.85, 0.85);
  prevM = { x: e.clientX, y: e.clientY };
});

function checkCollision(nx, nz, y) {
  const box = new THREE.Box3(
    new THREE.Vector3(nx - player.radius, y + 0.35, nz - player.radius),
    new THREE.Vector3(nx + player.radius, y + 1.65, nz + player.radius)
  );
  return wallColliders.some((wb) => box.intersectsBox(wb));
}

document.getElementById('btn-cutaway').addEventListener('click', (e) => {
  const isCut = e.currentTarget.classList.toggle('active');
  cutawayMeshes.forEach((m) => { m.visible = !isCut; });
  e.currentTarget.textContent = isCut ? '🏛️ Cutaway: On' : '🏛️ Cutaway: Off';
});
document.getElementById('btn-lighting').addEventListener('click', (e) => {
  isDaylight = !isDaylight;
  applyLightingPreset(isDaylight);
  e.currentTarget.textContent = isDaylight ? '☀️ Daylight' : '🌅 Golden Hour';
});
document.getElementById('btn-reset-pos').addEventListener('click', () => teleportToZone(2));

// ============================================================================
// 10. RENDER LOOP
// ============================================================================
const clock = new THREE.Clock();
let syncTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  let speed = 0;

  if (player.orbitMode) {
    orbitControls.update();
  } else if (!player.spectatorMode && !pinModal.classList.contains('open') && !invModal.classList.contains('open')) {
    let mf = 0, mr = 0;
    if (keys['KeyW'] || keys['ArrowUp']) mf += 1;
    if (keys['KeyS'] || keys['ArrowDown']) mf -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) mr += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) mr -= 1;

    const len = Math.hypot(mf, mr);
    if (len > 0) {
      mf /= len; mr /= len;
      speed = player.speed * (keys['ShiftLeft'] || keys['ShiftRight'] ? player.sprintMultiplier : 1.0);
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      const dx = (-sin * mf + cos * mr) * speed * dt;
      const dz = (-cos * mf - sin * mr) * speed * dt;
      if (!checkCollision(player.pos.x + dx, player.pos.z, player.pos.y)) player.pos.x += dx;
      if (!checkCollision(player.pos.x, player.pos.z + dz, player.pos.y)) player.pos.z += dz;
    }

    const tY = computeCampusHeight(player.pos.x, player.pos.z, player.pos.y);
    player.pos.y = THREE.MathUtils.lerp(player.pos.y, tY, 0.28);
    playerAvatar.root.position.copy(player.pos);
    playerAvatar.root.rotation.y = player.yaw;

    const eye = new THREE.Vector3(player.pos.x, player.pos.y + 1.62, player.pos.z);
    const look = new THREE.Vector3(-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch));

    if (player.thirdPerson) {
      playerCamera.position.copy(eye).add(look.clone().multiplyScalar(-3.4)).add(new THREE.Vector3(0, 0.65, 0));
      playerCamera.lookAt(eye.clone().add(look.clone().multiplyScalar(4.0)));
    } else {
      playerCamera.position.copy(eye);
      playerCamera.lookAt(eye.clone().add(look));
    }

    syncTimer += dt;
    if (syncTimer >= 0.2) {
      syncTimer = 0;
      gameService.updatePosition(activeTeamId, player.pos.x, player.pos.y, player.pos.z, player.yaw, speed > 0 ? 'WALK' : 'IDLE');
    }
  }

  playerAvatar.update(dt, speed);
  flagSystem.update(dt);

  // Update Zone & Floor HUD
  const floorNum = Math.round(player.pos.y / DIM.floorHeight);
  const floorStr = floorNum === 0 ? 'Ground' : floorNum === 1 ? '1st Floor' : '2nd Floor';
  document.getElementById('elevation-indicator').textContent = `Elev: ${player.pos.y.toFixed(1)}m (${floorStr})`;
  document.getElementById('room-indicator').textContent = `Zone: ${getCampusZoneLabel(player.pos)}`;

  if (currentTeamState) {
    const now = Date.now();
    const end = currentTeamState.completedAt || now;
    timerEl.textContent = `⏱️ ${formatSec(Math.max(0, Math.floor((end - (currentTeamState.startedAt || now)) / 1000)))}`;
    if (currentTeamState.penaltyActiveUntil > now) {
      penaltyEl.style.display = 'inline-flex';
      penaltyEl.textContent = `⚠️ DECOY PENALTY: ${Math.ceil((currentTeamState.penaltyActiveUntil - now) / 1000)}s`;
    } else {
      penaltyEl.style.display = 'none';
    }
  }

  const nearFlag = flagSystem.findInteractable(player.pos);
  toastEl.style.opacity = nearFlag && !player.spectatorMode ? '1' : '0';
  if (nearFlag) toastEl.textContent = `⚡ Press [E] to interact with ${nearFlag.code}`;

  renderer.render(scene, player.spectatorMode ? spectatorCamera : playerCamera);
}

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight, asp = w / h;
  playerCamera.aspect = asp;
  playerCamera.updateProjectionMatrix();
  spectatorCamera.left = -orthoSize * asp;
  spectatorCamera.right = orthoSize * asp;
  spectatorCamera.top = orthoSize;
  spectatorCamera.bottom = -orthoSize;
  spectatorCamera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

animate();

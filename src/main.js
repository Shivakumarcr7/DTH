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
  ADMIN_PASSCODE,
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

const IS_ADMIN_PAGE = document.body.dataset.page === 'admin';

// ============================================================================
// 1. FIREBASE CLOUD SERVICE
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
      [0, 0, 12.5], [-16.0, 0, 4.1], [-68.0, 0, 14.5], [68.0, 0, 14.5],
      [22.0, 0, 52.0], [-1.4, 2.1, -4.2], [-68.0, 4.2, 4.2], [68.0, 4.2, 4.2],
      [7.5, 4.2, 4.2], [-68.0, 8.4, 4.2], [0.0, 4.2, 4.0], [18.0, 0, 64.0]
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
            position: { x: wp[0], y: wp[1], z: wp[2], yaw: 0, anim: 'IDLE', zone: 'AIML Portico' },
            lastUpdatedAt: now
          });
        }
      } catch {}
    }
  }

  async resetAllTeams() {
    if (!this.connected) return;
    const now = Date.now();
    const waypoints = [
      [0, 0, 12.5], [-16.0, 0, 4.1], [-68.0, 0, 14.5], [68.0, 0, 14.5],
      [22.0, 0, 52.0], [-1.4, 2.1, -4.2], [-68.0, 4.2, 4.2], [68.0, 4.2, 4.2],
      [7.5, 4.2, 4.2], [-68.0, 8.4, 4.2], [0.0, 4.2, 4.0], [18.0, 0, 64.0]
    ];
    for (let i = 0; i < REGISTERED_TEAMS.length; i++) {
      const t = REGISTERED_TEAMS[i];
      const wp = waypoints[i % waypoints.length];
      await setDoc(doc(this.db, 'teams', t.teamId), {
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
        position: { x: wp[0], y: wp[1], z: wp[2], yaw: 0, anim: 'IDLE', zone: 'Spawn' },
        lastUpdatedAt: now
      });
    }
  }

  subscribeTeam(teamId, cb) {
    if (!this.connected) return () => {};
    return onSnapshot(doc(this.db, 'teams', teamId), (snap) => {
      if (snap.exists()) cb(snap.data());
    });
  }

  subscribeSpectator(cb) {
    if (!this.connected) return () => {};
    return onSnapshot(collection(this.db, 'teams'), (snap) => {
      const list = [];
      const now = Date.now();
      snap.forEach((d) => {
        const t = d.data();
        const cfg = REGISTERED_TEAMS.find((r) => r.teamId === t.teamId);
        const endRef = t.completedAt || now;
        const rawSec = Math.max(0, Math.floor((endRef - (t.startedAt || now)) / 1000));
        const effSec = rawSec + (t.penaltySeconds || 0);
        list.push({
          teamId: t.teamId,
          teamName: cfg ? cfg.teamName : t.teamName,
          flagsCollected: t.flagsCollected || 0,
          penaltySeconds: t.penaltySeconds || 0,
          status: t.status || 'IN_PROGRESS',
          rawSec,
          effSec,
          position: t.position || { x: 0, y: 0, z: 12, yaw: 0, anim: 'IDLE', zone: 'Campus' }
        });
      });
      list.sort((a, b) => (b.flagsCollected !== a.flagsCollected)
        ? (b.flagsCollected - a.flagsCollected)
        : (a.effSec - b.effSec));
      cb(list);
    });
  }

  async updatePosition(teamId, x, y, z, yaw, anim, zone) {
    if (!this.connected || !teamId) return;
    try {
      await updateDoc(doc(this.db, 'teams', teamId), {
        position: {
          x: Number(x.toFixed(2)),
          y: Number(y.toFixed(2)),
          z: Number(z.toFixed(2)),
          yaw: Number(yaw.toFixed(2)),
          anim,
          zone
        },
        lastUpdatedAt: Date.now()
      });
    } catch {}
  }

  async validateAndCollect(teamId, flagId, rawPin) {
    const pin = typeof rawPin === 'string' ? rawPin.trim() : '';
    if (!/^\d{4}$/.test(pin)) return { ok: false, message: 'Enter an exact 4-digit numeric PIN.' };
    if (DEV_PINS[flagId] !== pin) return { ok: false, message: 'Access Denied: Incorrect 4-digit PIN.' };
    try {
      const ref = doc(this.db, 'teams', teamId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return { ok: false, message: 'Team not found.' };
      const data = snap.data();
      if (data.status === 'COMPLETED') return { ok: false, message: 'Run already locked.' };
      if (data.collectedFlagIds?.includes(flagId)) return { ok: false, message: 'Flag already in backpack.' };
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
    if (now - (this.decoyCooldowns.get(key) || 0) < 8000) return { ok: false, message: 'Decoy cooldown active.' };
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
      return { ok: true, message: `DECOY TRAP! +${pen}s penalty applied.` };
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

let orthoSize = 95;
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
  scene.fog = new THREE.FogExp2(day ? 0x7EC8E3 : 0xE89D54, 0.002);
  sunLight.color.setHex(day ? 0xFFF9E6 : 0xFFD29D);
}
applyLightingPreset(true);

// ============================================================================
// 3. PROCEDURAL TEXTURES & MATERIALS
// ============================================================================
function createPlasterTexture(hexColor, gridStroke) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = hexColor;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = gridStroke;
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
    ctx.font = i === 0 ? 'bold 40px Arial, sans-serif' : 'bold 28px Arial, sans-serif';
    ctx.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * 64);
  });
  return new THREE.CanvasTexture(c);
}

function createFootballPitchTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 640;
  const ctx = c.getContext('2d');
  const stripes = 16;
  const sw = c.width / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#2E7D32' : '#388E3C';
    ctx.fillRect(i * sw, 0, sw, c.height);
  }
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 8;
  const pad = 40;
  ctx.strokeRect(pad, pad, c.width - pad * 2, c.height - pad * 2);
  ctx.beginPath(); ctx.moveTo(c.width / 2, pad); ctx.lineTo(c.width / 2, c.height - pad); ctx.stroke();
  ctx.beginPath(); ctx.arc(c.width / 2, c.height / 2, 78, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeRect(pad, c.height / 2 - 140, 135, 280);
  ctx.strokeRect(c.width - pad - 135, c.height / 2 - 140, 135, 280);
  return new THREE.CanvasTexture(c);
}

const MAT = {
  aimlWall: new THREE.MeshStandardMaterial({ map: createPlasterTexture('#F3EFE0', 'rgba(180,170,150,0.28)'), roughness: 0.8 }),
  crcWall: new THREE.MeshStandardMaterial({ map: createPlasterTexture('#E2E8F0', 'rgba(100,116,139,0.25)'), roughness: 0.5, metalness: 0.15 }),
  gblWall: new THREE.MeshStandardMaterial({ map: createPlasterTexture('#FDE68A', 'rgba(180,83,9,0.22)'), roughness: 0.85 }),
  annexWall: new THREE.MeshStandardMaterial({ map: createPlasterTexture('#F1F5F9', 'rgba(13,148,136,0.22)'), roughness: 0.4, metalness: 0.2 }),
  glassCurtain: new THREE.MeshPhysicalMaterial({ color: 0x38BDF8, transparent: true, opacity: 0.48, roughness: 0.1, metalness: 0.3 }),
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
// 4. DISTINCT ARCHITECTURAL GENERATOR (AIML vs CRC vs GBL vs ANNEX)
// ============================================================================
function buildDepartmentBuilding(bCfg) {
  const ox = bCfg.offsetX;
  const oz = bCfg.offsetZ;
  const numFloors = bCfg.floors;
  const totalH = numFloors * DIM.floorHeight;
  const zFront = oz + DIM.totalDepth / 2;
  const zBack = oz - DIM.totalDepth / 2;
  const zPart = oz + 2.6;

  const wallMat = bCfg.archStyle === 'CRC_GLASS_TOWER' ? MAT.crcWall
    : bCfg.archStyle === 'GBL_HERITAGE' ? MAT.gblWall
    : bCfg.archStyle === 'ANNEX_PAVILION' ? MAT.annexWall
    : MAT.aimlWall;

  const trimMat = new THREE.MeshStandardMaterial({ color: bCfg.trimColor, roughness: 0.6 });

  // 1. Common Navigable Floor Slabs, Corridors, Stairwells & Rooms
  addBoxMesh(6.4, 0.08, 22, MAT.drivewayTile, ox, 0.02, zFront + 12.0, false);
  addBoxMesh(0.32, 0.14, 22, trimMat, ox - 3.2, 0.05, zFront + 12.0, false);
  addBoxMesh(0.32, 0.14, 22, trimMat, ox + 3.2, 0.05, zFront + 12.0, false);

  addBoxMesh(DIM.totalWidth, 0.25, DIM.totalDepth, wallMat, ox, -0.125, oz, false);

  for (let f = 0; f < numFloors; f++) {
    const fY = f * DIM.floorHeight;
    if (f > 0) {
      addBoxMesh(20.0, 0.26, DIM.totalDepth, wallMat, ox - 13.0, fY - 0.13, oz, false);
      addBoxMesh(20.0, 0.26, DIM.totalDepth, wallMat, ox + 13.0, fY - 0.13, oz, false);
      addBoxMesh(6.0, 0.26, 4.0, wallMat, ox, fY - 0.13, oz + 3.8, false);
    }
    addBoxMesh(DIM.totalWidth - 0.4, 0.03, DIM.corridorDepth, MAT.corridorTile, ox, fY + 0.015, oz + 4.2, false);

    if (f === 0) {
      addBoxMesh(20.4, DIM.parapetHeight, 0.25, wallMat, ox - 12.8, fY + DIM.parapetHeight / 2, zFront, true, true);
      addBoxMesh(20.4, DIM.parapetHeight, 0.25, wallMat, ox + 12.8, fY + DIM.parapetHeight / 2, zFront, true, true);
    } else {
      addBoxMesh(DIM.totalWidth, DIM.parapetHeight, 0.25, wallMat, ox, fY + DIM.parapetHeight / 2, zFront, true, true);
    }
  }

  // Roof Slab
  addBoxMesh(DIM.totalWidth + 0.6, 0.3, DIM.totalDepth + 0.6, wallMat, ox, totalH + 0.15, oz, false, false, true);

  // Central Switchback Staircase
  addTwoToneWall(6.0, totalH, 0.25, ox, 0, oz - 5.65, true);
  addTwoToneWall(0.25, totalH, 8.2, ox - 3.0, 0, oz - 1.5, true);
  addTwoToneWall(0.25, totalH, 8.2, ox + 3.0, 0, oz - 1.5, true);

  for (let f = 0; f < numFloors - 1; f++) {
    const baseY = f * DIM.floorHeight;
    const midY = baseY + 2.1;
    addBoxMesh(5.7, 0.22, 2.2, MAT.lowerGranite, ox, midY - 0.11, oz - 4.4, false);
    const stepRise = 2.1 / 10;
    const stepDepth = 4.5 / 10;
    for (let i = 0; i < 10; i++) {
      addBoxMesh(2.5, stepRise, stepDepth, MAT.lowerGranite, ox + 1.45, baseY + (i + 0.5) * stepRise, oz + 1.2 - (i + 0.5) * stepDepth, false);
      addBoxMesh(2.5, stepRise, stepDepth, MAT.upperCement, ox - 1.45, midY + (i + 0.5) * stepRise, oz - 3.3 + (i + 0.5) * stepDepth, false);
    }
  }

  // Outer Back/Side Walls & Interior Rooms
  addBoxMesh(DIM.totalWidth, totalH, 0.25, wallMat, ox, totalH / 2, zBack, true);
  addBoxMesh(0.25, totalH, DIM.totalDepth, wallMat, ox - DIM.totalWidth / 2, totalH / 2, oz, true);
  addBoxMesh(0.25, totalH, DIM.totalDepth, wallMat, ox + DIM.totalWidth / 2, totalH / 2, oz, true);

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

      const pivot = new THREE.Group();
      pivot.position.set(dX - DIM.doorWidth / 2, fY, zPart);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(DIM.doorWidth, DIM.doorHeight, 0.06), MAT.woodDoor);
      panel.position.set(DIM.doorWidth / 2, DIM.doorHeight / 2, 0);
      pivot.add(panel);
      scene.add(pivot);
      pivot.rotation.y = -1.25;
      interactiveDoors.push({ pivot, isOpen: true, pos: new THREE.Vector3(dX, fY + 1.2, zPart), name: `${bCfg.id} ${f}F-${r.suffix}` });

      addBoxMesh(2.3, 0.78, 0.4, MAT.shoeRackWood, cX + 1.4, fY + 0.44, zPart + 0.35, true);
      addBoxMesh(1.3, 0.8, 0.65, MAT.shoeRackWood, cX - 2.6, fY + 0.4, oz - 3.5, true);
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          addBoxMesh(1.7, 0.75, 0.65, MAT.shoeRackWood, cX - 1.5 + col * 3.0, fY + 0.375, oz - 1.8 + row * 2.1, true);
        }
      }
    });
  }

  // Signboards
  const mainSign = new THREE.Mesh(
    new THREE.BoxGeometry(6.2, 1.5, 0.14),
    new THREE.MeshStandardMaterial({ map: createSignTexture(bCfg.signLines, bCfg.signColor) })
  );
  mainSign.position.set(ox, totalH - 0.76, zFront + 0.28);
  scene.add(mainSign);

  const subSign = new THREE.Mesh(
    new THREE.BoxGeometry(4.4, 1.15, 0.1),
    new THREE.MeshStandardMaterial({ map: createSignTexture(bCfg.subSignLines, bCfg.signColor) })
  );
  subSign.position.set(ox + 8.0, 2.25, zFront + 0.24);
  scene.add(subSign);

  // ==========================================================================
  // DISTINCT ARCHITECTURAL SILHOUETTES & EXTERIORS
  // ==========================================================================
  if (bCfg.archStyle === 'AIML_CLASSIC') {
    for (let f = 0; f < numFloors; f++) {
      const fY = f * DIM.floorHeight;
      const spandrelH = f === numFloors - 1 ? 1.55 : 1.35;
      addBoxMesh(DIM.totalWidth, spandrelH, 0.25, wallMat, ox, (f + 1) * DIM.floorHeight - spandrelH / 2, zFront, false, true);
      addBoxMesh(DIM.totalWidth + 0.4, 0.18, 0.12, trimMat, ox, fY + DIM.parapetHeight, zFront + 0.15, false, true);
      addBoxMesh(DIM.totalWidth + 0.5, 0.22, 0.14, trimMat, ox, (f + 1) * DIM.floorHeight, zFront + 0.16, false, true);
    }
    [-23.0, -18.0, -13.0, -8.0, -3.0, 3.0, 8.0, 13.0, 18.0, 23.0].forEach((cx) => {
      addBoxMesh(0.4, totalH, 0.35, wallMat, ox + cx, totalH / 2, zFront, false, true);
      addBoxMesh(0.22, totalH + 0.3, 0.1, trimMat, ox + cx, totalH / 2, zFront + 0.18, false, true);
    });
    const porticoZ = zFront + 2.2;
    addBoxMesh(6.2, 0.18, 4.6, MAT.corridorTile, ox, 0.09, zFront + 2.1, false);
    addBoxMesh(0.46, 3.25, 0.46, MAT.porticoPillar, ox - 2.4, 1.62, porticoZ, true);
    addBoxMesh(0.46, 3.25, 0.46, MAT.porticoPillar, ox + 2.4, 1.62, porticoZ, true);
    const lSlope = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.18, 4.8), wallMat);
    lSlope.position.set(ox - 1.55, 3.65, zFront + 2.1); lSlope.rotation.z = 0.24; scene.add(lSlope);
    const rSlope = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.18, 4.8), wallMat);
    rSlope.position.set(ox + 1.55, 3.65, zFront + 2.1); rSlope.rotation.z = -0.24; scene.add(rSlope);
    addBoxMesh(6.2, 2.7, 5.4, wallMat, ox, totalH + 1.5, oz - 2.3, false, false, true);
    [-16.5, -11.5, 6.8, 11.8, 16.8].forEach((sx) => {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.12, 2.3), MAT.solarPanel);
      panel.position.set(ox + sx, totalH + 0.6, oz + 2.8); panel.rotation.x = 0.28;
      scene.add(panel); roofMeshesForSpectator.push(panel);
    });
  } else if (bCfg.archStyle === 'CRC_GLASS_TOWER') {
    // 3-Floor High-Tech Glass Curtain-Wall Tower + Twin Geodesic Domes
    const atriumGlass = new THREE.Mesh(new THREE.BoxGeometry(7.8, totalH - 2.5, 0.2), MAT.glassCurtain);
    atriumGlass.position.set(ox, (totalH + 2.5) / 2, zFront + 0.2);
    scene.add(atriumGlass);
    cutawayMeshes.push(atriumGlass);

    const cyanGlow = new THREE.MeshStandardMaterial({ color: 0x38BDF8, emissive: 0x0284C7, emissiveIntensity: 0.75 });
    [-23, -15, -7, -3.8, 3.8, 7, 15, 23].forEach((cx) => {
      addBoxMesh(0.65, totalH + 1.0, 0.75, trimMat, ox + cx, (totalH + 1.0) / 2, zFront + 0.15, false);
    });
    for (let f = 1; f <= numFloors; f++) {
      addBoxMesh(DIM.totalWidth + 1.2, 0.4, 0.95, trimMat, ox, f * DIM.floorHeight, zFront + 0.25, false);
      addBoxMesh(DIM.totalWidth + 1.3, 0.09, 1.0, cyanGlow, ox, f * DIM.floorHeight + 0.22, zFront + 0.25, false);
    }

    // Cantilevered Steel Entrance Canopy
    addBoxMesh(9.0, 0.35, 5.8, trimMat, ox, 3.6, zFront + 2.8, false);
    addBoxMesh(9.1, 0.1, 5.9, cyanGlow, ox, 3.82, zFront + 2.8, false);
    [-3.6, 3.6].forEach((px) => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 3.6, 16), new THREE.MeshStandardMaterial({ color: 0x94A3B8, metalness: 0.85, roughness: 0.2 }));
      col.position.set(ox + px, 1.8, zFront + 5.0);
      scene.add(col);
    });

    // Twin Geodesic Radar Domes on Roof
    [-8.0, 8.0].forEach((dx) => {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(2.6, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xF8FAFC, metalness: 0.3, roughness: 0.4 }));
      dome.position.set(ox + dx, totalH + 0.3, oz);
      scene.add(dome);
      roofMeshesForSpectator.push(dome);
    });
  } else if (bCfg.archStyle === 'GBL_HERITAGE') {
    // Heritage Sandstone & Brick Wing with Arched Colonnade, Hip Roof & Clock Tower Spire
    const brickMat = new THREE.MeshStandardMaterial({ color: 0x9A3412, roughness: 0.85 });
    const roofTileMat = new THREE.MeshStandardMaterial({ color: 0xB91C1C, roughness: 0.75 });

    [-23, -18.5, -14, -9.5, -5, 5, 9.5, 14, 18.5, 23].forEach((cx) => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, totalH, 12), brickMat);
      col.position.set(ox + cx, totalH / 2, zFront + 0.15);
      scene.add(col);
    });
    for (let f = 0; f < numFloors; f++) {
      addBoxMesh(DIM.totalWidth + 0.8, 0.95, 0.5, brickMat, ox, (f + 1) * DIM.floorHeight - 0.5, zFront + 0.18, false, true);
    }

    // Classical Stepped Porch
    addBoxMesh(8.2, 0.24, 5.2, brickMat, ox, 0.12, zFront + 2.4, false);
    [-3.2, -2.1, 2.1, 3.2].forEach((px) => {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 3.8, 12), wallMat);
      col.position.set(ox + px, 1.9, zFront + 4.4);
      scene.add(col);
    });
    addBoxMesh(8.6, 0.65, 5.4, brickMat, ox, 4.0, zFront + 2.4, false);

    // Pitched Terracotta Hip Roof
    const frontPitch = new THREE.Mesh(new THREE.BoxGeometry(DIM.totalWidth + 1.8, 0.25, 7.2), roofTileMat);
    frontPitch.position.set(ox, totalH + 1.6, oz + 2.8);
    frontPitch.rotation.x = 0.38;
    scene.add(frontPitch);
    roofMeshesForSpectator.push(frontPitch);

    const backPitch = new THREE.Mesh(new THREE.BoxGeometry(DIM.totalWidth + 1.8, 0.25, 7.2), roofTileMat);
    backPitch.position.set(ox, totalH + 1.6, oz - 2.8);
    backPitch.rotation.x = -0.38;
    scene.add(backPitch);
    roofMeshesForSpectator.push(backPitch);

    // Central Clock Tower & Pyramid Spire
    addBoxMesh(5.6, 4.2, 5.0, wallMat, ox, totalH + 2.2, oz, false, false, true);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(4.2, 3.2, 4), roofTileMat);
    spire.position.set(ox, totalH + 5.9, oz);
    spire.rotation.y = Math.PI / 4;
    scene.add(spire);
    roofMeshesForSpectator.push(spire);

    const clockFace = new THREE.Mesh(new THREE.CircleGeometry(1.15, 24), new THREE.MeshBasicMaterial({ color: 0xFFFBEB }));
    clockFace.position.set(ox, totalH + 2.8, oz + 2.55);
    scene.add(clockFace);
    roofMeshesForSpectator.push(clockFace);
  } else {
    // ANNEX PAVILION: Sweeping Barrel-Vault Roof & Diagonal Teal Sun-Fins
    const tealMat = new THREE.MeshStandardMaterial({ color: 0x0D9488, metalness: 0.4, roughness: 0.3 });
    for (let x = -22; x <= 22; x += 2.2) {
      if (Math.abs(x) < 3.5) continue;
      const louver = new THREE.Mesh(new THREE.BoxGeometry(0.18, totalH, 0.55), tealMat);
      louver.position.set(ox + x, totalH / 2, zFront + 0.2);
      louver.rotation.y = 0.45;
      scene.add(louver);
    }
    const vault = new THREE.Mesh(
      new THREE.CylinderGeometry(6.0, 6.0, DIM.totalWidth + 0.8, 24, 1, false, 0, Math.PI),
      tealMat
    );
    vault.rotation.z = Math.PI / 2;
    vault.scale.set(0.45, 1, 1);
    vault.position.set(ox, totalH + 0.2, oz);
    scene.add(vault);
    roofMeshesForSpectator.push(vault);
  }
}

// ============================================================================
// 5. EXPANDED CAMPUS MAP & PESCE FOOTBALL TURF STADIUM
// ============================================================================
function buildExpandedCampus() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(450, 450),
    new THREE.MeshStandardMaterial({ color: 0x688048, roughness: 0.95 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  scene.add(ground);

  addBoxMesh(215, 0.06, 8.0, MAT.roadAsphalt, 0, 0.0, 29.0, false);
  addBoxMesh(7.5, 0.06, 75.0, MAT.roadAsphalt, -32.0, 0.0, 52.0, false);

  CAMPUS_BUILDINGS.forEach((bCfg) => buildDepartmentBuilding(bCfg));

  const fx = FOOTBALL_FIELD_CONFIG.centerX;
  const fz = FOOTBALL_FIELD_CONFIG.centerZ;
  const pLen = FOOTBALL_FIELD_CONFIG.pitchLength;
  const pWid = FOOTBALL_FIELD_CONFIG.pitchWidth;

  addBoxMesh(pLen + 8.0, 0.05, pWid + 8.0, new THREE.MeshStandardMaterial({ color: 0x993322, roughness: 0.85 }), fx, 0.0, fz, false);

  const pitchMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(pLen, pWid),
    new THREE.MeshStandardMaterial({ map: createFootballPitchTexture(), roughness: 0.75 })
  );
  pitchMesh.rotation.x = -Math.PI / 2;
  pitchMesh.position.set(fx, 0.04, fz);
  pitchMesh.receiveShadow = true;
  scene.add(pitchMesh);

  const postMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.2 });
  [-1, 1].forEach((dir) => {
    const gx = fx + dir * (pLen / 2 - 2.6);
    addBoxMesh(0.16, 2.6, 0.16, postMat, gx, 1.3, fz - 3.6, true);
    addBoxMesh(0.16, 2.6, 0.16, postMat, gx, 1.3, fz + 3.6, true);
    addBoxMesh(0.16, 0.16, 7.36, postMat, gx, 2.6, fz, false);
  });
}

buildExpandedCampus();

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
// 8. FLOOR HEIGHTFIELD & ZONE RESOLVER
// ============================================================================
function computeCampusHeight(x, z, curY) {
  for (const bCfg of CAMPUS_BUILDINGS) {
    const lx = x - bCfg.offsetX;
    const lz = z - bCfg.offsetZ;
    if (Math.abs(lx) <= DIM.totalWidth / 2 + 0.5 && Math.abs(lz) <= DIM.totalDepth / 2 + 0.5) {
      const maxFloorY = (bCfg.floors - 1) * DIM.floorHeight;
      if (lx >= -2.85 && lx <= 2.85) {
        for (let f = 0; f < bCfg.floors - 1; f++) {
          const baseY = f * DIM.floorHeight;
          const midY = baseY + 2.1;
          const topY = (f + 1) * DIM.floorHeight;
          if (lz >= -5.6 && lz <= -3.3 && curY >= baseY + 1.0 && curY <= topY - 0.9) return midY;
          if (lx >= 0.0 && lz >= -3.3 && lz <= 1.2 && curY >= baseY - 0.4 && curY < midY + 0.55) {
            return baseY + THREE.MathUtils.clamp((1.2 - lz) / 4.5, 0, 1) * 2.1;
          }
          if (lx < 0.0 && lz >= -3.3 && lz <= 1.2 && curY >= midY - 0.6 && curY <= topY + 0.5) {
            return midY + THREE.MathUtils.clamp((lz + 3.3) / 4.5, 0, 1) * 2.1;
          }
        }
      }
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
  const fx = FOOTBALL_FIELD_CONFIG.centerX;
  const fz = FOOTBALL_FIELD_CONFIG.centerZ;
  if (Math.abs(pos.x - fx) <= 42 && Math.abs(pos.z - fz) <= 28) return '⚽ Football Turf';

  for (const bCfg of CAMPUS_BUILDINGS) {
    const lx = pos.x - bCfg.offsetX;
    const lz = pos.z - bCfg.offsetZ;
    if (Math.abs(lx) <= 23.5 && Math.abs(lz) <= 8.5) {
      const fIdx = Math.round(pos.y / DIM.floorHeight);
      const fName = fIdx === 0 ? 'GF' : `${fIdx}F`;
      if (lz > 5.8) return `${bCfg.id} Portico`;
      if (lz > 2.6) return `${bCfg.id} ${fName} Corridor`;
      if (Math.abs(lx) <= 3.0) return `${bCfg.id} Staircase`;
      const room = LOCAL_FLOOR_ROOMS.find((r) => lx >= r.xMin && lx <= r.xMax);
      if (room) return `${bCfg.id} ${fName}-${room.suffix}`;
    }
  }
  return 'Campus Avenue';
}

function formatSec(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function createMarkerSprite(label, hex) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fillRect(8, 16, 496, 96);
  ctx.strokeStyle = `#${hex.toString(16).padStart(6, '0')}`;
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 16, 496, 96);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 38px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 64);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.position.set(0, 2.35, 0);
  s.scale.set(3.4, 0.85, 1);
  return s;
}

const otherTeamNodes = new Map();
REGISTERED_TEAMS.forEach((t) => {
  const char = new ArticulatedHumanCharacter({ shirtColor: t.shirtColor, accentColor: t.color });
  char.root.add(createMarkerSprite(t.teamName, t.color));
  scene.add(char.root);
  otherTeamNodes.set(t.teamId, { char, latestData: null });
});

// ============================================================================
// 9A. SEPARATE ADMIN PAGE LOGIC (GOD-MODE ONLY IN ADMIN.HTML)
// ============================================================================
let adminCameraMode = 'TOPDOWN';
let adminFollowTeamId = null;

if (IS_ADMIN_PAGE) {
  flagSystem.setSpectator(true);
  roofMeshesForSpectator.forEach((m) => { m.visible = false; });

  const adminOverlay = document.getElementById('admin-login-overlay');
  const adminPassIn = document.getElementById('admin-pass-input');
  const adminErr = document.getElementById('admin-login-err');

  function unlockAdmin() {
    if (adminPassIn.value.trim() === ADMIN_PASSCODE) {
      sessionStorage.setItem('TECHYON_ADMIN_AUTH', '1');
      adminOverlay.style.display = 'none';
    } else {
      adminErr.textContent = 'Invalid organizer passcode (use tachyonadmin).';
    }
  }

  if (sessionStorage.getItem('TECHYON_ADMIN_AUTH') === '1') {
    adminOverlay.style.display = 'none';
  }
  document.getElementById('btn-admin-unlock').addEventListener('click', unlockAdmin);
  adminPassIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') unlockAdmin(); });

  const camStatusEl = document.getElementById('admin-cam-status');
  const btnTopDown = document.getElementById('btn-admin-topdown');
  const btnFreeOrbit = document.getElementById('btn-admin-freeorbit');

  btnTopDown.addEventListener('click', () => {
    adminCameraMode = 'TOPDOWN';
    adminFollowTeamId = null;
    orbitControls.enabled = false;
    btnTopDown.classList.add('active');
    btnFreeOrbit.classList.remove('active');
    camStatusEl.textContent = '📷 Camera: Top-Down Orthographic God-Mode';
  });

  btnFreeOrbit.addEventListener('click', () => {
    adminCameraMode = 'FREE_ORBIT';
    adminFollowTeamId = null;
    orbitControls.enabled = true;
    playerCamera.position.set(0, 45, 75);
    orbitControls.target.set(0, 2, 10);
    orbitControls.update();
    btnFreeOrbit.classList.add('active');
    btnTopDown.classList.remove('active');
    camStatusEl.textContent = '📷 Camera: Free 3D Campus Drone';
  });

  let roofsHidden = true;
  document.getElementById('btn-admin-roof').addEventListener('click', (e) => {
    roofsHidden = !roofsHidden;
    roofMeshesForSpectator.forEach((m) => { m.visible = !roofsHidden; });
    e.currentTarget.textContent = roofsHidden ? '🏠 Roofs: Hidden (Interior X-Ray)' : '🏠 Roofs: Visible';
  });

  document.getElementById('btn-admin-reset-all').addEventListener('click', async () => {
    if (confirm('Reset all 12 teams to 0/5 flags and clear penalties?')) {
      await gameService.resetAllTeams();
    }
  });

  window.addEventListener('wheel', (e) => {
    if (adminCameraMode === 'TOPDOWN') {
      orthoSize = THREE.MathUtils.clamp(orthoSize + e.deltaY * 0.04, 25, 135);
      const asp = window.innerWidth / window.innerHeight;
      spectatorCamera.left = -orthoSize * asp;
      spectatorCamera.right = orthoSize * asp;
      spectatorCamera.top = orthoSize;
      spectatorCamera.bottom = -orthoSize;
      spectatorCamera.updateProjectionMatrix();
    }
  });

  gameService.subscribeSpectator((list) => {
    const tb = document.getElementById('spectator-tbody');
    tb.innerHTML = '';
    list.forEach((item, idx) => {
      const node = otherTeamNodes.get(item.teamId);
      if (node) {
        node.latestData = item;
        node.char.root.visible = true;
        node.char.root.position.set(item.position.x, item.position.y, item.position.z);
        node.char.root.rotation.y = item.position.yaw || 0;
      }

      const isFollowing = adminCameraMode === 'FOLLOW_TEAM' && adminFollowTeamId === item.teamId;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color:#38bdf8; font-weight:700;">#${idx + 1}</td>
        <td style="font-weight:700;">${item.teamName}</td>
        <td style="color:#a7f3d0;">${item.position.zone || getCampusZoneLabel(item.position)}</td>
        <td><span style="padding:2px 6px; border-radius:4px; background:rgba(255,255,255,0.08); font-size:10px;">${item.status === 'COMPLETED' ? '🏆 FINISHED' : (item.position.anim || 'IDLE')}</span></td>
        <td style="color:${item.flagsCollected === 5 ? '#10b981' : '#fff'}; font-weight:700;">${item.flagsCollected}/5</td>
        <td style="color:${item.penaltySeconds > 0 ? '#f43f5e' : '#94a3b8'};">+${item.penaltySeconds}s</td>
        <td>${formatSec(item.effSec)}</td>
        <td><button class="follow-btn ${isFollowing ? 'active' : ''}" data-tid="${item.teamId}">${isFollowing ? '👁️ Following' : 'Follow 3D'}</button></td>
      `;
      tb.appendChild(tr);
    });

    tb.querySelectorAll('.follow-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tid = btn.dataset.tid;
        if (adminCameraMode === 'FOLLOW_TEAM' && adminFollowTeamId === tid) {
          btnTopDown.click();
        } else {
          adminCameraMode = 'FOLLOW_TEAM';
          adminFollowTeamId = tid;
          orbitControls.enabled = false;
          btnTopDown.classList.remove('active');
          btnFreeOrbit.classList.remove('active');
          const cfg = REGISTERED_TEAMS.find((t) => t.teamId === tid);
          camStatusEl.textContent = `📷 Following Live: ${cfg ? cfg.teamName : tid}`;
        }
      });
    });
  });

  const clock = new THREE.Clock();
  function animateAdmin() {
    requestAnimationFrame(animateAdmin);
    const dt = Math.min(clock.getDelta(), 0.1);

    for (const { char, latestData } of otherTeamNodes.values()) {
      const spd = latestData?.position?.anim === 'WALKING' || latestData?.position?.anim === 'RUNNING' ? 5.5 : 0;
      char.update(dt, spd);
    }

    if (adminCameraMode === 'FREE_ORBIT') {
      orbitControls.update();
      renderer.render(scene, playerCamera);
    } else if (adminCameraMode === 'FOLLOW_TEAM' && adminFollowTeamId) {
      const targetNode = otherTeamNodes.get(adminFollowTeamId);
      if (targetNode) {
        const p = targetNode.char.root.position;
        const yaw = targetNode.char.root.rotation.y;
        const eye = new THREE.Vector3(p.x, p.y + 1.8, p.z);
        const back = new THREE.Vector3(Math.sin(yaw) * 4.2, 1.2, Math.cos(yaw) * 4.2);
        playerCamera.position.lerp(eye.clone().add(back), 0.15);
        playerCamera.lookAt(p.x, p.y + 1.3, p.z);
      }
      renderer.render(scene, playerCamera);
    } else {
      renderer.render(scene, spectatorCamera);
    }
  }
  animateAdmin();
}

// ============================================================================
// 9B. PARTICIPANT PAGE LOGIC (TEAM 1..12 LOGIN GATE + GAMEPLAY LOOP)
// ============================================================================
if (!IS_ADMIN_PAGE) {
  let activeTeamId = null;
  let currentTeamState = null;

  const player = {
    pos: new THREE.Vector3(0, 0, 11.5),
    yaw: 0,
    pitch: -0.08,
    speed: 6.2,
    sprintMultiplier: 1.75,
    radius: 0.36,
    thirdPerson: true,
    orbitMode: false
  };

  const playerAvatar = new ArticulatedHumanCharacter({
    shirtColor: REGISTERED_TEAMS[0].shirtColor,
    accentColor: REGISTERED_TEAMS[0].color
  });
  scene.add(playerAvatar.root);

  const loginOverlay = document.getElementById('login-overlay');
  const loginSelect = document.getElementById('login-team-select');
  const loginPass = document.getElementById('login-pass-input');
  const loginErr = document.getElementById('login-error-msg');
  const lockedBadge = document.getElementById('locked-team-badge');

  REGISTERED_TEAMS.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.teamId;
    opt.textContent = t.teamName;
    loginSelect.appendChild(opt);
  });

  let unsubTeam = null;
  function startParticipantSession(teamCfg) {
    activeTeamId = teamCfg.teamId;
    sessionStorage.setItem('TECHYON_TEAM_ID', teamCfg.teamId);
    loginOverlay.style.display = 'none';
    lockedBadge.textContent = `🛡️ ${teamCfg.teamName}`;
    lockedBadge.className = 'pill active';

    playerAvatar.mat.shirt.color.setHex(teamCfg.shirtColor);
    playerAvatar.mat.packTrim.color.setHex(teamCfg.color);
    playerAvatar.mat.packTrim.emissive.setHex(teamCfg.color);

    if (unsubTeam) unsubTeam();
    unsubTeam = gameService.subscribeTeam(activeTeamId, (state) => {
      currentTeamState = state;
      document.getElementById('hud-flag-counter').textContent = `🚩 Flags: ${state.flagsCollected || 0} / 5`;
      document.getElementById('btn-submit-run').style.display = (state.flagsCollected || 0) >= 5 ? 'inline-flex' : 'none';
      playerAvatar.syncInventory(state.collectedFlagIds || []);
      flagSystem.syncCollected(state.collectedFlagIds || []);
    });
  }

  function handleParticipantLogin() {
    const selectedId = loginSelect.value;
    const pass = loginPass.value.trim();
    const teamCfg = REGISTERED_TEAMS.find((t) => t.teamId === selectedId);
    if (!teamCfg || teamCfg.password !== pass) {
      loginErr.textContent = 'Incorrect password for this team (e.g., tachyon001 for Team 1).';
      return;
    }
    loginErr.textContent = '';
    startParticipantSession(teamCfg);
  }

  document.getElementById('btn-login-submit').addEventListener('click', handleParticipantLogin);
  loginPass.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleParticipantLogin(); });

  const savedTeamId = sessionStorage.getItem('TECHYON_TEAM_ID');
  if (savedTeamId) {
    const found = REGISTERED_TEAMS.find((t) => t.teamId === savedTeamId);
    if (found) startParticipantSession(found);
  }

  document.getElementById('btn-logout').addEventListener('click', () => {
    sessionStorage.removeItem('TECHYON_TEAM_ID');
    activeTeamId = null;
    loginPass.value = '';
    loginOverlay.style.display = 'flex';
  });

  gameService.subscribeSpectator((list) => {
    list.forEach((item) => {
      const node = otherTeamNodes.get(item.teamId);
      if (node) {
        if (item.teamId === activeTeamId) {
          node.char.root.visible = false;
        } else {
          node.char.root.visible = true;
          node.char.root.position.set(item.position.x, item.position.y, item.position.z);
          node.char.root.rotation.y = item.position.yaw || 0;
        }
      }
    });
  });

  const connBadgeEl = document.getElementById('conn-badge');
  if (gameService.connected) {
    connBadgeEl.textContent = '⚡ FIREBASE CLOUD';
    connBadgeEl.className = 'pill firebase-connected';
  }

  const toastEl = document.getElementById('interaction-toast');
  const feedbackEl = document.getElementById('feedback-banner');
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
    if (!activeFlagForPin || !activeTeamId) return;
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

  document.getElementById('btn-submit-run').addEventListener('click', () => {
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
    if (!activeTeamId || pinModal.classList.contains('open') || invModal.classList.contains('open')) return;
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
    if (loginOverlay.style.display !== 'none') return;
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
    if (!isDrag || player.orbitMode) return;
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

  const clock = new THREE.Clock();
  let syncTimer = 0;

  function animateParticipant() {
    requestAnimationFrame(animateParticipant);
    const dt = Math.min(clock.getDelta(), 0.1);
    let speed = 0;

    if (player.orbitMode) {
      orbitControls.update();
    } else if (activeTeamId && !pinModal.classList.contains('open') && !invModal.classList.contains('open')) {
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

      const zoneLabel = getCampusZoneLabel(player.pos);
      const floorNum = Math.round(player.pos.y / DIM.floorHeight);
      document.getElementById('elevation-indicator').textContent = `Elev: ${player.pos.y.toFixed(1)}m (${floorNum === 0 ? 'Ground' : `${floorNum}F`})`;
      document.getElementById('room-indicator').textContent = `Zone: ${zoneLabel}`;

      syncTimer += dt;
      if (syncTimer >= 0.2) {
        syncTimer = 0;
        const animLabel = speed > 7.5 ? 'RUNNING' : speed > 0.2 ? 'WALKING' : 'IDLE';
        gameService.updatePosition(activeTeamId, player.pos.x, player.pos.y, player.pos.z, player.yaw, animLabel, zoneLabel);
      }
    }

    playerAvatar.update(dt, speed);
    flagSystem.update(dt);

    if (currentTeamState) {
      const now = Date.now();
      const end = currentTeamState.completedAt || now;
      document.getElementById('hud-timer').textContent = `⏱️ ${formatSec(Math.max(0, Math.floor((end - (currentTeamState.startedAt || now)) / 1000)))}`;
      const penEl = document.getElementById('penalty-banner');
      if (currentTeamState.penaltyActiveUntil > now) {
        penEl.style.display = 'inline-flex';
        penEl.textContent = `⚠️ DECOY PENALTY: ${Math.ceil((currentTeamState.penaltyActiveUntil - now) / 1000)}s`;
      } else {
        penEl.style.display = 'none';
      }
    }

    const nearFlag = flagSystem.findInteractable(player.pos);
    toastEl.style.opacity = nearFlag ? '1' : '0';
    if (nearFlag) toastEl.textContent = `⚡ Press [E] to interact with ${nearFlag.code}`;

    renderer.render(scene, playerCamera);
  }
  animateParticipant();
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

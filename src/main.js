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
  ROOM_MANIFEST,
  TELEPORT_ZONES,
  QUEST_RULES,
  PUBLIC_FLAG_MANIFEST,
  REGISTERED_TEAMS
} from './config/buildingConfig.js';

// ============================================================================
// 1. LIVE FIREBASE FIRESTORE SERVICE LAYER (PROJECT: dtth-f2c8e)
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
    this.listeners = new Set();
    this.spectatorListeners = new Set();

    try {
      this.app = initializeApp(FIREBASE_CONFIG);
      this.db = getFirestore(this.app);
      this.connected = true;
      console.log('Firebase initialized successfully for dtth-f2c8e');
    } catch (err) {
      console.warn('Firebase init warning, fallback active:', err);
      this.connected = false;
    }

    this._ensureTeamsSeeded();
  }

  async _ensureTeamsSeeded() {
    if (!this.connected) return;
    const now = Date.now();
    const waypoints = [
      [0, 0, 11.5], [-16.0, 0, 4.1], [-8.5, 0, -1.5], [8.2, 0, 4.2],
      [17.5, 0, -2.0], [-1.4, 2.1, -4.2], [-18.0, 4.2, 4.2], [-9.0, 4.2, -1.8],
      [7.5, 4.2, 4.2], [16.5, 4.2, -1.4], [0.0, 4.2, 4.0], [-14.0, 0, 4.2]
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
      } catch (e) {
        console.warn('Could not seed team (check Firestore rules):', e);
      }
    }
  }

  subscribeTeam(teamId, cb) {
    if (this.connected) {
      const ref = doc(this.db, 'teams', teamId);
      return onSnapshot(ref, (snap) => {
        if (snap.exists()) {
          cb(snap.data());
        }
      }, (err) => console.warn('Team snapshot error:', err));
    }
    return () => {};
  }

  subscribeSpectator(cb) {
    if (this.connected) {
      const colRef = collection(this.db, 'teams');
      return onSnapshot(colRef, (snap) => {
        const list = [];
        const now = Date.now();
        snap.forEach((d) => {
          const t = d.data();
          const endRef = t.completedAt || now;
          const rawSec = Math.max(0, Math.floor((endRef - t.startedAt) / 1000));
          const effSec = rawSec + (t.penaltySeconds || 0);
          list.push({
            teamId: t.teamId,
            teamName: t.teamName,
            flagsCollected: t.flagsCollected || 0,
            penaltySeconds: t.penaltySeconds || 0,
            isPenaltyActive: t.penaltyActiveUntil > now,
            status: t.status || 'IN_PROGRESS',
            rawSec,
            effSec,
            position: t.position || { x: 0, y: 0, z: 10, yaw: 0 }
          });
        });

        list.sort((a, b) => (b.flagsCollected !== a.flagsCollected)
          ? (b.flagsCollected - a.flagsCollected)
          : (a.effSec - b.effSec));
        cb(list);
      }, (err) => console.warn('Spectator collection error:', err));
    }
    return () => {};
  }

  async updatePosition(teamId, x, y, z, yaw, anim) {
    if (!this.connected) return;
    try {
      const ref = doc(this.db, 'teams', teamId);
      await updateDoc(ref, {
        position: {
          x: Number(x.toFixed(2)),
          y: Number(y.toFixed(2)),
          z: Number(z.toFixed(2)),
          yaw: Number(yaw.toFixed(2)),
          anim
        },
        lastUpdatedAt: Date.now()
      });
    } catch {
      // Degrade gracefully on high frequency
    }
  }

  async validateAndCollect(teamId, flagId, rawPin) {
    const pin = typeof rawPin === 'string' ? rawPin.trim() : '';
    if (!/^\d{4}$/.test(pin)) {
      return { ok: false, message: 'Enter an exact 4-digit numeric code (e.g., 0047).' };
    }

    if (DEV_PINS[flagId] !== pin) {
      return { ok: false, message: 'Access Denied: Incorrect 4-digit PIN.' };
    }

    if (!this.connected) {
      return { ok: false, message: 'Firebase offline.' };
    }

    try {
      const ref = doc(this.db, 'teams', teamId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return { ok: false, message: 'Team record not found.' };

      const data = snap.data();
      if (data.status === 'COMPLETED') return { ok: false, message: 'Run already completed.' };
      if (data.collectedFlagIds?.includes(flagId)) {
        return { ok: false, message: 'Flag already collected in your backpack.' };
      }

      const now = Date.now();
      const updatedList = [...(data.collectedFlagIds || []), flagId];
      const updatedTimestamps = { ...(data.collectionTimestamps || {}), [flagId]: now };

      await updateDoc(ref, {
        collectedFlagIds: updatedList,
        flagsCollected: updatedList.length,
        collectionTimestamps: updatedTimestamps,
        lastUpdatedAt: now
      });

      return {
        ok: true,
        flagsCollected: updatedList.length,
        message: `Unlocked! Flag added to backpack (#${updatedList.length}/5).`
      };
    } catch (e) {
      return { ok: false, message: `Cloud error: ${e.message}` };
    }
  }

  async applyDecoy(teamId, decoyFlagId) {
    const now = Date.now();
    const coolKey = `${teamId}:${decoyFlagId}`;
    if (now - (this.decoyCooldowns.get(coolKey) || 0) < 8000) {
      return { ok: false, message: 'Decoy cooldown active.' };
    }
    this.decoyCooldowns.set(coolKey, now);

    if (!this.connected) return { ok: false, message: 'Offline.' };

    try {
      const ref = doc(this.db, 'teams', teamId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return { ok: false, message: 'Team not found.' };
      const data = snap.data();
      if (data.status === 'COMPLETED') return { ok: false, message: 'Inactive.' };

      const pen = QUEST_RULES.decoyPenaltySeconds;
      const totalPen = (data.penaltySeconds || 0) + pen;
      const base = Math.max(now, data.penaltyActiveUntil || 0);
      const activeUntil = base + pen * 1000;

      await updateDoc(ref, {
        penaltySeconds: totalPen,
        penaltyActiveUntil: activeUntil,
        lastUpdatedAt: now
      });

      return { ok: true, message: `DECOY TRAP! +${pen}s penalty applied to ${data.teamName}.` };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  async submitRun(teamId) {
    if (!this.connected) return { ok: false, message: 'Offline.' };
    try {
      const ref = doc(this.db, 'teams', teamId);
      const snap = await getDoc(ref);
      if (!snap.exists()) return { ok: false, message: 'Team not found.' };
      const data = snap.data();

      if (data.status === 'COMPLETED') {
        return { ok: true, message: 'Run was already completed and locked.' };
      }
      if ((data.flagsCollected || 0) < QUEST_RULES.totalLegitimateFlags) {
        return { ok: false, message: `Collect all 5 flags first (${data.flagsCollected}/5).` };
      }

      await updateDoc(ref, {
        completedAt: Date.now(),
        status: 'COMPLETED',
        lastUpdatedAt: Date.now()
      });

      return { ok: true, message: 'Congratulations! 5/5 flags verified and completion locked.' };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }
}

const gameService = new FirebaseGameService();

// ============================================================================
// 2. 3D SCENE, DUAL CAMERAS & ENVIRONMENT
// ============================================================================
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
container.appendChild(renderer.domElement);

const playerCamera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 220);

// Top-Down Orthographic Spectator God-Mode Camera
const orthoSize = 30;
const aspect = window.innerWidth / window.innerHeight;
const spectatorCamera = new THREE.OrthographicCamera(
  -orthoSize * aspect, orthoSize * aspect, orthoSize, -orthoSize, 1, 160
);
spectatorCamera.position.set(0, 65, 0.01);
spectatorCamera.up.set(0, 0, -1);
spectatorCamera.lookAt(0, 0, 2);

const orbitControls = new OrbitControls(playerCamera, renderer.domElement);
orbitControls.enableDamping = true;
orbitControls.dampingFactor = 0.06;
orbitControls.maxPolarAngle = Math.PI / 2 - 0.03;
orbitControls.target.set(0, 3.8, 0);
orbitControls.enabled = false;

const ambientLight = new THREE.HemisphereLight(0xFFF7ED, 0x6B7280, 0.85);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xFFE4B5, 2.1);
sunLight.position.set(28, 36, 32);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
const d = 32;
sunLight.shadow.camera.left = -d;
sunLight.shadow.camera.right = d;
sunLight.shadow.camera.top = d;
sunLight.shadow.camera.bottom = -d;
scene.add(sunLight);

let isGoldenHour = true;
function applyLightingPreset(golden) {
  scene.background = new THREE.Color(golden ? 0xE89D54 : 0x87CEEB);
  scene.fog = new THREE.FogExp2(golden ? 0xE89D54 : 0x87CEEB, 0.0055);
  sunLight.color.setHex(golden ? 0xFFD29D : 0xFFFFFF);
}
applyLightingPreset(true);

// ============================================================================
// 3. TEXTURES & PRESERVED 2-FLOOR 8-ROOM ARCHITECTURE
// ============================================================================
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

function createSignTexture(lines, bg = '#18509E') {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 320;
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = 10;
  ctx.strokeRect(12, 12, c.width - 24, c.height - 24);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => {
    ctx.font = i === 0 ? 'bold 44px sans-serif' : 'bold 32px sans-serif';
    ctx.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * 66);
  });
  return new THREE.CanvasTexture(c);
}

const MAT = {
  facadeCream: new THREE.MeshStandardMaterial({ color: PALETTE.facadeCream, roughness: 0.85 }),
  terracotta: new THREE.MeshStandardMaterial({ color: PALETTE.terracottaTrim, roughness: 0.75 }),
  interiorUpper: new THREE.MeshStandardMaterial({ color: PALETTE.interiorUpper, roughness: 0.85 }),
  interiorDado: new THREE.MeshStandardMaterial({ color: PALETTE.interiorDado, roughness: 0.65 }),
  corridorTile: new THREE.MeshStandardMaterial({ map: createTileTexture('#6A524A', '#7A6056', 22, 6), roughness: 0.35 }),
  roomTile: new THREE.MeshStandardMaterial({ map: createTileTexture('#C5C2BA', '#E2E0D8', 5, 4), roughness: 0.3 }),
  lowerGranite: new THREE.MeshStandardMaterial({ color: PALETTE.lowerStairGranite, roughness: 0.25 }),
  upperCement: new THREE.MeshStandardMaterial({ color: PALETTE.upperStairCement, roughness: 0.6 }),
  woodDoor: new THREE.MeshStandardMaterial({ color: PALETTE.woodDoor, roughness: 0.5 }),
  shoeRackWood: new THREE.MeshStandardMaterial({ color: PALETTE.shoeRackWood, roughness: 0.4 })
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

function buildBuilding() {
  const g = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), new THREE.MeshStandardMaterial({ color: 0x748B54 }));
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  scene.add(g);

  addBoxMesh(6.5, 0.08, 22, new THREE.MeshStandardMaterial({ color: 0xEDE9E0 }), 0, 0, 16.5, false);

  addBoxMesh(DIM.totalWidth, 0.25, DIM.totalDepth, MAT.facadeCream, 0, -0.125, 0, false);
  addBoxMesh(20.0, 0.26, DIM.totalDepth, MAT.facadeCream, -13.0, DIM.floorHeight - 0.13, 0, false);
  addBoxMesh(20.0, 0.26, DIM.totalDepth, MAT.facadeCream, 13.0, DIM.floorHeight - 0.13, 0, false);
  addBoxMesh(6.0, 0.26, 4.0, MAT.facadeCream, 0, DIM.floorHeight - 0.13, 3.8, false);
  addBoxMesh(DIM.totalWidth - 0.4, 0.03, DIM.corridorDepth, MAT.corridorTile, 0, 0.015, 4.2, false);
  addBoxMesh(DIM.totalWidth - 0.4, 0.03, DIM.corridorDepth, MAT.corridorTile, 0, DIM.floorHeight + 0.015, 4.2, false);
  addBoxMesh(DIM.totalWidth + 0.6, 0.3, DIM.totalDepth + 0.6, MAT.facadeCream, 0, DIM.floorHeight * 2 + 0.15, 0, false, false, true);

  const zF = DIM.totalDepth / 2;
  addBoxMesh(20.4, DIM.parapetHeight, 0.25, MAT.facadeCream, -12.8, DIM.parapetHeight / 2, zF, true, true);
  addBoxMesh(20.4, DIM.parapetHeight, 0.25, MAT.facadeCream, 12.8, DIM.parapetHeight / 2, zF, true, true);
  addBoxMesh(DIM.totalWidth, DIM.parapetHeight, 0.25, MAT.facadeCream, 0, DIM.floorHeight + DIM.parapetHeight / 2, zF, true, true);

  [-23.0, -13.0, -3.0, 3.0, 13.0, 23.0].forEach((cx) => {
    addBoxMesh(0.48, DIM.floorHeight * 2, 0.45, MAT.facadeCream, cx, DIM.floorHeight, zF - 0.05, true);
    addBoxMesh(0.24, DIM.floorHeight * 2 + 0.4, 0.08, MAT.terracotta, cx, DIM.floorHeight, zF + 0.18, false);
  });

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(5.8, 1.55, 0.12),
    new THREE.MeshStandardMaterial({
      map: createSignTexture(['COMPUTER SCIENCE & ENGINEERING', '( Artificial Intelligence & Machine Learning )'])
    })
  );
  sign.position.set(0, DIM.floorHeight * 2 - 0.78, zF + 0.22);
  scene.add(sign);

  addBoxMesh(6.2, 0.16, 4.6, MAT.corridorTile, 0, 0.08, zF + 2.1, false);
  addBoxMesh(0.45, 3.2, 0.45, MAT.facadeCream, -2.4, 1.6, zF + 2.2, true);
  addBoxMesh(0.45, 3.2, 0.45, MAT.facadeCream, 2.4, 1.6, zF + 2.2, true);

  // Switchback Stairs
  addTwoToneWall(6.0, DIM.floorHeight * 2, 0.25, 0, 0, -5.65, true);
  addTwoToneWall(0.25, DIM.floorHeight * 2, 8.2, -3.0, 0, -1.5, true);
  addTwoToneWall(0.25, DIM.floorHeight * 2, 8.2, 3.0, 0, -1.5, true);
  addBoxMesh(5.7, 0.22, 2.2, MAT.lowerGranite, 0, 2.1 - 0.11, -4.4, false);

  const stepRise = 2.1 / 10;
  const stepDepth = 4.5 / 10;
  for (let i = 0; i < 10; i++) {
    addBoxMesh(2.5, stepRise, stepDepth, MAT.lowerGranite, 1.45, (i + 0.5) * stepRise, 1.2 - (i + 0.5) * stepDepth, false);
    addBoxMesh(2.5, stepRise, stepDepth, MAT.upperCement, -1.45, 2.1 + (i + 0.5) * stepRise, -3.3 + (i + 0.5) * stepDepth, false);
  }

  // 8 Rooms
  const zBack = -DIM.totalDepth / 2;
  const zPart = 2.6;
  addBoxMesh(DIM.totalWidth, DIM.floorHeight * 2, 0.25, MAT.facadeCream, 0, DIM.floorHeight, zBack, true);
  addBoxMesh(0.25, DIM.floorHeight * 2, DIM.totalDepth, MAT.facadeCream, -DIM.totalWidth / 2, DIM.floorHeight, 0, true);
  addBoxMesh(0.25, DIM.floorHeight * 2, DIM.totalDepth, MAT.facadeCream, DIM.totalWidth / 2, DIM.floorHeight, 0, true);

  ROOM_MANIFEST.forEach((r) => {
    const fY = r.floor * DIM.floorHeight;
    const cX = (r.xMin + r.xMax) / 2;
    const cZ = (zBack + zPart) / 2;

    addBoxMesh(DIM.roomWidth - 0.3, 0.03, DIM.roomDepth - 0.3, MAT.roomTile, cX, fY + 0.02, cZ, false);
    if (r.xMax === -13.0 || r.xMax === 13.0) {
      addTwoToneWall(0.22, DIM.floorHeight - 0.25, DIM.roomDepth, r.xMax, fY, cZ, true);
    }

    const leftW = (r.doorX - DIM.doorWidth / 2) - r.xMin;
    const rightW = r.xMax - (r.doorX + DIM.doorWidth / 2);
    if (leftW > 0.1) addTwoToneWall(leftW, DIM.floorHeight - 0.25, 0.24, r.xMin + leftW / 2, fY, zPart, true);
    if (rightW > 0.1) addTwoToneWall(rightW, DIM.floorHeight - 0.25, 0.24, r.doorX + DIM.doorWidth / 2 + rightW / 2, fY, zPart, true);

    const pivot = new THREE.Group();
    pivot.position.set(r.doorX - DIM.doorWidth / 2, fY, zPart);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(DIM.doorWidth, DIM.doorHeight, 0.06), MAT.woodDoor);
    panel.position.set(DIM.doorWidth / 2, DIM.doorHeight / 2, 0);
    pivot.add(panel);
    scene.add(pivot);
    pivot.rotation.y = -1.25;
    interactiveDoors.push({ pivot, isOpen: true, pos: new THREE.Vector3(r.doorX, fY + 1.2, zPart), name: r.name });

    addBoxMesh(2.4, 0.78, 0.42, MAT.shoeRackWood, cX + 1.4, fY + 0.44, zPart + 0.35, true);
    addBoxMesh(1.3, 0.8, 0.65, MAT.shoeRackWood, cX - 2.6, fY + 0.4, -3.5, true);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        addBoxMesh(1.7, 0.75, 0.65, MAT.shoeRackWood, cX - 1.5 + col * 3.0, fY + 0.375, -1.8 + row * 2.1, true);
      }
    }
  });
}
buildBuilding();

// ============================================================================
// 4. ARTICULATED HUMAN CHARACTER WITH SKELETON & 3D BACKPACK
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
// 5. FLAGS & DECOYS SYSTEM
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

      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 0.14, 6), MAT.lowerGranite);
      base.position.y = 0.07;
      g.add(base);

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.85), new THREE.MeshStandardMaterial({ color: 0xE2E8F0, emissive: m.color, emissiveIntensity: 0.3 }));
      pole.position.y = 0.98;
      g.add(pole);

      const banner = new THREE.Mesh(
        new THREE.PlaneGeometry(0.75, 0.45),
        new THREE.MeshStandardMaterial({ color: m.color, emissive: m.color, emissiveIntensity: 0.8, side: THREE.DoubleSide })
      );
      banner.position.set(0.4, 1.55, 0);
      g.add(banner);

      const light = new THREE.PointLight(m.color, 1.2, 4.2);
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
      if (Math.abs(n.meta.position[1] - playerPos.y) > 1.5) continue;
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
// 6. PLAYER, MULTI-TEAM MARKERS & CONTROLLER
// ============================================================================
let activeTeamId = REGISTERED_TEAMS[0].teamId;
let currentTeamState = null;

const player = {
  pos: new THREE.Vector3(0, 0, 9.5),
  yaw: 0,
  pitch: -0.08,
  speed: 5.4,
  sprintMultiplier: 1.65,
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
  s.scale.set(2.8, 0.7, 1);
  return s;
}

const otherTeamNodes = new Map();
REGISTERED_TEAMS.forEach((t) => {
  const char = new ArticulatedHumanCharacter({ shirtColor: t.shirtColor, accentColor: t.color });
  char.root.add(createMarkerSprite(t.teamName.split('•')[1].trim(), t.color));
  scene.add(char.root);
  otherTeamNodes.set(t.teamId, char);
});

// ============================================================================
// 7. HUD, MODALS & EVENT HANDLERS
// ============================================================================
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
  showBanner._t = setTimeout(() => { feedbackEl.style.opacity = '0'; }, 3000);
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

// PIN Modal
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

// Inventory Modal
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
      <div><b>Slot #${i + 1}: ${f.code}</b> — ${f.title}</div>
      <div style="color:${col ? '#34d399' : '#64748b'}; font-weight:700;">${col ? '✅ IN BACKPACK' : '🔒 LOCKED'}</div>
    `;
    c.appendChild(div);
  });
  invModal.classList.add('open');
}
document.getElementById('btn-backpack').addEventListener('click', openInventory);
document.getElementById('btn-inv-close').addEventListener('click', () => invModal.classList.remove('open'));

// Submit Run Modal
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

// Spectator God-Mode Toggle
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

// Controls & Movement
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
  if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].includes(e.code)) {
    const z = TELEPORT_ZONES[Number(e.code.replace('Digit', ''))];
    if (z) {
      player.pos.set(z.pos[0], z.pos[1], z.pos[2]);
      player.yaw = z.yaw;
    }
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

function computeHeight(x, z, curY) {
  if (x >= -2.85 && x <= 2.85) {
    if (z >= -5.6 && z <= -3.3 && curY >= 1.1 && curY <= 3.2) return 2.1;
    if (x >= 0.0 && z >= -3.3 && z <= 1.2 && curY < 2.6) return THREE.MathUtils.clamp((1.2 - z) / 4.5, 0, 1) * 2.1;
    if (x < 0.0 && z >= -3.3 && z <= 1.2 && curY >= 1.5) return 2.1 + THREE.MathUtils.clamp((z + 3.3) / 4.5, 0, 1) * 2.1;
  }
  return curY >= 2.95 ? DIM.floorHeight : 0.0;
}

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
  isGoldenHour = !isGoldenHour;
  applyLightingPreset(isGoldenHour);
  e.currentTarget.textContent = isGoldenHour ? '🌅 Golden Hour' : '☀️ Daylight';
});
document.getElementById('btn-reset-pos').addEventListener('click', () => player.pos.set(0, 0, 9.5));

// ============================================================================
// 8. ANIMATION LOOP & CLOUD BROADCAST
// ============================================================================
const clock = new THREE.Clock();
let syncTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  let speed = 0;

  if (!player.spectatorMode && !pinModal.classList.contains('open') && !invModal.classList.contains('open')) {
    let mf = 0, mr = 0;
    if (keys['KeyW'] || keys['ArrowUp']) mf += 1;
    if (keys['KeyS'] || keys['ArrowDown']) mf -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) mr += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) mr -= 1;

    const len = Math.hypot(mf, mr);
    if (len > 0) {
      mf /= len; mr /= len;
      speed = player.speed * (keys['ShiftLeft'] ? player.sprintMultiplier : 1.0);
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      const dx = (-sin * mf + cos * mr) * speed * dt;
      const dz = (-cos * mf - sin * mr) * speed * dt;
      if (!checkCollision(player.pos.x + dx, player.pos.z, player.pos.y)) player.pos.x += dx;
      if (!checkCollision(player.pos.x, player.pos.z + dz, player.pos.y)) player.pos.z += dz;
    }

    const tY = computeHeight(player.pos.x, player.pos.z, player.pos.y);
    player.pos.y = THREE.MathUtils.lerp(player.pos.y, tY, 0.28);
    playerAvatar.root.position.copy(player.pos);
    playerAvatar.root.rotation.y = player.yaw;

    const eye = new THREE.Vector3(player.pos.x, player.pos.y + 1.62, player.pos.z);
    const look = new THREE.Vector3(-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch));

    if (player.thirdPerson) {
      playerCamera.position.copy(eye).add(look.clone().multiplyScalar(-3.3)).add(new THREE.Vector3(0, 0.6, 0));
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

// src/config/buildingConfig.js

// ============================================================================
// FIREBASE CLOUD CONFIGURATION (PROJECT: dtth-f2c8e)
// ============================================================================
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDSyGu6lrZy4i560cqMBhN-XR0OX9VT5G4",
  authDomain: "dtth-f2c8e.firebaseapp.com",
  projectId: "dtth-f2c8e",
  storageBucket: "dtth-f2c8e.firebasestorage.app",
  messagingSenderId: "688251611682",
  appId: "1:688251611682:web:21a33dd8dfbf2e72a5f87b",
  measurementId: "G-93C0PFJ6JZ"
};

export const BUILDING_DIMENSIONS = {
  totalWidth: 46.0,
  totalDepth: 11.6,
  corridorDepth: 3.2,
  roomDepth: 8.4,
  floorHeight: 4.2,
  wallThickness: 0.24,
  parapetHeight: 1.12,
  dadoHeight: 1.25,
  doorWidth: 1.25,
  doorHeight: 2.35,
  stairBayWidth: 6.0,
  roomWidth: 10.0
};

export const PALETTE = {
  facadeCream: 0xF3EFE0,
  terracottaTrim: 0xC64932,
  crcBlueTrim: 0x1E40AF,
  gblOchreTrim: 0xB45309,
  interiorUpper: 0xF5F2E6,
  interiorDado: 0x96999A,
  corridorTile: 0x6E564E,
  roomFloorTile: 0xD8D6D0,
  lowerStairGranite: 0x26282A,
  upperStairCement: 0xAEB2B5,
  railingSteel: 0x181A1C,
  handrailWood: 0xDFDCD5,
  woodDoor: 0x5C3824,
  shoeRackWood: 0x3D221A,
  signBlue: 0x1856A8,
  porticoPillar: 0x1A1C1E,
  aluminumFrame: 0xD0D5DD,
  fireRed: 0xD92626
};

// ============================================================================
// MULTI-BUILDING CAMPUS MANIFEST (AIML, CRC 3-FLOOR, GBL 2-FLOOR, ANNEX)
// ============================================================================
export const CAMPUS_BUILDINGS = [
  {
    id: 'AIML',
    name: 'AIML & CSE Department',
    floors: 2,
    offsetX: 0,
    offsetZ: 0,
    trimColor: 0xC64932,
    signLines: ['COMPUTER SCIENCE & ENGINEERING', '( Artificial Intelligence & Machine Learning )'],
    subSignLines: ['DEPARTMENT OF', 'ELECTRONICS & COMMUNICATION ENGINEERING', '( VLSI DESIGN & TECHNOLOGY )'],
    hasSolarPanels: true
  },
  {
    id: 'CRC',
    name: 'CRC Block (Central Computing & Research)',
    floors: 3, // 3 FULL NAVIGABLE FLOORS (Ground, 1st, 2nd Floor)
    offsetX: -66.0,
    offsetZ: 0,
    trimColor: 0x1D4ED8,
    signLines: ['CRC — CENTRAL REFERENCE & COMPUTING BLOCK', '( 3-Floor Academic & Research Center )'],
    subSignLines: ['CRC LECTURE COMPLEX', 'GROUND • FIRST • SECOND FLOOR'],
    hasSolarPanels: true
  },
  {
    id: 'GBL',
    name: 'GBL Block (General & Golden Jubilee Labs)',
    floors: 2, // 2 FULL NAVIGABLE FLOORS
    offsetX: 66.0,
    offsetZ: 0,
    trimColor: 0xB45309,
    signLines: ['GBL — GOLDEN JUBILEE ACADEMIC BLOCK', '( General Engineering & Science Wing )'],
    subSignLines: ['GBL SEMINAR & LAB COMPLEX', 'PESCE MANDYA CAMPUS'],
    hasSolarPanels: false
  },
  {
    id: 'ANNEX',
    name: 'PESCE Innovation & Placement Annex',
    floors: 2,
    offsetX: -66.0,
    offsetZ: 58.0,
    trimColor: 0x0F766E,
    signLines: ['INNOVATION & INCUBATION ANNEX', '( Techyon Event Operations Center )'],
    subSignLines: ['AUDITORIUM & TRAINING LABS', 'PESCE MANDYA'],
    hasSolarPanels: false
  }
];

export const FOOTBALL_FIELD_CONFIG = {
  centerX: 22.0,
  centerZ: 64.0,
  pitchLength: 76.0, // Along X axis
  pitchWidth: 48.0   // Along Z axis
};

// 8 Rooms per floor template relative to each building's local origin
export const LOCAL_FLOOR_ROOMS = [
  { suffix: 'L1', title: 'West Wing Lab / Hall 1', xMin: -23.0, xMax: -13.0, doorX: -19.2, type: 'lab' },
  { suffix: 'L2', title: 'West Wing Classroom 2', xMin: -13.0, xMax: -3.0, doorX: -9.2, type: 'classroom' },
  { suffix: 'R1', title: 'East Wing Lab / Hall 3', xMin: 3.0, xMax: 13.0, doorX: 6.8, type: 'lab' },
  { suffix: 'R2', title: 'East Wing Classroom 4', xMin: 13.0, xMax: 23.0, doorX: 16.8, type: 'classroom' }
];

// Teleport Presets (Keys 1 - 8)
export const TELEPORT_ZONES = {
  1: { name: 'AIML Reference Angle', pos: [-14, 7.5, 22], yaw: 0, orbit: true, target: [2, 3.8, 0] },
  2: { name: 'AIML Entrance Portico', pos: [0, 0, 11.5], yaw: 0, orbit: false },
  3: { name: 'AIML Switchback Stairs', pos: [-1.4, 0, 3.6], yaw: 0, orbit: false },
  4: { name: 'AIML 1st Floor Lab (F-L1)', pos: [-18.0, 4.2, -1.0], yaw: 0, orbit: false },
  5: { name: 'CRC Building (3 Floors)', pos: [-66.0, 0, 14.0], yaw: 0, orbit: false },
  6: { name: 'CRC 2nd Floor (Top Level)', pos: [-66.0, 8.4, 4.2], yaw: -Math.PI / 2, orbit: false },
  7: { name: 'GBL Building (2 Floors)', pos: [66.0, 0, 14.0], yaw: 0, orbit: false },
  8: { name: 'PESCE Football Turf', pos: [22.0, 0, 36.0], yaw: Math.PI, orbit: false }
};

export const QUEST_RULES = {
  totalLegitimateFlags: 5,
  decoyPenaltySeconds: 30,
  interactionRadius: 2.6
};

// ============================================================================
// 5 LEGITIMATE FLAGS + 3 DECOYS (DISTRIBUTED ACROSS AIML, CRC, GBL & TURF)
// ============================================================================
export const PUBLIC_FLAG_MANIFEST = [
  {
    flagId: 'FLAG-01',
    slotIndex: 0,
    code: 'TQ-ALPHA',
    title: 'Alpha Beacon — AIML Under-Stair Vault',
    clueHint: 'Hidden under the Ground Floor central switchback staircase inside the AIML Building.',
    roomCode: 'AIML-STAIR-GF',
    floor: 0,
    position: [-1.8, 0.0, -4.6],
    color: 0x00F5D4,
    kind: 'LEGITIMATE'
  },
  {
    flagId: 'FLAG-02',
    slotIndex: 1,
    code: 'TQ-BETA',
    title: 'Beta Core — AIML 1st Floor Lab (1F-L1)',
    clueHint: 'Secured inside the First Floor AI & Machine Learning Lab 1 (West Wing of AIML Building).',
    roomCode: 'AIML-1F-L1',
    floor: 1,
    position: [-21.4, 4.2, -4.6],
    color: 0x38BDF8,
    kind: 'LEGITIMATE'
  },
  {
    flagId: 'FLAG-03',
    slotIndex: 2,
    code: 'TQ-GAMMA',
    title: 'Gamma Node — CRC 2nd Floor Summit (Top Floor)',
    clueHint: 'Climb to the 3rd level (2nd Floor, Y=8.4m) of the CRC Building and check the West Research Lab.',
    roomCode: 'CRC-2F-L1',
    floor: 2,
    position: [-87.4, 8.4, -4.6],
    color: 0x10B981,
    kind: 'LEGITIMATE'
  },
  {
    flagId: 'FLAG-04',
    slotIndex: 3,
    code: 'TQ-DELTA',
    title: 'Delta Tensor — GBL 1st Floor East Wing',
    clueHint: 'Located inside the GBL Building First Floor East Classroom (GBL-1F-R2).',
    roomCode: 'GBL-1F-R2',
    floor: 1,
    position: [87.4, 4.2, -4.6],
    color: 0xA855F7,
    kind: 'LEGITIMATE'
  },
  {
    flagId: 'FLAG-05',
    slotIndex: 4,
    code: 'TQ-OMEGA',
    title: 'Omega Singularity — Football Turf Center Circle',
    clueHint: 'Positioned at the heart of the PESCE Football Turf Stadium.',
    roomCode: 'FOOTBALL-TURF',
    floor: 0,
    position: [22.0, 0.0, 64.0],
    color: 0xF59E0B,
    kind: 'LEGITIMATE'
  },

  // 3 Decoy Flags (+30s Penalty)
  {
    flagId: 'DECOY-01',
    code: 'DX-MIRAGE-1',
    title: 'Unstable Signal Node (AIML GF-R1)',
    clueHint: 'Decoy warning: wireframe core in AIML Ground Floor East Lab.',
    roomCode: 'AIML-GF-R1',
    floor: 0,
    position: [11.5, 0.0, -4.6],
    color: 0xF43F5E,
    kind: 'DECOY'
  },
  {
    flagId: 'DECOY-02',
    code: 'DX-MIRAGE-2',
    title: 'CRC 1st Floor Ghost Relay',
    clueHint: 'Decoy warning: located in CRC 1st Floor corridor.',
    roomCode: 'CRC-1F-CORR',
    floor: 1,
    position: [-87.5, 4.2, 4.5],
    color: 0xF43F5E,
    kind: 'DECOY'
  },
  {
    flagId: 'DECOY-03',
    code: 'DX-MIRAGE-3',
    title: 'GBL Ground Floor Phantom',
    clueHint: 'Decoy warning: located in GBL Ground Floor West Room.',
    roomCode: 'GBL-GF-L1',
    floor: 0,
    position: [44.6, 0.0, -4.6],
    color: 0xF43F5E,
    kind: 'DECOY'
  }
];

export const REGISTERED_TEAMS = [
  { teamId: 'team-01', teamName: 'Team 01 • CyberSentinels', color: 0x14B8A6, shirtColor: 0x0D9488 },
  { teamId: 'team-02', teamName: 'Team 02 • NeuralNomads', color: 0x3B82F6, shirtColor: 0x2563EB },
  { teamId: 'team-03', teamName: 'Team 03 • QuantumQuasar', color: 0x8B5CF6, shirtColor: 0x7C3AED },
  { teamId: 'team-04', teamName: 'Team 04 • TensorTitans', color: 0xF59E0B, shirtColor: 0xD97706 },
  { teamId: 'team-05', teamName: 'Team 05 • MandyaMatrix', color: 0xEC4899, shirtColor: 0xDB2777 },
  { teamId: 'team-06', teamName: 'Team 06 • SiliconSpartans', color: 0x10B981, shirtColor: 0x059669 },
  { teamId: 'team-07', teamName: 'Team 07 • ZeroDayZealots', color: 0x06B6D4, shirtColor: 0x0891B2 },
  { teamId: 'team-08', teamName: 'Team 08 • ApexAlgorithms', color: 0x6366F1, shirtColor: 0x4F46E5 },
  { teamId: 'team-09', teamName: 'Team 09 • BinaryBrigade', color: 0x84CC16, shirtColor: 0x65A30D },
  { teamId: 'team-10', teamName: 'Team 10 • VectorVanguard', color: 0xF97316, shirtColor: 0xEA580C },
  { teamId: 'team-11', teamName: 'Team 11 • DeepSeekers', color: 0x14B8A6, shirtColor: 0x0F766E },
  { teamId: 'team-12', teamName: 'Team 12 • TachyonPulse', color: 0xA855F7, shirtColor: 0x9333EA }
];

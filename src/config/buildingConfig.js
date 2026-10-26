// src/config/buildingConfig.js

export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDSyGu6lrZy4i560cqMBhN-XR0OX9VT5G4",
  authDomain: "dtth-f2c8e.firebaseapp.com",
  projectId: "dtth-f2c8e",
  storageBucket: "dtth-f2c8e.firebasestorage.app",
  messagingSenderId: "688251611682",
  appId: "1:688251611682:web:21a33dd8dfbf2e72a5f87b",
  measurementId: "G-93C0PFJ6JZ"
};

export const ADMIN_PASSCODE = "tachyonadmin";

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
  interiorUpper: 0xF5F2E6,
  interiorDado: 0x96999A,
  corridorTile: 0x6E564E,
  roomFloorTile: 0xD8D6D0,
  lowerStairGranite: 0x26282A,
  upperStairCement: 0xAEB2B5,
  railingSteel: 0x181A1C,
  woodDoor: 0x5C3824,
  shoeRackWood: 0x3D221A,
  porticoPillar: 0x16181A,
  fireRed: 0xD92626
};

// Distinct architectural styles for each campus building
export const CAMPUS_BUILDINGS = [
  {
    id: 'AIML',
    name: 'AIML & CSE Department',
    archStyle: 'AIML_CLASSIC',
    floors: 2,
    offsetX: 0,
    offsetZ: 0,
    trimColor: 0xC64932,
    signColor: '#1D5B9E',
    signLines: ['COMPUTER SCIENCE & ENGINEERING', '( Artificial Intelligence & Machine Learning )'],
    subSignLines: ['DEPARTMENT OF', 'ELECTRONICS & COMMUNICATION ENGINEERING', '( VLSI DESIGN & TECHNOLOGY )']
  },
  {
    id: 'CRC',
    name: 'CRC Block (3-Floor Glass & Steel Tower)',
    archStyle: 'CRC_GLASS_TOWER',
    floors: 3,
    offsetX: -68.0,
    offsetZ: 0,
    trimColor: 0x1E293B,
    signColor: '#0F172A',
    signLines: ['CRC — CENTRAL COMPUTING & RESEARCH TOWER', '( 3-Floor High-Performance Computing Block )'],
    subSignLines: ['CRC SMART LECTURE COMPLEX', 'GROUND • 1ST • 2ND FLOOR']
  },
  {
    id: 'GBL',
    name: 'GBL Block (Heritage Clock-Tower Wing)',
    archStyle: 'GBL_HERITAGE',
    floors: 2,
    offsetX: 68.0,
    offsetZ: 0,
    trimColor: 0x9A3412,
    signColor: '#7C2D12',
    signLines: ['GBL — GOLDEN JUBILEE HERITAGE BLOCK', '( General Engineering & Basic Sciences )'],
    subSignLines: ['GBL ARCHED VERANDA WING', 'PESCE MANDYA CAMPUS']
  },
  {
    id: 'ANNEX',
    name: 'Innovation & Incubation Pavilion',
    archStyle: 'ANNEX_PAVILION',
    floors: 2,
    offsetX: -68.0,
    offsetZ: 58.0,
    trimColor: 0x0D9488,
    signColor: '#115E59',
    signLines: ['TACHYON INNOVATION & INCUBATION PAVILION', '( Robotics & Autonomous Systems Wing )'],
    subSignLines: ['STARTUP INCUBATOR', 'PESCE MANDYA']
  }
];

export const FOOTBALL_FIELD_CONFIG = {
  centerX: 22.0,
  centerZ: 64.0,
  pitchLength: 76.0,
  pitchWidth: 48.0
};

export const LOCAL_FLOOR_ROOMS = [
  { suffix: 'L1', title: 'West Wing Lab 1', xMin: -23.0, xMax: -13.0, doorX: -19.2 },
  { suffix: 'L2', title: 'West Classroom 2', xMin: -13.0, xMax: -3.0, doorX: -9.2 },
  { suffix: 'R1', title: 'East Wing Lab 3', xMin: 3.0, xMax: 13.0, doorX: 6.8 },
  { suffix: 'R2', title: 'East Classroom 4', xMin: 13.0, xMax: 23.0, doorX: 16.8 }
];

export const TELEPORT_ZONES = {
  1: { name: 'AIML Reference View', pos: [-14, 7.5, 22], yaw: 0, orbit: true, target: [2, 3.8, 0] },
  2: { name: 'AIML Portico', pos: [0, 0, 11.5], yaw: 0, orbit: false },
  3: { name: 'AIML Stairs', pos: [-1.4, 0, 3.6], yaw: 0, orbit: false },
  4: { name: 'AIML 1st Floor Lab', pos: [-18.0, 4.2, -1.0], yaw: 0, orbit: false },
  5: { name: 'CRC Tower (3 Floors)', pos: [-68.0, 0, 15.0], yaw: 0, orbit: false },
  6: { name: 'CRC 2nd Floor (Top)', pos: [-68.0, 8.4, 4.2], yaw: -Math.PI / 2, orbit: false },
  7: { name: 'GBL Heritage Block', pos: [68.0, 0, 15.0], yaw: 0, orbit: false },
  8: { name: 'PESCE Football Turf', pos: [22.0, 0, 36.0], yaw: Math.PI, orbit: false }
};

export const QUEST_RULES = {
  totalLegitimateFlags: 5,
  decoyPenaltySeconds: 30,
  interactionRadius: 2.6
};

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
    clueHint: 'Secured inside the First Floor AI & Machine Learning Lab 1 (West Wing of AIML).',
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
    title: 'Gamma Node — CRC 2nd Floor Summit',
    clueHint: 'Climb to the top 2nd Floor (Y=8.4m) of the 3-story glass CRC Tower and check West Lab L1.',
    roomCode: 'CRC-2F-L1',
    floor: 2,
    position: [-89.4, 8.4, -4.6],
    color: 0x10B981,
    kind: 'LEGITIMATE'
  },
  {
    flagId: 'FLAG-04',
    slotIndex: 3,
    code: 'TQ-DELTA',
    title: 'Delta Tensor — GBL 1st Floor East Wing',
    clueHint: 'Located inside the GBL Heritage Building First Floor East Classroom (GBL-1F-R2).',
    roomCode: 'GBL-1F-R2',
    floor: 1,
    position: [89.4, 4.2, -4.6],
    color: 0xA855F7,
    kind: 'LEGITIMATE'
  },
  {
    flagId: 'FLAG-05',
    slotIndex: 4,
    code: 'TQ-OMEGA',
    title: 'Omega Singularity — Football Turf Center Circle',
    clueHint: 'Positioned at the center circle of the PESCE Football Turf Stadium.',
    roomCode: 'FOOTBALL-TURF',
    floor: 0,
    position: [22.0, 0.0, 64.0],
    color: 0xF59E0B,
    kind: 'LEGITIMATE'
  },
  {
    flagId: 'DECOY-01',
    code: 'DX-MIRAGE-1',
    title: 'Unstable Signal Node (AIML GF-R1)',
    clueHint: 'Decoy trap in AIML Ground Floor East Lab.',
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
    clueHint: 'Decoy trap in CRC 1st Floor corridor.',
    roomCode: 'CRC-1F-CORR',
    floor: 1,
    position: [-89.5, 4.2, 4.5],
    color: 0xF43F5E,
    kind: 'DECOY'
  },
  {
    flagId: 'DECOY-03',
    code: 'DX-MIRAGE-3',
    title: 'GBL Ground Floor Phantom',
    clueHint: 'Decoy trap in GBL Ground Floor West Room.',
    roomCode: 'GBL-GF-L1',
    floor: 0,
    position: [46.6, 0.0, -4.6],
    color: 0xF43F5E,
    kind: 'DECOY'
  }
];

// Strictly named Team 1 .. Team 12 with passwords tachyon001 .. tachyon012
export const REGISTERED_TEAMS = [
  { teamId: 'team-01', teamName: 'Team 1', password: 'tachyon001', color: 0x14B8A6, shirtColor: 0x0D9488 },
  { teamId: 'team-02', teamName: 'Team 2', password: 'tachyon002', color: 0x3B82F6, shirtColor: 0x2563EB },
  { teamId: 'team-03', teamName: 'Team 3', password: 'tachyon003', color: 0x8B5CF6, shirtColor: 0x7C3AED },
  { teamId: 'team-04', teamName: 'Team 4', password: 'tachyon004', color: 0xF59E0B, shirtColor: 0xD97706 },
  { teamId: 'team-05', teamName: 'Team 5', password: 'tachyon005', color: 0xEC4899, shirtColor: 0xDB2777 },
  { teamId: 'team-06', teamName: 'Team 6', password: 'tachyon006', color: 0x10B981, shirtColor: 0x059669 },
  { teamId: 'team-07', teamName: 'Team 7', password: 'tachyon007', color: 0x06B6D4, shirtColor: 0x0891B2 },
  { teamId: 'team-08', teamName: 'Team 8', password: 'tachyon008', color: 0x6366F1, shirtColor: 0x4F46E5 },
  { teamId: 'team-09', teamName: 'Team 9', password: 'tachyon009', color: 0x84CC16, shirtColor: 0x65A30D },
  { teamId: 'team-10', teamName: 'Team 10', password: 'tachyon010', color: 0xF97316, shirtColor: 0xEA580C },
  { teamId: 'team-11', teamName: 'Team 11', password: 'tachyon011', color: 0xE11D48, shirtColor: 0xBE123C },
  { teamId: 'team-12', teamName: 'Team 12', password: 'tachyon012', color: 0xA855F7, shirtColor: 0x9333EA }
];

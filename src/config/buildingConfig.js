// src/config/buildingConfig.js

// ============================================================================
// ARCHITECTURAL DIMENSIONS & GRID
// ============================================================================
export const BUILDING_DIMENSIONS = {
  totalWidth: 46.0,       // X: -23m to +23m
  totalDepth: 11.6,       // Z: -5.8m to +5.8m
  corridorDepth: 3.2,     // Z: +2.6m to +5.8m
  roomDepth: 8.4,         // Z: -5.8m to +2.6m
  floorHeight: 4.2,       // Ground Y=0.0m, First Floor Y=4.2m, Roof Y=8.4m
  wallThickness: 0.24,
  parapetHeight: 1.12,
  dadoHeight: 1.25,
  doorWidth: 1.25,
  doorHeight: 2.35,
  stairBayWidth: 6.0,     // X: -3.0m to +3.0m
  roomWidth: 10.0         // 2 rooms per wing on each floor
};

// ============================================================================
// COLOR PALETTE (MATCHING REAL PHOTOGRAPHS)
// ============================================================================
export const PALETTE = {
  facadeCream: 0xF3EFE0,       // Warm off-white exterior facade
  terracottaTrim: 0xC64932,    // Red-oxide / terracotta pilasters & trim
  interiorUpper: 0xF5F2E6,     // Cream upper interior wall
  interiorDado: 0x96999A,      // Neutral grey lower dado wall
  corridorTile: 0x6E564E,      // Earthy terracotta corridor vitrified tiles
  roomFloorTile: 0xD8D6D0,     // Polished classroom floor
  lowerStairGranite: 0x26282A, // Black/dark grey granite lower stair treads
  upperStairCement: 0xAEB2B5,  // Cement finish upper stair treads
  railingSteel: 0x181A1C,      // Black steel balusters
  handrailWood: 0xDFDCD5,      // Weathered white wood handrail
  woodDoor: 0x5C3824,          // Teak/mahogany doors
  shoeRackWood: 0x3D221A,      // Dark mahogany shoe racks
  signBlue: 0x1B56A8,          // Department royal blue signboard
  porticoPillar: 0x2A2D30,     // Polished granite entrance pillars
  aluminumFrame: 0xD0D5DD,     // Sliding aluminum window frame
  fireRed: 0xD92626
};

// ============================================================================
// MANDATORY 8 ROOMS (2 FLOORS: 2 LEFT + 2 RIGHT OF CENTRAL STAIRCASE)
// ============================================================================
export const ROOM_MANIFEST = [
  // Ground Floor (Y = 0.0m)
  { id: 'G-L1', name: 'Dept. Seminar Hall & Library', code: 'GF-L1', floor: 0, side: 'LEFT', xMin: -23.0, xMax: -13.0, doorX: -19.2, type: 'classroom' },
  { id: 'G-L2', name: 'AI Foundations Classroom G01', code: 'GF-L2', floor: 0, side: 'LEFT', xMin: -13.0, xMax: -3.0, doorX: -9.2, type: 'classroom' },
  { id: 'G-R1', name: 'Embedded & VLSI Systems Lab', code: 'GF-R1', floor: 0, side: 'RIGHT', xMin: 3.0, xMax: 13.0, doorX: 6.8, type: 'lab' },
  { id: 'G-R2', name: 'Department Office & HOD Chamber', code: 'GF-R2', floor: 0, side: 'RIGHT', xMin: 13.0, xMax: 23.0, doorX: 16.8, type: 'office' },
  // First Floor (Y = 4.2m)
  { id: 'F-L1', name: 'AI & Machine Learning Lab 1', code: '1F-L1', floor: 1, side: 'LEFT', xMin: -23.0, xMax: -13.0, doorX: -19.2, type: 'lab' },
  { id: 'F-L2', name: 'Deep Learning & Vision Lab 2', code: '1F-L2', floor: 1, side: 'LEFT', xMin: -13.0, xMax: -3.0, doorX: -9.2, type: 'lab' },
  { id: 'F-R1', name: 'Smart Classroom 101 (AIML)', code: '1F-R1', floor: 1, side: 'RIGHT', xMin: 3.0, xMax: 13.0, doorX: 6.8, type: 'classroom' },
  { id: 'F-R2', name: 'Smart Classroom 102 (AIML)', code: '1F-R2', floor: 1, side: 'RIGHT', xMin: 13.0, xMax: 23.0, doorX: 16.8, type: 'classroom' }
];

// Teleport Navigation Presets
export const TELEPORT_ZONES = {
  1: { name: 'Exterior Facade', pos: [0, 0, 22], yaw: 0, orbit: true },
  2: { name: 'Main Entrance Portico', pos: [0, 0, 9.5], yaw: 0, orbit: false },
  3: { name: 'Switchback Stairs', pos: [-1.4, 0, 3.6], yaw: 0, orbit: false },
  4: { name: '1st Floor Corridor', pos: [-11.5, 4.2, 4.2], yaw: -Math.PI / 2, orbit: false },
  5: { name: 'AI & ML Lab (F-L1)', pos: [-18.0, 4.2, -1.0], yaw: 0, orbit: false },
  6: { name: 'Smart Classroom (F-R1)', pos: [8.0, 4.2, -1.0], yaw: 0, orbit: false }
};

// ============================================================================
// TECHYON TWIN-QUEST RULES & CONFIGURATION
// ============================================================================
export const QUEST_RULES = {
  totalLegitimateFlags: 5,
  decoyPenaltySeconds: 30,
  interactionRadius: 2.5,
  allowCollectionDuringPenalty: true,
  scoringMode: 'EFFECTIVE_TIME' // Rank by Flags Collected, then (Elapsed + Penalties)
};

// 5 Legitimate Collectible Flags + 3 Decoys (Safe metadata; secret PINs are validated in the service layer)
export const PUBLIC_FLAG_MANIFEST = [
  // 5 Legitimate Flags
  {
    flagId: 'FLAG-01',
    slotIndex: 0,
    code: 'TQ-ALPHA',
    title: 'Alpha Beacon — Seminar Archive',
    clueHint: 'Hidden behind the instructor podium in Ground Floor Dept. Seminar Hall & Library (GF-L1).',
    roomCode: 'GF-L1',
    floor: 0,
    position: [-21.4, 0.0, -4.7],
    color: 0x00F5D4,
    kind: 'LEGITIMATE'
  },
  {
    flagId: 'FLAG-02',
    slotIndex: 1,
    code: 'TQ-BETA',
    title: 'Beta Core — Under-Stair Vault',
    clueHint: 'Tucked inside the Ground Floor central stairwell recess under the switchback mid-landing.',
    roomCode: 'STAIR-GF',
    floor: 0,
    position: [-1.8, 0.0, -4.6],
    color: 0x38BDF8,
    kind: 'LEGITIMATE'
  },
  {
    flagId: 'FLAG-03',
    slotIndex: 2,
    code: 'TQ-GAMMA',
    title: 'Gamma Node — Silicon Testbench',
    clueHint: 'Located at the rear workbench in Ground Floor Embedded & VLSI Systems Lab (GF-R1).',
    roomCode: 'GF-R1',
    floor: 0,
    position: [11.6, 0.0, -4.8],
    color: 0x10B981,
    kind: 'LEGITIMATE'
  },
  {
    flagId: 'FLAG-04',
    slotIndex: 3,
    code: 'TQ-DELTA',
    title: 'Delta Tensor — Neural Cluster',
    clueHint: 'Secured inside First Floor AI & Machine Learning Lab 1 (1F-L1) rear workstation bay.',
    roomCode: '1F-L1',
    floor: 1,
    position: [-21.5, 4.2, -4.6],
    color: 0xA855F7,
    kind: 'LEGITIMATE'
  },
  {
    flagId: 'FLAG-05',
    slotIndex: 4,
    code: 'TQ-OMEGA',
    title: 'Omega Singularity — Lecture Matrix',
    clueHint: 'Stationed in the far eastern corner of First Floor Smart Classroom 102 (1F-R2).',
    roomCode: '1F-R2',
    floor: 1,
    position: [21.5, 4.2, -4.6],
    color: 0xF59E0B,
    kind: 'LEGITIMATE'
  },

  // 3 Decoys (+30s penalty)
  {
    flagId: 'DECOY-01',
    code: 'DX-MIRAGE-1',
    title: 'Unstable Signal Node (GF-L2)',
    clueHint: 'Inspect closely: erratic crimson-amber pulse indicates a decoy trap.',
    roomCode: 'GF-L2',
    floor: 0,
    position: [-4.4, 0.0, -4.5],
    color: 0xF43F5E,
    kind: 'DECOY'
  },
  {
    flagId: 'DECOY-02',
    code: 'DX-MIRAGE-2',
    title: 'Corridor Ghost Relay (1F-CORR)',
    clueHint: 'Placed overtly in the First Floor west corridor end alcove.',
    roomCode: '1F-CORR',
    floor: 1,
    position: [-21.8, 4.2, 4.6],
    color: 0xF43F5E,
    kind: 'DECOY'
  },
  {
    flagId: 'DECOY-03',
    code: 'DX-MIRAGE-3',
    title: 'Vision Lab Phantom (1F-L2)',
    clueHint: 'Located in Deep Learning & Vision Lab 2 (1F-L2). Wireframe core indicates decoy.',
    roomCode: '1F-L2',
    floor: 1,
    position: [-4.5, 4.2, -4.6],
    color: 0xF43F5E,
    kind: 'DECOY'
  }
];

// 12 Participating Teams (Supports 10-15 teams concurrently)
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

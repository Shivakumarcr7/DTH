// src/config/buildingConfig.js

export const BUILDING_DIMENSIONS = {
  totalWidth: 46.0,       // X: -23m to +23m (20m Left Wing + 6m Stair Core + 20m Right Wing)
  totalDepth: 11.6,       // Z: -5.8m (back wall) to +5.8m (front corridor parapet)
  corridorDepth: 3.2,     // Z: +2.6m (partition wall) to +5.8m (front parapet)
  roomDepth: 8.4,         // Z: -5.8m (back wall) to +2.6m (corridor partition wall)
  floorHeight: 4.2,       // Ground Floor Y=0.0m, First Floor Y=4.2m, Roof Y=8.4m
  wallThickness: 0.24,
  parapetHeight: 1.12,
  dadoHeight: 1.25,
  doorWidth: 1.25,
  doorHeight: 2.35,
  stairBayWidth: 6.0,     // X: -3.0m to +3.0m
  roomWidth: 10.0         // 2 rooms per wing on each floor (10m width each)
};

export const PALETTE = {
  facadeCream: 0xF3EFE0,       // Warm off-white / light cream exterior plaster
  terracottaTrim: 0xC64932,    // Red-oxide / terracotta pilasters, slab bands, downpipes
  interiorUpper: 0xF5F2E6,     // Cream upper interior wall
  interiorDado: 0x96999A,      // Neutral medium grey lower dado wall (seen in stair & corridor photos)
  corridorTile: 0x6E564E,      // Earthy brown/terracotta square floor tiles
  roomFloorTile: 0xD8D6D0,     // Polished light vitrified classroom flooring
  lowerStairGranite: 0x26282A, // Dark grey/black granite treads on lower flight
  upperStairCement: 0xAEB2B5,  // Light grey cement finish on upper flight
  railingSteel: 0x181A1C,      // Black painted square steel balusters
  handrailWood: 0xDFDCD5,      // Weathered white-painted timber handrail
  woodDoor: 0x5C3824,          // Teak/mahogany classroom doors
  shoeRackWood: 0x3D221A,      // Dark mahogany corridor shoe rack cubbies
  signBlue: 0x1B56A8,          // Department signage royal blue
  porticoPillar: 0x2A2D30,     // Dark polished granite entrance pillars
  aluminumFrame: 0xD0D5DD,     // Sliding window aluminum frame
  fireRed: 0xD92626
};

// Mandatory 8 Rooms (4 Ground Floor, 4 First Floor: 2 Left + 2 Right of Central Staircase)
export const ROOM_MANIFEST = [
  // ================= GROUND FLOOR (Y = 0.0m) =================
  {
    id: 'G-L1',
    name: 'Dept. Seminar Hall & Library',
    code: 'GF-L1',
    floor: 0,
    side: 'LEFT',
    xMin: -23.0,
    xMax: -13.0,
    doorX: -19.2,
    type: 'classroom'
  },
  {
    id: 'G-L2',
    name: 'AI Foundations Classroom G01',
    code: 'GF-L2',
    floor: 0,
    side: 'LEFT',
    xMin: -13.0,
    xMax: -3.0,
    doorX: -9.2,
    type: 'classroom'
  },
  {
    id: 'G-R1',
    name: 'Embedded & VLSI Systems Lab',
    code: 'GF-R1',
    floor: 0,
    side: 'RIGHT',
    xMin: 3.0,
    xMax: 13.0,
    doorX: 6.8,
    type: 'lab'
  },
  {
    id: 'G-R2',
    name: 'Department Office & HOD Chamber',
    code: 'GF-R2',
    floor: 0,
    side: 'RIGHT',
    xMin: 13.0,
    xMax: 23.0,
    doorX: 16.8,
    type: 'office'
  },

  // ================= FIRST FLOOR (Y = 4.2m) =================
  {
    id: 'F-L1',
    name: 'AI & Machine Learning Lab 1',
    code: '1F-L1',
    floor: 1,
    side: 'LEFT',
    xMin: -23.0,
    xMax: -13.0,
    doorX: -19.2,
    type: 'lab'
  },
  {
    id: 'F-L2',
    name: 'Deep Learning & Vision Lab 2',
    code: '1F-L2',
    floor: 1,
    side: 'LEFT',
    xMin: -13.0,
    xMax: -3.0,
    doorX: -9.2,
    type: 'lab'
  },
  {
    id: 'F-R1',
    name: 'Smart Classroom 101 (AIML)',
    code: '1F-R1',
    floor: 1,
    side: 'RIGHT',
    xMin: 3.0,
    xMax: 13.0,
    doorX: 6.8,
    type: 'classroom'
  },
  {
    id: 'F-R2',
    name: 'Smart Classroom 102 (AIML)',
    code: '1F-R2',
    floor: 1,
    side: 'RIGHT',
    xMin: 13.0,
    xMax: 23.0,
    doorX: 16.8,
    type: 'classroom'
  }
];

export const TELEPORT_ZONES = {
  1: { name: 'Exterior Facade', pos: [0, 0, 22], yaw: 0, orbit: true },
  2: { name: 'Main Entrance Portico', pos: [0, 0, 9.5], yaw: 0, orbit: false },
  3: { name: 'Switchback Stairs', pos: [-1.4, 0, 3.6], yaw: 0, orbit: false },
  4: { name: '1st Floor Corridor', pos: [-11.5, 4.2, 4.2], yaw: -Math.PI / 2, orbit: false },
  5: { name: 'AI & ML Lab (F-L1)', pos: [-18.0, 4.2, -1.0], yaw: 0, orbit: false },
  6: { name: 'Smart Classroom (F-R1)', pos: [8.0, 4.2, -1.0], yaw: 0, orbit: false }
};

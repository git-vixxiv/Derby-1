// ==================== CONFIGURATION ====================
const ARENA_WIDTH = 800;
const ARENA_HEIGHT = 880;
const WALL_THICKNESS = 50;
const CAR_SCALE = 1.2; // 20% larger cars
const CONTACT_TIMEOUT = 45 * 60; // 45 seconds at 60fps

const PHYSICS = {
  BASE_ACCELERATION: 0.08,
  MAX_FORWARD_SPEED: 9,
  MAX_REVERSE_SPEED: 9,  // Same as forward when healthy
  ROLLING_FRICTION: 0.975,
  MUD_DRAG: 0.965,
  MAX_STEER_ANGLE: 0.42,
  STEER_SPEED: 0.055,
  STEER_RETURN_SPEED: 0.08,
  MIN_SPEED_TO_TURN: 0.15,
  SLIDE_FRICTION: 0.85,
  ANGULAR_FRICTION: 0.82,
  // Collision physics
  RESTITUTION: 0.35,
  COLLISION_BIAS: 0.3,
  ANGULAR_IMPULSE_SCALE: 0.012
};

// Per-model color palettes — each model gets a restricted HSL range that
// fits its real-world character. Lightness is jittered ±10 at spawn for
// uniqueness within a palette. h = hue (0-360), s = saturation, l = lightness.
const PALETTE_POLICE      = [{h:210,s:25,l:25},{h:0,s:0,l:88},{h:0,s:0,l:15},{h:210,s:60,l:30},{h:0,s:0,l:35}]; // Crown Vic — police interceptor: navy, white, black, dark blue, slate
const PALETTE_LUXURY_DARK = [{h:0,s:0,l:10},{h:355,s:55,l:25},{h:215,s:55,l:22},{h:0,s:0,l:55},{h:215,s:8,l:30}]; // Town Car / Imperial — black, burgundy, dark blue, silver, gunmetal
const PALETTE_LUXURY_CLASSIC = [{h:45,s:35,l:75},{h:355,s:50,l:30},{h:30,s:35,l:70},{h:0,s:0,l:92},{h:215,s:30,l:35}]; // DeVille — cream/gold/burgundy/white/dark blue
const PALETTE_FAMILY_WAGON = [{h:30,s:35,l:38},{h:35,s:25,l:55},{h:80,s:25,l:35},{h:25,s:50,l:30},{h:35,s:20,l:50}]; // Wagon — tan, beige, olive, brown, sand
const PALETTE_NEUTRAL_BRIGHT = [{h:0,s:65,l:42},{h:215,s:65,l:42},{h:130,s:55,l:32},{h:0,s:0,l:88},{h:30,s:70,l:48},{h:280,s:50,l:38}]; // Impala / Delta 88 — varied bright daily-driver
const PALETTE_MID_TIER = [{h:215,s:45,l:30},{h:355,s:45,l:32},{h:0,s:0,l:60},{h:0,s:0,l:92},{h:130,s:35,l:30}]; // LeSabre — navy, maroon, silver, white, dark green

// Car types. Proportions, body style and palette are cosmetic. The stats
// are a first-pass spread (v10), every car trading something away:
//   weight        — mass in collisions: heavier shoves harder, gets shoved less
//   acceleration  — multiplies BASE_ACCELERATION
//   topSpeed      — multiplies MAX_FORWARD/REVERSE_SPEED
//   frontStrength — engine-zone toughness: damage taken is divided by it
//   rearStrength  — rear-zone toughness: damage taken is divided by it
const CAR_TYPES = [
  { name: 'Crown Vic', length: 65, width: 28, hoodLength: 20, trunkLength: 16, cabinLength: 29, bodyStyle: 'sedan', colorPalette: PALETTE_POLICE,         frontStrength: 1.00, rearStrength: 1.00, weight: 1.00, acceleration: 1.05, topSpeed: 1.03, trait: 'quick all-rounder' },
  { name: 'Town Car',  length: 65, width: 28, hoodLength: 22, trunkLength: 14, cabinLength: 29, bodyStyle: 'sedan', colorPalette: PALETTE_LUXURY_DARK,    frontStrength: 1.00, rearStrength: 1.05, weight: 1.08, acceleration: 0.97, topSpeed: 1.00, trait: 'heavy cruiser' },
  { name: 'Impala',    length: 65, width: 28, hoodLength: 19, trunkLength: 17, cabinLength: 29, bodyStyle: 'sedan', colorPalette: PALETTE_NEUTRAL_BRIGHT, frontStrength: 0.92, rearStrength: 0.95, weight: 0.94, acceleration: 1.08, topSpeed: 1.04, trait: 'light and fast, fragile' },
  { name: 'Imperial',  length: 65, width: 28, hoodLength: 21, trunkLength: 15, cabinLength: 29, bodyStyle: 'sedan', colorPalette: PALETTE_LUXURY_DARK,    frontStrength: 1.20, rearStrength: 1.10, weight: 1.20, acceleration: 0.88, topSpeed: 0.95, trait: 'tank, slow off the line' },
  { name: 'Wagon',     length: 65, width: 28, hoodLength: 18, trunkLength: 20, cabinLength: 27, bodyStyle: 'wagon', colorPalette: PALETTE_FAMILY_WAGON,   frontStrength: 0.95, rearStrength: 1.25, weight: 1.12, acceleration: 0.92, topSpeed: 0.97, trait: 'long tail, rear-ram specialist' },
  { name: 'LeSabre',   length: 65, width: 28, hoodLength: 18, trunkLength: 17, cabinLength: 30, bodyStyle: 'sedan', colorPalette: PALETTE_MID_TIER,       frontStrength: 0.97, rearStrength: 0.97, weight: 0.96, acceleration: 1.03, topSpeed: 1.00, trait: 'nimble mid-size' },
  { name: 'DeVille',   length: 65, width: 28, hoodLength: 20, trunkLength: 16, cabinLength: 29, bodyStyle: 'sedan', colorPalette: PALETTE_LUXURY_CLASSIC, frontStrength: 1.08, rearStrength: 1.05, weight: 1.15, acceleration: 0.92, topSpeed: 0.98, trait: 'heavy luxury bruiser' },
  { name: 'Delta 88',  length: 65, width: 28, hoodLength: 19, trunkLength: 17, cabinLength: 29, bodyStyle: 'sedan', colorPalette: PALETTE_NEUTRAL_BRIGHT, frontStrength: 1.02, rearStrength: 1.00, weight: 1.02, acceleration: 1.00, topSpeed: 1.00, trait: 'balanced baseline' }
];

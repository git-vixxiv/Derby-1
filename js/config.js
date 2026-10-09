// ==================== CONFIGURATION ====================
const ARENA_WIDTH = 800;
const ARENA_HEIGHT = 880;
const WALL_THICKNESS = 50;
const CAR_SCALE = 1.2; // 20% larger cars
// Derby rule: every car must INITIATE contact with a live car within this
// time or it's out. Taking a hit doesn't reset it (see resolveCollision).
const CONTACT_TIMEOUT = 30 * 60; // 30 seconds at 60fps (was 45 and any contact counted)
const CONTACT_INITIATE_SPEED = 0.6; // must be driving into the other car at least this fast (top speed 6)

const PHYSICS = {
  BASE_ACCELERATION: 0.08,
  MAX_FORWARD_SPEED: 6,  // v10: cut from 9 (Joe: "way too fast")
  MAX_REVERSE_SPEED: 6,  // Same as forward when healthy
  ROLLING_FRICTION: 0.975,
  MUD_DRAG: 0.965,
  MAX_STEER_ANGLE: 0.42,
  STEER_SPEED: 0.04,     // v10: was 0.055 — wheel turns in slower, less twitchy
  STEER_RETURN_SPEED: 0.08,
  MIN_SPEED_TO_TURN: 0.15,
  SLIDE_FRICTION: 0.85,
  ANGULAR_FRICTION: 0.82,
  // Mud traction (v10). Fraction per frame that the car's direction of
  // travel swings toward where its nose points. 1.0 would be rails.
  // Reduced further at speed and by wheel/suspension damage.
  MUD_GRIP: 0.11,
  GRIP_LOSS_AT_TOP_SPEED: 0.45,  // grip × (1 - this) at full speed
  GRIP_LOSS_FROM_DAMAGE: 0.4,    // grip × (1 - this) when front/side fully damaged
  SLIDE_SCRUB: 0.05,             // speed lost per frame while sliding fully sideways
  // Bent steering (v10): front damage pulls the car toward the side that
  // took the hit and adds play/wobble to the wheel.
  DAMAGE_PULL_MAX: 0.07,         // radians of steering pull at 100% front damage
  DAMAGE_WOBBLE_MAX: 0.08,       // radians of random wheel play at 100% front/side damage
  // Collision physics
  RESTITUTION: 0.35,
  COLLISION_BIAS: 0.3,
  ANGULAR_IMPULSE_SCALE: 0.012
};

// Damage and crash-sound formulas were tuned when top speed was 9. This
// maps current speeds onto that scale so a full-speed hit at the new top
// speed hurts as much as a full-speed hit did before.
const DAMAGE_SPEED_SCALE = 9 / PHYSICS.MAX_FORWARD_SPEED;

// How much punishment a car takes before it is out, as multiples of each
// zone's pool (see getLifeUsed in car.js). Zones max out their handling
// and visual damage at 1×; the car keeps running until the combined wear
// across zones reaches 1. Measured at 75% ramming speed: about 6 front
// hits, 10 side hits or 14 rear hits (mixed hits add up).
const CAR_LIFE = {
  FRONT: 3.5,
  SIDE: 4.5,
  REAR: 4
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

// Car types (v10.1). Each model is a specific generation, drawn to its
// real proportions: length = real inches × 0.3, width = real inches × 0.36
// (before CAR_SCALE). hood + cabin + trunk = length.
//
// Stats: every car has the same total. Each model gets one +0.04 edge and
// one matching −0.04 weakness (Delta 88 is the even baseline):
//   weight        — mass in collisions: heavier shoves harder, gets shoved less
//   acceleration  — multiplies BASE_ACCELERATION
//   topSpeed      — multiplies MAX_FORWARD/REVERSE_SPEED
//   frontStrength — engine-zone toughness: damage taken is divided by it
//   rearStrength  — rear-zone toughness: damage taken is divided by it
//
// style (base units, scaled by CAR_SCALE when drawn):
//   fc/rc        — front/rear corner radius (rounded '90s bodies vs square '60s-'70s)
//   noseBow/tailBow — how far the nose/tail bows out at the centerline
//   ws/bl        — windshield / back glass length (rake: fastback vs formal roof)
//   roofR        — roof panel corner radius
//   wheelF/wheelR — wheel centers as a fraction of length from each end
//   lamps        — headlight style; tails — taillight style
//   features     — model-specific details drawn on top (see drawCarFeatures)
const CAR_TYPES = [
  { name: 'Crown Vic', era: "'98–'11 Police Interceptor", length: 63.6, width: 28.1, hoodLength: 19, cabinLength: 29.6, trunkLength: 15, bodyStyle: 'sedan', colorPalette: PALETTE_POLICE,
    frontStrength: 1.00, rearStrength: 1.00, weight: 0.96, acceleration: 1.00, topSpeed: 1.04, trait: 'faster top end, lighter',
    style: { fc: 7, rc: 6, noseBow: 2.5, tailBow: 1.5, ws: 9, bl: 7, roofR: 5, wheelF: 0.21, wheelR: 0.25, lamps: 'composite', tails: 'wideRect', features: ['policeRoof', 'spotlight', 'pushBar'] } },
  { name: 'Town Car', era: "'90–'97", length: 65.4, width: 27.7, hoodLength: 22, cabinLength: 28.4, trunkLength: 15, bodyStyle: 'sedan', colorPalette: PALETTE_LUXURY_DARK,
    frontStrength: 1.00, rearStrength: 1.00, weight: 1.04, acceleration: 0.96, topSpeed: 1.00, trait: 'heavier, slower off the line',
    style: { fc: 4, rc: 4, noseBow: 1, tailBow: 0.5, ws: 8, bl: 5, roofR: 2, wheelF: 0.22, wheelR: 0.25, lamps: 'composite', tails: 'wideRect', features: ['hoodOrnament', 'chromeSpear'] } },
  { name: 'Impala', era: "'65–'70", length: 63.9, width: 28.4, hoodLength: 20, cabinLength: 26.9, trunkLength: 17, bodyStyle: 'sedan', colorPalette: PALETTE_NEUTRAL_BRIGHT,
    frontStrength: 0.96, rearStrength: 1.00, weight: 1.00, acceleration: 1.04, topSpeed: 1.00, trait: 'quicker off the line, softer nose',
    style: { fc: 3.5, rc: 3, noseBow: 0.5, tailBow: 0, ws: 7, bl: 10, roofR: 3, wheelF: 0.21, wheelR: 0.25, lamps: 'quadRound', tails: 'tripleRound', features: ['hoodCrease', 'cokeBottle'] } },
  { name: 'Imperial', era: "'64–'66", length: 68.1, width: 28.8, hoodLength: 23.5, cabinLength: 26.6, trunkLength: 18, bodyStyle: 'sedan', colorPalette: PALETTE_LUXURY_DARK,
    frontStrength: 1.04, rearStrength: 1.00, weight: 1.00, acceleration: 1.00, topSpeed: 0.96, trait: 'tougher nose, lower top speed',
    style: { fc: 2, rc: 2, noseBow: 0, tailBow: 0, ws: 7, bl: 4, roofR: 1.5, wheelF: 0.22, wheelR: 0.26, lamps: 'quadRound', tails: 'slimRect', features: ['spareTire', 'knifeEdge'] } },
  { name: 'Wagon', era: "Country Squire '79–'91", length: 64.8, width: 28.4, hoodLength: 19, cabinLength: 42, trunkLength: 3.8, bodyStyle: 'wagon', colorPalette: PALETTE_FAMILY_WAGON,
    frontStrength: 1.00, rearStrength: 1.04, weight: 1.00, acceleration: 0.96, topSpeed: 1.00, trait: 'tougher tail, slower off the line',
    style: { fc: 3, rc: 2, noseBow: 0.5, tailBow: 0, ws: 8, bl: 2, roofR: 2, wheelF: 0.20, wheelR: 0.22, lamps: 'quadRect', tails: 'verticalCorner', features: ['woodgrain', 'roofRack'] } },
  { name: 'LeSabre', era: "'92–'99", length: 60.0, width: 26.6, hoodLength: 16, cabinLength: 30, trunkLength: 14, bodyStyle: 'sedan', colorPalette: PALETTE_MID_TIER,
    frontStrength: 1.00, rearStrength: 1.00, weight: 0.96, acceleration: 1.04, topSpeed: 1.00, trait: 'quicker off the line, lighter',
    style: { fc: 8, rc: 7, noseBow: 3, tailBow: 2, ws: 11, bl: 9, roofR: 6, wheelF: 0.18, wheelR: 0.24, lamps: 'composite', tails: 'fullWidth', features: [] } },
  { name: 'DeVille', era: "Sedan DeVille '77–'84", length: 66.3, width: 27.4, hoodLength: 22.5, cabinLength: 27.8, trunkLength: 16, bodyStyle: 'sedan', colorPalette: PALETTE_LUXURY_CLASSIC,
    frontStrength: 1.00, rearStrength: 1.00, weight: 1.04, acceleration: 1.00, topSpeed: 0.96, trait: 'heavier, lower top speed',
    style: { fc: 2.5, rc: 2, noseBow: 0.5, tailBow: 0, ws: 7, bl: 4, roofR: 2, wheelF: 0.22, wheelR: 0.25, lamps: 'quadRect', tails: 'verticalCorner', features: ['vinylHalf', 'hoodOrnament'] } },
  { name: 'Delta 88', era: "'77–'85", length: 65.4, width: 27.4, hoodLength: 21, cabinLength: 27.4, trunkLength: 17, bodyStyle: 'sedan', colorPalette: PALETTE_NEUTRAL_BRIGHT,
    frontStrength: 1.00, rearStrength: 1.00, weight: 1.00, acceleration: 1.00, topSpeed: 1.00, trait: 'even all-rounder',
    style: { fc: 3, rc: 3, noseBow: 0.5, tailBow: 0, ws: 7, bl: 6, roofR: 2.5, wheelF: 0.21, wheelR: 0.25, lamps: 'quadRect', tails: 'wraparound', features: ['vinylFull', 'bumperGuards'] } }
];

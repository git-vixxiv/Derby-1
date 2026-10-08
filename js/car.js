// ==================== CAR GEOMETRY ====================
function getCarDimensions(car) {
  const type = car.carType;
  const frontCrush = getFrontDamagePct(car) * type.hoodLength * 0.6;
  const rearCrush = getRearDamagePct(car) * type.trunkLength * 0.6;
  const sideCrush = getSideDamagePct(car) * 3;

  return {
    length: (type.hoodLength - frontCrush) + type.cabinLength + (type.trunkLength - rearCrush),
    width: Math.max(type.width * 0.75, type.width - sideCrush),
    hoodLength: Math.max(4, type.hoodLength - frontCrush),
    trunkLength: Math.max(4, type.trunkLength - rearCrush),
    frontCrush,
    rearCrush,
    sideCrush
  };
}

// Get the 4 corners of the car in world coordinates
function getCarCorners(car) {
  const dim = getCarDimensions(car);
  const halfLen = dim.length / 2;
  const halfWid = dim.width / 2;

  // Local corners (car facing right = angle 0)
  const localCorners = [
    vec(halfLen, -halfWid),   // Front-right
    vec(halfLen, halfWid),    // Front-left
    vec(-halfLen, halfWid),   // Rear-left
    vec(-halfLen, -halfWid)   // Rear-right
  ];

  // Transform to world coordinates
  return localCorners.map(corner => {
    const rotated = vecRotate(corner, car.angle);
    return vecAdd(vec(car.x, car.y), rotated);
  });
}

// Get axes for SAT collision (the normals of each edge)
function getCarAxes(car) {
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  return [
    vec(cos, sin),   // Forward axis
    vec(-sin, cos)   // Right axis
  ];
}

// ==================== CAR FACTORY ====================
function createCar(x, y, angle, isPlayer = false, colorIndex = 0, totalCars = 1) {
  const baseType = CAR_TYPES[Math.floor(Math.random() * CAR_TYPES.length)];

  // Scale the car type
  const carType = {
    ...baseType,
    length: baseType.length * CAR_SCALE,
    width: baseType.width * CAR_SCALE,
    hoodLength: baseType.hoodLength * CAR_SCALE,
    trunkLength: baseType.trunkLength * CAR_SCALE,
    cabinLength: baseType.cabinLength * CAR_SCALE
  };

  // Player keeps the signature bright blue regardless of model.
  // Enemies pick from their model's color palette and jitter lightness
  // for uniqueness within the palette (so two Crown Vics don't look
  // identical). colorIndex is reused as the palette index seed so the
  // distribution feels intentional rather than purely random.
  let color;
  if (isPlayer) {
    color = { h: 210, s: 70, l: 45 };
  } else {
    const palette = baseType.colorPalette;
    const base = palette[colorIndex % palette.length];
    color = {
      h: base.h,
      s: base.s,
      l: clamp(base.l + (Math.random() - 0.5) * 18, 8, 92)
    };
  }

  return {
    x, y, angle,
    speed: 0,
    vx: 0, vy: 0,           // Additional velocity from impacts
    steerAngle: 0,
    angularVel: 0,
    lateralVel: 0,

    frontDamage: 0,
    rearDamage: 0,
    sideDamage: 0,
    maxFrontDamage: 400,
    maxRearDamage: 320,
    maxSideDamage: 360,

    isPlayer,
    color,
    carNumber: getUniqueNumber(),
    carType,
    disabled: false,
    disabledReason: null,

    lastContactFrame: 0,

    ai: isPlayer ? null : {
      state: 'scanning',
      stateTimer: 0,
      target: null,
      attackCooldown: 0,
      preferReverse: Math.random() > 0.45,
      aggressiveness: 0.35 + Math.random() * 0.45,
      patience: 50 + Math.random() * 80,
      stuckTimer: 0,
      lastPos: { x, y }
    },

    dents: [],
    impactMarks: [],  // Persistent scratches and damage marks
    // Persistent body deformation (car-local, inward depth in px at
    // evenly spaced points along each edge). Built up hit by hit.
    deform: {
      front: new Array(DEFORM_END_POINTS).fill(0),
      rear: new Array(DEFORM_END_POINTS).fill(0),
      sideNeg: new Array(DEFORM_SIDE_POINTS).fill(0), // y < 0 edge
      sidePos: new Array(DEFORM_SIDE_POINTS).fill(0)  // y > 0 edge
    },
    creases: [],      // Persistent fold lines in the sheet metal
    pullDir: 0,       // Which way bent steering pulls (set by front hits)
    effSteer: 0,      // Steering actually reaching the road (incl. pull/wobble)
    lastHitFlash: 0,  // Frame when last hit for flash effect
    smokeTimer: 0,
    trackTimer: 0
  };
}

// ==================== BODY DEFORMATION ====================
const DEFORM_END_POINTS = 7;
const DEFORM_SIDE_POINTS = 9;

// Push the body in around the contact point. dmg is the HP just taken
// by that zone. Deformation is spread with a bell curve around the hit,
// randomized a little so no two crumples look alike, and capped so the
// car never folds through itself.
function addDeformation(car, contactPoint, zone, dmg) {
  if (!car.deform || dmg <= 0) return;
  const type = car.carType;
  const local = vecRotate(vecSub(contactPoint, vec(car.x, car.y)), -car.angle);
  const halfLen = type.length / 2;
  const hw = type.width / 2;

  const spread = (arr, pos, start, step, sigma, amount, cap) => {
    for (let i = 0; i < arr.length; i++) {
      const p = start + i * step;
      const w = Math.exp(-((p - pos) ** 2) / (2 * sigma * sigma));
      arr[i] = Math.min(cap, arr[i] + amount * w * (0.75 + Math.random() * 0.5));
    }
  };

  if (zone === 'front') {
    const amount = (dmg / car.maxFrontDamage) * type.hoodLength * 1.6;
    spread(car.deform.front, local.y, -hw, type.width / (DEFORM_END_POINTS - 1), type.width * 0.3, amount, type.hoodLength * 0.55);
    // Bent tie rod pulls toward the side that took the hit
    if (Math.abs(local.y) > hw * 0.2) car.pullDir = Math.sign(local.y);
    else if (!car.pullDir) car.pullDir = Math.random() < 0.5 ? -1 : 1;
  } else if (zone === 'rear') {
    const amount = (dmg / car.maxRearDamage) * type.trunkLength * 1.6;
    spread(car.deform.rear, local.y, -hw, type.width / (DEFORM_END_POINTS - 1), type.width * 0.3, amount, type.trunkLength * 0.55);
  } else {
    const arr = local.y < 0 ? car.deform.sideNeg : car.deform.sidePos;
    const amount = (dmg / car.maxSideDamage) * 22;
    spread(arr, local.x, -halfLen, type.length / (DEFORM_SIDE_POINTS - 1), type.length * 0.14, amount, type.width * 0.24);
  }

  // A fold line in the metal near the hit, kept for the life of the car
  if (dmg > 8) {
    const ang = (zone === 'side' ? 0.3 : Math.PI / 2 - 0.3) + (Math.random() - 0.5) * 0.9;
    const len = 6 + Math.min(16, dmg * 0.15);
    const cx = clamp(local.x * 0.85, -halfLen + 4, halfLen - 4);
    const cy = clamp(local.y * 0.7, -hw + 3, hw - 3);
    car.creases.push({
      x1: cx - Math.cos(ang) * len / 2, y1: cy - Math.sin(ang) * len / 2,
      x2: cx + Math.cos(ang) * len / 2, y2: cy + Math.sin(ang) * len / 2,
      depth: Math.min(1, dmg / 60)
    });
    if (car.creases.length > 24) car.creases.shift();
  }
}

function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

// ==================== CAR HEALTH / DAMAGE STATE ====================
// Two separate measures (v10):
//   Condition — frontDamage/maxFrontDamage etc., capped at 100%. Drives the
//     visuals and how badly the car handles. A couple of big hits can max
//     out a zone: the car crumples and drives like a wreck.
//   Life — how close the car is to actually being out. Damage keeps
//     counting past 100% condition; the car only dies once the combined
//     wear reaches CAR_LIFE. Cars are resilient: a crippled car keeps
//     limping around until it is finished off.
function getFrontDamagePct(car) { return Math.min(1, car.frontDamage / car.maxFrontDamage); }
function getRearDamagePct(car) { return Math.min(1, car.rearDamage / car.maxRearDamage); }
function getSideDamagePct(car) { return Math.min(1, car.sideDamage / car.maxSideDamage); }
function getFrontHealth(car) { return 1 - getFrontDamagePct(car); }
function getRearHealth(car) { return 1 - getRearDamagePct(car); }
function getSideHealth(car) { return 1 - getSideDamagePct(car); }

// Fraction of the car's life used up (1 = out). Each zone's damage counts
// against its own multiple of the zone pool; mixed damage adds up.
function getLifeUsed(car) {
  return car.frontDamage / (car.maxFrontDamage * CAR_LIFE.FRONT)
       + car.sideDamage / (car.maxSideDamage * CAR_LIFE.SIDE)
       + car.rearDamage / (car.maxRearDamage * CAR_LIFE.REAR);
}

// Health bar above the car: remaining life, not condition
function getCarHealthPct(car) {
  return Math.max(0, 1 - getLifeUsed(car));
}

function isDamagedOut(car) {
  return getLifeUsed(car) >= 1;
}

// Where the damage is decides what stops working:
//   front — steering (tie rods, wheels jammed by the crushed fenders) and
//           some engine power (radiator, engine mounts)
//   rear  — drivetrain: top speed and acceleration
//   side  — fenders rubbing the tires: a bit of everything
function getSpeedModifier(car) {
  const rearPenalty = getRearDamagePct(car) * 0.55;
  const frontPenalty = getFrontDamagePct(car) * 0.2;
  const sidePenalty = getSideDamagePct(car) * 0.15;
  return Math.max(0.25, 1 - rearPenalty - frontPenalty - sidePenalty);
}

function getAccelerationModifier(car) {
  const rearPenalty = getRearDamagePct(car) * 0.6;
  const frontPenalty = getFrontDamagePct(car) * 0.3;
  const sidePenalty = getSideDamagePct(car) * 0.15;
  return Math.max(0.2, 1 - rearPenalty - frontPenalty - sidePenalty);
}

function getSteerModifier(car) {
  const frontPenalty = getFrontDamagePct(car) * 0.85;
  const sidePenalty = getSideDamagePct(car) * 0.2;
  return Math.max(0.05, 1 - frontPenalty - sidePenalty);
}

// ==================== SAT COLLISION DETECTION ====================

// Project corners onto an axis, return min and max
function projectOntoAxis(corners, axis) {
  let min = Infinity, max = -Infinity;
  for (const corner of corners) {
    const proj = vecDot(corner, axis);
    min = Math.min(min, proj);
    max = Math.max(max, proj);
  }
  return { min, max };
}

function checkOBBCollision(car1, car2) {
  const corners1 = getCarCorners(car1);
  const corners2 = getCarCorners(car2);
  const axes1 = getCarAxes(car1);
  const axes2 = getCarAxes(car2);

  let minOverlap = Infinity;
  let collisionAxis = null;

  // Test all 4 axes (2 from each car)
  const allAxes = [...axes1, ...axes2];

  for (const axis of allAxes) {
    const proj1 = projectOntoAxis(corners1, axis);
    const proj2 = projectOntoAxis(corners2, axis);

    // Check for gap
    if (proj1.max < proj2.min || proj2.max < proj1.min) {
      return null; // No collision - separating axis found
    }

    // Calculate overlap
    const overlap = Math.min(proj1.max - proj2.min, proj2.max - proj1.min);
    if (overlap < minOverlap) {
      minOverlap = overlap;
      collisionAxis = axis;
    }
  }

  // Collision detected! Return collision info
  // Make sure axis points from car1 to car2
  const centerDiff = vecSub(vec(car2.x, car2.y), vec(car1.x, car1.y));
  if (vecDot(centerDiff, collisionAxis) < 0) {
    collisionAxis = vecMul(collisionAxis, -1);
  }

  // Find collision point (average of overlapping corners)
  let contactPoint = vec(0, 0);
  let contactCount = 0;

  // Check which corners of car1 are inside car2
  for (const corner of corners1) {
    if (isPointInOBB(corner, car2)) {
      contactPoint = vecAdd(contactPoint, corner);
      contactCount++;
    }
  }
  // Check which corners of car2 are inside car1
  for (const corner of corners2) {
    if (isPointInOBB(corner, car1)) {
      contactPoint = vecAdd(contactPoint, corner);
      contactCount++;
    }
  }

  if (contactCount > 0) {
    contactPoint = vecMul(contactPoint, 1 / contactCount);
  } else {
    // Fallback to midpoint
    contactPoint = vecMul(vecAdd(vec(car1.x, car1.y), vec(car2.x, car2.y)), 0.5);
  }

  return {
    overlap: minOverlap,
    normal: collisionAxis,
    contactPoint
  };
}

// Check if a point is inside a car's OBB
function isPointInOBB(point, car) {
  const dim = getCarDimensions(car);
  const halfLen = dim.length / 2;
  const halfWid = dim.width / 2;

  // Transform point to car's local space
  const localPoint = vecRotate(vecSub(point, vec(car.x, car.y)), -car.angle);

  return Math.abs(localPoint.x) <= halfLen && Math.abs(localPoint.y) <= halfWid;
}

// Determine which zone of the car was hit
function getImpactZone(car, contactPoint) {
  // Transform contact point to car's local space
  const localPoint = vecRotate(vecSub(contactPoint, vec(car.x, car.y)), -car.angle);
  const dim = getCarDimensions(car);

  // Determine zone based on local position
  const frontThreshold = dim.length / 2 - dim.hoodLength * 0.7;
  const rearThreshold = -dim.length / 2 + dim.trunkLength * 0.7;

  if (localPoint.x > frontThreshold) return 'front';
  if (localPoint.x < rearThreshold) return 'rear';
  return 'side';
}

// ==================== COLLISION RESPONSE ====================
function resolveCollision(car1, car2, collision) {
  const P = PHYSICS;

  // Get velocities at contact point
  const vel1 = getVelocityAtPoint(car1, collision.contactPoint);
  const vel2 = getVelocityAtPoint(car2, collision.contactPoint);

  // CONTACT CREDIT (derby rule): only the car that drives INTO a live car
  // resets its contact clock. Taking a hit doesn't count, and neither does
  // bumping a car that's already out. Both get credit on a head-on.
  // Runs before the early return below so a sustained shove keeps counting.
  const approach1 = vecDot(vel1, collision.normal);  // car1 moving toward car2
  const approach2 = -vecDot(vel2, collision.normal); // car2 moving toward car1
  // Driver's-door rule: a hit on a running car's driver's door is illegal.
  // It earns no credit, and a real one gets called (see callDoorHit).
  const door1 = !car2.disabled && isDriversDoor(car2, collision.contactPoint); // car1 would be at fault
  const door2 = !car1.disabled && isDriversDoor(car1, collision.contactPoint);
  if (approach1 > CONTACT_INITIATE_SPEED && !car2.disabled) {
    if (door1) callDoorHit(car1, car2, approach1);
    else car1.lastContactFrame = frameCount;
  }
  if (approach2 > CONTACT_INITIATE_SPEED && !car1.disabled) {
    if (door2) callDoorHit(car2, car1, approach2);
    else car2.lastContactFrame = frameCount;
  }
  // Normal points from car1 to car2, so relative velocity is taken as
  // car2 relative to car1: negative along the normal = closing in.
  // (Before v10 this was vel1 - vel2, which flipped the test below: head-on
  // rams were treated as separating, dealt no damage, and the attacker
  // just bulldozed the other car by positional push.)
  const relVel = vecSub(vel2, vel1);

  // Relative velocity along collision normal
  const velAlongNormal = vecDot(relVel, collision.normal);

  // Sustained player contact grinds: feed the scrape loop with the
  // sliding (tangential) speed plus a share of the shove
  if (car1.isPlayer || car2.isPlayer) {
    const tangential = vecSub(relVel, vecMul(collision.normal, velAlongNormal));
    addScrape((Math.hypot(tangential.x, tangential.y) + Math.abs(velAlongNormal) * 0.3) * DAMAGE_SPEED_SCALE);
  }

  // Don't resolve impulse if velocities are separating (but contact already credited above)
  if (velAlongNormal > 0) {
    // Still need to separate overlapping cars
    separateCars(car1, car2, collision);
    return;
  }

  // Calculate impulse
  const e = P.RESTITUTION;
  const m1 = car1.carType.weight;
  const m2 = car2.carType.weight;

  // For angular impulse, we need moment of inertia (approximated)
  const dim1 = getCarDimensions(car1);
  const dim2 = getCarDimensions(car2);
  const I1 = m1 * (dim1.length * dim1.length + dim1.width * dim1.width) / 12;
  const I2 = m2 * (dim2.length * dim2.length + dim2.width * dim2.width) / 12;

  // Vectors from center of mass to contact point
  const r1 = vecSub(collision.contactPoint, vec(car1.x, car1.y));
  const r2 = vecSub(collision.contactPoint, vec(car2.x, car2.y));

  // Calculate impulse scalar
  const r1CrossN = vecCross(r1, collision.normal);
  const r2CrossN = vecCross(r2, collision.normal);

  const invMassSum = 1/m1 + 1/m2 +
                     (r1CrossN * r1CrossN) / I1 +
                     (r2CrossN * r2CrossN) / I2;

  let j = -(1 + e) * velAlongNormal / invMassSum;

  // Clamp impulse for stability
  j = clamp(j, -50, 50);

  const impulse = vecMul(collision.normal, j);

  // Apply linear impulse: car1 is pushed back along -normal, car2 along +normal
  if (!car1.disabled) applyVelocityChange(car1, -impulse.x / m1, -impulse.y / m1);
  if (!car2.disabled) applyVelocityChange(car2, impulse.x / m2, impulse.y / m2);

  // Apply angular impulse
  if (!car1.disabled) {
    car1.angularVel -= vecCross(r1, impulse) / I1 * P.ANGULAR_IMPULSE_SCALE;
  }
  if (!car2.disabled) {
    car2.angularVel += vecCross(r2, impulse) / I2 * P.ANGULAR_IMPULSE_SCALE;
  }

  // Separate overlapping cars
  separateCars(car1, car2, collision);

  // Damage: energy of the hit from the closing speed at the contact point
  // (velAlongNormal was captured before the impulse changed it)
  const closing = -velAlongNormal / P.MAX_FORWARD_SPEED;
  const energy = DAMAGE.HIT_AT_TOP_SPEED * Math.min(DAMAGE.MAX_ENERGY, closing * closing);
  applyDamage(car1, car2, collision, energy);

  // Sparks at contact point
  spawnSparks(collision.contactPoint.x, collision.contactPoint.y, 3 + Math.min(12, Math.floor(energy / 15)));

  // Crash sound - louder for player involvement or harder hits.
  // Light contact below the threshold is left to the scrape loop so
  // shoving matches don't machine-gun crash samples.
  const playerInvolved = car1.isPlayer || car2.isPlayer;
  if (closing > 0.08) {
    playCrashSound(closing * 10 * (playerInvolved ? 1.2 : 0.6), collision.contactPoint.x);
  }
}

// An impulse changes the car's real velocity. The part along its direction
// of travel goes into drive speed (so a rammer is actually stopped by the
// hit instead of driving on through), the rest into knockback.
function applyVelocityChange(car, dvx, dvy) {
  const ma = car.moveAngle ?? car.angle;
  const hx = Math.cos(ma), hy = Math.sin(ma);
  const along = dvx * hx + dvy * hy;
  car.speed += along;
  car.vx = (car.vx || 0) + dvx - along * hx;
  car.vy = (car.vy || 0) + dvy - along * hy;
}

function getVelocityAtPoint(car, point) {
  // Linear velocity
  const linVel = vec(
    Math.cos(car.moveAngle ?? car.angle) * car.speed + (car.vx || 0),
    Math.sin(car.moveAngle ?? car.angle) * car.speed + (car.vy || 0)
  );

  // Angular contribution
  const r = vecSub(point, vec(car.x, car.y));
  const angVel = vec(-r.y * car.angularVel, r.x * car.angularVel);

  return vecAdd(linVel, angVel);
}

function separateCars(car1, car2, collision) {
  const P = PHYSICS;
  const separation = collision.overlap + P.COLLISION_BIAS;

  const m1 = car1.carType.weight;
  const m2 = car2.carType.weight;
  const totalMass = m1 + m2;

  // Move cars apart proportional to their mass (lighter cars move more)
  if (!car1.disabled) {
    const move1 = separation * (m2 / totalMass);
    car1.x -= collision.normal.x * move1;
    car1.y -= collision.normal.y * move1;
  }
  if (!car2.disabled) {
    const move2 = separation * (m1 / totalMass);
    car2.x += collision.normal.x * move2;
    car2.y += collision.normal.y * move2;
  }
}

// Both cars take the hit's energy, each scaled by the toughness of the
// zone it was hit on and by the weights (the heavier car comes off better).
function applyDamage(car1, car2, collision, energy) {
  if (energy < 0.5) return; // leaning and shoving, not a hit

  const zone1 = getImpactZone(car1, collision.contactPoint);
  const zone2 = getImpactZone(car2, collision.contactPoint);

  const type1 = car1.carType;
  const type2 = car2.carType;
  const totalWeight = type1.weight + type2.weight;

  const dmg1 = energy * getZoneDamageMultiplier(zone1, type1) * (2 * type2.weight / totalWeight);
  const dmg2 = energy * getZoneDamageMultiplier(zone2, type2) * (2 * type1.weight / totalWeight);
  for (const [car, zone, dmg] of [[car1, zone1, dmg1], [car2, zone2, dmg2]]) {
    if (car.disabled) continue; // wrecks are already out
    if (zone === 'front') car.frontDamage += dmg;
    else if (zone === 'rear') car.rearDamage += dmg;
    else car.sideDamage += dmg;
    addDeformation(car, collision.contactPoint, zone, dmg);
  }

  // Visual effects for anything harder than a nudge
  if (energy > 6) {
    for (const [car, zone, dmg] of [[car1, zone1, dmg1], [car2, zone2, dmg2]]) {
      // Contact point in the car's own space, for scratches and dents
      const local = vecRotate(vecSub(collision.contactPoint, vec(car.x, car.y)), -car.angle);
      car.impactMarks.push({
        x: local.x,
        y: local.y,
        zone,
        severity: Math.min(dmg / 50, 1),
        angle: Math.random() * Math.PI,
        type: Math.random() > 0.5 ? 'scratch' : 'dent'
      });
      if (car.impactMarks.length > 15) car.impactMarks.shift();
      car.lastHitFlash = frameCount;
    }

    // Metal chunks
    const debrisCount = Math.min(10, Math.floor(energy / 14));
    if (debrisCount > 0) {
      spawnDebris(collision.contactPoint.x, collision.contactPoint.y, '#666', debrisCount);
    }

    // Paint chips from both cars
    if (energy > 20) {
      spawnPaintChips(collision.contactPoint.x, collision.contactPoint.y, car1.color, 2 + Math.floor(Math.random() * 3));
      spawnPaintChips(collision.contactPoint.x, collision.contactPoint.y, car2.color, 2 + Math.floor(Math.random() * 3));
    }
  }

  // Add dents (legacy system)
  if (energy > 12) {
    car1.dents.push({ x: (Math.random() - 0.5) * type1.width, y: (Math.random() - 0.5) * type1.length * 0.4 });
    car2.dents.push({ x: (Math.random() - 0.5) * type2.width, y: (Math.random() - 0.5) * type2.length * 0.4 });
  }
}

// ==================== DRIVER'S DOOR ====================
// Where the driver's door sits along the car (car-local x, nose is +x).
// The driver sits on the left, which is -y in car space.
function getDoorSpan(car) {
  const dim = getCarDimensions(car);
  const front = dim.length / 2 - dim.hoodLength - DOOR_RULE.FROM_WINDSHIELD * CAR_SCALE;
  return { front, rear: front - DOOR_RULE.LENGTH * CAR_SCALE, halfWidth: dim.width / 2 };
}

function isDriversDoor(car, point) {
  const local = vecRotate(vecSub(point, vec(car.x, car.y)), -car.angle);
  const door = getDoorSpan(car);
  return local.y < -door.halfWidth * 0.3 && local.x <= door.front && local.x >= door.rear;
}

// `offender` drove into `victim`'s driver's door at `approach` px/step.
// Light contact isn't called. One call per incident: the cars stay in
// contact for several steps.
function callDoorHit(offender, victim, approach) {
  if (approach < DOOR_RULE.MIN_CLOSING * PHYSICS.MAX_FORWARD_SPEED) return;
  if (frameCount - (offender.lastDoorFlag ?? -1000) < 90) return;
  offender.lastDoorFlag = frameCount;
  offender.doorFlags = (offender.doorFlags || 0) + 1;
  if (offender.doorFlags < DOOR_RULE.HITS_ALLOWED) {
    announce(offender.isPlayer
      ? "WARNING: you hit a driver's door. Next one and you're out."
      : `#${offender.carNumber.toString().padStart(2, '0')} warned: driver's-door hit`,
      offender.isPlayer ? '#ff6b5e' : '#ffd27a');
  }
}

function getZoneDamageMultiplier(zone, type) {
  switch (zone) {
    case 'front': return 1.4 / type.frontStrength;
    case 'rear': return 0.5 / type.rearStrength;
    case 'side': return 0.8;
    default: return 1.0;
  }
}

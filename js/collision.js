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

  // CONTACT CREDIT: Any collision counts as contact for BOTH cars
  // This must happen BEFORE any early returns
  car1.lastContactFrame = frameCount;
  car2.lastContactFrame = frameCount;

  // Get velocities at contact point
  const vel1 = getVelocityAtPoint(car1, collision.contactPoint);
  const vel2 = getVelocityAtPoint(car2, collision.contactPoint);
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

  // Closing speeds for damage, captured before the impulse slows the cars
  const preSpeed1 = Math.abs(car1.speed) + Math.hypot(car1.vx || 0, car1.vy || 0);
  const preSpeed2 = Math.abs(car2.speed) + Math.hypot(car2.vx || 0, car2.vy || 0);

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

  // Apply damage based on impact zone
  // Scaled so impacts at the current top speed match the tuned damage
  // at the old top speed (see DAMAGE_SPEED_SCALE)
  const impactForce = Math.abs(j) * 0.8 * DAMAGE_SPEED_SCALE;
  applyDamage(car1, car2, collision, impactForce, preSpeed1, preSpeed2);

  // Sparks at contact point
  spawnSparks(collision.contactPoint.x, collision.contactPoint.y, 4 + Math.floor(impactForce * 0.3));

  // Crash sound - louder for player involvement or harder hits.
  // Light contact below the threshold is left to the scrape loop so
  // shoving matches don't machine-gun crash samples.
  const playerInvolved = car1.isPlayer || car2.isPlayer;
  if (impactForce > 0.8) {
    playCrashSound(impactForce * (playerInvolved ? 1.2 : 0.6), collision.contactPoint.x);
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

function applyDamage(car1, car2, collision, impactForce, preSpeed1, preSpeed2) {
  const zone1 = getImpactZone(car1, collision.contactPoint);
  const zone2 = getImpactZone(car2, collision.contactPoint);

  const type1 = car1.carType;
  const type2 = car2.carType;

  // Speed bonus damage
  // On the old top-speed-9 scale the formulas below were tuned for
  const speed1 = preSpeed1 * DAMAGE_SPEED_SCALE;
  const speed2 = preSpeed2 * DAMAGE_SPEED_SCALE;
  // Speed-bonus damage scales super-linearly so high-speed hits hurt
  // proportionally more, matching kinetic-energy intuition. Tuned
  // iteratively: started at *2.5 linear (hits felt glancing), bumped
  // to pow(_, 1.7) * 4 (better but mid-range hits at speed 6-7 still
  // felt weak), now pow(_, 1.9) * 5 — a speed-7 ram does ~108 bonus
  // damage (was ~64), and a max-speed hit does ~194 (was ~110).
  const speedBonus1 = speed1 > 2 ? Math.pow(speed1 - 2, 1.9) * 5 : 0;
  const speedBonus2 = speed2 > 2 ? Math.pow(speed2 - 2, 1.9) * 5 : 0;

  // Apply damage to car1
  const dmg1 = (impactForce + speedBonus2) * getZoneDamageMultiplier(zone1, type1);
  if (zone1 === 'front') car1.frontDamage += dmg1;
  else if (zone1 === 'rear') car1.rearDamage += dmg1;
  else car1.sideDamage += dmg1;
  addDeformation(car1, collision.contactPoint, zone1, dmg1);

  // Apply damage to car2
  const dmg2 = (impactForce + speedBonus1) * getZoneDamageMultiplier(zone2, type2);
  if (zone2 === 'front') car2.frontDamage += dmg2;
  else if (zone2 === 'rear') car2.rearDamage += dmg2;
  else car2.sideDamage += dmg2;
  addDeformation(car2, collision.contactPoint, zone2, dmg2);

  // Spawn damage popup numbers for ALL hits
  if (dmg1 >= 1) {
    spawnDamagePopup(car1.x, car1.y - 45, Math.round(dmg1), car1.isPlayer ? '#ff4444' : '#ffaa00');
  }
  if (dmg2 >= 1) {
    spawnDamagePopup(car2.x, car2.y - 45, Math.round(dmg2), car2.isPlayer ? '#ff4444' : '#ffaa00');
  }

  // Visual effects based on impact force
  const totalSpeed = speed1 + speed2;

  if (impactForce > 1.5 || totalSpeed > 3) {
    // Transform contact point to each car's local space for impact marks
    const localPoint1 = vecRotate(vecSub(collision.contactPoint, vec(car1.x, car1.y)), -car1.angle);
    const localPoint2 = vecRotate(vecSub(collision.contactPoint, vec(car2.x, car2.y)), -car2.angle);

    // Add impact marks (scratches/dents) to both cars
    car1.impactMarks.push({
      x: localPoint1.x,
      y: localPoint1.y,
      zone: zone1,
      severity: Math.min(dmg1 / 50, 1),
      angle: Math.random() * Math.PI,
      type: Math.random() > 0.5 ? 'scratch' : 'dent'
    });
    car2.impactMarks.push({
      x: localPoint2.x,
      y: localPoint2.y,
      zone: zone2,
      severity: Math.min(dmg2 / 50, 1),
      angle: Math.random() * Math.PI,
      type: Math.random() > 0.5 ? 'scratch' : 'dent'
    });

    // Limit stored marks
    if (car1.impactMarks.length > 15) car1.impactMarks.shift();
    if (car2.impactMarks.length > 15) car2.impactMarks.shift();

    // Flash effect
    car1.lastHitFlash = frameCount;
    car2.lastHitFlash = frameCount;

    // Spawn debris (metal chunks)
    const debrisCount = Math.floor(impactForce * 0.5 + totalSpeed * 0.3);
    if (debrisCount > 0) {
      spawnDebris(collision.contactPoint.x, collision.contactPoint.y, '#666', debrisCount);
    }

    // Spawn paint chips from both cars
    if (totalSpeed > 4 || impactForce > 3) {
      spawnPaintChips(collision.contactPoint.x, collision.contactPoint.y, car1.color, 2 + Math.floor(Math.random() * 3));
      spawnPaintChips(collision.contactPoint.x, collision.contactPoint.y, car2.color, 2 + Math.floor(Math.random() * 3));
    }
  }

  // Add dents (legacy system)
  if (impactForce > 2) {
    car1.dents.push({ x: (Math.random() - 0.5) * type1.width, y: (Math.random() - 0.5) * type1.length * 0.4 });
    car2.dents.push({ x: (Math.random() - 0.5) * type2.width, y: (Math.random() - 0.5) * type2.length * 0.4 });
  }
}

function spawnDamagePopup(x, y, damage, color) {
  damagePopups.push({
    x: x + (Math.random() - 0.5) * 20,
    y: y,
    damage: damage,
    color: color,
    life: 60, // 1 second at 60fps
    vy: -1.5 // Float upward
  });
}

function getZoneDamageMultiplier(zone, type) {
  switch (zone) {
    case 'front': return 1.4 / type.frontStrength;
    case 'rear': return 0.5 / type.rearStrength;
    case 'side': return 0.8;
    default: return 1.0;
  }
}

// ==================== PHYSICS ====================
function updateCarPhysics(car, inputGas, inputReverse, inputLeft, inputRight) {
  if (car.disabled) return;

  const type = car.carType;
  const P = PHYSICS;

  const speedMod = getSpeedModifier(car);
  const accelMod = getAccelerationModifier(car);
  const steerMod = getSteerModifier(car);

  const maxForward = P.MAX_FORWARD_SPEED * type.topSpeed * speedMod;
  const maxReverse = P.MAX_REVERSE_SPEED * type.topSpeed * speedMod;
  const accel = P.BASE_ACCELERATION * type.acceleration * accelMod;
  const maxSteer = P.MAX_STEER_ANGLE * steerMod;

  // Steering
  if (inputLeft) {
    car.steerAngle -= P.STEER_SPEED * steerMod;
  } else if (inputRight) {
    car.steerAngle += P.STEER_SPEED * steerMod;
  } else {
    if (Math.abs(car.steerAngle) < P.STEER_RETURN_SPEED) {
      car.steerAngle = 0;
    } else {
      car.steerAngle -= Math.sign(car.steerAngle) * P.STEER_RETURN_SPEED;
    }
  }
  car.steerAngle = clamp(car.steerAngle, -maxSteer, maxSteer);

  // Acceleration - same power forward and reverse
  if (inputGas) {
    if (car.speed < 0) {
      // Braking from reverse
      car.speed += accel * 2.5;
    } else {
      car.speed += accel;
      if (car.speed > maxForward) car.speed = maxForward;
    }
  }
  if (inputReverse) {
    if (car.speed > 0) {
      // Braking from forward
      car.speed -= accel * 2.5;
    } else {
      // Full reverse power (same as forward)
      car.speed -= accel;
      if (car.speed < -maxReverse) car.speed = -maxReverse;
    }
  }

  if (!inputGas && !inputReverse) {
    car.speed *= P.ROLLING_FRICTION * P.MUD_DRAG;
    if (Math.abs(car.speed) < 0.01) car.speed = 0;
  }

  // Front-axle steering
  const absSpeed = Math.abs(car.speed);
  const wheelBase = type.length * 0.52;

  // Bent steering: front damage pulls toward the side that was hit, and
  // front/side damage adds smoothed random play to the wheel.
  const frontPct = getFrontDamagePct(car);
  const wheelDamage = Math.max(frontPct, getSideDamagePct(car));
  car.wobble = (car.wobble || 0) * 0.9 + (Math.random() - 0.5) * 2 * P.DAMAGE_WOBBLE_MAX * wheelDamage * 0.1;
  car.effSteer = car.steerAngle + (car.pullDir || 0) * frontPct * P.DAMAGE_PULL_MAX + car.wobble;

  if (absSpeed > P.MIN_SPEED_TO_TURN && Math.abs(car.effSteer) > 0.01) {
    const turnRadius = wheelBase / Math.tan(Math.abs(car.effSteer));
    const turnDir = Math.sign(car.effSteer);
    car.angularVel += (car.speed / turnRadius) * turnDir * 0.15;

    // Turning costs speed (friction from tires scrubbing)
    const turnSpeedLoss = Math.abs(car.effSteer) * absSpeed * 0.012;
    car.speed *= (1 - turnSpeedLoss);

    // Lateral slide - set directly instead of accumulating to prevent speed burst
    const slideAmount = absSpeed * Math.abs(car.effSteer) * 0.03;
    car.lateralVel = slideAmount * turnDir * Math.sign(car.speed);
  } else {
    // Decay lateral velocity when not turning
    car.lateralVel *= P.SLIDE_FRICTION;
  }

  car.angle += car.angularVel;
  car.angularVel *= P.ANGULAR_FRICTION;
  // lateralVel no longer decays here since we set it directly above

  // Decay impact velocities. Tuned iteratively: started at 0.94 (cars
  // sailed across the arena), tightened to 0.85 (better but still drifty),
  // now 0.75 — a 12-unit impulse decays to under 1 unit in ~10 frames
  // and dissipates within ~50 units of slide instead of ~80.
  car.vx = (car.vx || 0) * 0.75;
  car.vy = (car.vy || 0) * 0.75;
  if (Math.abs(car.vx) < 0.01) car.vx = 0;
  if (Math.abs(car.vy) < 0.01) car.vy = 0;

  // Mud traction: the direction of travel (moveAngle) chases the heading
  // instead of snapping to it, so the car slides through turns and after
  // hits. Less grip at speed and with bent wheels. Near standstill the
  // tires bite and travel locks to the heading.
  if (car.moveAngle === undefined || absSpeed < 0.3) {
    car.moveAngle = car.angle;
  } else {
    const speedFrac = Math.min(1, absSpeed / P.MAX_FORWARD_SPEED);
    const grip = P.MUD_GRIP
      * (1 - P.GRIP_LOSS_AT_TOP_SPEED * speedFrac)
      * (1 - P.GRIP_LOSS_FROM_DAMAGE * wheelDamage);
    const slip = normAngle(car.angle - car.moveAngle);
    car.moveAngle += slip * grip;
    // Sliding sideways scrubs speed
    car.speed *= 1 - P.SLIDE_SCRUB * Math.abs(Math.sin(slip));
  }

  // Movement (combine drive velocity and impact velocity)
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);
  const moveCos = Math.cos(car.moveAngle);
  const moveSin = Math.sin(car.moveAngle);

  // Full velocity this frame (drive + slide + impact knockback). Wall
  // damage uses its component into the wall, so a car shoved sideways
  // into the wall gets hurt and a glancing scrape along it barely does.
  const velX = moveCos * car.speed - sin * car.lateralVel + car.vx;
  const velY = moveSin * car.speed + cos * car.lateralVel + car.vy;
  car.x += velX;
  car.y += velY;

  // Wall collisions
  const dim = getCarDimensions(car);
  const halfLen = dim.length / 2;
  const halfWid = dim.width / 2;
  const diagonal = Math.sqrt(halfLen * halfLen + halfWid * halfWid);
  const wallMargin = WALL_THICKNESS + diagonal;

  // Each wall clamps the car, then damages whichever zone of the car
  // actually struck it (backing in hurts the rear, not the engine).
  // Argument is the wall's outward-facing normal.
  let hitWall = false;
  let wallImpactSpeed = 0;
  if (car.x < wallMargin) {
    car.x = wallMargin;
    car.speed *= 0.1;
    car.vx = Math.abs(car.vx) * 0.3;
    wallImpactSpeed = Math.max(wallImpactSpeed, applyWallDamage(car, vec(-1, 0), velX, velY));
    hitWall = true;
  }
  if (car.x > ARENA_WIDTH - wallMargin) {
    car.x = ARENA_WIDTH - wallMargin;
    car.speed *= 0.1;
    car.vx = -Math.abs(car.vx) * 0.3;
    wallImpactSpeed = Math.max(wallImpactSpeed, applyWallDamage(car, vec(1, 0), velX, velY));
    hitWall = true;
  }
  if (car.y < wallMargin) {
    car.y = wallMargin;
    car.speed *= 0.1;
    car.vy = Math.abs(car.vy) * 0.3;
    wallImpactSpeed = Math.max(wallImpactSpeed, applyWallDamage(car, vec(0, -1), velX, velY));
    hitWall = true;
  }
  if (car.y > ARENA_HEIGHT - wallMargin) {
    car.y = ARENA_HEIGHT - wallMargin;
    car.speed *= 0.1;
    car.vy = -Math.abs(car.vy) * 0.3;
    wallImpactSpeed = Math.max(wallImpactSpeed, applyWallDamage(car, vec(0, 1), velX, velY));
    hitWall = true;
  }

  // Wall crash sound for player
  if (hitWall && car.isPlayer && wallImpactSpeed > 1) {
    playCrashSound(wallImpactSpeed * 0.8, car.x);
  }

  // Mud tracks
  car.trackTimer--;
  if (car.trackTimer <= 0 && absSpeed > 0.4) {
    mudTracks.push({ x: car.x, y: car.y, angle: car.angle, life: 350 });
    car.trackTimer = 10;
  }
}

// Wall impact: the contact point is the car's deepest point toward the
// wall. Corners within a few units of that depth are averaged, so a car
// flush against the wall with its door registers as a side hit and a
// square nose-in registers as front-center. Zone multipliers and model
// strengths are the same ones car-to-car hits use.
const WALL_DAMAGE_PER_SPEED = 3;

// Returns the impact speed (velocity into the wall) for the crash sound.
function applyWallDamage(car, wallNormal, velX, velY) {
  const impactSpeed = Math.max(0, velX * wallNormal.x + velY * wallNormal.y) * DAMAGE_SPEED_SCALE;
  const corners = getCarCorners(car);
  const depths = corners.map(c => vecDot(c, wallNormal));
  const maxDepth = Math.max(...depths);
  const touching = corners.filter((c, i) => maxDepth - depths[i] < 4);
  const contact = vec(
    touching.reduce((sum, c) => sum + c.x, 0) / touching.length,
    touching.reduce((sum, c) => sum + c.y, 0) / touching.length
  );

  const zone = getImpactZone(car, contact);
  const dmg = impactSpeed * WALL_DAMAGE_PER_SPEED * getZoneDamageMultiplier(zone, car.carType);
  if (zone === 'front') car.frontDamage += dmg;
  else if (zone === 'rear') car.rearDamage += dmg;
  else car.sideDamage += dmg;
  addDeformation(car, contact, zone, dmg);
  return impactSpeed;
}

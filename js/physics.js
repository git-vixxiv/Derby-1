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

  if (absSpeed > P.MIN_SPEED_TO_TURN && Math.abs(car.steerAngle) > 0.01) {
    const turnRadius = wheelBase / Math.tan(Math.abs(car.steerAngle));
    const turnDir = Math.sign(car.steerAngle);
    car.angularVel += (car.speed / turnRadius) * turnDir * 0.15;

    // Turning costs speed (friction from tires scrubbing)
    const turnSpeedLoss = Math.abs(car.steerAngle) * absSpeed * 0.012;
    car.speed *= (1 - turnSpeedLoss);

    // Lateral slide - set directly instead of accumulating to prevent speed burst
    const slideAmount = absSpeed * Math.abs(car.steerAngle) * 0.03;
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

  // Movement (combine drive velocity and impact velocity)
  const cos = Math.cos(car.angle);
  const sin = Math.sin(car.angle);

  car.x += cos * car.speed - sin * car.lateralVel + car.vx;
  car.y += sin * car.speed + cos * car.lateralVel + car.vy;

  // Wall collisions
  const dim = getCarDimensions(car);
  const halfLen = dim.length / 2;
  const halfWid = dim.width / 2;
  const diagonal = Math.sqrt(halfLen * halfLen + halfWid * halfWid);
  const wallMargin = WALL_THICKNESS + diagonal;

  let hitWall = false;
  if (car.x < wallMargin) {
    car.x = wallMargin;
    car.speed *= 0.1;
    car.vx = Math.abs(car.vx) * 0.3;
    car.sideDamage += absSpeed * 4;
    hitWall = true;
  }
  if (car.x > ARENA_WIDTH - wallMargin) {
    car.x = ARENA_WIDTH - wallMargin;
    car.speed *= 0.1;
    car.vx = -Math.abs(car.vx) * 0.3;
    car.sideDamage += absSpeed * 4;
    hitWall = true;
  }
  if (car.y < wallMargin) {
    car.y = wallMargin;
    car.speed *= 0.1;
    car.vy = Math.abs(car.vy) * 0.3;
    car.frontDamage += absSpeed * 3;
    hitWall = true;
  }
  if (car.y > ARENA_HEIGHT - wallMargin) {
    car.y = ARENA_HEIGHT - wallMargin;
    car.speed *= 0.1;
    car.vy = -Math.abs(car.vy) * 0.3;
    car.rearDamage += absSpeed * 2.5;
    hitWall = true;
  }

  // Wall crash sound for player
  if (hitWall && car.isPlayer && absSpeed > 1) {
    playCrashSound(absSpeed * 0.8, car.x);
  }

  // Mud tracks
  car.trackTimer--;
  if (car.trackTimer <= 0 && absSpeed > 0.4) {
    mudTracks.push({ x: car.x, y: car.y, angle: car.angle, life: 350 });
    car.trackTimer = 10;
  }
}

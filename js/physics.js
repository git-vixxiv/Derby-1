// ==================== PHYSICS ====================
// analogSteer (optional): -1..1 from tilt or the touch pad. The wheel still
// turns toward that position at the same rate as the keys, so analog input
// gives finer control without making the car any twitchier.
function updateCarPhysics(car, inputGas, inputReverse, inputLeft, inputRight, analogSteer = null) {
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
  if (analogSteer !== null && !inputLeft && !inputRight) {
    const target = clamp(analogSteer, -1, 1) * maxSteer;
    const delta = target - car.steerAngle;
    // Heading back toward center uses the faster return rate, like the keys
    const rate = Math.abs(target) < Math.abs(car.steerAngle) && Math.sign(target) !== -Math.sign(car.steerAngle)
      ? P.STEER_RETURN_SPEED : P.STEER_SPEED * steerMod;
    car.steerAngle += clamp(delta, -rate, rate);
  } else if (inputLeft) {
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

  // Throttle, brake, coast. Same power forward and reverse.
  //   Driving in the direction you're already going (or from rest): drive
  //     force, reduced while the wheels spin.
  //   Pedal opposite to the direction of travel: brakes. In mud the wheels
  //     lock and the car slides (see `braking` below), so it takes a while.
  //   No pedal: mud and rolling drag.
  const wantDir = inputGas ? 1 : inputReverse ? -1 : 0;
  const moving = Math.abs(car.speed) > 0.05 ? Math.sign(car.speed) : 0;
  car.braking = wantDir !== 0 && moving !== 0 && wantDir !== moving;

  if (car.braking) {
    const prev = car.speed;
    car.speed -= moving * P.BRAKE_DECEL;
    if (Math.sign(car.speed) !== Math.sign(prev)) car.speed = 0; // stop, don't flip
    car.driveDir = 0;
  } else if (wantDir !== 0) {
    // New launch (from rest or a change of direction): tires spin first
    if (car.driveDir !== wantDir && Math.abs(car.speed) < 1) {
      car.wheelspin = Math.max(car.wheelspin || 0, P.WHEELSPIN_LAUNCH);
    }
    car.driveDir = wantDir;
    car.speed += wantDir * accel * (1 - (car.wheelspin || 0));
    car.wheelspin = Math.max(0, (car.wheelspin || 0) - P.WHEELSPIN_RECOVERY * weather.grip); // slower to bite in the rain
    if (car.speed > maxForward) car.speed = maxForward;
    if (car.speed < -maxReverse) car.speed = -maxReverse;
  } else {
    car.driveDir = 0;
    car.wheelspin = 0;
    const s = Math.abs(car.speed) * P.COAST_DRAG - P.COAST_DECEL;
    car.speed = s > 0 ? Math.sign(car.speed) * s : 0;
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
    // Locked wheels barely steer while the car slides under braking
    const steerAuthority = car.braking ? P.LOCKED_STEER : 1;
    car.angularVel += (car.speed / turnRadius) * turnDir * 0.15 * steerAuthority;

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
      * (1 - P.GRIP_LOSS_FROM_DAMAGE * wheelDamage)
      * weather.grip
      * (car.braking ? P.LOCKED_GRIP : 1);
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

  // Walls and infield obstacles of the current arena. Each contact pushes
  // the car out, damages whichever zone actually struck (backing in hurts
  // the rear, not the engine) and stops or bounces the car.
  const wallImpactSpeed = collideCarWithArena(car, velX, velY);
  const hitWall = wallImpactSpeed > 0;

  // Wall crash sound for player
  if (hitWall && car.isPlayer && wallImpactSpeed > 1) {
    playCrashSound(wallImpactSpeed * 0.8, car.x);
  }

  // Mud tracks (laid down thicker while sliding on locked wheels)
  car.trackTimer--;
  if (car.trackTimer <= 0 && absSpeed > 0.4) {
    mudTracks.push({ x: car.x, y: car.y, angle: car.angle, life: car.braking ? 500 : 350 });
    car.trackTimer = car.braking ? 4 : 10;
  }

  // Spinning tires throw mud out behind the drive direction
  if ((car.wheelspin || 0) > 0.15 && car.driveDir && frameCount % 2 === 0) {
    spawnMudSpray(car, car.driveDir, car.wheelspin);
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

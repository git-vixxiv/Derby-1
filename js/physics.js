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
    // Locked wheels on top of the mud's own drag; stop, don't flip direction
    const s = Math.abs(car.speed) * P.COAST_DRAG - P.COAST_DECEL - P.BRAKE_DECEL;
    car.speed = s > 0 ? moving * s : 0;
    car.driveDir = 0;
  } else if (wantDir !== 0) {
    // New launch (from rest or a change of direction): tires spin first
    // (most from a standstill, less if the car is already rolling)
    if (car.driveDir !== wantDir && Math.abs(car.speed) < 1) {
      car.wheelspin = Math.max(car.wheelspin || 0, P.WHEELSPIN_LAUNCH * (1 - Math.abs(car.speed)));
    }
    car.driveDir = wantDir;
    // Pull fades toward top speed, so reaching it takes a while
    const top = wantDir > 0 ? maxForward : maxReverse;
    const taper = 1 - P.ACCEL_TAPER * Math.min(1, Math.abs(car.speed) / top);
    car.speed += wantDir * accel * taper * (1 - (car.wheelspin || 0));
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

  // Sideways grip available right now: less with bent wheels, in the rain
  // and on locked wheels. It caps how fast the path can bend (rad/step).
  const lateralGrip = P.LATERAL_GRIP
    * (1 - P.GRIP_LOSS_FROM_DAMAGE * wheelDamage)
    * weather.grip
    * (car.braking ? P.LOCKED_GRIP : 1);
  const maxPathRate = lateralGrip / Math.max(absSpeed, 0.5);

  if (absSpeed > P.MIN_SPEED_TO_TURN && Math.abs(car.effSteer) > 0.01) {
    const turnRadius = wheelBase / Math.tan(Math.abs(car.effSteer));
    const turnDir = Math.sign(car.effSteer);
    // Locked wheels barely steer while the car slides under braking
    const steerAuthority = car.braking ? P.LOCKED_STEER : 1;
    // What the steering geometry asks for, limited by what the mud gives:
    // at speed the front tires wash out and the car won't rotate as asked
    const yawPush = Math.min(absSpeed / turnRadius * steerAuthority, maxPathRate * P.YAW_OVER_GRIP);
    car.angularVel += yawPush * Math.sign(car.speed) * turnDir * 0.15;

    // Turning costs speed (tires scrubbing). Cornering force grows with
    // the square of speed until the grip runs out, so the drag does too:
    // next to nothing at a crawl (a weak, damaged engine can still pull
    // away on full lock), the full amount from about half speed up.
    const cornerLoad = Math.min(1, (absSpeed / (P.MAX_FORWARD_SPEED * 0.5)) ** 2);
    const turnDrag = P.TURN_DRAG * cornerLoad * Math.abs(car.effSteer) / P.MAX_STEER_ANGLE;
    car.speed = Math.sign(car.speed) * Math.max(0, absSpeed - turnDrag);

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
    car.moveAngle += clamp(slip * grip, -maxPathRate, maxPathRate);
    // Sliding sideways scrubs speed
    const slideDrag = P.SLIDE_DRAG * Math.abs(Math.sin(slip));
    car.speed = Math.sign(car.speed) * Math.max(0, Math.abs(car.speed) - slideDrag);
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
// square nose-in registers as front-center. Damage goes with the square
// of the speed into the wall, with the same zone multipliers and model
// strengths car-to-car hits use.

// Returns the impact speed (velocity into the wall) for the crash sound.
function applyWallDamage(car, wallNormal, velX, velY) {
  const into = Math.max(0, velX * wallNormal.x + velY * wallNormal.y);
  const impactSpeed = into * DAMAGE_SPEED_SCALE; // for the crash sound
  const closing = into / PHYSICS.MAX_FORWARD_SPEED;
  const energy = DAMAGE.HIT_AT_TOP_SPEED * DAMAGE.WALL_FACTOR * Math.min(DAMAGE.MAX_ENERGY, closing * closing);
  const corners = getCarCorners(car);
  const depths = corners.map(c => vecDot(c, wallNormal));
  const maxDepth = Math.max(...depths);
  const touching = corners.filter((c, i) => maxDepth - depths[i] < 4);
  const contact = vec(
    touching.reduce((sum, c) => sum + c.x, 0) / touching.length,
    touching.reduce((sum, c) => sum + c.y, 0) / touching.length
  );

  const zone = getImpactZone(car, contact);
  const dmg = energy * getZoneDamageMultiplier(zone, car.carType);
  if (dmg >= 0.5) {
    if (zone === 'front') car.frontDamage += dmg;
    else if (zone === 'rear') car.rearDamage += dmg;
    else car.sideDamage += dmg;
    addDeformation(car, contact, zone, dmg);
  }
  return impactSpeed;
}

// ==================== AI ====================
// Each AI driver picks a live car to hit and which end of its own car to
// hit it with, drives at it (attacking), backs off for another run-up
// (retreating), picks again (scanning), and repeats. It drives by the same rules as the player: it has to slow down
// to turn tightly, it needs room to stop, and it has to land a hit of its
// own inside the hit clock.
//
// Every state produces two wishes, turned into pedals and steering at the
// end:
//   drive: +1 gas, -1 reverse, 0 coast
//   turn:  +1 swing the nose clockwise (car.angle increasing), -1 the
//          other way. Which way the wheel goes for that depends on whether
//          the car is rolling forward or backward, handled in one place.
//          (Before v11 the attack states steered as if always rolling
//          forward, so cars ramming tail-first, over half the field,
//          steered away from their target and never landed a hit.)
function updateAI(car) {
  const idle = { gas: false, reverse: false, left: false, right: false };
  if (car.disabled) return idle;

  const P = PHYSICS;
  const ai = car.ai;
  if (ai.attackCooldown > 0) ai.attackCooldown--;
  ai.stateTimer--;

  const absV = Math.abs(car.speed);
  const top = P.MAX_FORWARD_SPEED * car.carType.topSpeed * getSpeedModifier(car);

  // Jammed against a wall or another car: pull it free. Only a car that
  // really isn't moving counts; a damaged car crawling away on a weak
  // engine and spinning tires is slow, not stuck.
  const moved = dist(car, ai.lastPos);
  if (moved < 0.04) ai.stuckTimer++;
  else ai.stuckTimer = Math.max(0, ai.stuckTimer - 3);
  ai.lastPos = { x: car.x, y: car.y };
  if (ai.stuckTimer > 80 && ai.state !== 'unsticking') {
    ai.state = 'unsticking';
    ai.stateTimer = 130;
    ai.stuckTimer = 0;
    // Pull away from whatever it's jammed against: the nearest car or
    // wreck if one is touching distance away, otherwise the nearer wall
    let nearest = null, nearestD = 115;
    for (const c of allCars) {
      if (c === car) continue;
      const d = dist(car, c);
      if (d < nearestD) { nearest = c; nearestD = d; }
    }
    if (nearest) {
      const awayDot = (car.x - nearest.x) * Math.cos(car.angle) + (car.y - nearest.y) * Math.sin(car.angle);
      ai.unstickDir = awayDot >= 0 ? 1 : -1;
    } else {
      const ahead = arenaClearance(car.x + Math.cos(car.angle) * 70, car.y + Math.sin(car.angle) * 70);
      const behind = arenaClearance(car.x - Math.cos(car.angle) * 70, car.y - Math.sin(car.angle) * 70);
      ai.unstickDir = ahead > behind ? 1 : -1;
    }
    ai.unstickTurn = Math.random() < 0.5 ? -1 : 1;
  }

  // The hit clock: with 60% of it left, drop everything and go hit someone
  const urgency = frameCount - car.lastContactFrame > CONTACT_TIMEOUT * 0.4;
  if (urgency && (ai.state === 'retreating' || ai.state === 'scanning')) {
    ai.state = 'scanning';
    ai.stateTimer = 0;
    ai.attackCooldown = 0;
  }

  if ((ai.state === 'scanning' && ai.stateTimer <= 0) ||
      (ai.state === 'attacking' && (!ai.target || ai.target.disabled))) {
    aiPickAttack(car, urgency);
    aiStartAttack(ai);
  }

  const target = ai.target;
  if (!target) return idle;

  const ramSign = ai.useRear ? -1 : 1; // direction the car travels when attacking
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const distToTarget = Math.hypot(dx, dy);

  // Aim where the target will be, not where it is
  const tAngle = target.moveAngle ?? target.angle;
  const eta = Math.min(45, distToTarget / Math.max(absV, 1.2));
  const aimX = target.x + (Math.cos(tAngle) * target.speed + (target.vx || 0)) * eta * 0.6;
  const aimY = target.y + (Math.sin(tAngle) * target.speed + (target.vy || 0)) * eta * 0.6;
  let angleToAim = Math.atan2(aimY - car.y, aimX - car.x);
  // A wreck in the way: go round it. (Wrecks pile up as the round goes on,
  // and hitting one doesn't count as a hit.)
  const wreck = ai.state === 'attacking' ? aiWreckInPath(car, aimX, aimY, 260) : null;
  if (wreck) {
    const pass = wreck.side > 0 ? -1 : 1; // pass on the side the wreck isn't leaning toward
    for (const side of [pass, -pass]) {
      const wx = wreck.car.x + wreck.px * side * 95, wy = wreck.car.y + wreck.py * side * 95;
      if (arenaClearance(wx, wy) > 30) { angleToAim = Math.atan2(wy - car.y, wx - car.x); break; }
    }
  }
  const distToAim = Math.hypot(aimX - car.x, aimY - car.y);
  // How far the ramming end is from pointing at the aim point
  const diff = normAngle((ai.useRear ? angleToAim + Math.PI : angleToAim) - car.angle);
  const misalign = Math.abs(diff);

  let drive = 0;
  let turn = 0;

  switch (ai.state) {
    case 'scanning':
      break; // coasting while it picks the next car

    case 'attacking': {
      // Target has ended up nearer the other end of the car: use that end
      // instead of dragging this one all the way round
      if (misalign > 1.75 && frameCount - (ai.lastEndSwitch || -999) > 120) {
        ai.useRear = !ai.useRear;
        ai.lastEndSwitch = frameCount;
        break;
      }
      turn = misalign > 0.06 ? Math.sign(diff) : 0;
      // The arc that would bring the ramming end onto the aim point. The
      // mud only lets the car follow an arc that tight below a certain
      // speed, so slow down for big corrections and go flat out once
      // lined up. If even the car's tightest turn (wider with bent
      // steering) can't make the arc, the target is inside its turning
      // circle: back off instead of orbiting it.
      const arcRadius = misalign > 0.2 ? distToAim / (2 * Math.sin(Math.min(misalign, Math.PI / 2))) : Infinity;
      const lateralGrip = P.LATERAL_GRIP * weather.grip *
        (1 - P.GRIP_LOSS_FROM_DAMAGE * Math.max(getFrontDamagePct(car), getSideDamagePct(car)));
      const cornerSpeed = Math.sqrt(lateralGrip * 0.7 * arcRadius);
      const wantSpeed = Math.min(top * (wreck ? 0.6 : 1), Math.max(0.8, cornerSpeed));
      if (car.speed * ramSign < wantSpeed) drive = ramSign;
      const tightestTurn = car.carType.length * 0.52 / Math.tan(P.MAX_STEER_ANGLE * getSteerModifier(car));
      const insideTurningCircle = arcRadius < Math.min(tightestTurn, 320) * 1.1 && distToTarget < 260;

      // Leaning on the target without the speed for a real hit
      ai.bogTimer = distToTarget < 100 && absV < 0.35 ? (ai.bogTimer || 0) + 1 : 0;

      if (car.lastContactFrame > ai.attackStart) {
        // Landed one. Back off far enough for a real run-up (hits are won
        // on speed); keener drivers settle for less and come back sooner
        aiBackOff(ai, 130 + (1 - ai.aggressiveness) * 110 + Math.random() * 50);
      } else if (ai.bogTimer > 25 || insideTurningCircle) {
        // Too close to build speed or to line up: make room
        aiBackOff(ai, Math.min(320, distToTarget + 110));
      } else if (ai.stateTimer <= 0) {
        ai.state = 'scanning';
        ai.stateTimer = 5;
      }
      break;
    }

    case 'retreating': {
      drive = -ramSign;
      // Stop backing off once there's room for a run, or if that way is blocked
      const away = ramSign > 0 ? car.angle + Math.PI : car.angle;
      const blocked = arenaClearance(car.x + Math.cos(away) * 75, car.y + Math.sin(away) * 75) < 15;
      if (ai.stateTimer <= 0 || blocked || distToTarget > ai.runUp) {
        // No room to back off for a run at this car: go after another one
        // rather than shuffling back and forth in front of it
        if (blocked && distToTarget < ai.runUp * 0.6) {
          ai.skipTarget = target;
          ai.skipUntil = frameCount + 300;
        }
        ai.state = 'scanning';
        ai.stateTimer = blocked ? 0 : 5 + Math.random() * 20;
      }
      break;
    }

    case 'unsticking':
      // One good pull each way rather than rocking on spinning wheels
      drive = ai.stateTimer > 60 ? ai.unstickDir : -ai.unstickDir;
      turn = ai.unstickTurn;
      if (ai.stateTimer <= 0) {
        ai.state = 'scanning';
        ai.stateTimer = 0;
      }
      break;
  }

  // Walls and infield, for any arena shape.
  if (ai.state !== 'unsticking') {
    const attacking = ai.state === 'attacking';
    const stopDist = absV * absV / (2 * (P.BRAKE_DECEL + P.COAST_DECEL));
    const clearAlong = (dir, a, d) => arenaClearance(car.x + Math.cos(dir + a) * d, car.y + Math.sin(dir + a) * d);

    if (absV > 1) {
      // At speed: look ahead along the direction of travel as far as the
      // car needs to stop. Steer toward the open side, and lift or brake if
      // steering won't be enough. Not when the target is lined up and
      // nearer than the wall: hitting it is the point, and it stops the car.
      const rolling = Math.sign(car.speed);
      const dir = rolling > 0 ? car.angle : car.angle + Math.PI;
      const targetFirst = attacking && misalign < 0.5 && distToTarget < 70 + stopDist * 1.1;
      if (!targetFirst && clearAlong(dir, 0, 50 + stopDist) < 20) {
        turn = clearAlong(dir, 0.6, 80) > clearAlong(dir, -0.6, 80) ? 1 : -1;
        if (clearAlong(dir, 0, 50 + stopDist * 0.6) < 20) drive = -rolling; // brake
        else if (absV > top * 0.45) drive = 0;                              // lift
      }
    } else if (drive !== 0) {
      // Crawling or stopped with a wall right where it wants to go: pull
      // away from the wall instead. The wanted swing stays the same, so
      // the car keeps turning toward its target as it backs out (a K-turn).
      const dir = drive > 0 ? car.angle : car.angle + Math.PI;
      const hold = ai.wallHold > 0;
      if (hold) ai.wallHold--;
      if (clearAlong(dir, 0, 62) < 12 && !(attacking && misalign < 0.5 && distToTarget < 110)) {
        ai.wallHold = 40; // keep backing out long enough to make real room
        drive = -drive;
      } else if (hold) {
        drive = -drive;
      }
    }
  }

  // Wheel direction for the wanted swing depends on which way the car rolls
  const rollSign = absV > 0.1 ? Math.sign(car.speed) : (drive || 1);
  return {
    gas: drive > 0,
    reverse: drive < 0,
    left: turn * rollSign < 0,
    right: turn * rollSign > 0
  };
}

function aiStartAttack(ai) {
  ai.state = 'attacking';
  ai.stateTimer = 480;
  ai.attackStart = frameCount;
  ai.bogTimer = 0;
}

function aiBackOff(ai, runUp) {
  ai.state = 'retreating';
  ai.stateTimer = 220;
  ai.runUp = runUp;
}

// Choose the next car to hit, and whether to hit it nose-first or
// tail-first. Nearer cars and cars that need less turning to reach are
// preferred, and so is a clear run with no wreck in the way.
function aiPickAttack(car, urgency) {
  const ai = car.ai;
  // Nose-first costs the rammer 1.4x the hit against 0.5x tail-first, so
  // every driver leans toward the tail; the bolder ones will still use
  // the nose when a car is right in front of them.
  const frontCost = (ai.preferReverse ? 1.4 : 0.6) + getFrontDamagePct(car) * 2.5;
  const rearCost = 0;
  // A car with bent steering can only reach what's nearly in line with it
  const turnWeight = 70 / Math.max(0.25, getSteerModifier(car));
  let best = null, bestScore = -Infinity, bestRear = false;
  for (const c of allCars) {
    if (c === car || c.disabled) continue;
    const d = dist(car, c);
    const skip = c === ai.skipTarget && frameCount < ai.skipUntil ? 400 : 0;
    const offFront = Math.abs(normAngle(Math.atan2(c.y - car.y, c.x - car.x) - car.angle));
    const viaFront = offFront + frontCost;
    const viaRear = (Math.PI - offFront) + rearCost;
    const blocked = aiWreckInPath(car, c.x, c.y, 400) ? 130 : 0; // prefer a clear run
    const score = -d * 0.5 - Math.min(viaFront, viaRear) * turnWeight - blocked - skip + getLifeUsed(c) * 40 + Math.random() * (urgency ? 30 : 150);
    if (score > bestScore) { bestScore = score; best = c; bestRear = viaRear < viaFront; }
  }
  ai.target = best;
  ai.useRear = bestRear;
}

// The nearest wreck lying across the straight line from the car to (tx, ty),
// within maxDist. Returns the wreck, which side of the line its center is
// on, and the unit vector across the line, or null if the way is clear.
function aiWreckInPath(car, tx, ty, maxDist) {
  const dx = tx - car.x, dy = ty - car.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const px = uy, py = -ux; // across the line
  let found = null, foundAlong = Infinity;
  for (const w of disabledCars) {
    const rx = w.x - car.x, ry = w.y - car.y;
    const along = rx * ux + ry * uy;
    if (along < 15 || along > Math.min(len - 35, maxDist)) continue; // behind us, or at/beyond the target
    const side = rx * px + ry * py;
    if (Math.abs(side) < 58 && along < foundAlong) {
      found = { car: w, side, px, py };
      foundAlong = along;
    }
  }
  return found;
}

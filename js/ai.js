// ==================== AI ====================
function updateAI(car) {
  if (car.disabled) return { gas: false, reverse: false, left: false, right: false };

  const ai = car.ai;
  if (ai.attackCooldown > 0) ai.attackCooldown--;
  ai.stateTimer--;

  const moved = dist(car, ai.lastPos);
  if (moved < 0.2 && Math.abs(car.speed) < 0.15) ai.stuckTimer++;
  else ai.stuckTimer = Math.max(0, ai.stuckTimer - 2);
  ai.lastPos = { x: car.x, y: car.y };

  if (ai.stuckTimer > 50) {
    ai.state = 'unsticking';
    ai.stateTimer = 45;
    ai.stuckTimer = 0;
  }

  const framesSinceContact = frameCount - car.lastContactFrame;
  const urgency = framesSinceContact > CONTACT_TIMEOUT * 0.65;

  const activeCars = allCars.filter(c => c !== car && !c.disabled);
  if (!ai.target || ai.target.disabled || ai.stateTimer <= 0) {
    if (activeCars.length > 0) {
      let best = null, bestScore = -Infinity;
      activeCars.forEach(c => {
        const d = dist(car, c);
        const dmg = (getFrontDamagePct(c) + getRearDamagePct(c)) * 50;
        let s = 500 - d * 0.4 + dmg + Math.random() * 200;
        if (c.isPlayer && ai.aggressiveness > 0.5) s += 80;
        if (urgency) s += 180;
        if (s > bestScore) { bestScore = s; best = c; }
      });
      ai.target = best;
    }
  }

  const target = ai.target;
  if (!target) return { gas: false, reverse: false, left: false, right: false };

  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const distToTarget = Math.sqrt(dx * dx + dy * dy);
  const angleToTarget = Math.atan2(dy, dx);

  let wantGas = false, wantReverse = false, wantLeft = false, wantRight = false;

  const useRear = ai.preferReverse || car.frontDamage > car.rearDamage * 1.5;

  if (urgency && ai.state !== 'charging' && ai.state !== 'unsticking') {
    ai.state = 'charging';
    ai.stateTimer = 100;
  }

  switch (ai.state) {
    case 'scanning':
      if (ai.stateTimer <= 0) {
        ai.state = distToTarget < 280 ? 'positioning' : 'approaching';
        ai.stateTimer = ai.patience;
      }
      wantGas = Math.random() > 0.5;
      break;

    case 'approaching':
      {
        const targetAngle = useRear ? angleToTarget + Math.PI : angleToTarget;
        const diff = normAngle(targetAngle - car.angle);
        wantLeft = diff < -0.15;
        wantRight = diff > 0.15;
        wantGas = !useRear;
        wantReverse = useRear;
        if (distToTarget < 230 || ai.stateTimer <= 0) {
          ai.state = 'positioning';
          ai.stateTimer = ai.patience;
        }
      }
      break;

    case 'positioning':
      {
        const targetAngle = useRear ? angleToTarget + Math.PI : angleToTarget;
        const diff = normAngle(targetAngle - car.angle);
        wantLeft = diff < -0.1;
        wantRight = diff > 0.1;

        if (distToTarget < 110) {
          wantGas = useRear;
          wantReverse = !useRear;
        } else if (distToTarget > 180) {
          wantGas = !useRear;
          wantReverse = useRear;
        }

        if (Math.abs(diff) < 0.35 && distToTarget > 90 && distToTarget < 230 && ai.attackCooldown <= 0) {
          ai.state = 'charging';
          ai.stateTimer = 85;
        }
        if (ai.stateTimer <= 0) {
          ai.state = 'scanning';
          ai.stateTimer = 35;
        }
      }
      break;

    case 'charging':
      {
        const targetAngle = useRear ? angleToTarget + Math.PI : angleToTarget;
        const diff = normAngle(targetAngle - car.angle);
        wantLeft = diff < -0.08;
        wantRight = diff > 0.08;
        wantGas = !useRear;
        wantReverse = useRear;

        if (distToTarget < 50 || ai.stateTimer <= 0) {
          ai.state = 'retreating';
          ai.stateTimer = 55 + Math.random() * 35;
          ai.attackCooldown = 60 + Math.random() * 45;
        }
      }
      break;

    case 'retreating':
      {
        const awayAngle = Math.atan2(car.y - target.y, car.x - target.x);
        const diff = normAngle(awayAngle - car.angle);

        if (Math.abs(diff) > Math.PI / 2) {
          wantReverse = true;
          wantLeft = diff > 0;
          wantRight = diff < 0;
        } else {
          wantGas = true;
          wantLeft = diff < -0.1;
          wantRight = diff > 0.1;
        }

        if (ai.stateTimer <= 0 || distToTarget > 280) {
          ai.state = 'scanning';
          ai.stateTimer = 30;
        }
      }
      break;

    case 'unsticking':
      wantReverse = ai.stateTimer > 22;
      wantGas = ai.stateTimer <= 22;
      wantLeft = Math.random() > 0.5;
      wantRight = !wantLeft;
      if (ai.stateTimer <= 0) {
        ai.state = 'scanning';
        ai.stateTimer = 30;
      }
      break;
  }

  // Wall avoidance for any arena shape: probe ahead in the direction of
  // travel and steer toward whichever side has more room. (Charging cars
  // still commit when the target is right there.)
  const goingBack = wantReverse || (!wantGas && car.speed < -0.3);
  if (!(ai.state === 'charging' && distToTarget < 120)) {
    const dir = goingBack ? car.angle + Math.PI : car.angle;
    const look = 55 + Math.abs(car.speed) * 12;
    const probe = a => arenaClearance(car.x + Math.cos(dir + a) * look, car.y + Math.sin(dir + a) * look);
    if (probe(0) < 25) {
      const leftRoom = probe(-0.6), rightRoom = probe(0.6);
      // Steering input turns the nose; in reverse the tail swings the other way
      const turnRight = rightRoom > leftRoom;
      wantRight = goingBack ? !turnRight : turnRight;
      wantLeft = !wantRight;
    }
  }

  return { gas: wantGas, reverse: wantReverse, left: wantLeft, right: wantRight };
}

// ==================== DRAWING ====================
function drawPlayerHighlight(car) {
  const dim = getCarDimensions(car);
  const halfLen = dim.length / 2;
  const t = Date.now() / 200;

  // Pulsing yellow ring around the player car
  const pulseRadius = 52 + Math.sin(t) * 8;
  ctx.save();
  ctx.strokeStyle = '#f5a623';
  ctx.lineWidth = 4;
  ctx.globalAlpha = 0.55 + Math.sin(t) * 0.25;
  ctx.beginPath();
  ctx.arc(car.x, car.y, pulseRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // "YOU" label with downward arrow above the car
  const labelY = car.y - halfLen - 32;
  ctx.save();
  ctx.font = 'bold 22px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#000';
  ctx.strokeText('YOU', car.x, labelY);
  ctx.fillStyle = '#f5a623';
  ctx.fillText('YOU', car.x, labelY);

  // Downward-pointing triangle below the label
  ctx.beginPath();
  ctx.moveTo(car.x - 8, labelY + 14);
  ctx.lineTo(car.x + 8, labelY + 14);
  ctx.lineTo(car.x, labelY + 26);
  ctx.closePath();
  ctx.fillStyle = '#f5a623';
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawHealthBar(car) {
  const dim = getCarDimensions(car);
  const halfLen = dim.length / 2;
  const healthPct = getCarHealthPct(car);

  const barWidth = 44;
  const barHeight = 6;
  const barX = car.x - barWidth / 2;
  const barY = car.y - halfLen - 20;

  // Background (dark)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

  // Health fill - color based on health level
  let barColor;
  if (healthPct > 0.6) {
    barColor = '#2ecc71'; // Green
  } else if (healthPct > 0.35) {
    barColor = '#f39c12'; // Yellow/orange
  } else {
    barColor = '#e74c3c'; // Red
  }

  ctx.fillStyle = barColor;
  ctx.fillRect(barX, barY, barWidth * healthPct, barHeight);

  // Border
  ctx.strokeStyle = car.isPlayer ? '#fff' : '#888';
  ctx.lineWidth = car.isPlayer ? 2 : 1;
  ctx.strokeRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);

  // Player indicator (small crown/star above bar)
  if (car.isPlayer) {
    ctx.fillStyle = '#f5a623';
    ctx.font = 'bold 10px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('★', car.x, barY - 4);
  }
}

function drawCar(car) {
  const type = car.carType;
  const dim = getCarDimensions(car);

  const totalLen = dim.length;
  const halfLen = totalLen / 2;
  const W = dim.width;
  const hw = W / 2;

  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(3, 3, halfLen, hw + 2, 0, 0, Math.PI * 2);
  ctx.fill();

  const baseLightness = car.disabled ? -20 : 0;

  // Main body
  ctx.fillStyle = hsl(car.color, baseLightness);
  ctx.beginPath();
  const frontX = halfLen;
  const rearX = -halfLen;

  ctx.moveTo(rearX + 4, -hw);
  ctx.lineTo(frontX - 5, -hw);
  ctx.quadraticCurveTo(frontX, -hw, frontX, -hw + 5);
  ctx.lineTo(frontX, hw - 5);
  ctx.quadraticCurveTo(frontX, hw, frontX - 5, hw);
  ctx.lineTo(rearX + 4, hw);
  ctx.quadraticCurveTo(rearX, hw, rearX, hw - 4);
  ctx.lineTo(rearX, -hw + 4);
  ctx.quadraticCurveTo(rearX, -hw, rearX + 4, -hw);
  ctx.closePath();
  ctx.fill();

  // Hood
  const hoodStart = halfLen - dim.hoodLength;
  const hoodDarkness = getFrontDamagePct(car) * 25;
  if (dim.hoodLength > 5) {
    ctx.fillStyle = hsl(car.color, 8 - hoodDarkness + baseLightness);
    ctx.beginPath();
    ctx.roundRect(hoodStart, -hw + 4, dim.hoodLength - 4, W - 8, [0, 4, 4, 0]);
    ctx.fill();

    if (getFrontDamagePct(car) > 0.2) {
      ctx.strokeStyle = hsl(car.color, -20 + baseLightness);
      ctx.lineWidth = 1;
      const wrinkles = Math.floor(getFrontDamagePct(car) * 4);
      for (let i = 0; i < wrinkles; i++) {
        const wx = hoodStart + Math.random() * (dim.hoodLength - 6);
        ctx.beginPath();
        ctx.moveTo(wx, -hw + 6);
        ctx.lineTo(wx + (Math.random() - 0.5) * 10, hw - 6);
        ctx.stroke();
      }
    }
  }

  // Windshield
  const wsX = hoodStart - 2;
  ctx.fillStyle = '#1a2838';
  ctx.beginPath();
  ctx.roundRect(wsX - 8, -hw + 5, 10, W - 10, 2);
  ctx.fill();

  // Cabin
  const cabinStart = -halfLen + dim.trunkLength + 2;
  const cabinEnd = wsX - 10;
  const actualCabinLen = cabinEnd - cabinStart;
  if (actualCabinLen > 6) {
    ctx.fillStyle = hsl(car.color, -10 + baseLightness);
    ctx.beginPath();
    ctx.roundRect(cabinStart, -hw + 4, actualCabinLen, W - 8, 3);
    ctx.fill();

    ctx.fillStyle = '#1a2838';
    ctx.fillRect(cabinStart + 4, -hw + 5, actualCabinLen - 8, 4);
    ctx.fillRect(cabinStart + 4, hw - 9, actualCabinLen - 8, 4);
  }

  // Trunk
  const trunkStart = -halfLen + 4;
  const trunkDarkness = getRearDamagePct(car) * 20;
  if (dim.trunkLength > 4) {
    if (type.bodyStyle === 'wagon') {
      ctx.fillStyle = hsl(car.color, -5 - trunkDarkness + baseLightness);
      ctx.beginPath();
      ctx.roundRect(trunkStart, -hw + 4, dim.trunkLength - 3, W - 8, [4, 0, 0, 4]);
      ctx.fill();
      if (dim.trunkLength > 10) {
        ctx.fillStyle = '#1a2838';
        ctx.fillRect(trunkStart + 3, -hw + 6, dim.trunkLength * 0.4, W - 12);
      }
    } else {
      ctx.fillStyle = hsl(car.color, -15 - trunkDarkness + baseLightness);
      ctx.beginPath();
      ctx.roundRect(trunkStart, -hw + 5, dim.trunkLength - 3, W - 10, [4, 0, 0, 4]);
      ctx.fill();
    }

    if (getRearDamagePct(car) > 0.25) {
      ctx.strokeStyle = hsl(car.color, -25 + baseLightness);
      ctx.lineWidth = 1;
      const wrinkles = Math.floor(getRearDamagePct(car) * 3);
      for (let i = 0; i < wrinkles; i++) {
        const wx = trunkStart + Math.random() * (dim.trunkLength - 5);
        ctx.beginPath();
        ctx.moveTo(wx, -hw + 7);
        ctx.lineTo(wx + (Math.random() - 0.5) * 8, hw - 7);
        ctx.stroke();
      }
    }
  }

  // Bumpers
  const bumperDarkness = car.disabled ? 30 : 0;
  ctx.fillStyle = `rgb(${100 - bumperDarkness}, ${100 - bumperDarkness}, ${100 - bumperDarkness})`;
  ctx.fillRect(frontX - 3, -hw + 3, 5, W - 6);
  ctx.fillStyle = `rgb(${85 - bumperDarkness}, ${85 - bumperDarkness}, ${85 - bumperDarkness})`;
  ctx.fillRect(rearX - 1, -hw + 4, 5, W - 8);

  // WHEELS - positioned 30% from each end (between original and v7 positions)
  const wheelColor = getRearDamagePct(car) > 0.8 ? '#444' : '#111';
  ctx.fillStyle = wheelColor;
  const wheelW = 10 * CAR_SCALE;
  const wheelH = 5 * CAR_SCALE;

  // Front wheels: 30% from front (was at midpoint of hood in v7, was too close to center before)
  const frontWheelX = halfLen - totalLen * 0.22;
  // Rear wheels: 30% from rear
  const rearWheelX = -halfLen + totalLen * 0.22;

  // Front wheels with steering
  ctx.save();
  ctx.translate(frontWheelX, -hw - 1);
  ctx.rotate(car.steerAngle * 0.4);
  ctx.fillRect(-wheelW / 2, -wheelH / 2, wheelW, wheelH);
  ctx.restore();
  ctx.save();
  ctx.translate(frontWheelX, hw + 1);
  ctx.rotate(car.steerAngle * 0.4);
  ctx.fillRect(-wheelW / 2, -wheelH / 2, wheelW, wheelH);
  ctx.restore();

  // Rear wheels
  const rearWheelH = getRearDamagePct(car) > 0.9 ? wheelH * 0.4 : wheelH;
  ctx.fillRect(rearWheelX - wheelW / 2, -hw - 2, wheelW, rearWheelH);
  ctx.fillRect(rearWheelX - wheelW / 2, hw + 2 - rearWheelH, wheelW, rearWheelH);

  // Headlights
  if (!car.disabled && dim.hoodLength > 6) {
    ctx.fillStyle = '#ffe';
    ctx.beginPath();
    ctx.ellipse(frontX - 5, -hw + 6, 3, 2.5, 0, 0, Math.PI * 2);
    ctx.ellipse(frontX - 5, hw - 6, 3, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Taillights
  if (dim.trunkLength > 5) {
    ctx.fillStyle = car.disabled ? '#600' : '#c00';
    ctx.beginPath();
    ctx.roundRect(rearX + 2, -hw + 5, 4, 5, 1);
    ctx.roundRect(rearX + 2, hw - 10, 4, 5, 1);
    ctx.fill();
  }

  // Car number
  ctx.fillStyle = car.disabled ? '#666' : '#fff';
  ctx.font = `bold ${Math.floor(W * 0.42)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(car.carNumber.toString().padStart(2, '0'), 0, 0);

  // Dents (legacy)
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  car.dents.slice(-8).forEach(dent => {
    ctx.beginPath();
    ctx.arc(dent.y * 0.6, dent.x * 0.6, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Impact marks (scratches and dents)
  car.impactMarks.forEach(mark => {
    if (mark.type === 'scratch') {
      // Draw scratch lines
      ctx.strokeStyle = `rgba(40, 40, 40, ${0.4 + mark.severity * 0.4})`;
      ctx.lineWidth = 1 + mark.severity;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const scratchLen = 8 + mark.severity * 12;
      const angle = Math.random() * Math.PI;
      ctx.moveTo(mark.x - Math.cos(angle) * scratchLen/2, mark.y - Math.sin(angle) * scratchLen/2);
      ctx.lineTo(mark.x + Math.cos(angle) * scratchLen/2, mark.y + Math.sin(angle) * scratchLen/2);
      ctx.stroke();
    } else {
      // Draw dent (darker circular area with highlight edge)
      const dentSize = 4 + mark.severity * 6;
      ctx.fillStyle = `rgba(0, 0, 0, ${0.2 + mark.severity * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(mark.x, mark.y, dentSize, dentSize * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      // Highlight edge
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.1 + mark.severity * 0.15})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mark.x - dentSize * 0.3, mark.y - dentSize * 0.3, dentSize * 0.5, Math.PI * 0.8, Math.PI * 1.5);
      ctx.stroke();
    }
  });

  // Hit flash effect (white overlay that fades)
  const flashAge = frameCount - car.lastHitFlash;
  if (flashAge < 8) {
    ctx.fillStyle = `rgba(255, 255, 255, ${(8 - flashAge) / 16})`;
    ctx.beginPath();
    ctx.roundRect(-halfLen, -hw, totalLen, W, 4);
    ctx.fill();
  }

  ctx.restore();

  // Disabled X marker
  if (car.disabled) {
    ctx.save();
    ctx.translate(car.x, car.y);

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(0, -halfLen - 18, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-7, -halfLen - 25);
    ctx.lineTo(7, -halfLen - 11);
    ctx.moveTo(7, -halfLen - 25);
    ctx.lineTo(-7, -halfLen - 11);
    ctx.stroke();

    ctx.restore();
  }

  // Smoke (reduced)
  const totalDmg = (getFrontDamagePct(car) + getRearDamagePct(car) + getSideDamagePct(car)) / 3;
  if ((totalDmg > 0.4 || car.disabled) && car.smokeTimer % (car.disabled ? 14 : 20) === 0) {
    const smokeX = car.x + Math.cos(car.angle) * (halfLen - dim.hoodLength / 2);
    const smokeY = car.y + Math.sin(car.angle) * (halfLen - dim.hoodLength / 2);
    spawnSmoke(smokeX + (Math.random() - 0.5) * 6, smokeY + (Math.random() - 0.5) * 6, 4 + totalDmg * 3);
  }
  car.smokeTimer++;

  // Fire (reduced)
  if ((totalDmg > 0.65 || car.disabled) && Math.random() < 0.06) {
    const fireX = car.x + Math.cos(car.angle) * (halfLen * 0.4);
    const fireY = car.y + Math.sin(car.angle) * (halfLen * 0.4);
    particles.push({
      x: fireX + (Math.random() - 0.5) * 8,
      y: fireY + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 0.8,
      vy: -0.6 - Math.random() * 1,
      life: 8 + Math.random() * 8,
      size: 2.5 + Math.random() * 3,
      type: 'fire'
    });
  }

  // Player reverse indicator
  if (car.isPlayer && !car.disabled && controls.reverse) {
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 11px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('◀◀ REVERSE', car.x, car.y + hw + 18);
  }
}

function drawArena() {
  ctx.fillStyle = '#5d4e3a';
  ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

  ctx.fillStyle = '#4a3f2e';
  for (let i = 0; i < 30; i++) {
    ctx.beginPath();
    ctx.ellipse((i * 137 + 40) % ARENA_WIDTH, (i * 97 + 50) % ARENA_HEIGHT, 30 + (i % 5) * 18, 20 + (i % 4) * 12, i * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#3d3425';
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.ellipse((i * 211 + 100) % ARENA_WIDTH, (i * 163 + 80) % ARENA_HEIGHT, 45 + (i % 3) * 25, 28 + (i % 4) * 15, i, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(55,45,32,0.2)';
  ctx.lineWidth = 5;
  mudTracks = mudTracks.filter(t => {
    t.life--;
    if (t.life > 0) {
      ctx.globalAlpha = Math.min(t.life / 100, 1);
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.angle);
      ctx.beginPath();
      ctx.moveTo(-10, -4); ctx.lineTo(10, -4);
      ctx.moveTo(-10, 4); ctx.lineTo(10, 4);
      ctx.stroke();
      ctx.restore();
    }
    return t.life > 0;
  });
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#666';
  ctx.fillRect(0, 0, ARENA_WIDTH, WALL_THICKNESS);
  ctx.fillRect(0, ARENA_HEIGHT - WALL_THICKNESS, ARENA_WIDTH, WALL_THICKNESS);
  ctx.fillRect(0, 0, WALL_THICKNESS, ARENA_HEIGHT);
  ctx.fillRect(ARENA_WIDTH - WALL_THICKNESS, 0, WALL_THICKNESS, ARENA_HEIGHT);

  ctx.strokeStyle = '#555';
  ctx.lineWidth = 2;
  for (let i = 0; i < ARENA_WIDTH; i += 50) {
    ctx.beginPath();
    ctx.moveTo(i, 0); ctx.lineTo(i, WALL_THICKNESS);
    ctx.moveTo(i, ARENA_HEIGHT - WALL_THICKNESS); ctx.lineTo(i, ARENA_HEIGHT);
    ctx.stroke();
  }
  for (let i = 0; i < ARENA_HEIGHT; i += 50) {
    ctx.beginPath();
    ctx.moveTo(0, i); ctx.lineTo(WALL_THICKNESS, i);
    ctx.moveTo(ARENA_WIDTH - WALL_THICKNESS, i); ctx.lineTo(ARENA_WIDTH, i);
    ctx.stroke();
  }

  ctx.fillStyle = '#222';
  const tireR = 32;
  [[tireR + 8, tireR + 8], [ARENA_WIDTH - tireR - 8, tireR + 8],
   [tireR + 8, ARENA_HEIGHT - tireR - 8], [ARENA_WIDTH - tireR - 8, ARENA_HEIGHT - tireR - 8]].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, tireR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 3;
    ctx.stroke();
  });
}

function drawPowerUp(pu) {
  ctx.save();
  ctx.translate(pu.x, pu.y);
  const pulse = Math.sin(Date.now() / 150) * 4;
  ctx.fillStyle = pu.type === 'wrench' ? 'rgba(46,204,113,0.4)' : 'rgba(241,196,15,0.4)';
  ctx.beginPath();
  ctx.arc(0, 0, 22 + pulse, 0, Math.PI * 2);
  ctx.fill();

  if (pu.type === 'wrench') {
    ctx.fillStyle = '#bdc3c7';
    ctx.fillRect(-14, -3, 28, 6);
    ctx.beginPath();
    ctx.arc(-14, 0, 9, 0, Math.PI * 2);
    ctx.arc(14, 0, 9, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.lineTo(10, 14);
    ctx.lineTo(0, 6);
    ctx.lineTo(-10, 14);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawCountdown() {
  const cdText = document.getElementById('countdown-text');

  if (countdownValue > 0) {
    cdText.textContent = countdownValue;
    cdText.className = '';
  } else {
    cdText.textContent = 'GO!';
    cdText.className = 'go';
  }

  flagCtx.clearRect(0, 0, 120, 80);
  const flagWave = Math.sin(Date.now() / 100) * 5;

  flagCtx.fillStyle = '#8B4513';
  flagCtx.fillRect(10, 10, 6, 65);

  flagCtx.fillStyle = countdownValue > 0 ? '#f1c40f' : '#2ecc71';

  flagCtx.beginPath();
  flagCtx.moveTo(16, 15);
  flagCtx.quadraticCurveTo(60 + flagWave, 20, 100, 15 + flagWave);
  flagCtx.lineTo(100, 45 + flagWave);
  flagCtx.quadraticCurveTo(60 - flagWave, 50, 16, 45);
  flagCtx.closePath();
  flagCtx.fill();

  flagCtx.strokeStyle = '#333';
  flagCtx.lineWidth = 2;
  flagCtx.stroke();
}

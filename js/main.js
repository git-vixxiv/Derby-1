// ==================== GAME STATE ====================
let gameState = 'menu';
let countdownValue = 5;
let countdownTimer = 0;
let level = 1;
let score = 0;
let carsWrecked = 0;
let roundStartTime = 0;
let highScore = parseInt(localStorage.getItem('demolitionDerbyHighScoreV9')) || 0;
let playerDisqualified = false;

let player = null;
let enemies = [];
let allCars = [];
let disabledCars = [];
let particles = [];
let mudTracks = [];
let damagePopups = []; // Floating damage numbers
let usedNumbers = new Set();

const controls = { left: false, right: false, gas: false, reverse: false, analogSteer: null };

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const flagCanvas = document.getElementById('flagCanvas');
const flagCtx = flagCanvas.getContext('2d');

const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

let frameCount = 0;

updateHighScoreDisplay();
updateMenuCarLine();
updateMenuSettings();
setupMobile();

// ==================== MAIN LOOP ====================
function gameLoop() {
  if (gameState === 'countdown') {
    countdownTimer++;
    if (countdownTimer >= 60) {
      countdownTimer = 0;
      countdownValue--;
      if (countdownValue < 0) {
        gameState = 'playing';
        roundStartTime = Date.now();
        allCars.forEach(c => c.lastContactFrame = frameCount);
        document.getElementById('countdown-overlay').classList.add('hidden');
      }
    }

    updateMobileSteering(); // calibrates tilt neutral during the countdown
    // Engines idle at the line; holding gas or reverse revs in place
    updateEngineSound(0, controls.gas || controls.reverse);
    updateFieldSound(enemies);

    drawArena();
    disabledCars.forEach(drawCar);
    allCars.forEach(drawCar);
    drawWeather();
    if (player) drawPlayerHighlight(player);
    drawCountdown();
    updateHUD();
    requestAnimationFrame(gameLoop);
    return;
  }

  if (gameState === 'garage') {
    drawGaragePreview();
    requestAnimationFrame(gameLoop);
    return;
  }

  if (gameState !== 'playing') {
    requestAnimationFrame(gameLoop);
    return;
  }

  frameCount++;

  // Update player
  if (!player.disabled) {
    updateMobileSteering();
    updateCarPhysics(player, controls.gas, controls.reverse, controls.left, controls.right, controls.analogSteer);

    // Update engine sound based on player state
    updateEngineSound(player.speed, controls.gas || controls.reverse);

    if (frameCount - player.lastContactFrame > CONTACT_TIMEOUT) {
      player.disabled = true;
      player.disabledReason = 'timeout';
      playerDisqualified = true;
      muteEngine();
    }
  }

  // Update enemies
  enemies.forEach(enemy => {
    if (!enemy.disabled) {
      const ai = updateAI(enemy);
      updateCarPhysics(enemy, ai.gas, ai.reverse, ai.left, ai.right);

      if (frameCount - enemy.lastContactFrame > CONTACT_TIMEOUT) {
        enemy.disabled = true;
        enemy.disabledReason = 'timeout';
        disabledCars.push(enemy);
        score += 100 * level;
        carsWrecked++;
      }
    }
  });

  // OBB Collisions - check all pairs
  const allActive = allCars.filter(c => !c.disabled);
  for (let i = 0; i < allActive.length; i++) {
    for (let j = i + 1; j < allActive.length; j++) {
      // Quick distance check first (broad phase)
      const car1 = allActive[i];
      const car2 = allActive[j];
      const d = dist(car1, car2);
      const maxSize = Math.max(car1.carType.length, car2.carType.length) * CAR_SCALE;

      if (d < maxSize) {
        const collision = checkOBBCollision(car1, car2);
        if (collision) {
          resolveCollision(car1, car2, collision);
        }
      }
    }

    // Collisions with disabled cars
    for (const dc of disabledCars) {
      const car1 = allActive[i];
      const d = dist(car1, dc);
      const maxSize = Math.max(car1.carType.length, dc.carType.length) * CAR_SCALE;

      if (d < maxSize) {
        const collision = checkOBBCollision(car1, dc);
        if (collision) {
          resolveCollision(car1, dc, collision);
        }
      }
    }
  }

  updateFieldSound(enemies);
  updateScrapeSound();

  // Check for newly disabled cars
  enemies.forEach(enemy => {
    if (!enemy.disabled && isDamagedOut(enemy)) {
      enemy.disabled = true;
      enemy.disabledReason = 'damage';
      enemy.speed = 0;
      enemy.vx = 0;
      enemy.vy = 0;
      disabledCars.push(enemy);
      score += 250 * level;
      carsWrecked++;
    }
  });

  if (!player.disabled && isDamagedOut(player)) {
    player.disabled = true;
    player.disabledReason = 'damage';
    player.speed = 0;
    player.vx = 0;
    player.vy = 0;
    muteEngine();
  }

  // Particles
  particles = particles.filter(p => {
    p.x += p.vx;
    p.y += p.vy;
    if (p.type === 'smoke') {
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.size *= 1.012;
    } else if (p.type === 'fire') {
      p.vy -= 0.03;
      p.size *= 0.93;
    } else if (p.type === 'debris') {
      p.vy += 0.15; // Gravity
      p.vx *= 0.98;
      p.vy *= 0.98;
      if (p.rotation !== undefined) p.rotation += p.rotSpeed || 0;
    } else if (p.type === 'paint') {
      p.vy += 0.08; // Light gravity
      p.vx *= 0.96;
      p.vy *= 0.96;
    } else {
      p.vx *= 0.93;
      p.vy *= 0.93;
    }
    p.life--;
    return p.life > 0;
  });

  // Win/lose
  if (gameMode === 'championship') {
    checkChampionshipRound();
  } else {
    const activeEnemies = enemies.filter(e => !e.disabled);

    if (player.disabled) {
      gameState = 'gameover';
      if (score > highScore) {
        highScore = score;
        localStorage.setItem('demolitionDerbyHighScoreV9', highScore);
      }
      updateHighScoreDisplay();
      document.getElementById('hud-panel').classList.remove('active');
      document.getElementById('touch-controls').classList.remove('active');
      document.getElementById('keyboard-hint').classList.remove('active');
      setTimeout(() => showOverlay('gameover'), 800);
    }

    if (activeEnemies.length === 0 && gameState === 'playing' && !player.disabled) {
      gameState = 'levelcomplete';
      muteEngine();
      document.getElementById('hud-panel').classList.remove('active');
      document.getElementById('touch-controls').classList.remove('active');
      document.getElementById('keyboard-hint').classList.remove('active');
      showOverlay('level');
    }
  }

  // Render
  drawArena();
  disabledCars.forEach(drawCar);
  allCars.filter(c => !c.disabled).forEach(drawCar);

  // Health bars above active cars
  allCars.filter(c => !c.disabled).forEach(car => {
    drawHealthBar(car);
  });

  // Update and draw damage popups
  damagePopups = damagePopups.filter(popup => {
    popup.life--;
    popup.y += popup.vy;
    popup.vy *= 0.95; // Slow down float

    if (popup.life <= 0) return false;

    // Draw popup
    const alpha = Math.min(popup.life / 20, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText('-' + popup.damage, popup.x, popup.y);
    ctx.fillStyle = popup.color;
    ctx.fillText('-' + popup.damage, popup.x, popup.y);
    ctx.restore();

    return true;
  });

  // Particles
  particles.forEach(p => {
    ctx.globalAlpha = Math.min(p.life / 12, 1);
    if (p.type === 'smoke') {
      const gray = 190 + Math.floor(Math.random() * 45);
      ctx.fillStyle = `rgba(${gray},${gray},${gray},${p.life / 50})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'fire') {
      const r = 255;
      const g = Math.floor(130 + Math.random() * 70);
      ctx.fillStyle = `rgba(${r},${g},0,${p.life / 15})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.type === 'debris') {
      // Metal debris chunks - irregular shapes
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation || 0);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(-p.size/2, -p.size/3);
      ctx.lineTo(p.size/2, -p.size/2);
      ctx.lineTo(p.size/3, p.size/2);
      ctx.lineTo(-p.size/3, p.size/3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (p.type === 'paint') {
      // Paint chips - small flakes
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.size, p.size * 0.6, Math.random() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Sparks
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  ctx.globalAlpha = 1;

  drawWeather();

  updateHUD();

  requestAnimationFrame(gameLoop);
}

// ==================== CONTROLS ====================
document.addEventListener('keydown', e => {
  switch (e.key.toLowerCase()) {
    case 'a': case 'arrowleft': controls.left = true; break;
    case 'd': case 'arrowright': controls.right = true; break;
    case 'w': case 'arrowup': controls.gas = true; break;
    case 's': case 'arrowdown': controls.reverse = true; break;
    case 'm': if (!e.repeat) toggleMute(); break;
  }
});

document.addEventListener('keyup', e => {
  switch (e.key.toLowerCase()) {
    case 'a': case 'arrowleft': controls.left = false; break;
    case 'd': case 'arrowright': controls.right = false; break;
    case 'w': case 'arrowup': controls.gas = false; break;
    case 's': case 'arrowdown': controls.reverse = false; break;
  }
});

['btn-left', 'btn-right', 'btn-reverse', 'btn-gas'].forEach(id => {
  const btn = document.getElementById(id);
  if (!btn) return;
  const action = id.replace('btn-', '');

  btn.addEventListener('touchstart', e => { e.preventDefault(); controls[action] = true; }, { passive: false });
  btn.addEventListener('touchend', e => { e.preventDefault(); controls[action] = false; }, { passive: false });
  btn.addEventListener('touchcancel', e => { e.preventDefault(); controls[action] = false; }, { passive: false });
  btn.addEventListener('mousedown', () => controls[action] = true);
  btn.addEventListener('mouseup', () => controls[action] = false);
  btn.addEventListener('mouseleave', () => controls[action] = false);
});

document.addEventListener('contextmenu', e => e.preventDefault());

gameLoop();

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
// The game logic always advances at 60 steps per second, whatever the
// screen's refresh rate. (Before v11 it advanced one step per screen
// refresh, so a 120 Hz display ran the whole game at double speed and a
// phone in low-power mode ran it at half speed.)
const STEP_MS = 1000 / 60;
let lastFrameTime = null;
let stepDebt = 0;

// How many logic steps are due this screen refresh
function stepsDue(now) {
  if (lastFrameTime === null) lastFrameTime = now;
  let elapsed = now - lastFrameTime;
  lastFrameTime = now;
  if (elapsed > 250) elapsed = STEP_MS; // tab was hidden or the page hitched: don't fast-forward
  // Snap near-60 Hz and near-30 Hz frames to whole steps so ordinary
  // timing jitter never causes a skipped or doubled step
  if (Math.abs(elapsed - STEP_MS) < 2) elapsed = STEP_MS;
  else if (Math.abs(elapsed - STEP_MS * 2) < 3) elapsed = STEP_MS * 2;
  stepDebt += elapsed;
  const steps = Math.min(4, Math.floor(stepDebt / STEP_MS + 0.001));
  stepDebt = Math.min(stepDebt - steps * STEP_MS, STEP_MS);
  return steps;
}

function gameLoop(now) {
  requestAnimationFrame(gameLoop);
  const steps = stepsDue(now === undefined ? performance.now() : now);

  if (gameState === 'garage') {
    drawGaragePreview();
    return;
  }
  if (steps === 0) return; // faster-than-60 Hz screen: nothing new to show yet

  let ran = null;
  for (let i = 0; i < steps; i++) {
    if (gameState === 'countdown') { updateCountdown(); ran = 'countdown'; }
    else if (gameState === 'playing') { updateGame(); ran = 'playing'; }
    else break;
  }
  if (ran === 'countdown') renderCountdown();
  else if (ran === 'playing') renderGame();
}

function updateCountdown() {
  countdownTimer++;
  if (countdownTimer >= 60) {
    countdownTimer = 0;
    countdownValue--;
    if (countdownValue < 0) {
      gameState = 'playing';
      allCars.forEach(c => c.lastContactFrame = frameCount);
      document.getElementById('countdown-overlay').classList.add('hidden');
    }
  }

  updateMobileSteering(); // calibrates tilt neutral during the countdown
  // Engines idle at the line; holding gas or reverse revs in place
  updateEngineSound(0, controls.gas || controls.reverse);
  updateFieldSound(enemies);
}

function renderCountdown() {
  drawArena();
  disabledCars.forEach(drawCar);
  allCars.forEach(drawCar);
  drawWeather();
  if (player) drawPlayerHighlight(player);
  drawCountdown();
  updateHUD();
}

// One 1/60 s step of the derby: input, AI, physics, collisions, rules.
// No drawing, so it can also be run flat-out for testing.
function updateGame() {
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

  // Damage popups float up and fade
  damagePopups = damagePopups.filter(popup => {
    popup.life--;
    popup.y += popup.vy;
    popup.vy *= 0.95;
    return popup.life > 0;
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

}

function renderGame() {
  drawArena();
  disabledCars.forEach(drawCar);
  allCars.filter(c => !c.disabled).forEach(drawCar);

  // Health bars above active cars
  allCars.filter(c => !c.disabled).forEach(car => {
    drawHealthBar(car);
  });

  damagePopups.forEach(popup => {
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

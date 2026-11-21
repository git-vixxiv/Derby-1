// ==================== GAME STATE ====================
let gameState = 'menu';
let countdownValue = 5;
let countdownTimer = 0;
let level = 1;
let roundStartTime = 0;
let playerDisqualified = false;

let player = null;
let enemies = [];
let allCars = [];
let disabledCars = [];
let particles = [];
let mudTracks = [];
let announcements = []; // Flagman's calls shown at the top of the arena
let usedNumbers = new Set();

const controls = { left: false, right: false, gas: false, reverse: false, analogSteer: null };

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const flagCanvas = document.getElementById('flagCanvas');
const flagCtx = flagCanvas.getContext('2d');

const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

let frameCount = 0;

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

// ==================== PAUSE ====================
function togglePause() {
  if (gameState === 'playing') {
    gameState = 'paused';
    muteEngine();
    showOverlay('pause');
  } else if (gameState === 'paused') {
    gameState = 'playing';
    showOverlay('none');
  }
}

function quitToMenu() {
  document.getElementById('hud-panel').classList.remove('active');
  document.getElementById('touch-controls').classList.remove('active');
  document.getElementById('keyboard-hint').classList.remove('active');
  backToMenu();
}

// Switching tabs or apps pauses the derby instead of leaving it running blind
document.addEventListener('visibilitychange', () => {
  if (document.hidden && gameState === 'playing') togglePause();
});

// ==================== FLAGMAN ====================
// Short calls at the top of the arena: who is out and why, and driver's
// door warnings. With no score or damage numbers, this is how the player
// follows the derby.
function announce(text, color = '#ffffff') {
  announcements.push({ text, color, life: 210 });
  if (announcements.length > 3) announcements.shift();
}

function carLabel(car) {
  return car.isPlayer ? 'You are' : `#${car.carNumber.toString().padStart(2, '0')} is`;
}

// Take a car out of the derby
function retireCar(car, reason) {
  car.disabled = true;
  car.disabledReason = reason;
  if (reason === 'damage') {
    car.speed = 0;
    car.vx = 0;
    car.vy = 0;
  }
  if (car.isPlayer) {
    if (reason !== 'damage') playerDisqualified = true;
    muteEngine();
  } else {
    disabledCars.push(car);
  }
  const why = reason === 'timeout' ? 'flagged out: no hit in 30 seconds'
    : reason === 'door' ? "flagged out: second driver's-door hit"
    : 'out: car is finished';
  announce(`${carLabel(car)} ${why}`, car.isPlayer ? '#ff6b5e' : '#ffd27a');
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

    if (frameCount - player.lastContactFrame > CONTACT_TIMEOUT) retireCar(player, 'timeout');
  }

  // Update enemies
  enemies.forEach(enemy => {
    if (!enemy.disabled) {
      const ai = updateAI(enemy);
      updateCarPhysics(enemy, ai.gas, ai.reverse, ai.left, ai.right);

      if (frameCount - enemy.lastContactFrame > CONTACT_TIMEOUT) retireCar(enemy, 'timeout');
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

  // Cars that are finished, or flagged out for a second driver's-door hit
  allCars.forEach(car => {
    if (car.disabled) return;
    if (car.doorFlags >= DOOR_RULE.HITS_ALLOWED) retireCar(car, 'door');
    else if (isDamagedOut(car)) retireCar(car, 'damage');
  });

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

  announcements = announcements.filter(a => --a.life > 0);

  // Win/lose
  if (gameMode === 'championship') {
    checkChampionshipRound();
  } else {
    const activeEnemies = enemies.filter(e => !e.disabled);

    if (player.disabled) {
      gameState = 'gameover';
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

  // No health bars or damage numbers: a car's state shows in its bodywork,
  // smoke and fire. Just a marker so the player can find their own car.
  if (!player.disabled) drawPlayerMarker(player);

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
  drawAnnouncements();

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
    case 'p': case 'escape': if (!e.repeat) togglePause(); break;
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

// ==================== GAME INIT / LIFECYCLE ====================
// Quick Derby: a fresh field each round, growing with the round number
function initGame(levelNum) {
  usedNumbers.clear();
  const totalCars = Math.min(8 + Math.floor(levelNum * 2), 14);
  const cars = [createCar(0, 0, 0, true)];
  for (let i = 0; i < totalCars; i++) {
    const enemy = createCar(0, 0, 0, false, i, totalCars);
    enemy.ai.aggressiveness = Math.min(0.35 + levelNum * 0.03 + Math.random() * 0.3, 0.85);
    cars.push(enemy);
  }
  placeField(cars);
}

// Put a field of cars (fresh or carrying damage from an earlier round) on
// the start line around the perimeter and reset everything per-round.
// Damage, dents and creases stay with each car.
function placeField(cars) {
  frameCount = 0;
  pickArenaForRound();
  pickWeatherForRound();
  playerDisqualified = false;

  const positions = generateStartPositions(cars.length);
  for (let i = positions.length - 1; i > 0; i--) { // shuffle start spots
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  cars.forEach((car, i) => {
    const pos = positions[i];
    car.x = pos.x;
    car.y = pos.y;
    car.angle = pos.angle;
    car.moveAngle = pos.angle;
    car.speed = 0;
    car.vx = 0;
    car.vy = 0;
    car.angularVel = 0;
    car.lateralVel = 0;
    car.steerAngle = 0;
    car.lastContactFrame = 0;
    car.lastHitFlash = -1000;
    if (car.ai) {
      car.ai.state = 'scanning';
      car.ai.stateTimer = 0;
      car.ai.target = null;
      car.ai.attackCooldown = 0;
      car.ai.stuckTimer = 0;
      car.ai.lastPos = { x: car.x, y: car.y };
    }
  });

  player = cars.find(c => c.isPlayer);
  enemies = cars.filter(c => !c.isPlayer);
  allCars = [player, ...enemies];
  disabledCars = [];
  particles = [];
  mudTracks = [];
  damagePopups = [];
  carsWrecked = 0;

  document.getElementById('player-number').textContent = player.carNumber.toString().padStart(2, '0');
  document.getElementById('player-model').textContent = '(' + player.carType.name + ' ' + player.carType.era + ' — ' + player.carType.trait + ')';
  document.getElementById('disqualified-msg').style.display = 'none';
}

function generateStartPositions(count) {
  return arena.startSlots(count);
}

// Quick Derby (endless rounds, last car standing each round)
function startGame() {
  withPlayerCar(() => {
    initAudio(); // Initialize sound on first user interaction
    gameMode = 'quick';
    level = 1;
    score = 0;
    initGame(1);
    startCountdown();
  });
}

function nextLevel() {
  initAudio(); // Resumes the context if the browser suspended it
  level++;
  initGame(level);
  startCountdown();
}

function startCountdown() {
  countdownValue = 5;
  countdownTimer = 0;
  gameState = 'countdown';
  showOverlay('none');
  document.getElementById('stage-banner').textContent = gameMode === 'championship' ? getStageBanner() : '';
  document.getElementById('hud-panel').classList.add('active');
  document.getElementById('countdown-overlay').classList.remove('hidden');
  if (isTouchDevice) {
    document.getElementById('touch-controls').classList.add('active');
  } else {
    document.getElementById('keyboard-hint').classList.add('active');
  }
}

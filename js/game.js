// ==================== GAME INIT / LIFECYCLE ====================
function initGame(levelNum) {
  usedNumbers.clear();
  frameCount = 0;
  playerDisqualified = false;

  const totalCars = Math.min(8 + Math.floor(levelNum * 2), 14);
  const allPositions = generateStartPositions(totalCars + 1);

  const playerPosIndex = Math.floor(Math.random() * allPositions.length);
  const playerPos = allPositions.splice(playerPosIndex, 1)[0];
  player = createCar(playerPos.x, playerPos.y, playerPos.angle, true);
  player.lastContactFrame = 0;

  enemies = [];
  for (let i = 0; i < allPositions.length; i++) {
    const pos = allPositions[i];
    const enemy = createCar(pos.x, pos.y, pos.angle, false, i, totalCars);
    enemy.ai.aggressiveness = Math.min(0.35 + levelNum * 0.03 + Math.random() * 0.3, 0.85);
    enemy.lastContactFrame = 0;
    enemies.push(enemy);
  }

  allCars = [player, ...enemies];
  disabledCars = [];
  powerUps = [];
  particles = [];
  mudTracks = [];
  damagePopups = [];
  carsWrecked = 0;

  document.getElementById('player-number').textContent = player.carNumber.toString().padStart(2, '0');
  document.getElementById('player-model').textContent = '(' + player.carType.name + ' — ' + player.carType.trait + ')';
  document.getElementById('disqualified-msg').style.display = 'none';
}

function generateStartPositions(count) {
  const positions = [];
  const margin = WALL_THICKNESS + 55 * CAR_SCALE;
  const arenaW = ARENA_WIDTH - margin * 2;
  const arenaH = ARENA_HEIGHT - margin * 2;
  const perimeter = 2 * (arenaW + arenaH);
  const spacing = perimeter / count;

  for (let i = 0; i < count; i++) {
    let d = (i * spacing + spacing / 2) % perimeter;
    let x, y, angle;

    if (d < arenaW) {
      x = margin + d;
      y = margin;
      angle = -Math.PI / 2; // Facing up (toward wall)
    } else if (d < arenaW + arenaH) {
      x = ARENA_WIDTH - margin;
      y = margin + (d - arenaW);
      angle = 0; // Facing right
    } else if (d < 2 * arenaW + arenaH) {
      x = ARENA_WIDTH - margin - (d - arenaW - arenaH);
      y = ARENA_HEIGHT - margin;
      angle = Math.PI / 2; // Facing down
    } else {
      x = margin;
      y = ARENA_HEIGHT - margin - (d - 2 * arenaW - arenaH);
      angle = Math.PI; // Facing left
    }

    x += (Math.random() - 0.5) * 20;
    y += (Math.random() - 0.5) * 20;

    positions.push({ x, y, angle });
  }

  return positions;
}

function startGame() {
  initAudio(); // Initialize sound on first user interaction
  level = 1;
  score = 0;
  initGame(1);
  startCountdown();
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
  document.getElementById('hud-panel').classList.add('active');
  document.getElementById('countdown-overlay').classList.remove('hidden');
  if (isTouchDevice) {
    document.getElementById('touch-controls').classList.add('active');
  } else {
    document.getElementById('keyboard-hint').classList.add('active');
  }
}

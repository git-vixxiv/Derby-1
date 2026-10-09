// ==================== HUD / OVERLAYS ====================
function showOverlay(type) {
  document.querySelectorAll('.overlay').forEach(el => el.classList.add('hidden'));
  document.getElementById('countdown-overlay').classList.add('hidden');

  if (type === 'garage') {
    document.getElementById('garage-overlay').classList.remove('hidden');
  } else if (type === 'champ') {
    document.getElementById('champ-overlay').classList.remove('hidden');
  } else if (type === 'menu') {
    document.getElementById('menu-overlay').classList.remove('hidden');
  } else if (type === 'level') {
    document.getElementById('completed-level').textContent = level;
    document.getElementById('level-score').textContent = score;
    document.getElementById('cars-wrecked').textContent = carsWrecked;
    document.getElementById('round-time').textContent = formatTime(Date.now() - roundStartTime);
    document.getElementById('level-overlay').classList.remove('hidden');
  } else if (type === 'gameover') {
    document.getElementById('final-level').textContent = level;
    document.getElementById('final-score').textContent = score;
    if (playerDisqualified) {
      document.getElementById('disqualified-msg').style.display = 'block';
    }
    document.getElementById('gameover-overlay').classList.remove('hidden');
  }
}

function updateHighScoreDisplay() {
  document.getElementById('menu-high-score').textContent = highScore > 0 ? 'Best: ' + highScore : '';
  document.getElementById('gameover-high-score').textContent = highScore;
}

function updateHUD() {
  document.getElementById('hud-level').textContent = gameMode === 'championship' ? getStageShortName() : level;
  document.getElementById('hud-enemies').textContent = enemies.filter(e => !e.disabled).length;
  document.getElementById('hud-score').textContent = score;

  if (gameState === 'playing') {
    document.getElementById('timer-display').textContent = formatTime(Date.now() - roundStartTime);

    const framesSinceContact = frameCount - player.lastContactFrame;
    const secondsRemaining = Math.ceil((CONTACT_TIMEOUT - framesSinceContact) / 60);

    if (secondsRemaining <= 15 && secondsRemaining > 0 && !player.disabled) {
      document.getElementById('contact-timer').textContent = `HIT someone in ${secondsRemaining}s!`;
      document.getElementById('contact-timer').style.color = secondsRemaining <= 5 ? '#e74c3c' : '#f39c12';
    } else {
      document.getElementById('contact-timer').textContent = '';
    }
  }

  const frontPct = Math.max(0, getFrontHealth(player) * 100);
  const sidePct = Math.max(0, getSideHealth(player) * 100);
  const rearPct = Math.max(0, getRearHealth(player) * 100);

  const getColor = pct => pct > 50 ? '#2ecc71' : pct > 25 ? '#f1c40f' : '#e74c3c';

  document.getElementById('front-damage').style.width = frontPct + '%';
  document.getElementById('front-damage').style.background = getColor(frontPct);
  document.getElementById('side-damage').style.width = sidePct + '%';
  document.getElementById('side-damage').style.background = getColor(sidePct);
  document.getElementById('rear-damage').style.width = rearPct + '%';
  document.getElementById('rear-damage').style.background = getColor(rearPct);
}

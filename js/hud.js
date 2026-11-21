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
  } else if (type === 'pause') {
    document.getElementById('pause-overlay').classList.remove('hidden');
  } else if (type === 'level') {
    document.getElementById('completed-level').textContent = level;
    document.getElementById('round-time').textContent = formatTime(frameCount / 60 * 1000);
    document.getElementById('level-overlay').classList.remove('hidden');
  } else if (type === 'gameover') {
    const out = describePlayerOut();
    document.getElementById('gameover-title').textContent = out.title;
    document.getElementById('gameover-place').textContent =
      `Round ${level}: finished ${ordinal(enemies.filter(e => !e.disabled).length + 1)} of ${allCars.length}`;
    document.getElementById('gameover-time').textContent = 'Lasted ' + formatTime(frameCount / 60 * 1000);
    document.getElementById('disqualified-msg').textContent = out.why;
    document.getElementById('gameover-overlay').classList.remove('hidden');
  }
}

// Why the player's derby ended, for the end screens
function describePlayerOut() {
  switch (player.disabledReason) {
    case 'timeout': return { title: 'FLAGGED OUT', why: 'You didn\'t hit anyone for 30 seconds.' };
    case 'door': return { title: 'FLAGGED OUT', why: 'Second hit on a driver\'s door.' };
    default: return { title: 'TOTALED!', why: 'Your car is finished.' };
  }
}

function updateHUD() {
  document.getElementById('hud-level').textContent = gameMode === 'championship' ? getStageShortName() : level;
  document.getElementById('hud-enemies').textContent = enemies.filter(e => !e.disabled).length;

  if (gameState === 'playing') {
    document.getElementById('timer-display').textContent = formatTime(frameCount / 60 * 1000);

    const framesSinceContact = frameCount - player.lastContactFrame;
    const secondsRemaining = Math.ceil((CONTACT_TIMEOUT - framesSinceContact) / 60);

    // The hit clock: time left to initiate contact with a live car
    const clock = document.getElementById('contact-timer');
    if (secondsRemaining > 0 && !player.disabled) {
      clock.textContent = `HIT someone in ${secondsRemaining}s`;
      clock.style.color = secondsRemaining <= 5 ? '#e74c3c' : secondsRemaining <= 15 ? '#f39c12' : '#888';
    } else {
      clock.textContent = '';
    }
  }

  // Driver's-door warnings
  const flags = document.getElementById('door-flags');
  flags.textContent = player.doorFlags > 0 ? `DOOR-HIT WARNING: next one and you're out` : '';

  // The player's own car: condition of each zone (how it drives) and how
  // much the car has left before it's out. Other cars show their state
  // only by how they look.
  const frontPct = Math.max(0, getFrontHealth(player) * 100);
  const sidePct = Math.max(0, getSideHealth(player) * 100);
  const rearPct = Math.max(0, getRearHealth(player) * 100);
  const lifePct = getCarHealthPct(player) * 100;

  const getColor = pct => pct > 50 ? '#2ecc71' : pct > 25 ? '#f1c40f' : '#e74c3c';

  for (const [id, pct] of [['front-damage', frontPct], ['side-damage', sidePct], ['rear-damage', rearPct], ['life-fill', lifePct]]) {
    const el = document.getElementById(id);
    el.style.width = pct + '%';
    el.style.background = getColor(pct);
  }
}

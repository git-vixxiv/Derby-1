// ==================== CHAMPIONSHIP ====================
// Three-round tournament. Every round is a 12-car field.
//   Heat:       you + 11 fresh cars. When 6 cars are left running, they advance.
//   Semi-final: your heat's 6 survivors, carrying their damage, + 6 cars
//               from a simulated heat, carrying simulated damage.
//   Final:      your semi's 6 survivors + 6 from a simulated semi-final,
//               carrying two rounds of damage. Last car running wins.
// No repairs between rounds: every car starts in the state it finished.
let gameMode = 'quick'; // 'quick' | 'championship'
let champStage = 0;     // 0 heat, 1 semi-final, 2 final

const CHAMP_FIELD_SIZE = 12;
const CHAMP_ADVANCE = 6;      // top 50% of the field (Joe, v10.4; was 25%)
const CHAMP_OTHER_GROUPS = 1; // simulated heats/semis feeding each round, so every round is 12 cars
const CHAMP_STAGES = [
  { name: 'HEAT', short: 'HEAT', banner: `HEAT — last ${CHAMP_ADVANCE} running advance` },
  { name: 'SEMI-FINAL', short: 'SEMI', banner: `SEMI-FINAL — last ${CHAMP_ADVANCE} running advance` },
  { name: 'FINAL', short: 'FINAL', banner: 'FINAL — last car running wins' }
];

function startChampionship() {
  prepareMobileForRace();
  withPlayerCar(() => {
    initAudio();
    gameMode = 'championship';
    champStage = 0;
    level = 1;
    score = 0;
    usedNumbers.clear();
    const cars = [createCar(0, 0, 0, true)];
    for (let i = 1; i < CHAMP_FIELD_SIZE; i++) cars.push(createChampCar(i));
    placeField(cars);
    startCountdown();
  });
}

function createChampCar(i) {
  const car = createCar(0, 0, 0, false, i, CHAMP_FIELD_SIZE);
  car.ai.aggressiveness = Math.min(0.4 + champStage * 0.08 + Math.random() * 0.3, 0.9);
  return car;
}

function getStageBanner() {
  return CHAMP_STAGES[champStage].banner;
}

function getStageShortName() {
  return CHAMP_STAGES[champStage].short;
}

// Called every frame while a championship round is being played
function checkChampionshipRound() {
  const running = allCars.filter(c => !c.disabled);

  if (player.disabled) {
    endRoundUI('champover');
    const place = running.length + 1;
    const stage = CHAMP_STAGES[champStage].name;
    const why = playerDisqualified ? 'Disqualified for no contact in 45 seconds.' : 'Your car is finished.';
    setTimeout(() => showChampOverlay(
      'ELIMINATED',
      '#e74c3c',
      `Out in the ${stage.toLowerCase()}, ${ordinal(place)} of ${CHAMP_FIELD_SIZE}.<br>${why}`,
      [['NEW CHAMPIONSHIP', 'startChampionship()', ''], ['MENU', 'backToMenu()', 'btn-grey']]
    ), 800);
    return;
  }

  if (champStage < 2 && running.length <= CHAMP_ADVANCE) {
    endRoundUI('champbreak');
    const next = CHAMP_STAGES[champStage + 1].name;
    showChampOverlay(
      'YOU ADVANCE!',
      '#2ecc71',
      `${CHAMP_STAGES[champStage].name} complete: ${running.length} of ${CHAMP_FIELD_SIZE} still running.<br>` +
      `On to the ${next.toLowerCase()} against ${CHAMP_OTHER_GROUPS * CHAMP_ADVANCE} cars from ${CHAMP_OTHER_GROUPS === 1 ? 'another' : CHAMP_OTHER_GROUPS + ' other'} ${champStage === 0 ? 'heat' : 'semi-final'}${CHAMP_OTHER_GROUPS === 1 ? '' : 's'}.<br>` +
      `<span style="color:#f39c12">No repairs: your car starts the ${next.toLowerCase()} exactly as it is.</span>`,
      [[`START ${next}`, 'nextChampionshipRound()', 'btn-green']]
    );
    return;
  }

  if (champStage === 2 && running.length === 1) {
    endRoundUI('champion');
    showChampOverlay(
      'CHAMPION!',
      '#f5a623',
      `Last car running out of ${CHAMP_FIELD_SIZE * (CHAMP_OTHER_GROUPS + 1) ** 2} entries.<br>Score: ${score}`,
      [['NEW CHAMPIONSHIP', 'startChampionship()', 'btn-green'], ['MENU', 'backToMenu()', 'btn-grey']]
    );
  }
}

function nextChampionshipRound() {
  initAudio();
  const survivors = allCars.filter(c => !c.disabled);
  champStage++;
  level = champStage + 1;
  const cars = [...survivors];
  // Cars from the other heats/semis, each having survived champStage rounds
  for (let g = 0; g < CHAMP_OTHER_GROUPS; g++) {
    for (let k = 0; k < CHAMP_ADVANCE; k++) {
      const car = createChampCar(cars.length);
      simulateRoundDamage(car, champStage);
      cars.push(car);
    }
  }
  placeField(cars);
  startCountdown();
}

// Give a car the damage it would plausibly carry out of `rounds` rounds it
// survived elsewhere: a run of hits weighted toward the rear (AI cars
// favor ramming in reverse), stopping well short of being knocked out.
function simulateRoundDamage(car, rounds) {
  const targetLife = Math.min(0.8, rounds * (0.18 + Math.random() * 0.22));
  const zones = ['rear', 'rear', 'rear', 'side', 'side', 'front'];
  const L = car.carType.length, W = car.carType.width;
  let guard = 0;
  while (getLifeUsed(car) < targetLife && guard++ < 60) {
    const zone = zones[Math.floor(Math.random() * zones.length)];
    const dmg = 40 + Math.random() * 110;
    let lx, ly;
    if (zone === 'front') { lx = L / 2; ly = (Math.random() - 0.5) * W * 0.9; }
    else if (zone === 'rear') { lx = -L / 2; ly = (Math.random() - 0.5) * W * 0.9; }
    else { lx = (Math.random() - 0.5) * L * 0.6; ly = (Math.random() < 0.5 ? -1 : 1) * W / 2; }
    car[zone + 'Damage'] += dmg;
    // createCar put the car at (0, 0) facing angle 0, so local == world
    addDeformation(car, { x: car.x + lx, y: car.y + ly }, zone, dmg);
    car.impactMarks.push({ x: lx * 0.9, y: ly * 0.9, zone, severity: Math.min(dmg / 50, 1), angle: Math.random() * Math.PI, type: Math.random() > 0.5 ? 'scratch' : 'dent' });
    if (car.impactMarks.length > 15) car.impactMarks.shift();
  }
}

function endRoundUI(state) {
  gameState = state;
  muteEngine();
  if (score > highScore) {
    highScore = score;
    try { localStorage.setItem('demolitionDerbyHighScoreV9', highScore); } catch (e) {}
    updateHighScoreDisplay();
  }
  document.getElementById('hud-panel').classList.remove('active');
  document.getElementById('touch-controls').classList.remove('active');
  document.getElementById('keyboard-hint').classList.remove('active');
}

function showChampOverlay(title, color, bodyHtml, buttons) {
  showOverlay('champ');
  const t = document.getElementById('champ-title');
  t.textContent = title;
  t.style.color = color;
  document.getElementById('champ-stage').textContent = 'CHAMPIONSHIP';
  document.getElementById('champ-body').innerHTML = bodyHtml;
  document.getElementById('champ-buttons').innerHTML = buttons
    .map(([label, action, cls]) => `<button class="btn ${cls}" onclick="${action}">${label}</button>`)
    .join('');
}

function backToMenu() {
  gameState = 'menu';
  updateMenuCarLine();
  showOverlay('menu');
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

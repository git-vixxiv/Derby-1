// ==================== GARAGE (the player's own car) ====================
// The player picks a model, paint, number color and number. The choice is
// saved in localStorage and used for every derby until they change it.
const GARAGE_STORAGE_KEY = 'demolitionDerbyCarV1';

// Paint: period factory colors plus the loud hand-painted colors derby
// cars actually run in
const PAINT_COLORS = [
  { name: 'Black',       h: 0,   s: 0,  l: 12 },
  { name: 'White',       h: 0,   s: 0,  l: 90 },
  { name: 'Silver',      h: 210, s: 6,  l: 62 },
  { name: 'Gunmetal',    h: 215, s: 10, l: 32 },
  { name: 'Navy',        h: 220, s: 55, l: 24 },
  { name: 'Royal Blue',  h: 215, s: 70, l: 42 },
  { name: 'Sky Blue',    h: 200, s: 60, l: 62 },
  { name: 'Red',         h: 0,   s: 72, l: 44 },
  { name: 'Maroon',      h: 350, s: 55, l: 26 },
  { name: 'Forest Green',h: 140, s: 45, l: 26 },
  { name: 'Lime',        h: 95,  s: 70, l: 48 },
  { name: 'Orange',      h: 25,  s: 85, l: 50 },
  { name: 'School Bus Yellow', h: 45, s: 95, l: 52 },
  { name: 'Purple',      h: 275, s: 50, l: 36 },
  { name: 'Hot Pink',    h: 325, s: 75, l: 58 },
  { name: 'Tan',         h: 35,  s: 30, l: 58 }
];

const NUMBER_COLORS = [
  { name: 'White',  css: '#ffffff' },
  { name: 'Black',  css: '#111111' },
  { name: 'Yellow', css: '#ffd400' },
  { name: 'Orange', css: '#ff7a00' },
  { name: 'Red',    css: '#e8231a' },
  { name: 'Green',  css: '#3ddc4a' },
  { name: 'Blue',   css: '#2f7bff' },
  { name: 'Pink',   css: '#ff5fb4' }
];

const DEFAULT_PLAYER_CAR = { model: 0, paint: 5, numberColor: 0, number: 7 };

function loadPlayerCar() {
  try {
    const saved = JSON.parse(localStorage.getItem(GARAGE_STORAGE_KEY));
    if (saved &&
        saved.model >= 0 && saved.model < CAR_TYPES.length &&
        saved.paint >= 0 && saved.paint < PAINT_COLORS.length &&
        saved.numberColor >= 0 && saved.numberColor < NUMBER_COLORS.length &&
        saved.number >= 0 && saved.number <= 99) {
      return { choice: saved, saved: true };
    }
  } catch (e) {}
  return { choice: { ...DEFAULT_PLAYER_CAR }, saved: false };
}

const loadedCar = loadPlayerCar();
let playerCar = loadedCar.choice;
let playerCarSaved = loadedCar.saved;

let garageDraft = null;
let garageOnDone = null;
let garagePreviewCar = null;

function savePlayerCar() {
  try { localStorage.setItem(GARAGE_STORAGE_KEY, JSON.stringify(playerCar)); } catch (e) {}
  playerCarSaved = true;
}

function getPlayerPaint() { return { ...PAINT_COLORS[playerCar.paint] }; }
function getPlayerNumberColor() { return NUMBER_COLORS[playerCar.numberColor].css; }

// Runs `then` right away if the player already has a car, otherwise sends
// them through the garage first (first visit).
function withPlayerCar(then) {
  if (playerCarSaved) then();
  else openGarage(then);
}

function openGarage(onDone) {
  garageDraft = { ...playerCar };
  garageOnDone = onDone || null;
  gameState = 'garage';
  showOverlay('garage');
  buildGarageSwatches();
  refreshGarage();
}

function garageChangeModel(dir) {
  garageDraft.model = (garageDraft.model + dir + CAR_TYPES.length) % CAR_TYPES.length;
  refreshGarage();
}

function garageSetPaint(i) { garageDraft.paint = i; refreshGarage(); }
function garageSetNumberColor(i) { garageDraft.numberColor = i; refreshGarage(); }

function garageChangeNumber(delta) {
  garageDraft.number = (garageDraft.number + delta + 100) % 100;
  refreshGarage();
}

function garageDone() {
  playerCar = { ...garageDraft };
  savePlayerCar();
  garagePreviewCar = null;
  updateMenuCarLine();
  const next = garageOnDone;
  garageOnDone = null;
  if (next) {
    next();
  } else {
    gameState = 'menu';
    showOverlay('menu');
  }
}

function buildGarageSwatches() {
  const paintEl = document.getElementById('garage-paint');
  if (!paintEl.children.length) {
    PAINT_COLORS.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.title = c.name;
      b.style.background = hsl(c);
      b.onclick = () => garageSetPaint(i);
      paintEl.appendChild(b);
    });
  }
  const numEl = document.getElementById('garage-numcolor');
  if (!numEl.children.length) {
    NUMBER_COLORS.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.title = c.name;
      b.style.background = c.css;
      b.onclick = () => garageSetNumberColor(i);
      numEl.appendChild(b);
    });
  }
}

function refreshGarage() {
  const type = CAR_TYPES[garageDraft.model];
  document.getElementById('garage-model').textContent = type.name;
  document.getElementById('garage-era').textContent = type.era;
  document.getElementById('garage-trait').textContent = type.trait;
  document.getElementById('garage-number').textContent = garageDraft.number.toString().padStart(2, '0');
  document.getElementById('garage-paint-name').textContent = PAINT_COLORS[garageDraft.paint].name;
  document.getElementById('garage-numcolor-name').textContent = NUMBER_COLORS[garageDraft.numberColor].name;
  [...document.getElementById('garage-paint').children].forEach((b, i) => b.classList.toggle('selected', i === garageDraft.paint));
  [...document.getElementById('garage-numcolor').children].forEach((b, i) => b.classList.toggle('selected', i === garageDraft.numberColor));
  garagePreviewCar = null; // rebuilt on next draw
}

// Big preview of the car being built, drawn on the arena canvas behind the
// garage panel
function drawGaragePreview() {
  drawArena();
  if (!garageDraft) return;
  if (!garagePreviewCar) {
    const base = CAR_TYPES[garageDraft.model];
    const c = createCar(0, 0, -Math.PI / 2, false, 0, 1);
    c.carType = {
      ...base,
      length: base.length * CAR_SCALE,
      width: base.width * CAR_SCALE,
      hoodLength: base.hoodLength * CAR_SCALE,
      trunkLength: base.trunkLength * CAR_SCALE,
      cabinLength: base.cabinLength * CAR_SCALE
    };
    c.color = { ...PAINT_COLORS[garageDraft.paint] };
    c.numberColor = NUMBER_COLORS[garageDraft.numberColor].css;
    c.carNumber = garageDraft.number;
    c.lastHitFlash = -1000;
    garagePreviewCar = c;
  }
  ctx.save();
  ctx.translate(ARENA_WIDTH / 2, 215);
  ctx.scale(3, 3);
  drawCar(garagePreviewCar);
  ctx.restore();
}

function updateMenuCarLine() {
  const el = document.getElementById('menu-car-line');
  if (!el) return;
  if (!playerCarSaved) { el.textContent = ''; return; }
  const t = CAR_TYPES[playerCar.model];
  el.textContent = `Your car: #${playerCar.number.toString().padStart(2, '0')} ${PAINT_COLORS[playerCar.paint].name} ${t.name} ${t.era}`;
}

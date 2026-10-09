// ==================== WEATHER ====================
// Kept mild on purpose (Joe: dabble, but keep it mild while tuning goes
// on). Weather is the same for every car in the event, so it never hands
// anyone an advantage. Light rain trims grip by 8%.
const WEATHER_STORAGE_KEY = 'demolitionDerbyWeatherV1';

const WEATHER_TYPES = [
  { id: 'clear',    name: 'Clear',      grip: 1.0,  tint: 0,    drops: 0 },
  { id: 'overcast', name: 'Overcast',   grip: 1.0,  tint: 0.14, drops: 0 },
  { id: 'drizzle',  name: 'Light rain', grip: 0.92, tint: 0.2,  drops: 70 }
];

let weatherChoice = 'clear'; // a weather id, or 'random'
try {
  const saved = localStorage.getItem(WEATHER_STORAGE_KEY);
  if (saved && (saved === 'random' || WEATHER_TYPES.some(w => w.id === saved))) weatherChoice = saved;
} catch (e) {}
let weather = WEATHER_TYPES[0];
let rainDrops = [];

function pickWeatherForRound() {
  weather = weatherChoice === 'random'
    ? WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)]
    : WEATHER_TYPES.find(w => w.id === weatherChoice);
  rainDrops = [];
  for (let i = 0; i < weather.drops; i++) {
    rainDrops.push({ x: Math.random() * ARENA_WIDTH, y: Math.random() * ARENA_HEIGHT, v: 9 + Math.random() * 5 });
  }
}

function cycleWeatherChoice(dir) {
  const options = [...WEATHER_TYPES.map(w => w.id), 'random'];
  const i = options.indexOf(weatherChoice);
  weatherChoice = options[(i + dir + options.length) % options.length];
  try { localStorage.setItem(WEATHER_STORAGE_KEY, weatherChoice); } catch (e) {}
  updateMenuSettings();
}

function weatherChoiceLabel() {
  return weatherChoice === 'random' ? 'Random each round' : WEATHER_TYPES.find(w => w.id === weatherChoice).name;
}

// Drawn over the arena and cars: a gray cast and falling rain streaks
function drawWeather() {
  if (weather.tint > 0) {
    ctx.fillStyle = `rgba(30, 38, 52, ${weather.tint})`;
    ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
  }
  if (rainDrops.length) {
    ctx.strokeStyle = 'rgba(200, 215, 235, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of rainDrops) {
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 2.5, d.y + 12);
      d.y += d.v;
      d.x -= d.v * 0.2;
      if (d.y > ARENA_HEIGHT) { d.y = -12; d.x = Math.random() * (ARENA_WIDTH + 60); }
    }
    ctx.stroke();
  }
}

// Menu lines for the arena and weather pickers
function updateMenuSettings() {
  const a = document.getElementById('menu-arena');
  const w = document.getElementById('menu-weather');
  if (a) a.textContent = arenaChoiceLabel();
  if (w) w.textContent = weatherChoiceLabel();
}

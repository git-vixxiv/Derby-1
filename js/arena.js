// ==================== ARENAS ====================
// An arena is an outer wall polygon (cars stay inside), optional round
// obstacles (infield islands, posts at inside corners; cars stay outside),
// start slots, and its own look. Physics, AI and drawing all go through
// the current `arena`, so adding a layout is just adding a definition.
const ARENA_STORAGE_KEY = 'demolitionDerbyArenaV1';

function makeArena(def) {
  const pts = def.outer;
  // Polygon orientation decides which side of each edge is inside
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    area += a.x * b.y - b.x * a.y;
  }
  const sign = area > 0 ? 1 : -1;
  def.segments = pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const tx = (b.x - a.x) / len, ty = (b.y - a.y) / len;
    return { a, b, len, tx, ty, nx: -ty * sign, ny: tx * sign }; // n points into the arena
  });
  def.obstacles = def.obstacles || [];
  return def;
}

// ---- Layouts ----
const ARENA_CX = ARENA_WIDTH / 2, ARENA_CY = ARENA_HEIGHT / 2;

function ellipsePoints(cx, cy, rx, ry, n) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

// Figure 8: two overlapping circles; the outer wall is their union, with
// a grass infield island in the middle of each loop. The loops cross at
// the waist in the middle of the arena.
const F8 = { c1: { x: ARENA_CX, y: 255 }, c2: { x: ARENA_CX, y: 625 }, R: 225, island: 85 };
function figure8Outline() {
  const pts = [];
  const n = 96;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const p1 = { x: F8.c1.x + Math.cos(a) * F8.R, y: F8.c1.y + Math.sin(a) * F8.R };
    const p2 = { x: F8.c2.x + Math.cos(a) * F8.R, y: F8.c2.y + Math.sin(a) * F8.R };
    if (p1.y < ARENA_CY) pts.push(p1);
    if (p2.y > ARENA_CY) pts.push(p2);
  }
  const halfWaist = Math.sqrt(F8.R ** 2 - (ARENA_CY - F8.c1.y) ** 2);
  pts.push({ x: ARENA_CX - halfWaist, y: ARENA_CY }, { x: ARENA_CX + halfWaist, y: ARENA_CY });
  // The union of two disks that both contain the center is star-shaped
  // about it, so sorting by angle gives the outline in order
  pts.sort((p, q) => Math.atan2(p.y - ARENA_CY, p.x - ARENA_CX) - Math.atan2(q.y - ARENA_CY, q.x - ARENA_CX));
  return { pts, halfWaist };
}
const F8_OUTLINE = figure8Outline();

const ARENAS = [
  makeArena({
    id: 'fairgrounds',
    name: 'County Fairgrounds',
    style: 'pit',
    outer: [
      { x: WALL_THICKNESS, y: WALL_THICKNESS },
      { x: ARENA_WIDTH - WALL_THICKNESS, y: WALL_THICKNESS },
      { x: ARENA_WIDTH - WALL_THICKNESS, y: ARENA_HEIGHT - WALL_THICKNESS },
      { x: WALL_THICKNESS, y: ARENA_HEIGHT - WALL_THICKNESS }
    ],
    startSlots(count) {
      // Around the perimeter, facing the wall (authentic derby start)
      const positions = [];
      const margin = WALL_THICKNESS + 55 * CAR_SCALE;
      const arenaW = ARENA_WIDTH - margin * 2;
      const arenaH = ARENA_HEIGHT - margin * 2;
      const perimeter = 2 * (arenaW + arenaH);
      const spacing = perimeter / count;
      for (let i = 0; i < count; i++) {
        const d = (i * spacing + spacing / 2) % perimeter;
        let x, y, angle;
        if (d < arenaW) { x = margin + d; y = margin; angle = -Math.PI / 2; }
        else if (d < arenaW + arenaH) { x = ARENA_WIDTH - margin; y = margin + (d - arenaW); angle = 0; }
        else if (d < 2 * arenaW + arenaH) { x = ARENA_WIDTH - margin - (d - arenaW - arenaH); y = ARENA_HEIGHT - margin; angle = Math.PI / 2; }
        else { x = margin; y = ARENA_HEIGHT - margin - (d - 2 * arenaW - arenaH); angle = Math.PI; }
        positions.push({ x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 20, angle });
      }
      return positions;
    }
  }),
  makeArena({
    id: 'oval',
    name: 'Speedway Oval',
    style: 'oval',
    outer: ellipsePoints(ARENA_CX, ARENA_CY, 350, 395, 80),
    startSlots(count) {
      // Ring just inside the wall, facing out
      const positions = [];
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + 0.2;
        const x = ARENA_CX + Math.cos(a) * (350 - 80);
        const y = ARENA_CY + Math.sin(a) * (395 - 80);
        // Outward normal of the ellipse at this point
        const angle = Math.atan2(Math.sin(a) / 395, Math.cos(a) / 350);
        positions.push({ x, y, angle });
      }
      return positions;
    }
  }),
  makeArena({
    id: 'figure8',
    name: 'Figure 8',
    style: 'figure8',
    outer: F8_OUTLINE.pts,
    obstacles: [
      { x: F8.c1.x, y: F8.c1.y, r: F8.island, island: true },
      { x: F8.c2.x, y: F8.c2.y, r: F8.island, island: true },
      // Inside corners where the loops meet
      { x: ARENA_CX - F8_OUTLINE.halfWaist, y: ARENA_CY, r: 6 },
      { x: ARENA_CX + F8_OUTLINE.halfWaist, y: ARENA_CY, r: 6 }
    ],
    startSlots(count) {
      // Lined up around both loops, pointed along the track: the top loop
      // runs one way and the bottom the other, so they meet at the cross
      const positions = [];
      const mid = (F8.R + F8.island) / 2;
      const top = Math.ceil(count / 2), bottom = count - top;
      const place = (c, n, waistAngle, dir) => {
        for (let i = 0; i < n; i++) {
          // Leave the crossover clear: spread over 280° away from the waist
          const a = waistAngle + (40 + (i + 0.5) * (280 / n)) * Math.PI / 180;
          positions.push({ x: c.x + Math.cos(a) * mid, y: c.y + Math.sin(a) * mid, angle: a + dir * Math.PI / 2 });
        }
      };
      place(F8.c1, top, Math.PI / 2, 1);
      place(F8.c2, bottom, -Math.PI / 2, -1);
      return positions;
    }
  })
];

let arenaChoice = 'fairgrounds'; // an arena id, or 'random'
try {
  const saved = localStorage.getItem(ARENA_STORAGE_KEY);
  if (saved && (saved === 'random' || ARENAS.some(a => a.id === saved))) arenaChoice = saved;
} catch (e) {}
let arena = ARENAS[0];

// Pick the arena for the next round (random choice re-rolls every round)
function pickArenaForRound() {
  arena = arenaChoice === 'random'
    ? ARENAS[Math.floor(Math.random() * ARENAS.length)]
    : ARENAS.find(a => a.id === arenaChoice);
}

function cycleArenaChoice(dir) {
  const options = [...ARENAS.map(a => a.id), 'random'];
  const i = options.indexOf(arenaChoice);
  arenaChoice = options[(i + dir + options.length) % options.length];
  try { localStorage.setItem(ARENA_STORAGE_KEY, arenaChoice); } catch (e) {}
  if (arenaChoice !== 'random') arena = ARENAS.find(a => a.id === arenaChoice);
  updateMenuSettings();
}

function arenaChoiceLabel() {
  return arenaChoice === 'random' ? 'Random each round' : ARENAS.find(a => a.id === arenaChoice).name;
}

// ---- Geometry queries ----

// Signed clearance from a point to the nearest wall or obstacle
// (positive = open track, negative = inside a wall). Used by the AI.
function arenaClearance(x, y) {
  let best = Infinity;
  let inside = false;
  const pts = arena.outer;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  for (const s of arena.segments) {
    const t = clamp((x - s.a.x) * s.tx + (y - s.a.y) * s.ty, 0, s.len);
    best = Math.min(best, Math.hypot(x - (s.a.x + s.tx * t), y - (s.a.y + s.ty * t)));
  }
  best = inside ? best : -best;
  for (const o of arena.obstacles) best = Math.min(best, Math.hypot(x - o.x, y - o.y) - o.r);
  return best;
}

// Keep a car inside the arena. Returns the hardest impact speed into a
// wall this frame (for the crash sound), 0 if none.
function collideCarWithArena(car, velX, velY) {
  let hardest = 0;

  for (const s of arena.segments) {
    // Quick reject: car center far from this edge
    const along = (car.x - s.a.x) * s.tx + (car.y - s.a.y) * s.ty;
    if (along < -60 || along > s.len + 60) continue;
    if ((car.x - s.a.x) * s.nx + (car.y - s.a.y) * s.ny > 60) continue;

    let pen = 0;
    for (const c of getCarCorners(car)) {
      const t = (c.x - s.a.x) * s.tx + (c.y - s.a.y) * s.ty;
      if (t < -1 || t > s.len + 1) continue;
      const d = (c.x - s.a.x) * s.nx + (c.y - s.a.y) * s.ny;
      if (d < -pen) pen = -d;
    }
    if (pen > 0) {
      hardest = Math.max(hardest, hitWall(car, { x: -s.nx, y: -s.ny }, pen, velX, velY));
      velX = car.vx; velY = car.vy; // later edges this frame see the bounced velocity
    }
  }

  for (const o of arena.obstacles) {
    // Closest point on the car's box to the obstacle center
    const local = vecRotate(vec(o.x - car.x, o.y - car.y), -car.angle);
    const dim = getCarDimensions(car);
    const cx = clamp(local.x, -dim.length / 2, dim.length / 2);
    const cy = clamp(local.y, -dim.width / 2, dim.width / 2);
    const dx = local.x - cx, dy = local.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist >= o.r) continue;
    // Direction from the car toward the obstacle, in world space
    let n = dist > 0.001 ? vecRotate(vec(dx / dist, dy / dist), car.angle) : vecRotate(vec(Math.sign(local.x) || 1, 0), car.angle);
    hardest = Math.max(hardest, hitWall(car, n, o.r - dist, velX, velY));
    velX = car.vx; velY = car.vy;
  }

  return hardest;
}

// Push the car out of a wall along `intoWall` (unit vector pointing from
// the car into the wall), damage the zone that hit, and bounce.
function hitWall(car, intoWall, depth, velX, velY) {
  car.x -= intoWall.x * depth;
  car.y -= intoWall.y * depth;

  const impact = applyWallDamage(car, intoWall, velX, velY);

  // Driving into the wall stops the car; knockback bounces off it
  const ma = car.moveAngle ?? car.angle;
  const driveInto = Math.cos(ma) * car.speed * intoWall.x + Math.sin(ma) * car.speed * intoWall.y;
  if (driveInto > 0) car.speed *= 0.1;
  const kn = car.vx * intoWall.x + car.vy * intoWall.y;
  if (kn > 0) {
    car.vx -= intoWall.x * kn * 1.3;
    car.vy -= intoWall.y * kn * 1.3;
  }
  return impact;
}

// ---- Drawing ----
function traceArenaOuter() {
  const pts = arena.outer;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

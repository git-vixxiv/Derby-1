// ==================== VECTOR MATH ====================
function vec(x, y) { return { x, y }; }
function vecAdd(a, b) { return vec(a.x + b.x, a.y + b.y); }
function vecSub(a, b) { return vec(a.x - b.x, a.y - b.y); }
function vecMul(v, s) { return vec(v.x * s, v.y * s); }
function vecDot(a, b) { return a.x * b.x + a.y * b.y; }
function vecCross(a, b) { return a.x * b.y - a.y * b.x; }
function vecLen(v) { return Math.sqrt(v.x * v.x + v.y * v.y); }
function vecNorm(v) { const l = vecLen(v); return l > 0.0001 ? vec(v.x / l, v.y / l) : vec(0, 0); }
function vecPerp(v) { return vec(-v.y, v.x); }
function vecRotate(v, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return vec(v.x * c - v.y * s, v.x * s + v.y * c);
}

// ==================== UTILITIES ====================
function getUniqueNumber() {
  let num;
  do { num = Math.floor(Math.random() * 100); } while (usedNumbers.has(num));
  usedNumbers.add(num);
  return num;
}

// Reserve a specific number (the player's) so no AI car gets it
function claimNumber(num) {
  usedNumbers.add(num);
  return num;
}

function hsl(c, lAdj = 0) {
  return `hsl(${c.h}, ${c.s}%, ${Math.max(0, Math.min(100, c.l + lAdj))}%)`;
}

function dist(a, b) { return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2); }
function normAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function formatTime(ms) { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; }

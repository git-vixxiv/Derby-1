// ==================== MOBILE: TILT + TOUCH STEERING ====================
// Two ways to steer on a phone, both analog (how far you turn = how far
// the wheels turn):
//   Tilt  — hold the phone like a steering wheel and rotate it. Reads the
//           gravity direction in the plane of the screen, so it works in
//           landscape or portrait and with the phone tipped back. Neutral
//           is whatever angle you're holding at the green flag.
//   Touch — drag left/right on the steering pad.
// iPhone Safari only shares motion data after a tap + permission prompt;
// Android Chrome shares it without asking (both need HTTPS).
const STEERING_STORAGE_KEY = 'demolitionDerbySteeringV1';
const TILT_FULL_LOCK_DEG = 30; // rotate this far for full lock
const TILT_DEADZONE_DEG = 2;
const TOUCH_PAD_FULL_LOCK_PX = 70;

const tiltSupported = typeof DeviceMotionEvent !== 'undefined';
let steeringMode = 'tilt';
try {
  const saved = localStorage.getItem(STEERING_STORAGE_KEY);
  if (saved === 'tilt' || saved === 'touch') steeringMode = saved;
} catch (e) {}
if (!tiltSupported) steeringMode = 'touch';

let tiltPermission = 'unknown'; // 'unknown' | 'granted' | 'denied'
let tiltGravity = null;         // latest gravity reading in the screen plane {x, y}
let tiltNeutral = null;         // unit vector of "straight ahead" gravity
let tiltSmoothed = 0;
let touchPadSteer = 0;

// ---- Tilt ----
function onDeviceMotion(e) {
  const g = e.accelerationIncludingGravity;
  if (!g || g.x === null) return;
  const first = tiltGravity === null;
  tiltGravity = { x: g.x, y: g.y };
  if (tiltPermission !== 'granted') tiltPermission = 'granted'; // events arriving = allowed
  if (first) applySteeringModeClass();
}

// Must run inside a tap handler (iPhone requires a user gesture)
function requestTiltPermission() {
  if (!tiltSupported) return Promise.resolve(false);
  window.removeEventListener('devicemotion', onDeviceMotion);
  window.addEventListener('devicemotion', onDeviceMotion);
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    return DeviceMotionEvent.requestPermission()
      .then(state => {
        tiltPermission = state === 'granted' ? 'granted' : 'denied';
        return tiltPermission === 'granted';
      })
      .catch(() => { tiltPermission = 'denied'; return false; });
  }
  tiltPermission = 'granted';
  return Promise.resolve(true);
}

// Angle (degrees) the phone is rotated from neutral, clockwise = positive.
// Gravity and neutral are compared as directions in the screen plane, so
// the result doesn't depend on screen orientation, and iPhone's reversed
// sign convention cancels out (both vectors flip together).
function readTiltDegrees() {
  if (!tiltGravity) return null;
  const mag = Math.hypot(tiltGravity.x, tiltGravity.y);
  if (mag < 2.5) return null; // phone lying flat: no usable wheel angle
  const g = { x: tiltGravity.x / mag, y: tiltGravity.y / mag };
  if (!tiltNeutral) tiltNeutral = g;
  const cross = tiltNeutral.x * g.y - tiltNeutral.y * g.x;
  const dot = tiltNeutral.x * g.x + tiltNeutral.y * g.y;
  return Math.atan2(cross, dot) * 180 / Math.PI;
}

function calibrateTilt() {
  if (!tiltGravity) return;
  const mag = Math.hypot(tiltGravity.x, tiltGravity.y);
  if (mag >= 2.5) tiltNeutral = { x: tiltGravity.x / mag, y: tiltGravity.y / mag };
}

// ---- Touch pad ----
function setupTouchPad() {
  const pad = document.getElementById('steer-pad');
  if (!pad) return;
  let startX = null, id = null;
  const knob = document.getElementById('steer-knob');
  const show = () => { knob.style.transform = `translateX(${touchPadSteer * 45}px)`; };
  pad.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    id = t.identifier; startX = t.clientX;
  }, { passive: false });
  pad.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === id) touchPadSteer = clamp((t.clientX - startX) / TOUCH_PAD_FULL_LOCK_PX, -1, 1);
    }
    show();
  }, { passive: false });
  const end = e => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === id) { id = null; touchPadSteer = 0; }
    show();
  };
  pad.addEventListener('touchend', end, { passive: false });
  pad.addEventListener('touchcancel', end, { passive: false });
}

// ---- Per frame ----
// Called every frame during the countdown and while playing. Writes
// controls.analogSteer (null when no analog input is active).
function updateMobileSteering() {
  if (!isTouchDevice) { controls.analogSteer = null; return; }

  if (tiltIsLive()) {
    // Whatever angle the player holds during the countdown is "straight"
    if (gameState === 'countdown') calibrateTilt();
    const deg = readTiltDegrees();
    if (deg !== null) {
      const live = Math.sign(deg) * Math.max(0, Math.abs(deg) - TILT_DEADZONE_DEG);
      const target = clamp(live / (TILT_FULL_LOCK_DEG - TILT_DEADZONE_DEG), -1, 1);
      tiltSmoothed += (target - tiltSmoothed) * 0.35; // take the jitter out of the sensor
    }
    controls.analogSteer = tiltSmoothed;
    const needle = document.getElementById('tilt-needle');
    if (needle) needle.style.transform = `rotate(${tiltSmoothed * TILT_FULL_LOCK_DEG}deg)`;
  } else {
    controls.analogSteer = touchPadSteer;
  }
}

// ---- Setup / settings ----
// Tilt takes over only once the sensor is actually sending data; until
// then (or on a device with no motion sensor) the touch pad is shown
function tiltIsLive() {
  return steeringMode === 'tilt' && tiltPermission === 'granted' && tiltGravity !== null;
}

function applySteeringModeClass() {
  const tiltActive = tiltIsLive();
  document.body.classList.toggle('steer-tilt', tiltActive);
  document.body.classList.toggle('steer-touch', !tiltActive);
}

function cycleSteeringMode() {
  const tiltNow = steeringMode === 'tilt' && tiltPermission !== 'denied';
  steeringMode = tiltNow || !tiltSupported ? 'touch' : 'tilt';
  try { localStorage.setItem(STEERING_STORAGE_KEY, steeringMode); } catch (e) {}
  if (steeringMode === 'tilt') {
    tiltPermission = 'unknown';
    // This tap is the user gesture iPhone needs for the permission prompt
    requestTiltPermission().then(() => { applySteeringModeClass(); updateSteeringLabel(); });
  }
  applySteeringModeClass();
  updateSteeringLabel();
}

function updateSteeringLabel() {
  const el = document.getElementById('menu-steering');
  if (!el) return;
  if (steeringMode === 'tilt' && tiltPermission === 'denied') el.textContent = 'Touch pad (tilt blocked)';
  else el.textContent = steeringMode === 'tilt' ? 'Tilt (steering wheel)' : 'Touch pad';
}

// Called from the Start buttons (a tap): ask for tilt permission if needed
// and go fullscreen where the browser allows it (Android; not iPhone)
function prepareMobileForRace() {
  if (!isTouchDevice) return;
  if (steeringMode === 'tilt' && tiltPermission !== 'granted') {
    requestTiltPermission().then(() => { applySteeringModeClass(); updateSteeringLabel(); });
  }
  const el = document.documentElement;
  if (el.requestFullscreen && !document.fullscreenElement) {
    el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  }
  tiltNeutral = null;
  tiltSmoothed = 0;
}

function setupMobile() {
  if (!isTouchDevice) return;
  document.body.classList.add('touch');
  document.getElementById('menu-steering-row').style.display = '';
  setupTouchPad();
  applySteeringModeClass();
  updateSteeringLabel();
  // Android grants without a prompt; start listening right away there
  if (tiltSupported && typeof DeviceMotionEvent.requestPermission !== 'function') {
    window.addEventListener('devicemotion', onDeviceMotion);
    tiltPermission = 'granted';
  }
}

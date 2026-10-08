// ==================== SOUND SYSTEM ====================
// Everything is synthesized at startup — no audio files. Signal chain:
//   voices -> masterGain -> compressor -> speakers
// The compressor keeps pile-ups from clipping into digital distortion.
//
// Voices:
//   - Player engine: looped V8 exhaust-pulse buffer, pitch tracks RPM
//   - Field engines: same buffer, two detuned copies, the rest of the cars
//   - Scrape: looped grinding noise, level fed by sustained metal contact
//   - Crashes: 12 pre-rendered buffers (3 weights x 4 variations)
let audioCtx = null;
let soundEnabled = false;
let soundMuted = localStorage.getItem('demolitionDerbyMuted') === '1';
let masterGain = null;
let engineVoice = null;
let fieldVoice = null;
let scrapeVoice = null;
let crashBuffers = { light: [], medium: [], heavy: [] };
let lastCrashTime = 0;
let lastCrashIntensity = 0;
let activeCrashVoices = 0;
let scrapeLevel = 0;

const MASTER_VOLUME = 0.9;
const MAX_CRASH_VOICES = 6;
const IDLE_RPM_RATE = 1;     // playbackRate of the engine loop at idle (~750 rpm)
const REDLINE_RPM_RATE = 4.4; // ~3300 rpm at full speed

function initAudio() {
  if (audioCtx) {
    // Mobile browsers suspend the context until a user gesture
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return;
  }
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    masterGain = audioCtx.createGain();
    masterGain.gain.value = soundMuted ? 0 : MASTER_VOLUME;
    const comp = audioCtx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 8;
    comp.ratio.value = 6;
    comp.attack.value = 0.002;
    comp.release.value = 0.15;
    masterGain.connect(comp);
    comp.connect(audioCtx.destination);

    createCrashBuffers();
    const engineBuffer = createEngineBuffer();
    engineVoice = createEngineVoice(engineBuffer, [1]);
    fieldVoice = createEngineVoice(engineBuffer, [1, 1.13]);
    scrapeVoice = createScrapeVoice();

    soundEnabled = true;
  } catch (e) {
    soundEnabled = false;
  }
}

function toggleMute() {
  soundMuted = !soundMuted;
  try { localStorage.setItem('demolitionDerbyMuted', soundMuted ? '1' : '0'); } catch (e) {}
  if (masterGain) {
    masterGain.gain.setTargetAtTime(soundMuted ? 0 : MASTER_VOLUME, audioCtx.currentTime, 0.05);
  }
}

// ==================== ENGINE ====================
// One loop of a cross-plane V8 at idle. GM firing order 1-8-4-3-6-5-7-2,
// odd cylinders on the left bank. Firing every 90° of crank overall, but
// each bank sees uneven gaps (270/180/90/180°) — that unevenness is the
// V8 burble. Left bank leans left channel, right bank leans right.
//
// Each pulse is an unpitched exhaust "pop" (filtered noise plus a single
// low push), so the only pitch you hear is the firing rate itself. An
// earlier version rang a fixed tone on every pulse, which turned into a
// horn-like note when revved.
function createEngineBuffer() {
  const sr = audioCtx.sampleRate;
  const idleRpm = 750;
  const cycleSec = 2 * 60 / idleRpm;        // 720° of crank = one full firing cycle
  const cycles = 8;
  const len = Math.floor(sr * cycleSec * cycles);
  const buffer = audioCtx.createBuffer(2, len, sr);
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);

  const firingOrder = [1, 8, 4, 3, 6, 5, 7, 2];
  // Fixed per-cylinder strength offsets: no real engine fires perfectly even
  const cylTrim = [0, 0.05, -0.07, 0.03, -0.04, 0.08, -0.02, 0.06, -0.05];
  const pulseLen = Math.floor(sr * 0.03);
  const pushLen = Math.floor(sr * 0.007); // half-cycle of ~70Hz: a push, not a tone

  for (let c = 0; c < cycles; c++) {
    for (let k = 0; k < 8; k++) {
      const cyl = firingOrder[k];
      const leftBank = cyl % 2 === 1;
      const jitter = (Math.random() - 0.5) * 0.04; // ±2% of a firing slot
      const start = Math.floor(((c * 8 + k + jitter) / (cycles * 8)) * len);
      const amp = (1 + cylTrim[cyl]) * (0.85 + Math.random() * 0.3);
      const lpCoef = 0.08 + Math.random() * 0.06; // darker or brighter pop
      let lp1 = 0, lp2 = 0;
      for (let i = 0; i < pulseLen; i++) {
        const t = i / sr;
        const attack = Math.min(1, i / (sr * 0.001));
        lp1 += ((Math.random() * 2 - 1) - lp1) * lpCoef;
        lp2 += (lp1 - lp2) * lpCoef;
        const pop = lp2 * Math.exp(-t * 110) * 2.2;
        const push = i < pushLen ? Math.sin(Math.PI * i / pushLen) * 0.7 : 0;
        const s = attack * amp * (pop + push);
        // Wrap around so the loop point is seamless
        const idx = (start + i) % len;
        L[idx] += s * (leftBank ? 1 : 0.65);
        R[idx] += s * (leftBank ? 0.65 : 1);
      }
    }
  }

  removeDC(buffer);
  normalizeBuffer(buffer, 0.9);
  return buffer;
}

function createEngineVoice(buffer, rateMultipliers) {
  const shaper = audioCtx.createWaveShaper();
  shaper.curve = makeDriveCurve(2.2);
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 500;
  filter.Q.value = 0.9;
  const gain = audioCtx.createGain();
  gain.gain.value = 0;

  const sources = rateMultipliers.map((mult, i) => {
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = IDLE_RPM_RATE * mult;
    src.connect(shaper);
    src.start(0, (i * 0.37) % buffer.duration);
    return { src, mult };
  });

  shaper.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  return { sources, filter, gain };
}

function setEngineVoice(voice, rate, cutoff, volume, rateTimeConst) {
  const now = audioCtx.currentTime;
  voice.sources.forEach(({ src, mult }) => {
    src.playbackRate.setTargetAtTime(rate * mult, now, rateTimeConst);
  });
  voice.filter.frequency.setTargetAtTime(cutoff, now, 0.08);
  voice.gain.gain.setTargetAtTime(volume, now, 0.1);
}

// Player engine. Called every frame while the player is running,
// including during the countdown (speed 0) so you can rev at the line.
function updateEngineSound(speed, isAccelerating) {
  if (!soundEnabled || !engineVoice) return;

  const speedFrac = Math.min(1, Math.abs(speed) / PHYSICS.MAX_FORWARD_SPEED);
  let rate = IDLE_RPM_RATE + speedFrac * (REDLINE_RPM_RATE - IDLE_RPM_RATE - 0.4);
  if (isAccelerating) {
    // Under load the revs lead the road speed; from a standstill
    // (or shoving against another car) they flare harder.
    rate += 0.4 + 0.9 * (1 - Math.min(1, Math.abs(speed) / 3));
  }
  rate = Math.min(rate, REDLINE_RPM_RATE);

  // Throttle opens the exhaust note up; off-throttle it goes dull and burbly
  const cutoff = isAccelerating ? 650 + rate * 380 : 380 + rate * 160;
  const volume = isAccelerating ? 0.14 + speedFrac * 0.06 : 0.06 + speedFrac * 0.04;
  // Revs rise faster than they fall (flywheel inertia)
  const timeConst = isAccelerating ? 0.09 : 0.22;
  setEngineVoice(engineVoice, rate, cutoff, volume, timeConst);
}

// The rest of the field: a muffled bed of engines whose level tracks
// how many cars are still running and whose pitch tracks their speed.
function updateFieldSound(cars) {
  if (!soundEnabled || !fieldVoice) return;
  const running = cars.filter(c => !c.disabled);
  if (running.length === 0) {
    fieldVoice.gain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.3);
    return;
  }
  const avgSpeed = running.reduce((s, c) => s + Math.abs(c.speed), 0) / running.length;
  const speedFrac = Math.min(1, avgSpeed / PHYSICS.MAX_FORWARD_SPEED);
  // Slow wander so idling cars don't sit on one dead-flat pitch
  const wander = Math.sin(Date.now() / 700) * 0.08 + Math.sin(Date.now() / 1900) * 0.06;
  const rate = 1.1 + speedFrac * 2.4 + wander;
  const volume = Math.min(0.08, 0.022 * Math.sqrt(running.length));
  setEngineVoice(fieldVoice, rate, 320 + speedFrac * 250, volume, 0.3);
}

// Engine dies: revs sag and the sound fades. Used when the player is
// knocked out, disqualified, or the round ends.
function muteEngine() {
  if (!soundEnabled) return;
  const now = audioCtx.currentTime;
  [engineVoice, fieldVoice].forEach(voice => {
    voice.sources.forEach(({ src, mult }) => src.playbackRate.setTargetAtTime(0.55 * mult, now, 0.35));
    voice.gain.gain.setTargetAtTime(0, now, 0.35);
  });
  scrapeLevel = 0;
  scrapeVoice.gain.gain.setTargetAtTime(0, now, 0.05);
}

// ==================== METAL SCRAPE ====================
// Sustained contact (shoving, grinding along a door) is a scrape, not a
// string of crashes. Grit is baked in as random amplitude spikes.
function createScrapeVoice() {
  const sr = audioCtx.sampleRate;
  const len = Math.floor(sr * 2);
  const buffer = audioCtx.createBuffer(1, len, sr);
  const data = buffer.getChannelData(0);
  let grit = 0;
  for (let i = 0; i < len; i++) {
    if (Math.random() < 0.004) grit = 0.6 + Math.random() * 0.4;
    grit *= 0.995;
    data[i] = (Math.random() * 2 - 1) * (0.45 + grit);
  }
  normalizeBuffer(buffer, 0.8);

  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const bandHigh = audioCtx.createBiquadFilter();
  bandHigh.type = 'bandpass';
  bandHigh.frequency.value = 2100;
  bandHigh.Q.value = 1.8;
  const bandLow = audioCtx.createBiquadFilter();
  bandLow.type = 'bandpass';
  bandLow.frequency.value = 700;
  bandLow.Q.value = 1.2;
  const gain = audioCtx.createGain();
  gain.gain.value = 0;

  src.connect(bandHigh);
  src.connect(bandLow);
  bandHigh.connect(gain);
  bandLow.connect(gain);
  gain.connect(masterGain);
  src.start();
  return { src, bandHigh, gain };
}

// Called from collision resolution with the sliding speed at the contact.
function addScrape(amount) {
  scrapeLevel = Math.max(scrapeLevel, amount);
}

// Called once per frame: scrape fades out quickly once contact stops.
function updateScrapeSound() {
  if (!soundEnabled || !scrapeVoice) return;
  const now = audioCtx.currentTime;
  const level = Math.min(1, scrapeLevel / 4);
  scrapeVoice.gain.gain.setTargetAtTime(level * 0.16, now, 0.04);
  scrapeVoice.src.playbackRate.setTargetAtTime(0.8 + level * 0.5, now, 0.05);
  scrapeVoice.bandHigh.frequency.setTargetAtTime(1600 + level * 1200, now, 0.05);
  scrapeLevel *= 0.75;
  if (scrapeLevel < 0.05) scrapeLevel = 0;
}

// ==================== CRASHES ====================
// Built from noise, not tones — anything tonal and short reads as water
// drops or cartoon boings. Layers, each tuned per weight class:
//   body    — unpitched low thud (low-passed noise), the chassis taking the hit
//   crunch  — dense broadband crackle = sheet metal tearing and folding
//   metal   — the crunch driven through a bank of resonant filters at
//             inharmonic frequencies: the clang of steel panels
//   debris  — sparse bright ticks trailing a big hit (glass, trim)
// Everything is then saturated hard, the way a real crash recording is.
const CRASH_TIERS = {
  light:  { dur: 0.45, bodyAmp: 0.6, bodyDecay: 28, crunchDur: 0.08, crunchDensity: 900,  modes: 14, modeLo: 500, modeHi: 5000, modeDecay: 0.10, metalAmp: 0.9, debris: 0,  drive: 2.2, tone: 0.55 },
  medium: { dur: 0.8,  bodyAmp: 1.5,  bodyDecay: 18, crunchDur: 0.22, crunchDensity: 1400, modes: 18, modeLo: 350, modeHi: 4500, modeDecay: 0.20, metalAmp: 1.0, debris: 10, drive: 2.8, tone: 0.45 },
  heavy:  { dur: 1.3,  bodyAmp: 2.0, bodyDecay: 11, crunchDur: 0.45, crunchDensity: 1800, modes: 22, modeLo: 250, modeHi: 4000, modeDecay: 0.32, metalAmp: 1.1, debris: 28, drive: 3.4, tone: 0.38 }
};

function createCrashBuffers() {
  Object.keys(CRASH_TIERS).forEach(tierName => {
    for (let v = 0; v < 4; v++) {
      crashBuffers[tierName].push(renderCrash(CRASH_TIERS[tierName]));
    }
  });
}

function renderCrash(tier) {
  const sr = audioCtx.sampleRate;
  const len = Math.floor(sr * tier.dur);
  const buffer = audioCtx.createBuffer(2, len, sr);

  // Panel resonances, shared by both channels so the clang sits centered.
  // Log-spaced with jitter so no two are harmonically related.
  const modes = [];
  for (let k = 0; k < tier.modes; k++) {
    const frac = (k + Math.random()) / tier.modes;
    modes.push({
      f: tier.modeLo * Math.pow(tier.modeHi / tier.modeLo, frac),
      q: 12 + Math.random() * 25,
      gain: 0.5 + Math.random() * 0.8
    });
  }

  // Crunch event times shared by both channels (noise content differs)
  const events = [];
  const n = Math.floor(tier.crunchDensity * tier.crunchDur);
  for (let e = 0; e < n; e++) {
    const u = Math.random();
    events.push({
      start: Math.floor(sr * tier.crunchDur * u * u), // denser at the start
      len: Math.floor(sr * (0.0003 + Math.random() * 0.002)),
      amp: (0.2 + Math.random() * 0.8) * (1 - u * 0.7)
    });
  }

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    const crunch = new Float32Array(len);

    // Opening blast of broadband noise, then the crackle events
    for (let i = 0; i < Math.min(len, Math.floor(sr * 0.02)); i++) {
      crunch[i] += (Math.random() * 2 - 1) * Math.exp(-i / sr * 150);
    }
    for (const ev of events) {
      for (let i = 0; i < ev.len && ev.start + i < len; i++) {
        crunch[ev.start + i] += (Math.random() * 2 - 1) * ev.amp;
      }
    }

    // Metal: crunch through the resonator bank
    const metal = new Float32Array(len);
    for (const m of modes) {
      const bp = makeBandpass(m.f, m.q, sr);
      const decayQ = Math.exp(-1 / (sr * tier.modeDecay * (600 / m.f + 0.5)));
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0, env = 1;
      for (let i = 0; i < len; i++) {
        const x = crunch[i];
        const y = bp.b0 * x + bp.b2 * x2 - bp.a1 * y1 - bp.a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        env *= decayQ;
        metal[i] += y * m.gain * (0.4 + 0.6 * env);
      }
    }

    // Body thud: two-stage low-passed noise, no pitch sweep
    let b1 = 0, b2 = 0;
    // Debris ticks
    const debrisTimes = [];
    for (let d = 0; d < tier.debris; d++) {
      debrisTimes.push(Math.floor(sr * (0.06 + Math.pow(Math.random(), 1.4) * tier.dur * 0.6)));
    }
    let hp = 0, prevCr = 0, mix = 0, lpA = 0, lpB = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      b1 += ((Math.random() * 2 - 1) - b1) * 0.03;
      b2 += (b1 - b2) * 0.03;
      const attack = Math.min(1, i / (sr * 0.001));
      const body = b2 * 4 * Math.exp(-t * tier.bodyDecay) * tier.bodyAmp * attack;
      // High-passed crunch layered on top so the tearing stays audible
      hp = 0.9 * (hp + crunch[i] - prevCr);
      prevCr = crunch[i];
      mix = body + metal[i] * tier.metalAmp * 1.1 + hp * 0.12;
      // Gentle two-stage low-pass: keeps the tear, loses the hiss
      lpA += (mix - lpA) * tier.tone;
      lpB += (lpA - lpB) * tier.tone;
      data[i] = lpB;
    }
    for (const start of debrisTimes) {
      const amp = 0.05 + Math.random() * 0.12;
      let prev = 0;
      for (let i = 0; i < Math.floor(sr * 0.0015) && start + i < len; i++) {
        const w = Math.random() * 2 - 1;
        data[start + i] += (w - prev) * amp * Math.exp(-i / sr * 2500);
        prev = w;
      }
    }

    // Short fade at the tail so the buffer never ends on a click
    const fade = Math.floor(sr * 0.05);
    for (let i = 0; i < fade; i++) data[len - 1 - i] *= i / fade;
  }

  removeDC(buffer);
  // Normalize, saturate hard, normalize again: level-matched buffers so
  // the playback gain alone decides loudness
  normalizeBuffer(buffer, 1);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    const k = Math.tanh(tier.drive);
    for (let i = 0; i < len; i++) data[i] = Math.tanh(data[i] * tier.drive) / k;
  }
  normalizeBuffer(buffer, 0.95);
  return buffer;
}

// RBJ band-pass (constant 0 dB peak gain), coefficients normalized by a0
function makeBandpass(f, q, sr) {
  const w0 = 2 * Math.PI * Math.min(f, sr * 0.45) / sr;
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  return { b0: alpha / a0, b2: -alpha / a0, a1: -2 * Math.cos(w0) / a0, a2: (1 - alpha) / a0 };
}

// intensity: same scale as before (roughly 0-12; player hits arrive
// pre-boosted by the caller). x: world position for stereo placement.
function playCrashSound(intensity, x) {
  if (!soundEnabled || crashBuffers.light.length === 0) return;

  const norm = clamp(intensity / 9, 0, 1);
  if (norm < 0.03) return;

  // A train of contacts on consecutive frames should read as one hit,
  // unless the new one is clearly harder than the one still ringing.
  const now = audioCtx.currentTime;
  if (now - lastCrashTime < 0.07 && norm < lastCrashIntensity * 1.5) return;
  if (activeCrashVoices >= MAX_CRASH_VOICES) return;
  lastCrashTime = now;
  lastCrashIntensity = norm;

  const tierName = norm < 0.3 ? 'light' : norm < 0.65 ? 'medium' : 'heavy';
  const pool = crashBuffers[tierName];
  const source = audioCtx.createBufferSource();
  source.buffer = pool[Math.floor(Math.random() * pool.length)];
  // Small random pitch shift so repeats never sound identical
  source.playbackRate.value = 0.9 + Math.random() * 0.2;

  const gain = audioCtx.createGain();
  gain.gain.value = 0.1 + 0.75 * Math.pow(norm, 0.7);

  let tail = gain;
  if (audioCtx.createStereoPanner && typeof x === 'number') {
    const pan = audioCtx.createStereoPanner();
    pan.pan.value = clamp((x / ARENA_WIDTH) * 2 - 1, -1, 1) * 0.6;
    gain.connect(pan);
    tail = pan;
  }

  source.connect(gain);
  tail.connect(masterGain);
  activeCrashVoices++;
  source.onended = () => { activeCrashVoices--; };
  source.start(0);
}

// ==================== HELPERS ====================
function normalizeBuffer(buffer, peakTarget) {
  let peak = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  }
  if (peak === 0) return;
  const scale = peakTarget / peak;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) data[i] *= scale;
  }
}

// Strip any DC offset (one-pole high-pass at ~20Hz)
function removeDC(buffer) {
  const r = 1 - (2 * Math.PI * 20 / buffer.sampleRate);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const data = buffer.getChannelData(ch);
    let x1 = 0, y1 = 0;
    for (let i = 0; i < data.length; i++) {
      const y = data[i] - x1 + r * y1;
      x1 = data[i];
      y1 = y;
      data[i] = y;
    }
  }
}

// Soft saturation curve (tanh), normalized so full scale stays full scale
function makeDriveCurve(drive) {
  const samples = 2048;
  const curve = new Float32Array(samples);
  const norm = Math.tanh(drive);
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = Math.tanh(x * drive) / norm;
  }
  return curve;
}

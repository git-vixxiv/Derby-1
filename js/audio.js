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
//   - Countdown ticks + starting air horn
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
  const pulseLen = Math.floor(sr * 0.045);

  for (let c = 0; c < cycles; c++) {
    for (let k = 0; k < 8; k++) {
      const cyl = firingOrder[k];
      const leftBank = cyl % 2 === 1;
      const jitter = (Math.random() - 0.5) * 0.04; // ±2% of a firing slot
      const start = Math.floor(((c * 8 + k + jitter) / (cycles * 8)) * len);
      const amp = (1 + cylTrim[cyl]) * (0.88 + Math.random() * 0.24);
      const ring = 105 + Math.random() * 15; // exhaust pipe resonance
      let noiseLp = 0;
      for (let i = 0; i < pulseLen; i++) {
        const t = i / sr;
        const attack = Math.min(1, i / (sr * 0.0015));
        noiseLp = noiseLp * 0.6 + (Math.random() * 2 - 1) * 0.4;
        const s = attack * amp * (
          Math.exp(-t * 55) * Math.sin(2 * Math.PI * ring * t) * 0.85 +
          Math.exp(-t * 140) * noiseLp * 0.45
        );
        // Wrap around so the loop point is seamless
        const idx = (start + i) % len;
        L[idx] += s * (leftBank ? 1 : 0.65);
        R[idx] += s * (leftBank ? 0.65 : 1);
      }
    }
  }

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
// Layers, each tuned per weight class:
//   thump   — pitch-dropping low sine, the chassis taking the hit
//   smack   — short low-passed noise burst, the initial contact
//   crumple — hundreds of tiny damped resonances = sheet metal folding
//   ring    — quiet inharmonic panel modes (kept low: real, not cartoon)
//   glass   — sparse high clicks trailing a big hit
//   settle  — low rumble tail as the cars rock back
const CRASH_TIERS = {
  light:  { dur: 0.35, thumpF: 140, thumpDecay: 26, thumpAmp: 0.55, smackLp: 0.45, grains: 18,  crumpleDur: 0.10, ringBase: [320, 480], ringDecay: 22, ringAmp: 0.08, glass: 0,  settle: 0.05 },
  medium: { dur: 0.7,  thumpF: 115, thumpDecay: 16, thumpAmp: 0.8,  smackLp: 0.35, grains: 70,  crumpleDur: 0.28, ringBase: [220, 340], ringDecay: 12, ringAmp: 0.11, glass: 6,  settle: 0.12 },
  heavy:  { dur: 1.2,  thumpF: 95,  thumpDecay: 10, thumpAmp: 1.0,  smackLp: 0.28, grains: 170, crumpleDur: 0.55, ringBase: [150, 250], ringDecay: 7,  ringAmp: 0.14, glass: 30, settle: 0.25 }
};
const RING_RATIOS = [1, 1.58, 2.31, 3.17, 4.41, 5.6];

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

  // Shared between channels so the body of the hit sits dead center
  const thumpStart = tier.thumpF * (0.9 + Math.random() * 0.2);
  const ringBase = tier.ringBase[0] + Math.random() * (tier.ringBase[1] - tier.ringBase[0]);
  const modes = RING_RATIOS.map((r, k) => ({
    f: ringBase * r * (0.97 + Math.random() * 0.06),
    amp: 1 / (k + 1),
    decay: tier.ringDecay * (1 + k * 0.4),
    phase: Math.random() * Math.PI * 2
  }));

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);

    // Thump + smack + ring + settle, sample by sample
    let phase = 0;
    let smackLp = 0;
    let settleLp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      const f = 45 + (thumpStart - 45) * Math.exp(-t * 30);
      phase += 2 * Math.PI * f / sr;
      const attack = Math.min(1, i / (sr * 0.002));
      const thump = Math.sin(phase) * Math.exp(-t * tier.thumpDecay) * tier.thumpAmp;

      smackLp += (Math.random() * 2 - 1 - smackLp) * tier.smackLp;
      const smack = smackLp * Math.exp(-t * 45) * 0.9;

      let ring = 0;
      if (t > 0.004) {
        for (const m of modes) ring += Math.sin(2 * Math.PI * m.f * t + m.phase) * m.amp * Math.exp(-t * m.decay);
      }

      settleLp += (Math.random() * 2 - 1 - settleLp) * 0.02;
      const settle = settleLp * Math.exp(-t * 6) * tier.settle * 4;

      data[i] = attack * (thump + smack + settle) + ring * tier.ringAmp;
    }

    // Crumple grains: denser at the start, thinning out
    for (let g = 0; g < tier.grains; g++) {
      const u = Math.random();
      const start = Math.floor(sr * tier.crumpleDur * u * u);
      const f = 400 + Math.random() * 2600;
      const decay = 300 + Math.random() * 600;
      const amp = (0.15 + Math.random() * 0.5) * (1 - u * 0.6) * (Math.random() < 0.5 ? -1 : 1);
      const glen = Math.min(len - start, Math.floor(sr * 5 / decay));
      for (let i = 0; i < glen; i++) {
        const t = i / sr;
        data[start + i] += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * decay) * amp;
      }
    }

    // Glass and loose trim landing after the hit
    for (let g = 0; g < tier.glass; g++) {
      const start = Math.floor(sr * (0.05 + Math.pow(Math.random(), 1.5) * (tier.dur * 0.6)));
      const f = 3000 + Math.random() * 4000;
      const amp = 0.06 + Math.random() * 0.14;
      const glen = Math.min(len - start, Math.floor(sr * 0.004));
      for (let i = 0; i < glen; i++) {
        const t = i / sr;
        data[start + i] += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 1800) * amp;
      }
    }

    // Short fade at the tail so the buffer never ends on a click
    const fade = Math.floor(sr * 0.03);
    for (let i = 0; i < fade; i++) data[len - 1 - i] *= i / fade;
  }

  // Gentle saturation for weight, then level-match all buffers so the
  // playback gain alone decides loudness
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = Math.tanh(data[i] * 1.4);
  }
  normalizeBuffer(buffer, 0.95);
  return buffer;
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

// ==================== COUNTDOWN ====================
function playCountdownTick() {
  if (!soundEnabled) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  osc.type = 'square';
  osc.frequency.value = 660;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1800;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.12, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  osc.start(now);
  osc.stop(now + 0.16);
}

// Two-tone air horn — the classic derby start signal
function playStartHorn() {
  if (!soundEnabled) return;
  const now = audioCtx.currentTime;
  const dur = 0.9;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2400;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.22, now + 0.03);
  gain.gain.setValueAtTime(0.22, now + dur - 0.15);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  filter.connect(gain);
  gain.connect(masterGain);
  [233, 294, 466].forEach((f, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f * 0.97, now);
    osc.frequency.linearRampToValueAtTime(f, now + 0.06);
    const g = audioCtx.createGain();
    g.gain.value = i === 2 ? 0.3 : 0.5;
    osc.connect(g);
    g.connect(filter);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  });
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

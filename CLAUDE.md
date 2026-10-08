# CLAUDE.md — Demolition Derby Project Briefing

This file is the primary orientation document for Claude Code working on this project. Read it fully before making changes.

## What this is

A browser-based recreation of the 1984 Bally Midway arcade game **Demolition Derby**, with modern enhancements. Pure HTML5 Canvas + vanilla JavaScript. No build step, no framework, no dependencies. Opens directly in a browser. Deployed to GitHub Pages.

## Project owner

Joe owns product direction and testing. Joe has deep domain knowledge of real-world demolition derby and the original 1984 arcade game, but does not write code. All programming is delegated to Claude / Claude Code. Joe provides precise numerical feedback on physics tuning and gameplay feel.

## Design principles — do not violate these without explicit approval

1. **Authenticity first.** The physics must feel like a real car with real weight and real front-axle steering geometry. The implementation is a bicycle-model approximation that feels close to rear-axle pivot — angular velocity is computed from `speed / turnRadius` (the standard rear-axle formula), but position integration updates the car's center, not the rear axle, so it's not a strict rear-axle pivot. Joe has tuned this to feel right; don't rewrite the integration just to match the label more literally. If a change makes the game play more "arcadey" at the expense of this feel, reject it.
2. **Engine protection is the core strategic loop.** The reason to ram with the rear is to protect the front (engine). Any new feature must reinforce this decision, not dilute it. Power-ups, weather, AI behaviors — all get evaluated against this.
3. **Visual authenticity of classic American iron.** Cars are based on Crown Vic, Town Car, Impala, Imperial, Wagon, LeSabre, DeVille, Delta 88. Proportions matter. Wheels sit at fender positions. Cars are rendered at 1.2× scale for visibility.
4. **Realistic damage zones.** Front (engine) is most critical, rear is most protected, sides are in between. Damage visibly accumulates with persistent scratches and dents.
5. **No roleplay, no gimmicks.** This is a serious arcade recreation, not a cartoon.

## Current state (v10)

Modular build:
- `index.html` (~131 lines) — HTML structure + ordered `<script>` tags
- `css/styles.css`
- `js/config.js` — ARENA_*, WALL_THICKNESS, CAR_SCALE, CONTACT_TIMEOUT, PHYSICS, CAR_TYPES
- `js/math.js` — vector math, hsl, dist, normAngle, clamp, formatTime, getUniqueNumber/Color
- `js/audio.js` — master bus + compressor, V8 engine loop (player + field), layered crash buffers, metal scrape, mute toggle
- `js/car.js` — geometry, createCar, damage % helpers, modifiers (speed/accel/steer)
- `js/collision.js` — SAT detection, OBB checks, resolveCollision, applyDamage, getZoneDamageMultiplier, spawnDamagePopup
- `js/physics.js` — updateCarPhysics
- `js/ai.js` — updateAI (state machine)
- `js/particles.js` — spawnSparks/Debris/PaintChips/Smoke
- `js/rendering.js` — drawCar, drawArena, drawPowerUp, drawCountdown, drawHealthBar
- `js/hud.js` — showOverlay, updateHUD, updateHighScoreDisplay
- `js/game.js` — initGame, generateStartPositions, startGame, nextLevel, startCountdown
- `js/main.js` — global state, controls, gameLoop, event listeners, bootstrap

All JS uses classic `<script>` tags loaded in dependency order — no build step, no ES modules. Functions and `let`/`const` declarations remain global so inline `onclick="startGame()"` handlers in `index.html` continue to work. Open `index.html` directly in a browser, or use `python -m http.server` to avoid file:// quirks. Deployed and playable.

**Features shipped:**
- Front-axle steering physics with realistic pivot behavior
- Oriented Bounding Box (OBB / SAT) collision detection
- Momentum-based collision response with angular impulse. Impulse goes into drive speed along the direction of travel (a rammer is stopped by the hit) and the rest into knockback. v10 fixed an inverted approach test that made head-on rams deal no damage.
- Mud traction: direction of travel (`moveAngle`) lags heading, so cars slide through turns; less grip at speed and with damage. Front damage pulls steering toward the hit side and adds wheel wobble.
- Per-zone damage (front/side/rear) with separate HP pools. Two measures: **condition** (zone damage ÷ pool, capped at 100%) drives visuals and handling — front kills steering (to 5–15%) and some power, rear kills speed/acceleration, side a bit of both. **Life** (`getLifeUsed`) keeps counting past 100%: out when front/(pool×3.5) + side/(pool×4.5) + rear/(pool×4) ≥ 1 (`CAR_LIFE` in config). At 75% ram speed: 6 front, 10 side or 14 rear hits. Health bar above cars shows life; HUD zone bars show condition. Fire only when life < 25%.
- Visual damage accumulation — per-car deformation profile (`car.deform`): body outline caves in where hit, persistent creases, buckled hood, broken lamps, bent bumpers, grime; plus scratches/dents in car-local space
- Particle systems: sparks, debris, paint chips, smoke, fire
- Synthesized audio (no files): 12 pre-rendered crash buffers (3 weight classes × 4 variations) built from noise only — body thud, broadband crunch, crunch driven through a resonant filter bank for the steel-panel clang, debris ticks, hard saturation. Stereo-panned, volume scales with impact. Metal scrape loop for sustained contact. V8 engine loop of unpitched exhaust pops (pitch comes from firing rate only), rev at the line during countdown, muffled field-engine bed. Master compressor. `M` to mute (localStorage key `demolitionDerbyMuted`). **Avoid short tonal components** (damped sines, pitch sweeps): Joe heard them as water splashes and a horn.
- AI opponents with state machine: scanning, approaching, positioning, charging, retreating, unsticking
- 45-second contact timer — must hit someone every 45s or you're disqualified
- Cars start around arena perimeter facing outward (authentic derby start)
- Mobile touch controls + keyboard controls
- Health bars above active cars
- Floating damage popup numbers
- Power-ups: wrench (repair) and boost
- Multiple rounds with increasing car counts (8 + 2×level, capped at 14)
- Mud tracks, arena environment
- Per-model car stats (weight, acceleration, top speed, front/rear strength) — first pass, see roster below
- High score persistence via localStorage (key: `demolitionDerbyHighScoreV9`)

## Physics constants — current tuning (v10)

These were tuned iteratively with Joe providing direct feedback. v9/v10 are significantly faster and grippier than earlier versions; do not revert toward older values without explicit approval. Any change to these requires testing and approval.

```javascript
BASE_ACCELERATION: 0.08         // doubled from 0.04: top speed in ~63% of arena width
MAX_FORWARD_SPEED: 6            // v10: cut from 9 (Joe: "way too fast")
MAX_REVERSE_SPEED: 6            // same as forward when healthy
ROLLING_FRICTION: 0.975
MUD_DRAG: 0.965
MAX_STEER_ANGLE: 0.42
STEER_SPEED: 0.04               // v10: was 0.055
STEER_RETURN_SPEED: 0.08
MIN_SPEED_TO_TURN: 0.15         // steering only works while moving
SLIDE_FRICTION: 0.85
ANGULAR_FRICTION: 0.82
MUD_GRIP: 0.11                  // v10: travel direction chases heading at this rate/frame
GRIP_LOSS_AT_TOP_SPEED: 0.45
GRIP_LOSS_FROM_DAMAGE: 0.4
SLIDE_SCRUB: 0.05
DAMAGE_PULL_MAX: 0.07           // v10: steering pull (rad) at 100% front damage
DAMAGE_WOBBLE_MAX: 0.08
RESTITUTION: 0.35
COLLISION_BIAS: 0.3
ANGULAR_IMPULSE_SCALE: 0.012
CONTACT_TIMEOUT: 45 * 60        // 45 seconds at 60fps
CAR_SCALE: 1.2
```

Tuned outside `PHYSICS` (in code, with history comments):

- Post-impact velocity decay: `0.75` per frame (`physics.js`). Was 0.94, then 0.85.
- Speed-bonus damage: `pow(speed - 2, 1.9) * 5` (`collision.js`), on the old top-speed-9 scale: all damage and crash-sound speeds are multiplied by `DAMAGE_SPEED_SCALE = 9 / MAX_FORWARD_SPEED` so a full-speed hit still does what it did at top speed 9. Measured: 90%-speed rear ram into a door = 165 side damage.
- Wall damage: `impactSpeed * 3 * zoneMultiplier`, where impactSpeed is the velocity component into the wall (drive + slide + knockback) (`physics.js`, `WALL_DAMAGE_PER_SPEED`). The zone is the part of the car that hits the wall (front 1.4×, side 0.8×, rear 0.5×, divided by model strength), not which wall was hit.

## Car roster (v10 first-pass stats — awaiting Joe's tuning)

`frontStrength`/`rearStrength` divide incoming zone damage (higher = tougher). `weight` is collision mass. `acceleration`/`topSpeed` multiply the PHYSICS values.

| Model | weight | accel | top | front | rear | identity |
|---|---|---|---|---|---|---|
| Crown Vic | 1.00 | 1.05 | 1.03 | 1.00 | 1.00 | quick all-rounder |
| Town Car | 1.08 | 0.97 | 1.00 | 1.00 | 1.05 | heavy cruiser |
| Impala | 0.94 | 1.08 | 1.04 | 0.92 | 0.95 | light and fast, fragile |
| Imperial | 1.20 | 0.88 | 0.95 | 1.20 | 1.10 | tank, slow off the line |
| Wagon | 1.12 | 0.92 | 0.97 | 0.95 | 1.25 | long tail, rear-ram specialist |
| LeSabre | 0.96 | 1.03 | 1.00 | 0.97 | 0.97 | nimble mid-size |
| DeVille | 1.15 | 0.92 | 0.98 | 1.08 | 1.05 | heavy luxury bruiser |
| Delta 88 | 1.02 | 1.00 | 1.00 | 1.02 | 1.00 | balanced baseline |

Visual proportions (hood/trunk/cabin) and body style also vary. Any change to these numbers shifts balance — get Joe's approval.

## File structure

The module split is complete (see "Current state" above for the file list). When editing physics, AI, or rendering, look in the matching module rather than the inline `<script>` block. The inline `<script>` block no longer exists.

If you add a new module, append a `<script src="js/your-module.js"></script>` line to `index.html` in dependency order (most modules can go anywhere; `main.js` must be last because it calls `gameLoop()` at the end and depends on every other module being loaded).

## Roadmap (not prioritized — discuss before starting)

- ~~Split monolithic `index.html` into modules~~ — done in `refactor/module-split` branch
- ~~Differentiated car stats~~ — first pass shipped in v10, tuning pending
- Weather effects (rain, mud, reduced visibility)
- Championship mode (multi-round tournament with persistent damage between rounds)
- Strategic power-ups beyond repair/boost: engine cooling, reinforced bumpers
- Custom car selection screen with color picker
- Online leaderboards (would require a backend — scope before committing)

## How Joe works

- Prefers iterative prototypes over big-bang features. Ship a minimal version, test, refine.
- Gives precise numerical feedback ("the steering feels 20% too sensitive at low speed"). Take this literally.
- Does not want flattery or agreement-for-agreement's-sake. Push back with evidence when you disagree.
- Has ADHD. Prefers: short summaries up front, prioritized task lists, clear next-action framing. Avoid overwhelming walls of text.
- Confidence calibration required: if you're not certain of something, say so with a rough confidence percentage and your reasoning.
- Never fabricate. If you don't know, say you don't know and propose how to find out.

## Deployment

Live on GitHub Pages from the `main` branch, root folder. Any push to `main` auto-deploys within ~60 seconds. There is no staging environment. Test locally before pushing — `index.html` can be opened directly in a browser, no server needed, though a local server (`python -m http.server` or VS Code Live Server) avoids some cache weirdness during iteration.

## Git workflow

Single-developer project. Commit directly to `main` for small cosmetic/tuning changes. For larger refactors (like the module split) or anything that touches physics constants, create a feature branch, verify gameplay behavior, then merge.

## When in doubt

Ask Joe. He'd rather answer a clarifying question than get a wrong-direction implementation that has to be undone.

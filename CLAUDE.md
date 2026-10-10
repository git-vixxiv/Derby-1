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
- `js/arena.js` — arena layouts (outer wall polygon, round obstacles, start slots), `collideCarWithArena`, `arenaClearance` (AI), arena picker
- `js/weather.js` — mild weather (clear / overcast / light rain −8% grip), rain drawing, menu settings
- `js/garage.js` — player car choice (model/paint/number), persistence, garage preview
- `js/championship.js` — tournament flow, simulated field damage, round-end overlays
- `js/game.js` — initGame (Quick Derby field), placeField (any field, keeps damage), generateStartPositions, startGame, nextLevel, startCountdown
- `js/mobile.js` — tilt + touch-pad steering, permission, steering setting, fullscreen
- `js/main.js` — global state, controls, gameLoop, event listeners, bootstrap

All JS uses classic `<script>` tags loaded in dependency order — no build step, no ES modules. Functions and `let`/`const` declarations remain global so inline `onclick="startGame()"` handlers in `index.html` continue to work. Open `index.html` directly in a browser, or use `python -m http.server` to avoid file:// quirks. Deployed and playable.

**Features shipped:**
- Front-axle steering physics with realistic pivot behavior
- Oriented Bounding Box (OBB / SAT) collision detection
- Momentum-based collision response with angular impulse. Impulse goes into drive speed along the direction of travel (a rammer is stopped by the hit) and the rest into knockback. v10 fixed an inverted approach test that made head-on rams deal no damage.
- Braking and launching in mud (v10.6, Joe): pedal opposite to travel = brakes; the wheels lock, the car slides with little steering (half-second full-lock turn: 12° braking vs 49° on the gas). Launching from rest or changing direction starts with wheelspin (mud spray) and builds traction. Full forward → full reverse: 3.2 s (was 1.6 s).
- Mud traction: direction of travel (`moveAngle`) lags heading, so cars slide through turns; less grip at speed and with damage. Front damage pulls steering toward the hit side and adds wheel wobble.
- Per-zone damage (front/side/rear) with separate HP pools. Two measures: **condition** (zone damage ÷ pool, capped at 100%) drives visuals and handling — front kills steering (to 5–15%) and some power, rear kills speed/acceleration, side a bit of both. **Life** (`getLifeUsed`) keeps counting past 100%: out when front/(pool×3.5) + side/(pool×4.5) + rear/(pool×4) ≥ 1 (`CAR_LIFE` in config). At 75% ram speed: 6 front, 10 side or 14 rear hits. Health bar above cars shows life; HUD zone bars show condition. Fire only when life < 25%.
- Visual damage accumulation — per-car deformation profile (`car.deform`): body outline caves in where hit, persistent creases, buckled hood, broken lamps, bent bumpers, grime; plus scratches/dents in car-local space
- Particle systems: sparks, debris, paint chips, smoke, fire
- Synthesized audio (no files): 12 pre-rendered crash buffers (3 weight classes × 4 variations) built from noise only — body thud, broadband crunch, crunch driven through a resonant filter bank for the steel-panel clang, debris ticks, hard saturation. Stereo-panned, volume scales with impact. Metal scrape loop for sustained contact. V8 engine loop of unpitched exhaust pops (pitch comes from firing rate only), rev at the line during countdown, muffled field-engine bed. Master compressor. `M` to mute (localStorage key `demolitionDerbyMuted`). **Avoid short tonal components** (damped sines, pitch sweeps): Joe heard them as water splashes and a horn.
- AI opponents with state machine: scanning, approaching, positioning, charging, retreating, unsticking
- **30-second hit rule** (Joe, v10.5): every car must *initiate* contact with a live car within 30 s or it's out. Only the car driving into the other (approach speed > `CONTACT_INITIATE_SPEED` 0.6) gets credit; taking a hit doesn't reset the clock, and hitting a dead car doesn't count. Head-ons credit both. HUD shows the player's hit clock at all times (gray → orange ≤15 s → red ≤5 s). AI goes on the attack at 40% of the clock (12 s).
- Cars start around arena perimeter facing outward (authentic derby start)
- Keyboard controls (desktop). Phones (`js/mobile.js`): **tilt steering** (hold the phone like a wheel; gravity direction in the screen plane vs. a neutral captured during the countdown; 30° = full lock, 2° deadzone; orientation-independent and iPhone/Android sign-agnostic; iPhone needs a tap + permission prompt, requested from the Start buttons or the Steering menu setting) or a **drag-to-steer touch pad** (70 px = full lock). Both are analog: `updateCarPhysics(..., analogSteer)` moves the wheel toward the target at the normal steer rate. Landscape layout: arena full height center, REV left / GAS right (tilt) or pad left / REV+GAS right (touch). Portrait: steering area + REV + GAS under the arena. Menus go fullscreen and scroll on phones. Android goes fullscreen on Start.
- Health bars above active cars
- Floating damage popup numbers
- **No power-ups or track pickups.** Joe's rule: nothing may hand out an advantage or disadvantage during an event (removed v10.2).
- Garage (`js/garage.js`): player picks model, paint (16), number color (8) and number (00–99). Saved in localStorage (`demolitionDerbyCarV1`) and used for every event until changed. First visit routes through the garage.
- Championship (`js/championship.js`): 12-car heat → last 6 running advance (50%, Joe v10.4) → semi-final (your 6 + 6 from a simulated heat, carrying simulated damage) → last 6 advance → final (your 6 + 6 from a simulated semi) → last car running wins. No repairs between rounds. Elimination shows placement.
- Quick Derby: endless rounds with increasing car counts (8 + 2×level, capped at 14)
- Arenas (`js/arena.js`): County Fairgrounds (original rectangle), Speedway Oval, Figure 8 (two loops, tire-ringed grass islands, crossover in the middle). Menu picker, or random each round. Walls are generic polygons + round obstacles; AI avoids walls with look-ahead probes. Mud tracks are visual only.
- Weather (`js/weather.js`): Clear / Overcast / Light rain (−8% grip, same for every car), menu picker or random. Default Clear.
- Per-model car stats (weight, acceleration, top speed, front/rear strength) — first pass, see roster below
- High score persistence via localStorage (key: `demolitionDerbyHighScoreV9`)

## Physics constants — current tuning (v10)

These were tuned iteratively with Joe providing direct feedback. v9/v10 are significantly faster and grippier than earlier versions; do not revert toward older values without explicit approval. Any change to these requires testing and approval.

```javascript
BASE_ACCELERATION: 0.05         // v10.6: was 0.08 (Joe: too quick). 90% top speed in 2.1 s
MAX_FORWARD_SPEED: 5.4          // v10.7: -10% (Joe). v10 cut 9 -> 6
MAX_REVERSE_SPEED: 5.4          // same as forward when healthy
COAST_DRAG: 0.99                // v10.6 coasting: v = v*0.99 - 0.025 (2.0 s to stop from full)
COAST_DECEL: 0.025              //   (replaced ROLLING_FRICTION*MUD_DRAG, which out-stopped the brakes)
BRAKE_DECEL: 0.09               // v10.6: was 2.5x accel. Full speed to stop: 1.1 s, 193 px slide
LOCKED_STEER: 0.35              // steering authority while braking (wheels locked)
LOCKED_GRIP: 0.4                // grip multiplier while braking: the car slides
WHEELSPIN_LAUNCH: 0.7           // drive lost at launch from rest / direction change
WHEELSPIN_RECOVERY: 0.016       // per frame (~0.75 s to full traction; slower in rain)
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
CONTACT_TIMEOUT: 30 * 60        // 30 s to initiate a hit (v10.5; was 45 s, any contact)
CAR_SCALE: 1.2
```

Tuned outside `PHYSICS` (in code, with history comments):

- Post-impact velocity decay: `0.75` per frame (`physics.js`). Was 0.94, then 0.85.
- Speed-bonus damage: `pow(speed - 2, 1.9) * 5` (`collision.js`), on the old top-speed-9 scale: all damage and crash-sound speeds are multiplied by `DAMAGE_SPEED_SCALE = 9 / MAX_FORWARD_SPEED` so a full-speed hit still does what it did at top speed 9. Measured: 90%-speed rear ram into a door = 165 side damage.
- Wall damage: `impactSpeed * 3 * zoneMultiplier`, where impactSpeed is the velocity component into the wall (drive + slide + knockback) (`physics.js`, `WALL_DAMAGE_PER_SPEED`). The zone is the part of the car that hits the wall (front 1.4×, side 0.8×, rear 0.5×, divided by model strength), not which wall was hit.

## Car roster (v10.1)

Each model is a specific generation drawn to real proportions (length = real inches × 0.3, width = inches × 0.36, before CAR_SCALE), with model-specific details from `style` in `CAR_TYPES` (corner radius, nose/tail bow, windshield/back-glass rake, wheel positions, lamp styles, features). Joe's priority: **cars must be visually recognizable as the real car**; stats stay nearly equal.

Stats: every car totals 5.00. One +0.04 edge, one −0.04 weakness (Delta 88 is even). `frontStrength`/`rearStrength` divide incoming zone damage; `weight` is collision mass.

| Model | Generation | Top-down features | Edge (+0.04) | Weakness (−0.04) |
|---|---|---|---|---|
| Crown Vic | '98–'11 Police Interceptor | rounded aero body, white roof, A-pillar spotlight, push bar | top speed | weight |
| Town Car | '90–'97 | long hood, formal roof, hood ornament, chrome spear | weight | acceleration |
| Impala | '65–'70 | fastback roof, triple round taillights, hood crease, coke-bottle | acceleration | front strength |
| Imperial | '64–'66 | longest, razor-edge fenders, spare-tire trunk hump | front strength | top speed |
| Wagon | Country Squire '79–'91 | long roof, woodgrain sides + tailgate, roof rack | rear strength | acceleration |
| LeSabre | '92–'99 | shortest, rounded, full-width taillight bar | acceleration | weight |
| DeVille | Sedan DeVille '77–'84 | half vinyl landau roof, wreath ornament, fender-tip taillights | weight | top speed |
| Delta 88 | '77–'85 | boxy, full vinyl roof, wraparound taillights, bumper guards | — | — |

Sizes differ with the real cars (LeSabre 60.0 to Imperial 68.1 base length), so hitboxes differ by up to ±7%.

## File structure

The module split is complete (see "Current state" above for the file list). When editing physics, AI, or rendering, look in the matching module rather than the inline `<script>` block. The inline `<script>` block no longer exists.

If you add a new module, append a `<script src="js/your-module.js"></script>` line to `index.html` in dependency order (most modules can go anywhere; `main.js` must be last because it calls `gameLoop()` at the end and depends on every other module being loaded).

## Roadmap (not prioritized — discuss before starting)

- ~~Split monolithic `index.html` into modules~~ — done in `refactor/module-split` branch
- ~~Differentiated car stats~~ — first pass shipped in v10, tuning pending
- Weather effects (rain, mud, reduced visibility)
- Championship mode (multi-round tournament with persistent damage between rounds)
- ~~Championship mode~~ — shipped v10.2 (3-round tournament)
- ~~Car selection screen~~ — shipped v10.2 (garage)
- ~~Different arenas~~ — shipped v10.3 (Fairgrounds, Oval, Figure 8 as a derby arena). Open question for Joe: should Figure 8 be an actual lap race?
- ~~Mild weather~~ — shipped v10.3
- ~~Power-ups~~ — rejected by Joe: no in-event advantages or track pickups
- ~~Online leaderboards~~ — not wanted for now

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

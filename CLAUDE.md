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

## Current state (v11)

Modular build:
- `index.html` (~131 lines) — HTML structure + ordered `<script>` tags
- `css/styles.css`
- `js/config.js` — ARENA_*, WALL_THICKNESS, CAR_SCALE, CONTACT_TIMEOUT, PHYSICS, CAR_TYPES
- `js/math.js` — vector math, hsl, dist, normAngle, clamp, formatTime, getUniqueNumber/Color
- `js/audio.js` — master bus + compressor, recorded sounds loaded from `sounds/` (engine loop, layered crashes) with the synthesized versions as fallback, metal scrape, mute toggle
- `sounds/` — recorded sound files + `README.md` (what each is, how to replace) + `CREDITS.md`; `sound-test.html` at the root auditions them
- `images/` — `splash.jpg` (title-screen art from Joe: night stadium, pink #69 sedan; 1920 px wide, 453 KB, resized from his upload) + `README.md`
- `js/car.js` — geometry, createCar, damage % helpers, modifiers (speed/accel/steer)
- `js/collision.js` — SAT detection, OBB checks, resolveCollision, applyDamage, getZoneDamageMultiplier, spawnDamagePopup
- `js/physics.js` — updateCarPhysics
- `js/ai.js` — updateAI (states: scanning → attacking → retreating, plus unsticking), aiPickAttack (target + which end to ram with), aiWreckInPath
- `js/particles.js` — spawnSparks/Debris/PaintChips/Smoke
- `js/rendering.js` — drawCar, drawArena, drawPowerUp, drawCountdown, drawHealthBar
- `js/hud.js` — showOverlay, updateHUD, updateHighScoreDisplay
- `js/arena.js` — arena layouts (outer wall polygon, round obstacles, start slots), `collideCarWithArena`, `arenaClearance` (AI), arena picker
- `js/weather.js` — mild weather (clear / overcast / light rain −8% grip), rain drawing, menu settings
- `js/garage.js` — player car choice (model/paint/number), persistence, garage preview
- `js/championship.js` — tournament flow, simulated field damage, round-end overlays
- `js/game.js` — initGame (Quick Derby field), placeField (any field, keeps damage), generateStartPositions, startGame, nextLevel, startCountdown
- `js/mobile.js` — tilt + touch-pad steering, permission, steering setting, fullscreen
- `js/main.js` — global state, controls, fixed-timestep gameLoop (`updateGame` = one 1/60 s step with no drawing, `renderGame`), pause, flagman announcements, `retireCar`, event listeners, bootstrap

All JS uses classic `<script>` tags loaded in dependency order — no build step, no ES modules. Functions and `let`/`const` declarations remain global so inline `onclick="startGame()"` handlers in `index.html` continue to work. Open `index.html` directly in a browser, or use `python -m http.server` to avoid file:// quirks. Deployed and playable.

**Features shipped:**
- Front-axle steering physics with realistic pivot behavior
- Oriented Bounding Box (OBB / SAT) collision detection
- **Fixed 60 Hz timestep** (v11). Logic advances 60 steps/s on any display; rendering is capped at 60 fps. Before v11 it ran one step per screen refresh, so a 120 Hz screen played at double speed and low-power phones at half speed. `updateGame()` does no drawing, so tests can run thousands of steps flat out (override `requestAnimationFrame`, call `updateGame()` in a loop).
- Momentum-based collision response with angular impulse. Impulse goes into drive speed along the direction of travel (a rammer is stopped by the hit) and the rest into knockback. v10 fixed an inverted approach test that made head-on rams deal no damage.
- **Mud handling (v11, Joe).** Real-world scale: 1 ft = 4.32 px, 1 mph = 0.1056 px/step (`PX_PER_FOOT`, `SPEED_PER_MPH`); use these to talk tuning with Joe in mph and feet.
  - Top speed 4.0 px/step ≈ 38 mph at scale (a real mud derby is ~25).
  - Acceleration tapers toward top speed and starts with wheelspin: 50% speed in 1.7 s, 90% in 3.5 s / 404 px.
  - Brakes lock the wheels and the car slides: 2.4 s / 263 px (3.4 car lengths) from top speed; coasting takes 3.8 s / 416 px. Full forward → full reverse: 5.8 s. While braking the path can barely be steered (12° in 1 s).
  - Sideways grip is capped (`LATERAL_GRIP`), so the tightest turn widens with speed²: full steering up to ~55% of top speed, then the car plows wide with the nose swung in (a slide). From top speed on full lock the path turns 32° in the first second (was 77°) and a U-turn is 389 px wide (was 199). You have to slow down to turn.
  - Cornering drag is an absolute deceleration that fades to zero at a crawl, so a hard turn can't out-brake the brakes and a damaged engine can still pull away on full lock.
  - A wall takes away only the part of the car's motion pointing into it: square-on stops the car, a glancing touch scrapes along. (Before v11 any wall touch cut speed 90%, which could pin a car lying along a wall.)
- Mud traction: direction of travel (`moveAngle`) lags heading; less grip at speed, with damage and in rain. Front damage pulls steering toward the hit side and adds wheel wobble.
- **Damage model (v11): both cars take every hit.** Energy = `DAMAGE.HIT_AT_TOP_SPEED` (260) × (closing speed at the contact point ÷ top speed)², capped at 0.7×. Each car takes energy × its own zone multiplier (front 1.4, side 0.8, rear 0.5, ÷ model strength) × weight share. So a tail-first ram costs the rammer 0.5 while the door it hits takes 0.8 (an engine 1.4); a nose-first ram costs the rammer 1.4. **This is the engine-protection loop (design principle 2); before v11 the rammer took almost nothing either way.** Glancing contact does little (only the closing component counts). Walls: same formula × 0.3. Worst single hit: 29% of life (engine), 14% (door), 9% (tail). Typical solid hit at ~55% closing speed: 12% / 6% / 4%.
- Per-zone damage (front/side/rear) with separate HP pools. Two measures: **condition** (zone damage ÷ pool, capped at 100%) drives visuals and handling — front kills steering (to 5–15%) and some power, rear kills speed/acceleration, side a bit of both. **Life** (`getLifeUsed`) keeps counting past 100%: out when front/(pool×2.2) + side/(pool×2.8) + rear/(pool×3.0) ≥ 1 (`CAR_LIFE` in config; lowered in v11 together with the new damage model). Acceleration never drops below 35% (was 20%) so a crippled car can still crawl to a hit. Health bar above cars shows life; HUD zone bars show condition. Fire only when life < 25%.
- Visual damage accumulation — per-car deformation profile (`car.deform`): body outline caves in where hit, persistent creases, buckled hood, broken lamps, bent bumpers, grime; plus scratches/dents in car-local space
- Particle systems: sparks, debris, paint chips, smoke, fire
- **Audio (v11.1): recordings first, synthesis as fallback.** Joe judged both synthesized attempts fake. `SOUND_FILES` in `audio.js` lists files in `sounds/` per slot (engine / thud / hit / debris / glass); any slot that loads replaces the synthesized sound. Crashes are layered: light = one `hit`; medium adds `thud` and delayed `debris`; heavy adds a second `hit` and `glass`, all pitched lower. Engine: one recorded idle loop pitched 0.85×–2× with revs (a recording can't be pitched as far as the synth). Current files are CC0 from OpenGameArt (see `sounds/CREDITS.md`) and are foley and a phone-recorded idle, not real derby recordings. **Joe's verdict (2026-11-22): the engine sounds are great, so leave the engine loop and its pitch range alone; the crash sounds are undecided, so don't change them until he says what is off** (`sound-test.html` plays each layer on its own). Claude cannot hear: never claim a sound is good, measure what can be measured and let Joe judge. Recordings only load over http(s), so `file://` runs use the synth. Synth notes: avoid short tonal components (Joe heard them as water splashes and a horn). `M` mutes (localStorage `demolitionDerbyMuted`).
- AI opponents (`js/ai.js`, rewritten v11). Each driver picks a live car and which end to ram with (everyone leans toward the tail; more so with engine damage), drives at it leading its motion, slows down for corrections the mud won't allow at speed, brakes for walls using its real stopping distance, goes round wrecks, backs off 130–290 px for a run-up after each hit, and K-turns away from a wall instead of pushing into it. No bias toward the player (the old +80 targeting bonus is gone: Joe's no-advantage rule). **v11 fixed the old AI steering backwards in reverse: tail-first rammers (55% of the field) landed 0 hits/min; all drivers now land ~9/min on a parked car.** Known weak spot: Figure 8, where ~1.5 healthy cars per round still time out behind the islands.
- Round pacing with 12 AI cars (measured, fast sim): heat (6 left) ≈ 107 s Fairgrounds / 116 s Oval / 92 s Figure 8; last car standing ≈ 175 s. First car out typically 20–40 s. About 60% of eliminations are wrecks and 40% are crippled cars timed out by the hit clock, none healthy on Fairgrounds/Oval.
- **30-second hit rule** (Joe, v10.5): every car must *initiate* contact with a live car within 30 s or it's out. Only the car driving into the other gets credit; taking a hit doesn't reset the clock, and hitting a dead car doesn't count. Head-ons credit both. HUD shows the player's hit clock at all times (gray → orange ≤15 s → red ≤5 s). Approach speed threshold is `CONTACT_INITIATE_SPEED` 0.45 since v11. AI drops everything to go hit someone at 40% of the clock (12 s).
- Cars start around arena perimeter facing outward (authentic derby start)
- Keyboard controls (desktop). Phones (`js/mobile.js`): **tilt steering** (hold the phone like a wheel; gravity direction in the screen plane vs. a neutral captured during the countdown; 30° = full lock, 2° deadzone; orientation-independent and iPhone/Android sign-agnostic; iPhone needs a tap + permission prompt, requested from the Start buttons or the Steering menu setting) or a **drag-to-steer touch pad** (70 px = full lock). Both are analog: `updateCarPhysics(..., analogSteer)` moves the wheel toward the target at the normal steer rate. Landscape layout: arena full height center, REV left / GAS right (tilt) or pad left / REV+GAS right (touch). Portrait: steering area + REV + GAS under the arena. Menus go fullscreen and scroll on phones. Android goes fullscreen on Start.
- **No score, no health bars, no damage numbers (Joe, v11.1): survival only.** A car's state shows in its bodywork, smoke and fire. The player's own status is on the HUD: FRONT / SIDE / REAR condition bars plus "LEFT IN THE CAR" (life). A small orange marker sits over the player's car. A flagman line at the top of the arena calls who is out and why, and door warnings (`announce`). End screens show placing ("finished 4th of 11") and time lasted.
- **Driver's-door rule (v11.1).** The driver's door (left side of the cabin, painted white, or orange on light cars) must not be hit. A door hit never counts toward the hit clock. One harder than `DOOR_RULE.MIN_CLOSING` (0.2 of top speed) is called against the car that drove into it: first is a warning, second puts that car out (`HITS_ALLOWED: 2`, per round). Same for the player and the AI; AI drivers aim for the fender or rear quarter when coming at a car's left side and draw ~1–3 warnings per round, with ~0.2 cars per round flagged out.
- Pause: `P` or `Esc`, the II button on the HUD, or automatically when the tab is hidden. Resume or quit to menu.
- Title screen styled after Joe's mockup: full-window splash, riveted metal menu panel left, how-to-play clipboard right, real buttons on top of `images/splash.jpg`.
- **No power-ups or track pickups.** Joe's rule: nothing may hand out an advantage or disadvantage during an event (removed v10.2).
- Garage (`js/garage.js`): player picks model, paint (16), number color (8) and number (00–99). Saved in localStorage (`demolitionDerbyCarV1`) and used for every event until changed. First visit routes through the garage.
- Championship (`js/championship.js`): 12-car heat → last 6 running advance (50%, Joe v10.4) → semi-final (your 6 + 6 from a simulated heat, carrying simulated damage) → last 6 advance → final (your 6 + 6 from a simulated semi) → last car running wins. No repairs between rounds. Elimination shows placement.
- Quick Derby: endless rounds with increasing car counts (8 + 2×level, capped at 14)
- Arenas (`js/arena.js`): County Fairgrounds (original rectangle), Speedway Oval, Figure 8 (two loops, tire-ringed grass islands, crossover in the middle). Menu picker, or random each round. Walls are generic polygons + round obstacles; AI avoids walls with look-ahead probes. Mud tracks are visual only.
- Weather (`js/weather.js`): Clear / Overcast / Light rain (−8% grip, same for every car), menu picker or random. Default Clear.
- Per-model car stats (weight, acceleration, top speed, front/rear strength) — first pass, see roster below

## Physics constants — current tuning (v11)

Tuned iteratively with Joe. He has asked for slower and muddier four times running (top speed 9 → 6 → 5.4 → 4.0); do not make the cars faster, grippier or quicker to stop without his say-so. Any change here needs measuring (see "How to test") and his approval.

```javascript
MAX_FORWARD_SPEED: 4.0          // ~38 mph at scale. History: 9 -> 6 -> 5.4 -> 4.0
MAX_REVERSE_SPEED: 4.0          // same as forward when healthy
BASE_ACCELERATION: 0.03         // at a standstill. History: 0.04 -> 0.08 -> 0.05 -> 0.03
ACCEL_TAPER: 0.7                // pull lost by top speed (30% left)
COAST_DRAG: 0.998               // coasting: v = v*0.998 - 0.014 per step
COAST_DECEL: 0.014
BRAKE_DECEL: 0.011              // added to coasting drag while braking (wheels locked)
LOCKED_STEER: 0.35              // steering authority while braking
LOCKED_GRIP: 0.4                // sideways grip left while braking
WHEELSPIN_LAUNCH: 0.7           // drive lost launching from rest (less if already rolling)
WHEELSPIN_RECOVERY: 0.012       // per step (~1 s to full traction; slower in rain)
LATERAL_GRIP: 0.05              // max sideways acceleration, px/step^2 (path curvature cap)
YAW_OVER_GRIP: 1.35             // how much faster than the path the nose may swing (the slide)
TURN_DRAG: 0.012                // decel at full lock from half speed up (fades to 0 at a crawl)
SLIDE_DRAG: 0.03                // decel sliding fully sideways
MAX_STEER_ANGLE: 0.42
STEER_SPEED: 0.04
STEER_RETURN_SPEED: 0.08
MIN_SPEED_TO_TURN: 0.15         // steering only works while moving
SLIDE_FRICTION: 0.85
ANGULAR_FRICTION: 0.82
MUD_GRIP: 0.11                  // travel direction chases heading at this rate/step (below the grip cap)
GRIP_LOSS_AT_TOP_SPEED: 0.45
GRIP_LOSS_FROM_DAMAGE: 0.4
DAMAGE_PULL_MAX: 0.07           // steering pull (rad) at 100% front damage
DAMAGE_WOBBLE_MAX: 0.08
RESTITUTION: 0.35
COLLISION_BIAS: 0.3
ANGULAR_IMPULSE_SCALE: 0.012
CONTACT_TIMEOUT: 30 * 60        // 30 s to initiate a hit
CONTACT_INITIATE_SPEED: 0.45    // approach speed needed for hit credit (~4 mph)
CAR_SCALE: 1.2
DAMAGE: { HIT_AT_TOP_SPEED: 260, MAX_ENERGY: 0.7, WALL_FACTOR: 0.3 }
DOOR_RULE: { HITS_ALLOWED: 2, MIN_CLOSING: 0.2, LENGTH: 17, FROM_WINDSHIELD: 5 }
CAR_LIFE: { FRONT: 2.2, SIDE: 2.8, REAR: 3.0 }
```

Tuned outside config (in code, with history comments):

- Post-impact knockback decay: `0.75` per step (`physics.js`). Was 0.94, then 0.85.
- `DAMAGE_SPEED_SCALE = 9 / MAX_FORWARD_SPEED` now only scales crash-sound and scrape loudness.

## How to test (no test suite; these are the checks that caught real bugs)

All run in headless Chromium via Playwright against `index.html`.
- **Fast round simulation:** replace `requestAnimationFrame` with a no-op in an init script, build a field with `placeField`, give the player's car an `ai` object and wrap `updateCarPhysics` so `updateAI` drives it, then call `updateGame()` in a loop. A 3-minute 12-car round runs in under a second. Measure: seconds until 6 are left, wrecks vs clock disqualifications, and whether disqualified cars were crippled (`getSteerModifier` < 0.35 or `getAccelerationModifier` < 0.45) or healthy. Healthy disqualifications mean an AI bug.
- **Handling numbers:** one car in open space, stepped with `updateCarPhysics`: time/distance to 50% and 90% speed, braking and coasting distance from top speed, degrees the path turns in 1 s at full lock, U-turn width. Report them to Joe in seconds, px, car lengths and mph.
- **AI aim test:** one AI car and one parked target for 60 s, 12 seeds, for both `preferReverse` values: every trial must land hits.
- **Refresh-rate test:** drive `requestAnimationFrame` callbacks by hand at 30/60/120/144 Hz and confirm the countdown takes 6 s and the same distance is covered.
- After any physics change, also run a damaged car (accel modifier at its floor) on full lock and confirm it can still pull away.

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
- v11.1 shipped Joe's calls: driver's-door rule, no scoring, recorded sounds, no damage numbers or health bars, pause.
- Waiting on Joe: his verdict on the crash sounds (engine approved 2026-11-22); better crash recordings if he can get real derby audio (see `sounds/README.md`).

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

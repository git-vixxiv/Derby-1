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

## Current state (v9, post-refactor)

Modular build:
- `index.html` (~131 lines) — HTML structure + ordered `<script>` tags
- `css/styles.css`
- `js/config.js` — ARENA_*, WALL_THICKNESS, CAR_SCALE, CONTACT_TIMEOUT, PHYSICS, CAR_TYPES
- `js/math.js` — vector math, hsl, dist, normAngle, clamp, formatTime, getUniqueNumber/Color
- `js/audio.js` — initAudio, crash buffer synthesis, engine sound, muteEngine
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
- Momentum-based collision response with angular impulse
- Per-zone damage (front/side/rear) with separate HP pools
- Visual damage accumulation — persistent scratches and dents in car-local space
- Particle systems: sparks, debris, paint chips, smoke, fire
- 5-layer procedural crash sound system (instant playback via pre-computed buffers)
- Engine sound responsive to speed and throttle
- AI opponents with state machine: scanning, approaching, positioning, charging, retreating, unsticking
- 45-second contact timer — must hit someone every 45s or you're disqualified
- Cars start around arena perimeter facing outward (authentic derby start)
- Mobile touch controls + keyboard controls
- Health bars above active cars
- Floating damage popup numbers
- Power-ups: wrench (repair) and boost
- Multiple rounds with increasing car counts (8 + 2×level, capped at 14)
- Mud tracks, arena environment
- High score persistence via localStorage (key: `demolitionDerbyHighScoreV9`)

## Physics constants — current tuning (v9)

These were tuned iteratively with Joe providing direct feedback. v9 is significantly faster and grippier than earlier versions; do not revert toward older values without explicit approval. Any change to these requires testing and approval.

```javascript
BASE_ACCELERATION: 0.04
MAX_FORWARD_SPEED: 9
MAX_REVERSE_SPEED: 9            // same as forward when healthy
ROLLING_FRICTION: 0.975
MUD_DRAG: 0.965
MAX_STEER_ANGLE: 0.42
STEER_SPEED: 0.055
STEER_RETURN_SPEED: 0.08
MIN_SPEED_TO_TURN: 0.15         // steering only works while moving
SLIDE_FRICTION: 0.72
ANGULAR_FRICTION: 0.82
RESTITUTION: 0.35
COLLISION_BIAS: 0.3
ANGULAR_IMPULSE_SCALE: 0.012
CONTACT_TIMEOUT: 45 * 60        // 45 seconds at 60fps
CAR_SCALE: 1.2
```

## Car roster (all stats currently identical — cosmetic-only differences)

Crown Vic, Town Car, Impala, Imperial, Wagon, LeSabre, DeVille, Delta 88. All eight have `frontStrength: 1.0, rearStrength: 1.0, weight: 1.0, acceleration: 1.0, topSpeed: 1.0`. Only visual proportions (hood/trunk/cabin lengths) and body style (sedan vs wagon) vary. Differentiating these stats is a reasonable future direction but must be approved first — it would shift the game's balance.

## File structure

The module split is complete (see "Current state" above for the file list). When editing physics, AI, or rendering, look in the matching module rather than the inline `<script>` block. The inline `<script>` block no longer exists.

If you add a new module, append a `<script src="js/your-module.js"></script>` line to `index.html` in dependency order (most modules can go anywhere; `main.js` must be last because it calls `gameLoop()` at the end and depends on every other module being loaded).

## Roadmap (not prioritized — discuss before starting)

- ~~Split monolithic `index.html` into modules~~ — done in `refactor/module-split` branch
- Differentiated car stats (weight, acceleration, durability per model)
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

## Game Studios template (added 2026-09-27)

This repo now carries the Claude-Code-Game-Studios agent framework (49 agents, 74 skills, hooks) from https://github.com/Donchitos/Claude-Code-Game-Studios, on branch `studio/game-studios-template`, for evaluation.

- **The briefing above still governs.** Where the template's guidance conflicts with the design principles in this file, this file wins.
- The template assumes Godot, Unity or Unreal. **Demo Derby is vanilla HTML5 Canvas + JavaScript with no engine**, so engine-specialist agents do not apply, and skills that resolve a code root (`src/`, `Assets/`, `Source/`) will report "unresolved" rather than scan `js/`. Start with `/start` (choose "existing work") and `/adopt`.
- The template's own orientation file: @.claude/docs/game-studios-CLAUDE.md

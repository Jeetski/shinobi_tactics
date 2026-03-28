# Tutorial Refactor Notes

This project is still in the stage where the tutorial is revealing mechanics bit by bit, and those mechanics are still changing. Because of that, some hardcoding inside the Naruto academy tutorial is acceptable for now.

That is not a contradiction with the engine direction. It just means:

- tutorial content can stay concrete and scripted for now
- engine-facing patterns should still be identified early
- refactors should happen when mechanics stabilize, not before

## Current Reality

The main concentration of hardcoded flow is:

- [src/naruto_story/naruto_story.tsx](C:/Users/david/Desktop/Hivemind%20Studio/Shinobi%20Tactics/src/naruto_story/naruto_story.tsx)

That file currently owns several responsibilities at once:

- story/tutorial sequencing
- movement execution
- throw/shuriken execution
- jutsu chain execution
- challenge logic
- temporary character visual overrides
- a lot of cue timing for music, sfx, and vox

At this stage, that is acceptable because the tutorial is still acting as the experimental surface where the game language is being discovered.

## Hardcoded Things That Are Fine For Now

These are content-level and do not need urgent abstraction:

- Naruto and Iruka specific dialogue
- exact tutorial coordinates and targets
- exact order of lessons
- exact VOX trigger timing for jokes, reactions, and teaching beats
- Sexy Jutsu / Clone Jutsu / Substitution tutorial staging
- stage-specific props and their use in the lesson flow

These belong to the current Naruto content layer anyway.

## Things That Should Eventually Become Engine Modules

These are the main candidates for future extraction once the mechanics feel stable:

### 1. Movement Action System

Current issue:

- walk, run, jump, teleport, path preview, and movement timing are still scene-owned

Future module should handle:

- path selection
- movement verb execution
- timing and travel style
- facing updates
- completion callbacks/events

### 2. Ranged / Projectile Action System

Current issue:

- shuriken preview, throw execution, stuck projectiles, and hit feedback are tied to the tutorial scene

Future module should handle:

- projectile spawn
- travel along path or direct line
- hit resolution hooks
- lodged/stuck visual outcomes
- reusable preview rules

### 3. Jutsu / Ability Chain Execution

Current issue:

- clone, substitution, transformation, and sexy jutsu are all manually scripted in one scene file

Future module should handle:

- queued actions
- readiness/validation
- execution steps
- reusable cast effects
- reusable resolve/fail/success hooks

### 4. Objective / Challenge Framework

Current issue:

- countdowns, retries, round logic, target assignment, and completion checks are scene-hardcoded

Future module should handle:

- objective states
- timed challenge rules
- retries/reset
- success/failure handling
- reusable target-selection constraints

### 5. Character Presentation State

Current issue:

- temporary pose overrides
- reaction poses
- hidden/replaced character states
- twitching / stunned reactions

Future module should handle:

- temporary visual states
- pose overrides
- transformed states
- reaction animation overlays
- state cleanup rules

### 6. Dialogue Condition / Trigger Registry

Current issue:

- the `wait` system is reusable, but most fulfillment logic still lives directly in scene code

Future module should handle:

- named trigger registration
- reusable condition handlers
- event-driven fulfill paths
- less direct scene imperative wiring

## Refactor Priority

Do not refactor all of this immediately.

Best order later:

1. movement executor
2. projectile / ranged executor
3. jutsu / action-chain executor
4. objective / challenge system
5. character visual state system

## Current Recommendation

Keep moving forward with the tutorial and mechanic discovery first.

Refactor when:

- a mechanic stops changing frequently
- the same pattern is needed in more than one scene
- the story scene starts slowing implementation instead of accelerating it

That keeps the engine/content separation honest without turning early prototyping into architecture theater.

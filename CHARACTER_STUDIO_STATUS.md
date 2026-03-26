# Character Studio Status

This document is the handoff point for the new character studio. It records:

- the major design decisions already made
- what is actually implemented today
- what is still missing
- the intended resume order later

This is deliberately separate from the thread history so the studio can be resumed without reconstructing old planning messages.

## Core Decisions Already Made

These are treated as settled unless we explicitly change them later.

- The character tool is a proper studio, not a one-file toy.
- The studio UI is React-based.
- The studio should feel like a dense desktop authoring tool, not a wizard.
- The studio should use icons for tool and panel chrome like a real art/animation tool.
- Panels are independent, scrollable, resizable, and mostly collapsible.
- The main canvas and live preview remain the center of the workspace.
- The canonical art space is a shared `64x64` pixel canvas.
- The character authoring source of truth is editor YAML, not imported PNG files.
- PNG import is for underlay/reference/tracing, not the canonical authored source.
- Editor YAML and runtime YAML are separate outputs.
- Default authored directions are `front`, `back`, `left`, `right`.
- Default base pose is `t_pose`.
- Expressions are primarily template-based pixel swaps.
- Expressions may optionally use tiny procedural offsets for polish.
- Animation is rig-driven and frame-based.
- Animation composition should work through named body-region channels with explicit priority.
- The system should support combinations like locomotion plus hand signs.
- Shared assets should support reuse plus local shadow overrides.
- The wider repo is an engine/framework/pipeline, not Naruto-locked engine code.

## Current Implementation Snapshot

The new studio exists and is usable, but it is still a partial implementation of the original plan.

Primary entry points:

- [character-designer.html](C:/Users/david/Desktop/Hivemind%20Studio/Shinobi%20Tactics/character-designer.html)
- [studio_app.jsx](C:/Users/david/Desktop/Hivemind%20Studio/Shinobi%20Tactics/tools/character_designer/react/studio_app.jsx)
- [studio.css](C:/Users/david/Desktop/Hivemind%20Studio/Shinobi%20Tactics/tools/character_designer/styles/studio.css)

Supporting data/render/io files:

- [constants.js](C:/Users/david/Desktop/Hivemind%20Studio/Shinobi%20Tactics/tools/character_designer/scripts/data/constants.js)
- [defaults.js](C:/Users/david/Desktop/Hivemind%20Studio/Shinobi%20Tactics/tools/character_designer/scripts/data/defaults.js)
- [validation.js](C:/Users/david/Desktop/Hivemind%20Studio/Shinobi%20Tactics/tools/character_designer/scripts/data/validation.js)
- [yaml_io.js](C:/Users/david/Desktop/Hivemind%20Studio/Shinobi%20Tactics/tools/character_designer/scripts/io/yaml_io.js)
- [canvas_renderer.js](C:/Users/david/Desktop/Hivemind%20Studio/Shinobi%20Tactics/tools/character_designer/scripts/rendering/canvas_renderer.js)

### Implemented

- React studio shell
- dark desktop-style layout
- icon-based tool chrome
- resizable left sidebar, right inspector, and bottom timeline
- collapsible panels
- independent panel scroll regions
- shared `64x64` pixel document
- edit canvas plus live preview
- pixel tools:
  - pencil
  - erase
  - fill
  - eyedropper
  - rectangle select
  - move selection
- layer system:
  - groups
  - visibility
  - lock
  - reorder
  - duplicate
  - delete
  - add layer
- palette slots
- PNG underlay import with visibility/opacity/offset/scale
- browser autosave
- undo/redo
- editor YAML import/export
- runtime package export
- preview PNG export
- rig authoring:
  - joints
  - bones
  - anchors
  - regions
  - root joint
  - per-direction rig snapshots
  - on-canvas joint/anchor dragging
  - on-canvas bone and anchor creation
- skeleton overlay rendering
- expression templates with tiny offsets
- expression preview switching
- basic shared asset/reference system scaffold
- file-backed seed library assets under `tools/character_designer/library/`
- library-ready asset export from the studio for:
  - palette
  - rig
  - expression
  - animation
- animation clips:
  - clip list
  - clip add/duplicate/delete
  - fps
  - duration
  - direction expression resolve
  - expression keyframes
  - events
  - root motion keys
- animation composition scaffold:
  - channel list
  - channel enable/disable
  - priority
  - target regions
  - root motion source
- composition ownership preview:
  - region ownership summary
  - channel-colored rig overlay in animation mode
- region motion keys per clip
- rig preview motion driven by composition priority and region ownership

### Partially Implemented

- library system
  - exists in UI
  - supports attach/import flows
  - now loads seed assets from real file-backed library files
  - now exports library-ready files for several asset types
  - still lacks direct save-back into the library folders and stronger reference semantics
- shared animation library
  - built-in animation assets exist
  - currently imported into local clips
  - not yet a proper reference-plus-override system
- animation composition
  - visible in rig preview and face expression resolution
  - not yet a full character deformation/compositing system
- runtime export
  - exists
  - still more like a flattened editor snapshot than a finalized engine-ready animation package

## Major Gaps

These are the main gaps between the current studio and the full plan we agreed on.

### 1. Fine-Grained Character Authoring Is Not There Yet

The current starter character is still coarse.

Missing:

- detailed face segmentation
- separate reusable eyes/irises/pupils/eyelids
- detailed mouth parts
- fine-grained hair segmentation
- layered garment pieces
- accessory layers with strong attachment semantics
- overlay groups for damage, dirt, chakra, status, and similar state visuals

The planned long-term structure is much more granular than the current starter layers.

### 2. Reusable Asset Library Is Still a Scaffold

We decided on a proper reusable library with typed folders and reusable individual assets.

Still missing:

- file-backed library folders under the tool
- actual library asset YAML files
- persistent browsing of saved reusable assets
- save-current-piece-to-library flow
- save-current-preset-to-library flow
- import selected parts from another character file
- local shadow override editing against real file-backed base assets
- promote-to-library workflow for authored pieces

Right now the library mostly demonstrates UI direction and reference shape.

### 3. Editor YAML Schema Is Still Incomplete Relative to the Plan

Current editor export includes:

- `character.yml`
- `identity.yml`
- `proportions.yml`
- `rig.yml`
- `expressions.yml`
- `animations.yml`
- `animation_composition.yml`
- `layers.yml`
- `palettes.yml`
- `references.yml`
- optional `underlay.yml`

Still missing from the fuller plan:

- `garments.yml`
- `overlays.yml`
- a more explicit file-backed library asset model
- richer typed asset manifests
- stronger separation of character-local authored data vs reusable library data

### 4. Runtime Export Is Not Final

We explicitly decided to keep editor YAML and runtime YAML separate.

Still missing in the runtime side:

- stronger runtime-specific schema
- fully resolved animation references
- explicit resolved composition package
- cleaner stripping of editor-only concepts
- stronger packaging for engine/runtime use

### 5. Animation System Is Still Early

Implemented:

- timeline-like clip editing
- expression tracks
- event tracks
- root motion tracks
- region offset tracks
- per-direction expression overrides

Still missing:

- general rig transform tracks beyond simple region offsets
- proper keyframe editing UI for rig movement
- proper bone/joint animation authoring workflow
- better timeline editing ergonomics
- clip trim/split/duplicate tooling
- stronger playback inspection
- event semantics beyond raw ids
- layer/template swap tracks beyond the current expression-oriented path
- visibility tracks
- reusable clip inheritance/reference model

### 6. Animation Composition Is Still Only Partially Real

The plan called for composition like `run + hand_signs`.

What exists now:

- channel metadata
- priorities
- region ownership resolution
- face expression override resolution
- rig overlay preview motion by region

What is still missing:

- real composited character motion, not just rig preview motion
- composition applied to drawn pixel layers in a meaningful way
- clearer conflict debugging tools
- stronger root motion ownership rules in export/runtime
- override/augment semantics beyond simple highest-priority ownership

### 7. Shared Animation Library Is Not Finished

We planned a reusable animation library with shared and character-specific clips.

Still missing:

- true shared clip references
- local shadow overrides on referenced clips
- attach-reference vs import-copy distinction at the animation level
- reusable core moveset package
- character-specific animation extension model
- reusable hand-sign library structure

### 8. Expression System Is Still Basic

Implemented:

- expression templates
- per-layer visibility
- per-layer tiny offsets

Still missing:

- reusable expression assets stored in library files
- better face-part reuse
- richer expression sets
- expression composition with animation channels beyond the current limited path
- stronger face-region tooling

### 9. Rig System Still Needs More Depth

Implemented:

- editable joints/bones/anchors/regions
- direction snapshots
- on-canvas editing

Still missing:

- stronger per-direction rig authoring workflow
- better anchor semantics
- attachment-point specialization for garments/accessories
- better region editing UX
- clearer pose storage model
- tighter integration between rig data and pixel-layer authoring

### 10. Pixel Editor Is Still Missing Serious Studio Features

Still missing:

- better selection tooling
- lasso or more advanced selections if desired later
- copy/paste workflows
- better layer grouping UX
- mask/region overlays
- better palette workflows
- stronger template creation workflows
- higher-end productivity features expected from a mature studio

## Planned System Pieces Not Yet Started

These were discussed but have not really been built yet.

- typed reusable garment system
- typed overlay system
- full preset/template authoring system
- richer palette preset system
- import selected assets from another character document
- save any individual authored piece for later reuse
- save whole authored presets cleanly for reuse
- stronger runtime-side animation package
- real character deformation/compositing from rig animation
- later directional/pose output pipeline beyond the current stub

## Current Reality vs Planned End State

### Current Reality

The studio is currently best described as:

- a good React-based foundation
- a working `64x64` layered pixel editor
- a usable rig editor
- a usable expression editor
- an early animation/composition playground

### Planned End State

The target system is:

- a modular character studio
- a reusable asset library
- a reusable rig library
- a reusable expression library
- a reusable animation library
- a proper editor-YAML-to-runtime-YAML pipeline
- a composable animation system that can drive generic engine/runtime characters

The current tool is not there yet, but it is now clearly pointed in that direction.

## Recommended Resume Order

When work resumes, the clean order is:

1. Stabilize the studio data model.
2. Finish the file-backed library system.
3. Implement real shared animation references plus local overrides.
4. Deepen rig animation beyond region offsets.
5. Make composition affect the actual composed character, not only the rig overlay and expressions.
6. Expand the fine-grained face/hair/clothing/overlay model.
7. Add proper `garments.yml` and `overlays.yml`.
8. Tighten runtime export into a true engine-facing package.

## Immediate Next Step If Resuming Soon

If resuming immediately, the cleanest next task is:

- implement a real file-backed reusable asset library

Reason:

- it unlocks the rest of the studio without baking more important systems into hardcoded constants
- it keeps the animation library and expression library from becoming another temporary dead-end
- it matches the original plan more closely than continuing to pile more behavior into local-only document state

## Notes

- The legacy one-file tool still exists only as historical reference.
- The React studio is the active path.
- This studio should continue to stay engine-generic and avoid Naruto-specific engine terminology.

# Architecture

## Source Layout

Main source folders under `src/`:

- `app/`
- `loading_screen/`
- `main_menu/`
- `map_loader/`
- `projection/`
- `rendering/`
- `entities/`
- `speech/`
- `naruto_story/`
- `lib/`

## Module Responsibilities

### `src/app/`

Owns top-level scene/screen orchestration.

Examples:

- fade transitions
- switching between menu, loading, and story scenes

### `src/main_menu/`

Owns the prototype main menu.

Examples:

- menu state
- menu layout
- layout editor

### `src/loading_screen/`

Reusable loading-screen view.

### `src/map_loader/`

Owns YAML loading and normalized scene/map data creation.

Examples:

- scene loading
- map loading
- tile loading
- character placement loading
- simple YAML parsing

This layer should stay data-focused, not visual.

### `src/projection/`

Owns world-to-screen math.

Examples:

- flat-top hex world positioning
- 2.5D projection
- perspective scaling
- depth sort values

### `src/rendering/`

Owns visual treatment.

Examples:

- tile shading
- map/platform shadow
- character draw output
- scene backgrounds

### `src/entities/`

Owns entity-specific layout logic that is not generic projection math.

Current example:

- character feet/head/sprite layout

### `src/speech/`

Owns dialogue script loading, state progression, and speech UI rendering.

Current behavior:

- linear dialogue
- typewriter reveal
- `Enter` or click advances
- `Escape` skips

### `src/lib/`

Shared low-level helpers.

Current example:

- collision-mask generation and opaque-bound utilities

## Architectural Rules

- keep feature code modular by folder
- avoid putting new systems into one global `app.tsx`-style file
- keep data loading separate from rendering
- keep projection separate from styling/shading
- prefer reusable helpers over per-scene hacks

## Current Runtime Chain

Typical story-scene load chain:

1. app selects a scene/view
2. loader reads scene YAML
3. map data and character placements are normalized
4. projection computes world-to-screen positions
5. rendering draws the scene
6. speech overlays run on top if dialogue is active

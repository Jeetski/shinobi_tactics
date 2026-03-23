# Overview

`Shinobi Tactics` is a web-based tactical Naruto game prototype built with:

- `React`
- `TypeScript`
- `Vite`
- custom SVG/world rendering
- YAML-driven content under `public/resources/`

## Current State

The prototype currently includes:

- a modular main menu
- loading-screen transitions
- a data-driven academy yard scene
- flat-top hex map rendering
- shared 2.5D projection logic
- character rendering with height-based sizing
- a bottom-centered dialogue system with typewriter text

## Design Direction

The project is aiming for:

- feature-local modules under `src/`
- YAML-driven scene setup and game data
- minimal dependency weight
- reusable rendering/projection systems
- a fake-3D isometric tactical presentation over hex maps

## Core Principles

- map data lives in world/hex space
- projection decides how world space is viewed
- rendering decides how it looks
- scenes define initial conditions
- reusable character/tile data lives outside individual scenes

## Current Entry Flow

High-level flow:

1. `main_menu`
2. `loading_screen`
3. `naruto_story`
4. scene data is loaded from `resources/stages/...`

## Near-Term Focus

The next major systems likely to expand are:

- scripted dialogue triggers
- richer scene YAML
- terrain/object placement
- story scene sequencing
- combat/gameplay systems

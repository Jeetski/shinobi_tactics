# Scene Authoring

This document describes the current scene authoring pattern.

## Current Scene Folder Pattern

Example:

`public/resources/stages/academy/yard/naruto_story/level_1/`

This scene folder currently contains:

- `scene.yml`
- `map.yml`
- `characters.yml`
- `dialogue/`

## Minimal Scene Setup

### `scene.yml`

```yml
id: academy_yard_naruto_story_level_1
stage_name: Academy
scene_name: Yard
background:
  preset: academy_sky
music: /resources/music/daylight_of_konoha.mp3
map: map.yml
characters: characters.yml
dialogue: dialogue/intro.yml
```

### `map.yml`

```yml
id: academy_yard
layout:
  orientation: flat_top
  radius: 2
fill:
  tile: dirt
```

### `characters.yml`

```yml
characters:
  naruto_spawn:
    character: naruto_uzumaki/academy_newbie
    q: 0
    r: -1
    s: 1
    facing: front
```

### `dialogue/intro.yml`

```yml
dialogue:
  - speaker: iruka_umino
    text: "Naruto, today you will learn the basics."
```

## Coordinate Rules

Maps currently use cube coordinates:

- `q`
- `r`
- `s`

Constraint:

- `q + r + s = 0`

Maps are currently:

- flat-top hexes
- radially generated from the origin

## Authoring Guidelines

- scene files should define initial conditions, not reusable base character metadata
- reusable character defaults belong under `public/resources/characters/`
- keep dialogue files separate from map/character placement files
- prefer small, purpose-specific YAML files over one large dump file

## Likely Future Scene Files

As scenes grow, these are reasonable additions:

- `terrain.yml`
- `objects.yml`
- `buildings.yml`
- `triggers.yml`
- `events.yml`

Those are not all implemented yet, but the current structure is designed to support them cleanly.

# Data Layout

## High-Level Rule

Game content is intended to be data-driven and stored under `public/resources/`.

The top-level `resources/` folder is no longer treated as canonical project data.

## Main Data Areas

- `public/resources/stages/`
- `public/resources/characters/`
- `public/resources/tiles/`
- `public/resources/textures/`
- `public/resources/music/`
- `public/resources/UI/`
- `public/resources/weapons/`
- `public/resources/fonts/`

## Stages

Current scene data lives under stage-specific folders, for example:

`public/resources/stages/academy/yard/naruto_story/level_1/`

Current files there:

- `scene.yml`
- `map.yml`
- `characters.yml`
- `dialogue/intro.yml`

## Recommended Meaning Of Each File

### `scene.yml`

Scene-level metadata and file references.

Current examples:

- stage name
- scene name
- background preset
- default music
- file references for map, characters, dialogue

### `map.yml`

Base map shape and fill.

Current examples:

- orientation
- radius
- default fill tile

### `characters.yml`

Scene-local character instances.

Current examples:

- which character variant is present
- cube coordinates
- facing
- optional scene-local scale multiplier

### `dialogue/*.yml`

Dialogue scripts for the scene.

Current format:

```yml
dialogue:
  - speaker: iruka_umino
    text: "Naruto, today you will learn the basics."
```

## Character Data

Character data currently uses:

`public/resources/characters/<character_id>/<variant>/`

Current files:

- `info.yaml`
- `defaults.yaml`
- other future stat/moveset/jutsu files
- sprite folders

### `info.yaml`

In-verse character information.

Current fields:

- `name`
- `height_cm`

### `defaults.yaml`

Default presentation/render values.

Current fields:

- `id`
- `sprite_front`
- `sprite_back`

## Tile Data

Tiles live under `public/resources/tiles/*.yml`.

Current tile data includes things like:

- `id`
- `name`
- `texture`
- movement/vision/environment flags

## Naming Conventions

- use `snake_case` for file names
- keep scene folders explicit and readable
- prefer stable ids that map cleanly to folder structure

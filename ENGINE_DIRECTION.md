# Engine Direction

This project is intended to become a reusable game engine, framework, and content pipeline for tactical games.

Naruto is the current content/IP layer, not the core engine identity.

## Core Principle

The engine layer should stay generic wherever possible.

That means:
- engine systems should avoid Naruto-specific terminology
- runtime architecture should describe generic game concepts
- content, assets, scenes, characters, abilities, items, and dialogue should be data-driven
- franchise-specific wording should live in content/data layers, not engine internals

## Practical Goal

The long-term goal is that Naruto-specific assets, terminology, and content can be swapped out without needing to rewrite the engine.

In other words:
- the engine should be reusable
- the content pack should be replaceable
- the pipeline should support plugging one setting/IP out and another in

## Separation Rule

Use generic terminology in engine code whenever the concept is not inherently Naruto-specific.

Examples:
- prefer `character`, `ability`, `status_effect`, `faction`, `scene`, `stage`, `animation`, `dialogue`
- avoid hardcoding Naruto/IP terms into engine modules unless they belong strictly to authored content

## Content Layer

Naruto-specific things should live in content-facing areas such as:
- YAML data
- assets
- dialogue
- story scenes
- named abilities/jutsu content
- lore text
- franchise-specific UI copy where appropriate

## Why This Matters

This keeps the project useful as:
- a Naruto tactics game
- a general tactics engine
- a reusable solo-dev pipeline for future projects

## Working Standard

When adding new systems, prefer this split:
- engine layer: generic, reusable, system-oriented
- content layer: setting-specific, asset-specific, story-specific

If a new module would still make sense after removing Naruto-specific data, it belongs in the engine layer.

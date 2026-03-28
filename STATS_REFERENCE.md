# Stats Reference

This file defines the current high-level interpretation of stat values used by character `stats.yml` files.

The purpose of this scale is:

- keep character sheets readable
- keep balancing consistent
- give numeric values a shared in-world meaning
- support a data-driven engine layer later

## Scale

### `1`

Average genin

### `2`

Average chunin

### `3`

Most named / competent genin we actually see

### `4`

Average jonin

### `5`

Top jonin / specialists

Examples:

- Kakashi
- Gai

### `6`

Standard kage level

### `7`

Exceptional monsters

Example:

- Minato-tier

### `8`

Legendary / insane

Examples:

- Hashirama
- EMS Madara
- Six Paths Naruto
- Six Paths Sasuke
- bijuu

### `9`

God-tier, but below Kaguya

Examples:

- Juubi Madara
- Juubi Obito
- Boruto-era Naruto
- Boruto-era Sasuke
- Jigen

### `10`

Otsutsuki apex

Examples:

- Kaguya
- similar Otsutsuki-level entities

## Use Guidance

This scale is a reference, not a law.

It should be used to keep values emotionally and mechanically consistent across characters.

### Practical rule

Most early-game or academy-era characters should live mostly in the `0` to `3` range, with only specific standout traits going far beyond that.

### Important note

Not every stat must mean power in the same way.

For example:

- `Chakra Reserves: 7.0` on academy Naruto can be valid if that specific trait is intentionally an extreme outlier
- that does **not** mean Naruto is globally a `7` in overall combat competence

So:

- use this scale per trait
- allow exceptional outliers where the fiction clearly supports them
- avoid flattening every character into one implied "power level"

## Current Direction

The project is still in mechanic-discovery/tutorial-prototype stage.

That means:

- the stat model is still evolving
- existing `stats.yml` values may need rebalancing against this reference
- this document should be treated as the canonical target for future cleanup

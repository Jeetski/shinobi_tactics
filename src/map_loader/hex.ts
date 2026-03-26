import type { HexCoord } from './map_types';

export function create_hex(q: number, r: number): HexCoord {
  return {
    q,
    r,
    s: -q - r,
  };
}

export function build_hex_disc(radius: number) {
  const tiles: HexCoord[] = [];

  for (let q = -radius; q <= radius; q += 1) {
    const r_min = Math.max(-radius, -q - radius);
    const r_max = Math.min(radius, -q + radius);

    for (let r = r_min; r <= r_max; r += 1) {
      tiles.push(create_hex(q, r));
    }
  }

  return tiles;
}

export function hex_distance(a: HexCoord, b: HexCoord) {
  return Math.max(
    Math.abs(a.q - b.q),
    Math.abs(a.r - b.r),
    Math.abs(a.s - b.s),
  );
}

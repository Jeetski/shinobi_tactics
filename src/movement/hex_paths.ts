import type { HexCoord, StageTile } from '../map_loader/map_types';

export type PathFamily = 'short' | 'wide';
export type PathVariant = 'shortest' | 'left' | 'right';

type BuildPathFamilyVariantArgs = {
  start: HexCoord;
  goal: HexCoord;
  tiles: StageTile[];
  family: PathFamily;
  variant: PathVariant;
};

type BuildShortestPathArgs = {
  start: HexCoord;
  goal: HexCoord;
  tiles: StageTile[];
};

type AxialPoint = {
  x: number;
  y: number;
};

type CubePoint = {
  q: number;
  r: number;
  s: number;
};

type OneBendCandidate = {
  path: HexCoord[];
  length: number;
  side: 'left' | 'right' | 'center';
  bend_coord: HexCoord;
};

type HexAxis = 'q' | 'r' | 's';

const cube_directions: HexCoord[] = [
  { q: 1, r: 0, s: -1 },
  { q: 1, r: -1, s: 0 },
  { q: 0, r: -1, s: 1 },
  { q: -1, r: 0, s: 1 },
  { q: -1, r: 1, s: 0 },
  { q: 0, r: 1, s: -1 },
];
const cube_axes: HexAxis[] = ['q', 'r', 's'];

const short_bend_scale = 0.42;
const wide_bend_scale = 1.12;

export function key_hex(coord: HexCoord) {
  return `${coord.q},${coord.r},${coord.s}`;
}

export function hex_distance(left: HexCoord, right: HexCoord) {
  return Math.max(
    Math.abs(left.q - right.q),
    Math.abs(left.r - right.r),
    Math.abs(left.s - right.s),
  );
}

export function get_hex_neighbors(coord: HexCoord) {
  return cube_directions.map((direction) => add_hex(coord, direction));
}

export function build_shortest_path({ start, goal, tiles }: BuildShortestPathArgs) {
  const walkable_keys = get_walkable_tile_keys(tiles);
  return build_shortest_path_from_keys(start, goal, walkable_keys);
}

export function build_path_family_variant({
  start,
  goal,
  tiles,
  family,
  variant,
}: BuildPathFamilyVariantArgs) {
  const walkable_tiles = tiles.filter((tile) => !tile.tile.properties.blocks_movement);
  const walkable_keys = new Set(walkable_tiles.map((tile) => key_hex(tile.coord)));
  const canonical_shortest = draw_hex_line(start, goal).every((coord) => walkable_keys.has(key_hex(coord)))
    ? draw_hex_line(start, goal)
    : build_shortest_path_from_keys(start, goal, walkable_keys);
  const one_bend_candidates = build_one_bend_candidates(start, goal, walkable_keys);

  if (variant === 'shortest') {
    return canonical_shortest;
  }

  if (family === 'short') {
    const short_candidate = select_short_candidate(start, goal, one_bend_candidates, variant);
    return short_candidate?.path ?? canonical_shortest;
  }

  const wide_candidate = select_wide_candidate(start, goal, one_bend_candidates, walkable_keys, variant);
  return wide_candidate?.path ?? canonical_shortest;
}

function build_one_bend_candidates(start: HexCoord, goal: HexCoord, walkable_keys: Set<string>) {
  const candidates: OneBendCandidate[] = [];
  const seen_bends = new Set<string>();

  for (const start_axis of cube_axes) {
    for (const goal_axis of cube_axes) {
      if (start_axis === goal_axis) {
        continue;
      }

      const bend_coord = build_radial_intersection(start, start_axis, goal, goal_axis);
      if (!bend_coord) {
        continue;
      }

      if (key_hex(bend_coord) === key_hex(start) || key_hex(bend_coord) === key_hex(goal)) {
        continue;
      }

      if (seen_bends.has(key_hex(bend_coord))) {
        continue;
      }

      const first_leg = draw_hex_line(start, bend_coord);
      const second_leg = draw_hex_line(bend_coord, goal);
      const path = [...first_leg, ...second_leg.slice(1)];

      if (!path.every((coord) => walkable_keys.has(key_hex(coord)))) {
        continue;
      }

      seen_bends.add(key_hex(bend_coord));
      candidates.push({
        path,
        length: path.length - 1,
        side: classify_path_side(start, goal, bend_coord),
        bend_coord,
      });
    }
  }

  return candidates;
}

function get_walkable_tile_keys(tiles: StageTile[]) {
  return new Set(
    tiles
      .filter((tile) => !tile.tile.properties.blocks_movement)
      .map((tile) => key_hex(tile.coord)),
  );
}

function build_shortest_path_from_keys(start: HexCoord, goal: HexCoord, walkable_keys: Set<string>) {
  if (key_hex(start) === key_hex(goal)) {
    return [start];
  }

  const start_key = key_hex(start);
  const goal_key = key_hex(goal);

  if (!walkable_keys.has(start_key) || !walkable_keys.has(goal_key)) {
    return [start];
  }

  const frontier: HexCoord[] = [start];
  const came_from = new Map<string, HexCoord | null>([[start_key, null]]);

  while (frontier.length > 0) {
    const current = frontier.shift();
    if (!current) {
      break;
    }

    if (key_hex(current) === goal_key) {
      return reconstruct_path(goal, came_from);
    }

    for (const neighbor of get_hex_neighbors(current)) {
      const neighbor_key = key_hex(neighbor);
      if (!walkable_keys.has(neighbor_key) || came_from.has(neighbor_key)) {
        continue;
      }

      came_from.set(neighbor_key, current);
      frontier.push(neighbor);
    }
  }

  return [start];
}

function reconstruct_path(goal: HexCoord, came_from: Map<string, HexCoord | null>) {
  const path: HexCoord[] = [];
  let current: HexCoord | null = goal;

  while (current) {
    path.push(current);
    current = came_from.get(key_hex(current)) ?? null;
  }

  return path.reverse();
}

function draw_hex_line(start: HexCoord, goal: HexCoord) {
  const distance = hex_distance(start, goal);
  if (distance === 0) {
    return [start];
  }

  const path: HexCoord[] = [];
  for (let step = 0; step <= distance; step += 1) {
    const t = distance === 0 ? 0 : step / distance;
    const cube = cube_lerp(start, goal, t);
    const rounded = cube_round(cube);
    if (path.length === 0 || key_hex(path[path.length - 1]) !== key_hex(rounded)) {
      path.push(rounded);
    }
  }

  return path;
}

function cube_lerp(start: HexCoord, goal: HexCoord, t: number): CubePoint {
  return {
    q: start.q + (goal.q - start.q) * t,
    r: start.r + (goal.r - start.r) * t,
    s: start.s + (goal.s - start.s) * t,
  };
}

function cube_round(cube: CubePoint): HexCoord {
  let q = Math.round(cube.q);
  let r = Math.round(cube.r);
  let s = Math.round(cube.s);

  const q_diff = Math.abs(q - cube.q);
  const r_diff = Math.abs(r - cube.r);
  const s_diff = Math.abs(s - cube.s);

  if (q_diff > r_diff && q_diff > s_diff) {
    q = -r - s;
  } else if (r_diff > s_diff) {
    r = -q - s;
  } else {
    s = -q - r;
  }

  return { q, r, s };
}

function get_side_normal(goal_point: AxialPoint, variant: Exclude<PathVariant, 'shortest'>) {
  const length = Math.hypot(goal_point.x, goal_point.y) || 1;
  const left = {
    x: goal_point.y / length,
    y: -goal_point.x / length,
  };

  if (variant === 'left') {
    return left;
  }

  return {
    x: -left.x,
    y: -left.y,
  };
}

function hex_to_axial_point(coord: HexCoord): AxialPoint {
  return {
    x: 1.5 * coord.q,
    y: Math.sqrt(3) * (coord.r + coord.q / 2),
  };
}

function select_short_candidate(
  start: HexCoord,
  goal: HexCoord,
  candidates: OneBendCandidate[],
  side: Exclude<PathVariant, 'shortest'>,
) {
  const trip_distance = hex_distance(start, goal);
  const ideal_bend_point = build_ideal_bend_point(start, goal, side, short_bend_scale * trip_distance);
  const side_candidates = candidates.filter((candidate) => candidate.side === side);

  if (side_candidates.length === 0) {
    return null;
  }

  return side_candidates
    .slice()
    .sort((left, right) => {
      const left_length_delta = Math.abs(left.length - trip_distance);
      const right_length_delta = Math.abs(right.length - trip_distance);
      if (left_length_delta !== right_length_delta) {
        return left_length_delta - right_length_delta;
      }

      const left_ideal_delta = get_bend_distance_to_ideal(start, left, ideal_bend_point);
      const right_ideal_delta = get_bend_distance_to_ideal(start, right, ideal_bend_point);
      return left_ideal_delta - right_ideal_delta;
    })[0];
}

function select_wide_candidate(
  start: HexCoord,
  goal: HexCoord,
  candidates: OneBendCandidate[],
  walkable_keys: Set<string>,
  side: Exclude<PathVariant, 'shortest'>,
) {
  const short_candidate = select_short_candidate(start, goal, candidates, side);
  if (!short_candidate) {
    return null;
  }
  const offset_directions = get_side_offset_directions(start, goal, side);
  const wide_candidates = offset_directions
    .map((direction) => build_offset_wide_candidate({
      start,
      goal,
      walkable_keys,
      side,
      direction,
    }))
    .filter((candidate): candidate is OneBendCandidate => candidate !== null);

  if (wide_candidates.length === 0) {
    return short_candidate;
  }

  const short_offset = get_bend_side_offset(start, goal, short_candidate.bend_coord);
  const trip_distance = hex_distance(start, goal);
  const ideal_bend_point = build_ideal_bend_point(start, goal, side, wide_bend_scale * trip_distance);

  return wide_candidates
    .slice()
    .sort((left, right) => {
      const left_offset = get_bend_side_offset(start, goal, left.bend_coord);
      const right_offset = get_bend_side_offset(start, goal, right.bend_coord);
      const left_offset_delta = left_offset - short_offset;
      const right_offset_delta = right_offset - short_offset;

      if (left_offset_delta !== right_offset_delta) {
        return right_offset_delta - left_offset_delta;
      }

      const left_ideal_delta = get_bendDistanceToIdealForWide(start, left, ideal_bend_point);
      const right_ideal_delta = get_bendDistanceToIdealForWide(start, right, ideal_bend_point);
      if (left_ideal_delta !== right_ideal_delta) {
        return left_ideal_delta - right_ideal_delta;
      }

      return right.length - left.length;
    })[0];
}

function build_ideal_bend_point(
  start: HexCoord,
  goal: HexCoord,
  side: Exclude<PathVariant, 'shortest'>,
  offset_magnitude: number,
) {
  const relative_goal = subtract_hex(goal, start);
  const goal_point = hex_to_axial_point(relative_goal);
  const midpoint = {
    x: goal_point.x / 2,
    y: goal_point.y / 2,
  };
  const normal = get_side_normal(goal_point, side);

  return {
    x: midpoint.x + normal.x * offset_magnitude,
    y: midpoint.y + normal.y * offset_magnitude,
  };
}

function get_bend_distance_to_ideal(start: HexCoord, candidate: OneBendCandidate, ideal_bend_point: AxialPoint) {
  const relative_bend = subtract_hex(candidate.bend_coord, start);
  const bend_point = hex_to_axial_point(relative_bend);
  return Math.hypot(bend_point.x - ideal_bend_point.x, bend_point.y - ideal_bend_point.y);
}

function get_bendDistanceToIdealForWide(start: HexCoord, candidate: OneBendCandidate, ideal_bend_point: AxialPoint) {
  return get_bend_distance_to_ideal(start, candidate, ideal_bend_point);
}

function get_bend_side_offset(start: HexCoord, goal: HexCoord, bend_coord: HexCoord) {
  const start_point = hex_to_axial_point(start);
  const goal_point = hex_to_axial_point(goal);
  const bend_point = hex_to_axial_point(bend_coord);
  const direct = subtract_axial_points(goal_point, start_point);
  const bend_offset = subtract_axial_points(bend_point, start_point);
  const cross = Math.abs(direct.x * bend_offset.y - direct.y * bend_offset.x);
  const direct_length = Math.hypot(direct.x, direct.y) || 1;
  return cross / direct_length;
}

function get_side_offset_directions(
  start: HexCoord,
  goal: HexCoord,
  side: Exclude<PathVariant, 'shortest'>,
) {
  const goal_vector = subtract_axial_points(hex_to_axial_point(goal), hex_to_axial_point(start));
  const goal_length = Math.hypot(goal_vector.x, goal_vector.y) || 1;
  const goal_unit = {
    x: goal_vector.x / goal_length,
    y: goal_vector.y / goal_length,
  };
  const side_normal = get_side_normal(goal_vector, side);

  return cube_directions
    .map((direction) => {
      const point = hex_to_axial_point(direction);
      const side_strength = point.x * side_normal.x + point.y * side_normal.y;
      const forward_strength = point.x * goal_unit.x + point.y * goal_unit.y;
      return {
        direction,
        side_strength,
        forward_strength,
        score: side_strength - Math.abs(forward_strength) * 0.25,
      };
    })
    .filter((entry) => entry.side_strength > 0.05)
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.direction);
}

function build_offset_wide_candidate({
  start,
  goal,
  walkable_keys,
  side,
  direction,
}: {
  start: HexCoord;
  goal: HexCoord;
  walkable_keys: Set<string>;
  side: Exclude<PathVariant, 'shortest'>;
  direction: HexCoord;
}): OneBendCandidate | null {
  const start_offset = add_hex(start, direction);
  const goal_offset = add_hex(goal, direction);

  if (!walkable_keys.has(key_hex(start_offset)) || !walkable_keys.has(key_hex(goal_offset))) {
    return null;
  }

  const offset_candidates = build_one_bend_candidates(start_offset, goal_offset, walkable_keys);
  const offset_short = select_short_candidate(start_offset, goal_offset, offset_candidates, side);
  if (!offset_short) {
    return null;
  }

  const path = [start, ...offset_short.path, goal];
  return {
    path,
    length: path.length - 1,
    side,
    bend_coord: offset_short.bend_coord,
  };
}

function build_radial_intersection(
  start: HexCoord,
  start_axis: HexAxis,
  goal: HexCoord,
  goal_axis: HexAxis,
): HexCoord | null {
  const bend = {
    q: 0,
    r: 0,
    s: 0,
  } as HexCoord;

  bend[start_axis] = start[start_axis];
  bend[goal_axis] = goal[goal_axis];

  const third_axis = cube_axes.find((axis) => axis !== start_axis && axis !== goal_axis);
  if (!third_axis) {
    return null;
  }

  bend[third_axis] = -bend.q - bend.r - bend.s;
  return bend;
}

function classify_path_side(start: HexCoord, goal: HexCoord, bend_coord: HexCoord | undefined) {
  if (!bend_coord) {
    return 'center' as const;
  }

  const direct = subtract_axial_points(hex_to_axial_point(goal), hex_to_axial_point(start));
  const midpoint = midpoint_axial(hex_to_axial_point(start), hex_to_axial_point(goal));
  const bend = hex_to_axial_point(bend_coord);
  const bend_offset = subtract_axial_points(bend, midpoint);
  const cross = direct.x * bend_offset.y - direct.y * bend_offset.x;

  if (Math.abs(cross) < 0.001) {
    return 'center' as const;
  }

  return cross > 0 ? 'right' : 'left';
}

function midpoint_axial(left: AxialPoint, right: AxialPoint) {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  };
}

function subtract_axial_points(left: AxialPoint, right: AxialPoint) {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
  };
}

function add_hex(left: HexCoord, right: HexCoord): HexCoord {
  return {
    q: left.q + right.q,
    r: left.r + right.r,
    s: left.s + right.s,
  };
}

function subtract_hex(left: HexCoord, right: HexCoord): HexCoord {
  return {
    q: left.q - right.q,
    r: left.r - right.r,
    s: left.s - right.s,
  };
}

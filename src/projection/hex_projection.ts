import type { HexCoord } from '../map_loader/map_types';
import type { ProjectionSettings, ScreenPoint, WorldPoint } from './projection_types';

export const default_projection_settings: ProjectionSettings = {
  tile_radius: 52,
  vertical_scale: 0.72,
  elevation_scale: 28,
  perspective_strength: 0.14,
};

export function flat_top_hex_to_world(coord: HexCoord, tile_radius: number): WorldPoint {
  return {
    x: tile_radius * 1.5 * coord.q,
    y: Math.sqrt(3) * tile_radius * (coord.r + coord.q / 2),
    z: 0,
  };
}

export function project_world_to_screen(
  world_point: WorldPoint,
  settings: ProjectionSettings = default_projection_settings,
): ScreenPoint {
  return {
    x: world_point.x,
    y: world_point.y * settings.vertical_scale - world_point.z * settings.elevation_scale,
  };
}

export function build_projected_flat_top_hex_points(
  center: WorldPoint,
  settings: ProjectionSettings = default_projection_settings,
) {
  const points: string[] = [];

  for (let index = 0; index < 6; index += 1) {
    const angle = (Math.PI / 180) * (60 * index);
    const world_point: WorldPoint = {
      x: center.x + settings.tile_radius * Math.cos(angle),
      y: center.y + settings.tile_radius * Math.sin(angle),
      z: center.z,
    };
    const screen_point = project_world_to_screen(world_point, settings);
    points.push(`${screen_point.x},${screen_point.y}`);
  }

  return points.join(' ');
}

export function get_projected_hex_extents(settings: ProjectionSettings = default_projection_settings) {
  const points = Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index);
    return project_world_to_screen(
      {
        x: settings.tile_radius * Math.cos(angle),
        y: settings.tile_radius * Math.sin(angle),
        z: 0,
      },
      settings,
    );
  });

  return {
    min_x: Math.min(...points.map((point) => point.x)),
    max_x: Math.max(...points.map((point) => point.x)),
    min_y: Math.min(...points.map((point) => point.y)),
    max_y: Math.max(...points.map((point) => point.y)),
  };
}

export function get_depth_sort_value(screen_point: ScreenPoint, world_point: WorldPoint) {
  return screen_point.y * 10000 + screen_point.x * 0.1 + world_point.z * 100000;
}

export function get_perspective_scale(
  screen_y: number,
  min_screen_y: number,
  max_screen_y: number,
  settings: ProjectionSettings = default_projection_settings,
) {
  const span = Math.max(1, max_screen_y - min_screen_y);
  const depth_ratio = (screen_y - min_screen_y) / span;

  return 1 - settings.perspective_strength / 2 + depth_ratio * settings.perspective_strength;
}

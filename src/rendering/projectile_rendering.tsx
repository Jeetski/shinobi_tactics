import { project_world_to_screen, default_projection_settings, get_projected_hex_extents } from '../projection';
import { getRenderedOpaqueBounds, type CollisionMask } from '../lib/collision_mask';
import type { WorldPoint } from '../projection';

export type ProjectileRenderable = {
  id: string;
  sprite: string;
  world_position: WorldPoint;
  size_m: number;
  rotation_deg: number;
};

const projected_hex_extents = get_projected_hex_extents(default_projection_settings);
const projected_tile_height = projected_hex_extents.max_y - projected_hex_extents.min_y;

export function render_projected_projectile(
  projectile: ProjectileRenderable,
  perspective_scale: number,
  sprite_mask?: CollisionMask,
) {
  const screen_position = project_world_to_screen(projectile.world_position, default_projection_settings);
  const sprite_height = projected_tile_height * projectile.size_m * perspective_scale;
  const sprite_width = sprite_mask && sprite_mask.height > 0
    ? sprite_height * (sprite_mask.width / sprite_mask.height)
    : sprite_height;
  const opaque_bounds = sprite_mask
    ? getRenderedOpaqueBounds(sprite_mask, sprite_width, sprite_height)
    : {
        left: 0,
        right: sprite_width,
        top: 0,
        bottom: sprite_height,
      };
  const opaque_center_x = (opaque_bounds.left + opaque_bounds.right) / 2;
  const opaque_center_y = (opaque_bounds.top + opaque_bounds.bottom) / 2;
  const sprite_x = screen_position.x - opaque_center_x;
  const sprite_y = screen_position.y - opaque_center_y;
  const transform_origin_x = sprite_x + opaque_center_x;
  const transform_origin_y = sprite_y + opaque_center_y;

  return (
    <image
      key={projectile.id}
      href={projectile.sprite}
      x={sprite_x}
      y={sprite_y}
      width={sprite_width}
      height={sprite_height}
      preserveAspectRatio="xMidYMid meet"
      transform={`rotate(${projectile.rotation_deg} ${transform_origin_x} ${transform_origin_y})`}
      pointerEvents="none"
    />
  );
}

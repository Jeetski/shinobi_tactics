import { default_projection_settings, get_projected_hex_extents } from '../projection';
import { getRenderedOpaqueBounds, type CollisionMask, type OpaqueBounds } from '../lib/collision_mask';
import type { LoadedStageProp } from '../map_loader/map_types';
import type { ScreenPoint } from '../projection';

export type PropLayout = {
  anchor_x: number;
  anchor_y: number;
  sprite_width: number;
  sprite_height: number;
  sprite_x: number;
  sprite_y: number;
  shadow_width: number;
  shadow_height: number;
  shadow_y: number;
  opaque_bounds: OpaqueBounds;
};

const projected_hex_extents = get_projected_hex_extents(default_projection_settings);
const projected_tile_height = projected_hex_extents.max_y - projected_hex_extents.min_y;

export function build_prop_layout(
  prop: LoadedStageProp,
  standing_point: ScreenPoint,
  perspective_scale: number,
  sprite_mask?: CollisionMask,
): PropLayout {
  const sprite_height = projected_tile_height * 1.04 * prop.scale * perspective_scale;
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
  const opaque_bottom_y = opaque_bounds.bottom;
  const opaque_width = opaque_bounds.right - opaque_bounds.left;

  return {
    anchor_x: standing_point.x,
    anchor_y: standing_point.y,
    sprite_width,
    sprite_height,
    sprite_x: standing_point.x - opaque_center_x,
    sprite_y: standing_point.y - opaque_bottom_y,
    shadow_width: Math.max(projected_tile_height * 0.24, opaque_width * 0.68),
    shadow_height: sprite_height * 0.14 * default_projection_settings.vertical_scale,
    shadow_y: standing_point.y + sprite_height * 0.03,
    opaque_bounds,
  };
}

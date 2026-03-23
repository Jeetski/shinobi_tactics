import { default_projection_settings, get_projected_hex_extents } from '../projection';
import { getRenderedOpaqueBounds, type CollisionMask } from '../lib/collision_mask';
import type { LoadedCharacter } from '../map_loader/map_types';
import type { ScreenPoint } from '../projection';

type CharacterLayout = {
  feet_x: number;
  feet_y: number;
  head_x: number;
  head_y: number;
  sprite_width: number;
  sprite_height: number;
  sprite_x: number;
  sprite_y: number;
  shadow_width: number;
  shadow_height: number;
  shadow_y: number;
};

const sprite_aspect_ratio = 120 / 160;
const projected_hex_extents = get_projected_hex_extents(default_projection_settings);
const projected_tile_height = projected_hex_extents.max_y - projected_hex_extents.min_y;

export function build_character_layout(
  character: LoadedCharacter,
  standing_point: ScreenPoint,
  perspective_scale: number,
  sprite_mask?: CollisionMask,
): CharacterLayout {
  const sprite_height =
    projected_tile_height *
    (character.info.height_cm / 100) *
    character.scale *
    perspective_scale;
  const sprite_width = sprite_height * get_sprite_aspect_ratio(sprite_mask);
  const opaque_bounds = sprite_mask
    ? getRenderedOpaqueBounds(sprite_mask, sprite_width, sprite_height)
    : null;
  const opaque_center_x = opaque_bounds ? (opaque_bounds.left + opaque_bounds.right) / 2 : sprite_width / 2;
  const opaque_bottom_y = opaque_bounds ? opaque_bounds.bottom : sprite_height * 0.94;
  const opaque_width = opaque_bounds ? opaque_bounds.right - opaque_bounds.left : sprite_width * 0.58;

  return {
    feet_x: standing_point.x,
    feet_y: standing_point.y,
    head_x: standing_point.x,
    head_y: standing_point.y - sprite_height * 0.94,
    sprite_width,
    sprite_height,
    sprite_x: standing_point.x - opaque_center_x,
    sprite_y: standing_point.y - opaque_bottom_y,
    shadow_width: Math.max(projected_tile_height * 0.24, opaque_width * 0.68),
    shadow_height: sprite_height * 0.14 * default_projection_settings.vertical_scale,
    shadow_y: standing_point.y + sprite_height * 0.03,
  };
}

function get_sprite_aspect_ratio(sprite_mask?: CollisionMask) {
  if (!sprite_mask || sprite_mask.height === 0) {
    return sprite_aspect_ratio;
  }

  return sprite_mask.width / sprite_mask.height;
}

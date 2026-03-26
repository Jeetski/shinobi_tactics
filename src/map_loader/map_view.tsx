import { useEffect, useMemo, useRef, useState } from 'react';
import { loadCollisionMask, type CollisionMask } from '../lib/collision_mask';
import type { CharacterFacing, HexCoord, LoadedStageScene } from './map_types';
import type { PathFamily } from '../movement';
import {
  default_projection_settings,
  flat_top_hex_to_world,
  get_depth_sort_value,
  get_perspective_scale,
  get_projected_hex_extents,
  project_world_to_screen,
  type WorldPoint,
} from '../projection';
import { build_character_layout, render_projected_character, render_projected_path_preview, render_projected_projectile, render_projected_prop, render_projected_tile, TileRenderDefs } from '../rendering';
import { build_prop_layout } from '../entities/prop_layout';
import { SpeechRenderer } from '../speech';
import './map_view.css';

type TileCoord = {
  q: number;
  r: number;
  s: number;
};

type MapViewProps = {
  scene: LoadedStageScene;
  active_speech_line?: {
    speaker: string;
    text: string;
  } | null;
  on_advance_speech?: () => void;
  highlighted_tiles?: Array<{
    q: number;
    r: number;
    s: number;
  }>;
  highlighted_prop_ids?: string[];
  prop_highlight_tone?: 'move' | 'attack';
  on_tile_click?: (coord: TileCoord) => void;
  on_tile_hold?: (coord: TileCoord) => void;
  on_tile_right_click?: (coord: TileCoord) => void;
  on_tile_right_hold?: (coord: TileCoord) => void;
  on_tile_hover?: (coord: TileCoord | null) => void;
  on_tile_wheel?: (coord: TileCoord, delta_y: number) => void;
  on_tile_middle_click?: (coord: TileCoord) => void;
  on_prop_hover?: (prop_id: string | null) => void;
  on_prop_click?: (prop_id: string) => void;
  on_prop_wheel?: (prop_id: string, delta_y: number) => void;
  on_prop_middle_click?: (prop_id: string) => void;
  character_world_overrides?: Record<string, WorldPoint>;
  character_facing_overrides?: Record<string, CharacterFacing>;
  path_preview?: {
    path: HexCoord[];
    family?: PathFamily;
    tone?: 'move' | 'attack';
  } | null;
  projectiles?: Array<{
    id: string;
    sprite: string;
    world_position: WorldPoint;
    size_m: number;
    rotation_deg: number;
  }>;
  prop_effects?: Array<{
    id: string;
    prop_id: string;
    sprite: string;
    size_m: number;
    rotation_deg: number;
    offset_x: number;
    offset_y: number;
    offset_z: number;
  }>;
};

const stage_padding_px = 18;
const frame_padding_px = 12;
const stroke_safe_padding = 50;
const tile_hold_delay_ms = 220;

export function MapView({
  scene,
  active_speech_line = null,
  on_advance_speech,
  highlighted_tiles = [],
  highlighted_prop_ids = [],
  prop_highlight_tone = 'attack',
  on_tile_click,
  on_tile_hold,
  on_tile_right_click,
  on_tile_right_hold,
  on_tile_hover,
  on_tile_wheel,
  on_tile_middle_click,
  on_prop_hover,
  on_prop_click,
  on_prop_wheel,
  on_prop_middle_click,
  character_world_overrides = {},
  character_facing_overrides = {},
  path_preview = null,
  projectiles = [],
  prop_effects = [],
}: MapViewProps) {
  const [viewport_size, set_viewport_size] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  const [character_masks, set_character_masks] = useState<Record<string, CollisionMask>>({});
  const [prop_masks, set_prop_masks] = useState<Record<string, CollisionMask>>({});
  const [effect_masks, set_effect_masks] = useState<Record<string, CollisionMask>>({});
  const [hovered_tile, set_hovered_tile] = useState<TileCoord | null>(null);
  const hold_timer_ref = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const hold_fired_coord_ref = useRef<string | null>(null);
  const right_hold_timer_ref = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const right_hold_fired_coord_ref = useRef<string | null>(null);

  useEffect(() => {
    const update_viewport_size = () => {
      set_viewport_size({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', update_viewport_size);
    return () => window.removeEventListener('resize', update_viewport_size);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load_character_masks = async () => {
      const sprite_paths = Array.from(
        new Set(
          scene.characters.flatMap((character) => [
            character.defaults.sprite_front,
            character.defaults.sprite_back,
            character.defaults.sprite_left,
            character.defaults.sprite_right,
          ]),
        ),
      );

      const loaded_masks = await Promise.all(
        sprite_paths.map(async (sprite_path) => [sprite_path, await loadCollisionMask(sprite_path)] as const),
      );

      if (cancelled) {
        return;
      }

      set_character_masks(Object.fromEntries(loaded_masks));
    };

    void load_character_masks();

    return () => {
      cancelled = true;
    };
  }, [scene.characters]);

  useEffect(() => {
    let cancelled = false;

    const load_prop_masks = async () => {
      const sprite_paths = Array.from(
        new Set(scene.props.map((prop) => prop.sprite)),
      );

      const loaded_masks = await Promise.all(
        sprite_paths.map(async (sprite_path) => [sprite_path, await loadCollisionMask(sprite_path)] as const),
      );

      if (cancelled) {
        return;
      }

      set_prop_masks(Object.fromEntries(loaded_masks));
    };

    void load_prop_masks();

    return () => {
      cancelled = true;
    };
  }, [scene.props]);

  useEffect(() => {
    let cancelled = false;

    const effect_sprite_paths = Array.from(
      new Set([
        ...projectiles.map((projectile) => projectile.sprite),
        ...prop_effects.map((effect) => effect.sprite),
      ]),
    );

    const load_effect_masks = async () => {
      if (effect_sprite_paths.length === 0) {
        set_effect_masks({});
        return;
      }

      const loaded_masks = await Promise.all(
        effect_sprite_paths.map(async (sprite_path) => [sprite_path, await loadCollisionMask(sprite_path)] as const),
      );

      if (!cancelled) {
        set_effect_masks(Object.fromEntries(loaded_masks));
      }
    };

    void load_effect_masks();

    return () => {
      cancelled = true;
    };
  }, [
    projectiles.map((projectile) => projectile.sprite).sort().join('|'),
    prop_effects.map((effect) => effect.sprite).sort().join('|'),
  ]);

  useEffect(() => {
    return () => {
      if (hold_timer_ref.current !== null) {
        window.clearTimeout(hold_timer_ref.current);
      }
      if (right_hold_timer_ref.current !== null) {
        window.clearTimeout(right_hold_timer_ref.current);
      }
    };
  }, []);

  const {
    renderables,
    view_box_x,
    view_box_y,
    view_box_width,
    view_box_height,
  } = useMemo(() => {
    const projected_hex_extents = get_projected_hex_extents(default_projection_settings);
    const projected_tiles = scene.map.tiles.map((tile) => {
      const is_highlighted = highlighted_tiles.some(
        (highlight) =>
          highlight.q === tile.coord.q &&
          highlight.r === tile.coord.r &&
          highlight.s === tile.coord.s,
      );
      const world_position = flat_top_hex_to_world(tile.coord, default_projection_settings.tile_radius);
      const screen_position = project_world_to_screen(world_position, default_projection_settings);

      return {
        ...tile,
        world_position,
        x: screen_position.x,
        y: screen_position.y,
        is_highlighted,
        is_hovered:
          hovered_tile?.q === tile.coord.q &&
          hovered_tile?.r === tile.coord.r &&
          hovered_tile?.s === tile.coord.s,
        depth: get_depth_sort_value(screen_position, world_position),
        render_kind: 'tile' as const,
      };
    });

    const projected_characters = scene.characters.map((character) => {
      const effective_facing = character_facing_overrides[character.id] ?? character.facing;
      const world_position =
        character_world_overrides[character.id]
        ?? flat_top_hex_to_world(character.coord, default_projection_settings.tile_radius);
      const screen_position = project_world_to_screen(world_position, default_projection_settings);
      const sprite_path = (() => {
        switch (effective_facing) {
          case 'back':
            return character.defaults.sprite_back;
          case 'left':
            return character.defaults.sprite_left;
          case 'right':
            return character.defaults.sprite_right;
          case 'front':
          default:
            return character.defaults.sprite_front;
        }
      })();
      const sprite_mask = character_masks[sprite_path];
      const approximate_height =
        projected_hex_extents.max_y - projected_hex_extents.min_y;
      const perspective_scale = get_perspective_scale(screen_position.y, min_projected_y(scene), max_projected_y(scene), default_projection_settings);

      return {
        character: {
          ...character,
          facing: effective_facing,
        },
        world_position,
        sprite_mask,
        speaker_key: character.defaults.id.split('/')[0],
        character_layout: build_character_layout(character, screen_position, perspective_scale, sprite_mask),
        x: screen_position.x,
        y: screen_position.y,
        depth: get_depth_sort_value(screen_position, world_position) + 500,
        top_extent: screen_position.y - approximate_height * (character.info.height_cm / 100) * character.scale * perspective_scale,
        bottom_extent: screen_position.y + approximate_height * 0.08,
        render_kind: 'character' as const,
      };
    });

    const projected_props = scene.props.map((prop) => {
      const world_position = {
        ...flat_top_hex_to_world(prop.coord, default_projection_settings.tile_radius),
        z: prop.elevation,
      };
      const screen_position = project_world_to_screen(world_position, default_projection_settings);
      const perspective_scale = get_perspective_scale(screen_position.y, min_projected_y(scene), max_projected_y(scene), default_projection_settings);
      const sprite_mask = prop_masks[prop.sprite];
      const approximate_height = (projected_hex_extents.max_y - projected_hex_extents.min_y) * 1.04 * prop.scale * perspective_scale;
      const layout = build_prop_layout(prop, screen_position, perspective_scale, sprite_mask);

      return {
        prop,
        world_position,
        sprite_mask,
        layout,
        x: screen_position.x,
        y: screen_position.y,
        depth: get_depth_sort_value(screen_position, world_position) + 260,
        top_extent: screen_position.y - approximate_height * 0.84,
        bottom_extent: screen_position.y + approximate_height * 0.18,
        perspective_scale,
        render_kind: 'prop' as const,
      };
    });

    const min_x = Math.min(...projected_tiles.map((tile) => tile.x + projected_hex_extents.min_x));
    const max_x = Math.max(...projected_tiles.map((tile) => tile.x + projected_hex_extents.max_x));
    const min_y = Math.min(
      ...projected_tiles.map((tile) => tile.y + projected_hex_extents.min_y),
      ...projected_props.map((prop) => prop.top_extent),
      ...projected_characters.map((character) => character.top_extent),
    );
    const max_y = Math.max(
      ...projected_tiles.map((tile) => tile.y + projected_hex_extents.max_y),
      ...projected_props.map((prop) => prop.bottom_extent),
      ...projected_characters.map((character) => character.bottom_extent),
    );
    const y_span = Math.max(1, max_y - min_y);
    const renderables = [
      ...projected_tiles.map((tile) => ({
        ...tile,
        depth_ratio: (tile.y - min_y) / y_span,
      })),
      ...projected_props,
      ...projected_characters,
    ]
      .map((renderable) => {
        if (renderable.render_kind === 'character') {
          return {
            ...renderable,
            perspective_scale: get_perspective_scale(renderable.y, min_y, max_y, default_projection_settings),
          };
        }

        return renderable;
      })
      .sort((left, right) => {
        if (left.render_kind !== right.render_kind) {
          if (left.render_kind === 'tile') {
            return -1;
          }

          if (right.render_kind === 'tile') {
            return 1;
          }
        }

        if (left.render_kind === 'tile' && right.render_kind === 'tile') {
          if (left.is_hovered !== right.is_hovered) {
            return left.is_hovered ? 1 : -1;
          }

          if (left.is_highlighted !== right.is_highlighted) {
          return left.is_highlighted ? 1 : -1;
          }
        }

        return left.depth - right.depth;
      });

    return {
      renderables,
      view_box_x: min_x - stroke_safe_padding,
      view_box_y: min_y - stroke_safe_padding,
      view_box_width: max_x - min_x + stroke_safe_padding * 2,
      view_box_height: max_y - min_y + stroke_safe_padding * 2,
    };
  }, [character_facing_overrides, character_masks, character_world_overrides, highlighted_tiles, hovered_tile, prop_masks, scene]);

  const frame_width = viewport_size.width - stage_padding_px * 2;
  const frame_height = viewport_size.height - stage_padding_px * 2;
  const drawable_width = Math.max(0, frame_width - frame_padding_px * 2);
  const drawable_height = Math.max(0, frame_height - frame_padding_px * 2);
  const scale = Math.min(drawable_width / view_box_width, drawable_height / view_box_height);
  const svg_width = Math.floor(view_box_width * scale);
  const svg_height = Math.floor(view_box_height * scale);
  const active_speaker_name = active_speech_line
    ? {
        name:
          scene.characters.find(
            (character) => character.defaults.id.split('/')[0] === active_speech_line.speaker,
          )?.info.name ?? active_speech_line.speaker,
      }
    : null;
  const hovered_tile_label = hovered_tile
    ? `q ${hovered_tile.q} | r ${hovered_tile.r} | s ${hovered_tile.s}`
    : 'q -- | r -- | s --';

  return (
    <section className="map-view">
      <div
        className="map-view__frame"
        style={{
          width: `${svg_width + frame_padding_px * 2}px`,
          height: `${svg_height + frame_padding_px * 2}px`,
          padding: `${frame_padding_px}px`,
        }}
      >
        <svg
          className="map-view__svg"
          width={svg_width}
          height={svg_height}
          viewBox={`${view_box_x} ${view_box_y} ${view_box_width} ${view_box_height}`}
          role="img"
          aria-label={`${scene.map.id} hex map`}
        >
          <TileRenderDefs />

          {scene.map.tiles.map((tile) => (
            <polygon
              key={`hit:${tile.coord.q}:${tile.coord.r}:${tile.coord.s}`}
              data-coord={`${tile.coord.q},${tile.coord.r},${tile.coord.s}`}
              className="tile-hit-area"
              points={get_tile_hit_points(tile.coord)}
              fill="transparent"
              stroke="none"
              pointerEvents="all"
              onMouseEnter={() => {
                set_hovered_tile(tile.coord);
                on_tile_hover?.(tile.coord);
              }}
              onMouseLeave={() => {
                clear_tile_hold_timer(hold_timer_ref);
                clear_tile_hold_timer(right_hold_timer_ref);
                on_tile_hover?.(null);
                set_hovered_tile((current) =>
                  current &&
                  current.q === tile.coord.q &&
                  current.r === tile.coord.r &&
                  current.s === tile.coord.s
                    ? null
                    : current,
                );
              }}
              onMouseMove={() => on_tile_hover?.(tile.coord)}
              onWheel={(event) => {
                event.preventDefault();
                on_tile_wheel?.(tile.coord, event.deltaY);
              }}
              onMouseDown={(event) => {
                if (event.button === 0) {
                  clear_tile_hold_timer(hold_timer_ref);
                  const coord_key = `${tile.coord.q},${tile.coord.r},${tile.coord.s}`;
                  hold_timer_ref.current = window.setTimeout(() => {
                    hold_fired_coord_ref.current = coord_key;
                    on_tile_hold?.(tile.coord);
                  }, tile_hold_delay_ms);
                  return;
                }

                if (event.button !== 1) {
                  if (event.button === 2) {
                    event.preventDefault();
                    event.stopPropagation();
                    clear_tile_hold_timer(right_hold_timer_ref);
                    const coord_key = `${tile.coord.q},${tile.coord.r},${tile.coord.s}`;
                    right_hold_timer_ref.current = window.setTimeout(() => {
                      right_hold_fired_coord_ref.current = coord_key;
                      on_tile_right_hold?.(tile.coord);
                    }, tile_hold_delay_ms);
                  }
                  return;
                }

                event.preventDefault();
                event.stopPropagation();
                on_tile_middle_click?.(tile.coord);
              }}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault();
              }}
              onMouseUp={(event) => {
                clear_tile_hold_timer(hold_timer_ref);
                if (event.button === 2) {
                  const coord_key = `${tile.coord.q},${tile.coord.r},${tile.coord.s}`;
                  const did_right_hold_fire = right_hold_fired_coord_ref.current === coord_key;
                  clear_tile_hold_timer(right_hold_timer_ref);
                  if (did_right_hold_fire) {
                    right_hold_fired_coord_ref.current = null;
                    return;
                  }

                  on_tile_right_click?.(tile.coord);
                }
              }}
              onClick={() => {
                const coord_key = `${tile.coord.q},${tile.coord.r},${tile.coord.s}`;
                if (hold_fired_coord_ref.current === coord_key) {
                  hold_fired_coord_ref.current = null;
                  return;
                }

                on_tile_click?.(tile.coord);
              }}
            />
          ))}

          {renderables.map((renderable) => {
            if (renderable.render_kind !== 'prop') {
              return null;
            }

            const hit_padding_x = renderable.prop.kind === 'target_post' ? 16 : 6;
            const hit_padding_y = renderable.prop.kind === 'target_post' ? 12 : 6;

            return (
              <rect
                key={`prop-hit:${renderable.prop.id}`}
                className="prop-hit-area"
                x={renderable.layout.sprite_x + renderable.layout.opaque_bounds.left - hit_padding_x}
                y={renderable.layout.sprite_y + renderable.layout.opaque_bounds.top - hit_padding_y}
                width={Math.max(1, renderable.layout.opaque_bounds.right - renderable.layout.opaque_bounds.left + hit_padding_x * 2)}
                height={Math.max(1, renderable.layout.opaque_bounds.bottom - renderable.layout.opaque_bounds.top + hit_padding_y * 2)}
                fill="transparent"
                pointerEvents="all"
                onMouseEnter={(event) => {
                  event.stopPropagation();
                  on_prop_hover?.(renderable.prop.id);
                }}
                onMouseLeave={(event) => {
                  event.stopPropagation();
                  on_prop_hover?.(null);
                }}
                onWheel={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  on_prop_wheel?.(renderable.prop.id, event.deltaY);
                }}
                onMouseDown={(event) => {
                  if (event.button !== 1) {
                    return;
                  }

                  event.preventDefault();
                  event.stopPropagation();
                  on_prop_middle_click?.(renderable.prop.id);
                }}
                onAuxClick={(event) => {
                  if (event.button !== 1) {
                    return;
                  }

                  event.preventDefault();
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  on_prop_click?.(renderable.prop.id);
                }}
              />
            );
          })}

          <g filter="url(#platform-shadow-blur)">
            {renderables.map((renderable) => {
              if (renderable.render_kind !== 'tile') {
                return null;
              }

              return render_projected_tile({
                coord: renderable.coord,
                tile: renderable.tile,
                world_position: renderable.world_position,
                depth_ratio: renderable.depth_ratio,
                is_highlighted: renderable.is_highlighted,
                is_hovered: renderable.is_hovered,
              });
            })}
          </g>

          {renderables.map((renderable) => {
            if (renderable.render_kind === 'tile') {
              return render_projected_tile({
                coord: renderable.coord,
                tile: renderable.tile,
                world_position: renderable.world_position,
                depth_ratio: renderable.depth_ratio,
                is_highlighted: renderable.is_highlighted,
                is_hovered: renderable.is_hovered,
              });
            }

            return null;
          })}

          {renderables.map((renderable) => {
            if (renderable.render_kind !== 'prop') {
              return null;
            }

            if (!highlighted_prop_ids.includes(renderable.prop.id)) {
              return null;
            }

            return render_prop_tile_highlight(renderable.prop.coord, prop_highlight_tone, renderable.prop.id);
          })}

          {path_preview ? render_projected_path_preview(path_preview) : null}

          {projectiles.map((projectile) =>
            render_projected_projectile(
              projectile,
              get_perspective_scale(
                project_world_to_screen(projectile.world_position, default_projection_settings).y,
                min_projected_y(scene),
                max_projected_y(scene),
                default_projection_settings,
              ),
              effect_masks[projectile.sprite],
            ),
          )}

          {renderables.map((renderable) => {
            if (renderable.render_kind === 'tile') {
              return null;
            }

            if (renderable.render_kind === 'prop') {
              return (
                <g key={renderable.prop.id}>
                  {render_projected_prop({
                    prop: renderable.prop,
                    world_position: renderable.world_position,
                    perspective_scale: renderable.perspective_scale,
                    sprite_mask: renderable.sprite_mask,
                  })}
                  {prop_effects
                    .filter((effect) => effect.prop_id === renderable.prop.id)
                    .map((effect) =>
                      render_projected_projectile(
                        {
                          id: effect.id,
                          sprite: effect.sprite,
                          size_m: effect.size_m,
                          rotation_deg: effect.rotation_deg,
                          world_position: {
                            x: renderable.world_position.x + effect.offset_x,
                            y:
                              renderable.world_position.y
                              - default_projection_settings.tile_radius * 0.14
                              + effect.offset_y,
                            z: renderable.world_position.z + effect.offset_z,
                          },
                        },
                        renderable.perspective_scale,
                        effect_masks[effect.sprite],
                      ),
                    )}
                </g>
              );
            }

            return render_projected_character({
              character: renderable.character,
              world_position: renderable.world_position,
              perspective_scale: renderable.perspective_scale,
              sprite_mask: renderable.sprite_mask,
            });
          })}
        </svg>
        <div className="map-view__coord-readout" aria-live="polite">
          <span className="map-view__coord-title">Hover Tile</span>
          <span className="map-view__coord-value">{hovered_tile_label}</span>
        </div>
        {active_speech_line && active_speaker_name && on_advance_speech ? (
          <div className="speech-layer">
            <SpeechRenderer
              speaker_name={active_speaker_name.name}
              text={active_speech_line.text}
              on_advance={on_advance_speech}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function render_prop_tile_highlight(coord: TileCoord, tone: 'move' | 'attack', key: string) {
  const points = get_tile_hit_points(coord);
  const palette =
    tone === 'attack'
      ? {
          outer: 'rgba(131, 48, 53, 0.34)',
          inner: 'rgba(209, 116, 116, 0.88)',
        }
      : {
          outer: 'rgba(128, 173, 122, 0.38)',
          inner: 'rgba(188, 231, 172, 0.88)',
        };

  return (
    <g key={`prop-highlight:${key}`} pointerEvents="none">
      <polygon
        points={points}
        fill="none"
        stroke={palette.outer}
        strokeWidth="5.4"
        strokeLinejoin="round"
      />
      <polygon
        points={points}
        fill="none"
        stroke={palette.inner}
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
        strokeDasharray="34 18"
      >
        <animate
          attributeName="stroke-dashoffset"
          from="0"
          to="-104"
          dur="5.8s"
          repeatCount="indefinite"
        />
      </polygon>
    </g>
  );
}

function clear_tile_hold_timer(timer_ref: React.MutableRefObject<ReturnType<typeof window.setTimeout> | null>) {
  if (timer_ref.current !== null) {
    window.clearTimeout(timer_ref.current);
    timer_ref.current = null;
  }
}

function min_projected_y(scene: LoadedStageScene) {
  return Math.min(
    ...scene.map.tiles.map((tile) => flat_top_hex_to_world(tile.coord, default_projection_settings.tile_radius).y),
  ) * default_projection_settings.vertical_scale;
}

function max_projected_y(scene: LoadedStageScene) {
  return Math.max(
    ...scene.map.tiles.map((tile) => flat_top_hex_to_world(tile.coord, default_projection_settings.tile_radius).y),
  ) * default_projection_settings.vertical_scale;
}

function get_tile_hit_points(coord: TileCoord) {
  const world_position = flat_top_hex_to_world(coord, default_projection_settings.tile_radius);

  return Array.from({ length: 6 }, (_, index) => {
    const angle = (Math.PI / 180) * (60 * index);
    const world_point = {
      x: world_position.x + default_projection_settings.tile_radius * Math.cos(angle),
      y: world_position.y + default_projection_settings.tile_radius * Math.sin(angle),
      z: world_position.z,
    };
    const screen_point = project_world_to_screen(world_point, default_projection_settings);
    return `${screen_point.x},${screen_point.y}`;
  }).join(' ');
}

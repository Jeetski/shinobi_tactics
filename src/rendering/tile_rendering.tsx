import {
  build_projected_flat_top_hex_points,
  default_projection_settings,
} from '../projection';
import type { HexCoord, TileDefinition } from '../map_loader/map_types';
import type { WorldPoint } from '../projection';

type RenderableTile = {
  coord: HexCoord;
  tile: TileDefinition;
  world_position: WorldPoint;
  depth_ratio: number;
  is_highlighted?: boolean;
  is_hovered?: boolean;
};

export function TileRenderDefs() {
  return (
    <defs>
      <pattern
        id="tile-texture-dirt"
        patternUnits="userSpaceOnUse"
        width="96"
        height="96"
      >
        <image href="/resources/textures/dirt.png" x="0" y="0" width="96" height="96" preserveAspectRatio="xMidYMid slice" />
      </pattern>

      <linearGradient id="tile-light-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="rgba(255, 245, 222, 0.22)" />
        <stop offset="42%" stopColor="rgba(255, 228, 181, 0.08)" />
        <stop offset="100%" stopColor="rgba(24, 11, 5, 0.26)" />
      </linearGradient>

      <linearGradient id="tile-edge-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="rgba(255, 236, 212, 0.34)" />
        <stop offset="100%" stopColor="rgba(28, 13, 6, 0.55)" />
      </linearGradient>

      <filter id="tile-shadow-blur" x="-40%" y="-40%" width="180%" height="220%">
        <feGaussianBlur stdDeviation="9" />
      </filter>

      <filter id="platform-shadow-blur" x="-30%" y="-10%" width="160%" height="180%">
        <feOffset dx="0" dy="28" />
        <feGaussianBlur stdDeviation="18" />
        <feColorMatrix
          type="matrix"
          values="0 0 0 0 0
                  0 0 0 0 0
                  0 0 0 0 0
                  0 0 0 0.42 0"
        />
      </filter>
    </defs>
  );
}

export function render_projected_tile(tile: RenderableTile) {
  const points = build_projected_flat_top_hex_points(tile.world_position, default_projection_settings);
  const shadow_points = build_projected_flat_top_hex_points(
    {
      x: tile.world_position.x,
      y: tile.world_position.y + 18,
      z: tile.world_position.z,
    },
    default_projection_settings,
  );
  const variation = get_tile_variation(tile.coord);
  const depth_tint = get_depth_tint(tile.depth_ratio);

  return (
    <g key={`${tile.coord.q}:${tile.coord.r}:${tile.coord.s}`} pointerEvents="none">
      <polygon
        points={shadow_points}
        fill={`rgba(0, 0, 0, ${0.17 + variation.shadow_alpha})`}
        filter="url(#tile-shadow-blur)"
      />
      <polygon
        points={points}
        fill={`url(#tile-texture-${tile.tile.texture})`}
        stroke={`rgba(26, 14, 8, ${0.8 + variation.edge_alpha})`}
        strokeWidth="4"
      />
      <polygon
        points={points}
        fill={`rgba(255, 214, 161, ${0.02 + variation.warm_alpha})`}
      />
      <polygon
        points={points}
        fill={`rgba(255, 255, 255, ${depth_tint.top_light_alpha})`}
      />
      <polygon
        points={points}
        fill={`rgba(0, 0, 0, ${depth_tint.bottom_dark_alpha})`}
      />
      <polygon
        points={points}
        fill="url(#tile-light-gradient)"
      />
      <polygon
        points={points}
        fill="none"
        stroke="url(#tile-edge-gradient)"
        strokeWidth="1.65"
      />
      <polygon
        points={points}
        fill="none"
        stroke={`rgba(255, 247, 232, ${0.06 + variation.highlight_alpha})`}
        strokeWidth="0.8"
      />
      {tile.is_highlighted ? (
        <>
          <polygon
            points={points}
            fill="none"
            stroke="rgba(128, 173, 122, 0.38)"
            strokeWidth="5.4"
            strokeLinejoin="round"
          />
          <polygon
            points={points}
            fill="none"
            stroke="rgba(188, 231, 172, 0.88)"
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
        </>
      ) : null}
      {tile.is_hovered && !tile.is_highlighted ? (
        <polygon
          points={points}
          fill="none"
          stroke="rgba(255, 241, 212, 0.34)"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
      ) : null}
    </g>
  );
}

function get_tile_variation(coord: HexCoord) {
  const seed = pseudo_random(coord.q, coord.r, coord.s);

  return {
    warm_alpha: seed * 0.045,
    edge_alpha: seed * 0.08,
    highlight_alpha: seed * 0.06,
    shadow_alpha: seed * 0.08,
  };
}

function get_depth_tint(depth_ratio: number) {
  const clamped = Math.max(0, Math.min(1, depth_ratio));
  const inverse = 1 - clamped;

  return {
    top_light_alpha: inverse * 0.08,
    bottom_dark_alpha: clamped * 0.18,
  };
}

function pseudo_random(q: number, r: number, s: number) {
  const raw = Math.sin(q * 127.1 + r * 311.7 + s * 74.7) * 43758.5453123;
  return raw - Math.floor(raw);
}

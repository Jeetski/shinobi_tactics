import { default_projection_settings, flat_top_hex_to_world, project_world_to_screen } from '../projection';
import type { HexCoord } from '../map_loader/map_types';
import type { PathFamily } from '../movement';

type PathPreviewProps = {
  path: HexCoord[];
  family?: PathFamily;
  tone?: 'move' | 'attack';
};

export function render_projected_path_preview({
  path,
  family: _family = 'short',
  tone = 'move',
}: PathPreviewProps) {
  if (path.length < 2) {
    return null;
  }

  const screen_points = path.map((coord) => {
    const world = flat_top_hex_to_world(coord, default_projection_settings.tile_radius);
    return project_world_to_screen(world, default_projection_settings);
  });
  const palette = tone === 'attack'
    ? {
        back_stroke: 'rgba(116, 42, 48, 0.34)',
        front_stroke: 'rgba(210, 113, 113, 0.88)',
        end_fill: 'rgba(234, 157, 157, 0.96)',
        node_fill: 'rgba(193, 103, 103, 0.78)',
        node_stroke: 'rgba(58, 20, 21, 0.84)',
      }
    : {
        back_stroke: 'rgba(67, 134, 91, 0.34)',
        front_stroke: 'rgba(154, 245, 169, 0.92)',
        end_fill: 'rgba(180, 255, 187, 0.98)',
        node_fill: 'rgba(140, 221, 150, 0.82)',
        node_stroke: 'rgba(18, 42, 19, 0.8)',
      };

  const polyline_points = screen_points.map((point) => `${point.x},${point.y}`).join(' ');
  const arrow_head = build_arrow_head(screen_points[screen_points.length - 2], screen_points[screen_points.length - 1]);

  return (
    <g pointerEvents="none">
      <polyline
        points={polyline_points}
        fill="none"
        stroke={palette.back_stroke}
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polyline
        points={polyline_points}
        fill="none"
        stroke={palette.front_stroke}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="18 10"
      >
        <animate
          attributeName="stroke-dashoffset"
          from="0"
          to="-56"
          dur="2.8s"
          repeatCount="indefinite"
        />
      </polyline>

      {screen_points.map((point, index) => (
        <circle
          key={`path-node:${index}:${point.x}:${point.y}`}
          cx={point.x}
          cy={point.y}
          r={index === screen_points.length - 1 ? 7.5 : 4}
          fill={index === screen_points.length - 1 ? palette.end_fill : palette.node_fill}
          stroke={palette.node_stroke}
          strokeWidth="2"
        />
      ))}

      <polygon
        points={arrow_head}
        fill={palette.end_fill}
        stroke={palette.node_stroke}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </g>
  );
}

function build_arrow_head(previous: { x: number; y: number }, current: { x: number; y: number }) {
  const angle = Math.atan2(current.y - previous.y, current.x - previous.x);
  const size = 12;
  const spread = Math.PI / 7;

  const left = {
    x: current.x - size * Math.cos(angle - spread),
    y: current.y - size * Math.sin(angle - spread),
  };
  const right = {
    x: current.x - size * Math.cos(angle + spread),
    y: current.y - size * Math.sin(angle + spread),
  };

  return `${current.x},${current.y} ${left.x},${left.y} ${right.x},${right.y}`;
}

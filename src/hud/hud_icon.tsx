import { useEffect, useMemo, useState } from 'react';
import { getRenderedOpaqueBounds, loadCollisionMask, type CollisionMask } from '../lib/collision_mask';

type HudIconProps = {
  icon: string;
  box_size: number;
  class_name?: string;
};

export function HudIcon({ icon, box_size, class_name = '' }: HudIconProps) {
  const [mask, set_mask] = useState<CollisionMask | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load_mask = async () => {
      const next_mask = await loadCollisionMask(icon);
      if (!cancelled) {
        set_mask(next_mask);
      }
    };

    void load_mask();

    return () => {
      cancelled = true;
    };
  }, [icon]);

  const layout = useMemo(() => {
    const rendered_width = box_size;
    const rendered_height = box_size;
    const opaque_bounds = mask
      ? getRenderedOpaqueBounds(mask, rendered_width, rendered_height)
      : null;
    const opaque_center_x = opaque_bounds ? (opaque_bounds.left + opaque_bounds.right) / 2 : rendered_width / 2;
    const opaque_bottom_y = opaque_bounds ? opaque_bounds.bottom : rendered_height * 0.94;

    return {
      width: rendered_width,
      height: rendered_height,
      x: box_size / 2 - opaque_center_x,
      y: box_size - opaque_bottom_y,
    };
  }, [box_size, mask]);

  return (
    <img
      className={class_name}
      src={icon}
      alt=""
      width={layout.width}
      height={layout.height}
      style={{
        left: `${layout.x}px`,
        top: `${layout.y}px`,
      }}
    />
  );
}

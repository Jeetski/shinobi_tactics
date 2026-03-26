import { useEffect, useMemo, useState } from 'react';
import { getRenderedOpaqueBounds, loadCollisionMask, type CollisionMask } from '../lib/collision_mask';
import './inventory_bar.css';

type InventoryItem = {
  icon: string;
  count: number;
};

type InventoryBarProps = {
  slots: Array<InventoryItem | null>;
  selected_index?: number | null;
  on_select_slot?: (index: number) => void;
};

const icon_box_size = 30;

export function InventoryBar({ slots, selected_index = null, on_select_slot }: InventoryBarProps) {
  const [icon_masks, set_icon_masks] = useState<Record<string, CollisionMask>>({});
  const icon_path_signature = useMemo(
    () =>
      slots
        .filter((slot): slot is InventoryItem => slot !== null)
        .map((slot) => slot.icon)
        .sort()
        .join('|'),
    [slots],
  );

  useEffect(() => {
    let cancelled = false;

    const load_masks = async () => {
      const icon_paths = Array.from(
        new Set(
          slots
            .filter((slot): slot is InventoryItem => slot !== null)
            .map((slot) => slot.icon),
        ),
      );
      const loaded_masks = await Promise.all(
        icon_paths.map(async (icon_path) => [icon_path, await loadCollisionMask(icon_path)] as const),
      );

      if (!cancelled) {
        set_icon_masks(Object.fromEntries(loaded_masks));
      }
    };

    void load_masks();

    return () => {
      cancelled = true;
    };
  }, [icon_path_signature]);

  return (
    <div className="inventory-bar" aria-label="Equipment and inventory">
      {slots.map((slot, index) => (
        <button
          key={`slot:${index}`}
          type="button"
          className={`inventory-bar__slot${selected_index === index ? ' inventory-bar__slot--selected' : ''}`}
          onClick={() => on_select_slot?.(index)}
        >
          {slot ? (
            <>
              <div className="inventory-bar__icon-box">
                <InventoryIcon
                  icon={slot.icon}
                  mask={icon_masks[slot.icon]}
                />
              </div>
              <span className="inventory-bar__count">{slot.count}</span>
            </>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function InventoryIcon({
  icon,
  mask,
}: {
  icon: string;
  mask?: CollisionMask;
}) {
  const layout = useMemo(() => {
    const rendered_width = icon_box_size;
    const rendered_height = icon_box_size;
    const opaque_bounds = mask
      ? getRenderedOpaqueBounds(mask, rendered_width, rendered_height)
      : null;
    const opaque_center_x = opaque_bounds ? (opaque_bounds.left + opaque_bounds.right) / 2 : rendered_width / 2;
    const opaque_bottom_y = opaque_bounds ? opaque_bounds.bottom : rendered_height * 0.94;

    return {
      width: rendered_width,
      height: rendered_height,
      x: icon_box_size / 2 - opaque_center_x,
      y: icon_box_size - opaque_bottom_y,
    };
  }, [mask]);

  return (
    <img
      className="inventory-bar__icon"
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

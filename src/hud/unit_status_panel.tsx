import { useEffect, useMemo, useState } from 'react';
import { getRenderedOpaqueBounds, loadCollisionMask, type CollisionMask } from '../lib/collision_mask';
import './unit_status_panel.css';

type ResourceBar = {
  label: string;
  value: number;
  tone: 'stamina' | 'chakra_infused' | 'chakra_pool';
};

type UnitStatusPanelProps = {
  avatar: string;
  name: string;
  bars: ResourceBar[];
};

const avatar_box_width = 80;
const avatar_box_height = 80;

export function UnitStatusPanel({ avatar, name, bars }: UnitStatusPanelProps) {
  const [avatar_mask, set_avatar_mask] = useState<CollisionMask | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load_mask = async () => {
      const mask = await loadCollisionMask(avatar);
      if (!cancelled) {
        set_avatar_mask(mask);
      }
    };

    void load_mask();

    return () => {
      cancelled = true;
    };
  }, [avatar]);

  const avatar_layout = useMemo(() => {
    const opaque_bounds = avatar_mask
      ? getRenderedOpaqueBounds(avatar_mask, avatar_box_width, avatar_box_height)
      : null;
    const opaque_center_x = opaque_bounds ? (opaque_bounds.left + opaque_bounds.right) / 2 : avatar_box_width / 2;
    const opaque_bottom_y = opaque_bounds ? opaque_bounds.bottom : avatar_box_height * 0.94;

    return {
      width: avatar_box_width,
      height: avatar_box_height,
      x: avatar_box_width / 2 - opaque_center_x,
      y: avatar_box_height - opaque_bottom_y,
    };
  }, [avatar_mask]);

  return (
    <section className="unit-status-panel" aria-label={`${name} status`}>
      <div className="unit-status-panel__avatar-frame">
        <img
          className="unit-status-panel__avatar"
          src={avatar}
          alt=""
          width={avatar_layout.width}
          height={avatar_layout.height}
          style={{
            left: `${avatar_layout.x}px`,
            top: `${avatar_layout.y}px`,
          }}
        />
      </div>

      <div className="unit-status-panel__content">
        <h2 className="unit-status-panel__name">{name}</h2>
        <div className="unit-status-panel__bars">
          {bars.map((bar) => (
            <div key={bar.label} className="unit-status-panel__bar-row">
              <div className={`unit-status-panel__bar unit-status-panel__bar--${bar.tone}`}>
                <div
                  className="unit-status-panel__bar-fill"
                  style={{ width: `${Math.max(0, Math.min(100, bar.value * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

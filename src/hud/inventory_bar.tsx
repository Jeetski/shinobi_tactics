import { HudIcon } from './hud_icon';
import './inventory_bar.css';

type InventoryItem = {
  icon: string;
  count: number;
};

type InventoryBarProps = {
  slots: Array<InventoryItem | null>;
  selected_index?: number | null;
  highlighted_indices?: number[];
  on_select_slot?: (index: number) => void;
};

const icon_box_size = 30;

export function InventoryBar({
  slots,
  selected_index = null,
  highlighted_indices = [],
  on_select_slot,
}: InventoryBarProps) {
  return (
    <div className="inventory-bar" aria-label="Equipment and inventory">
      {slots.map((slot, index) => (
        <button
          key={`slot:${index}`}
          type="button"
          className={`inventory-bar__slot${selected_index === index ? ' inventory-bar__slot--selected' : ''}${highlighted_indices.includes(index) ? ' inventory-bar__slot--highlighted' : ''}`}
          onClick={() => on_select_slot?.(index)}
        >
          {slot ? (
            <>
              <div className="inventory-bar__icon-box">
                <HudIcon icon={slot.icon} box_size={icon_box_size} class_name="inventory-bar__icon" />
              </div>
              <span className="inventory-bar__count">{slot.count}</span>
            </>
          ) : null}
        </button>
      ))}
    </div>
  );
}

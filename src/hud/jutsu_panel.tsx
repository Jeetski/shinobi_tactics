import { HudIcon } from './hud_icon';
import './jutsu_panel.css';

type JutsuItem = {
  id: string;
  label: string;
  icon?: string | null;
  abbreviation?: string;
};

type JutsuPanelProps = {
  is_open: boolean;
  items: JutsuItem[];
  highlighted_item_id?: string | null;
  on_toggle: () => void;
  on_select_item?: (item_id: string) => void;
};

export function JutsuPanel({
  is_open,
  items,
  highlighted_item_id = null,
  on_toggle,
  on_select_item,
}: JutsuPanelProps) {
  return (
    <aside className={`jutsu-panel${is_open ? ' is-open' : ' is-collapsed'}`} aria-label="Jutsu panel">
      <button type="button" className="jutsu-panel__toggle" onClick={on_toggle}>
        {is_open ? 'Jutsu >' : '< Jutsu'}
      </button>
      {is_open ? (
        <div className="jutsu-panel__sheet">
          <h2 className="jutsu-panel__title">Jutsu</h2>
          <div className="jutsu-panel__list">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`jutsu-panel__item${highlighted_item_id === item.id ? ' is-highlighted' : ''}`}
                onClick={() => on_select_item?.(item.id)}
                aria-label={item.label}
                title={item.label}
              >
                <div className="jutsu-panel__item-icon">
                  {item.icon ? (
                    <HudIcon icon={item.icon} box_size={54} class_name="jutsu-panel__item-icon-image" />
                  ) : (
                    <span className="jutsu-panel__item-abbreviation">{item.abbreviation ?? item.label.slice(0, 2)}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}

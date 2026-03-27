import { HudIcon } from './hud_icon';
import './action_queue_bar.css';

type ActionQueueItem = {
  id: string;
  label: string;
  icon?: string | null;
  abbreviation?: string;
};

type ActionQueueBarProps = {
  slots: Array<ActionQueueItem | null>;
  is_ready_enabled?: boolean;
  is_ready_highlighted?: boolean;
  on_ready?: () => void;
};

const icon_box_size = 28;

export function ActionQueueBar({
  slots,
  is_ready_enabled = false,
  is_ready_highlighted = false,
  on_ready,
}: ActionQueueBarProps) {
  return (
    <div className="action-queue-bar" aria-label="Action queue">
      {slots.map((slot, index) => (
        <div key={`queue-slot:${index}`} className="action-queue-bar__slot">
          {slot ? (
            <>
              <div className="action-queue-bar__icon-box">
                {slot.icon ? (
                  <HudIcon icon={slot.icon} box_size={icon_box_size} class_name="action-queue-bar__icon" />
                ) : (
                  <span className="action-queue-bar__abbreviation">{slot.abbreviation ?? slot.label.slice(0, 2)}</span>
                )}
              </div>
              <span className="action-queue-bar__index">{index + 1}</span>
            </>
          ) : (
            <span className="action-queue-bar__index">{index + 1}</span>
          )}
        </div>
      ))}
      <button
        type="button"
        className={`action-queue-bar__marker${is_ready_highlighted ? ' is-highlighted' : ''}`}
        onClick={on_ready}
        disabled={!is_ready_enabled}
        aria-label="Execute action chain"
        title="Execute action chain"
      >
        <span className="action-queue-bar__check">✓</span>
      </button>
    </div>
  );
}

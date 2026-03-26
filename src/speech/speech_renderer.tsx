import { useEffect, useMemo, useState } from 'react';
import {
  loadCollisionMaskWithPredicate,
  normalizeBounds,
  type CollisionMask,
} from '../lib/collision_mask';
import { render_dialogue_markdown } from './dialogue_markdown';
import './speech.css';

type SpeechRendererProps = {
  speaker_name: string;
  text: string;
  on_advance: () => void;
};

const bubble_width = 300;
const bubble_height_scale = 0.5;
const fallback_crop = {
  left: 0.12,
  right: 0.88,
  top: 0.2,
  bottom: 0.78,
};

export function SpeechRenderer({
  speaker_name,
  text,
  on_advance,
}: SpeechRendererProps) {
  const [bubble_mask, set_bubble_mask] = useState<CollisionMask | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load_mask = async () => {
      const mask = await loadCollisionMaskWithPredicate(
        '/resources/UI/speech/dialogue_box.png',
        (red, green, blue, alpha) => alpha >= 8 && red + green + blue > 110,
      );
      if (!cancelled) {
        set_bubble_mask(mask);
      }
    };

    void load_mask();

    return () => {
      cancelled = true;
    };
  }, []);

  const bubble_metrics = useMemo(() => {
    const crop = bubble_mask ? normalizeBounds(bubble_mask) : fallback_crop;
    const crop_width_ratio = Math.max(0.01, crop.right - crop.left);
    const crop_height_ratio = Math.max(0.01, crop.bottom - crop.top);
    const natural_bubble_height = bubble_width * (crop_height_ratio / crop_width_ratio);
    const bubble_height = natural_bubble_height * bubble_height_scale;
    const source_width = bubble_width / crop_width_ratio;
    const source_height = natural_bubble_height / crop_height_ratio;

    return {
      bubble_height,
      image: {
        width: source_width,
        height: source_height,
        left: -crop.left * source_width,
        top: -crop.top * source_height - (natural_bubble_height - bubble_height) * 0.5,
      },
      content: {
        top: bubble_height * 0.2,
        right: bubble_width * 0.15,
        bottom: bubble_height * 0.2,
        left: bubble_width * 0.15,
      },
    };
  }, [bubble_mask]);

  return (
    <button
      type="button"
      className="speech-bubble"
      style={{
        width: `${bubble_width}px`,
        height: `${bubble_metrics.bubble_height}px`,
      }}
      onClick={on_advance}
    >
      <img
        className="speech-bubble__art"
        src="/resources/UI/speech/dialogue_box.png"
        alt=""
        style={{
          width: `${bubble_metrics.image.width}px`,
          height: `${bubble_metrics.image.height}px`,
          left: `${bubble_metrics.image.left}px`,
          top: `${bubble_metrics.image.top}px`,
        }}
      />
      <div
        className="speech-bubble__content"
        style={{
          top: `${bubble_metrics.content.top}px`,
          right: `${bubble_metrics.content.right}px`,
          bottom: `${bubble_metrics.content.bottom}px`,
          left: `${bubble_metrics.content.left}px`,
        }}
      >
        <p className="speech-bubble__speaker">{speaker_name}</p>
        <div className="speech-bubble__text">{render_dialogue_markdown(text)}</div>
        <div className="speech-bubble__actions" aria-hidden="true">
          <span className="speech-bubble__key speech-bubble__key--secondary">Esc</span>
          <span className="speech-bubble__key speech-bubble__key--primary">Enter</span>
        </div>
      </div>
    </button>
  );
}

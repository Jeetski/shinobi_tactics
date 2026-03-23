import { useEffect, useMemo, useState } from 'react';
import type { SpeechLine, SpeechState } from './speech_types';

const typewriter_interval_ms = 24;

export function use_speech_controller(lines: SpeechLine[]) {
  const [active_index, set_active_index] = useState(0);
  const [visible_count, set_visible_count] = useState(0);
  const [is_finished, set_is_finished] = useState(lines.length === 0);

  useEffect(() => {
    set_active_index(0);
    set_visible_count(0);
    set_is_finished(lines.length === 0);
  }, [lines]);

  const active_line = useMemo(() => {
    if (is_finished) {
      return null;
    }

    return lines[active_index] ?? null;
  }, [active_index, is_finished, lines]);

  useEffect(() => {
    if (!active_line || visible_count >= active_line.text.length) {
      return;
    }

    const timeout_id = window.setTimeout(() => {
      set_visible_count((current) => Math.min(current + 1, active_line.text.length));
    }, typewriter_interval_ms);

    return () => window.clearTimeout(timeout_id);
  }, [active_line, visible_count]);

  useEffect(() => {
    const handle_key_down = (event: KeyboardEvent) => {
      if (!active_line) {
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        advance();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        skip();
      }
    };

    window.addEventListener('keydown', handle_key_down);
    return () => window.removeEventListener('keydown', handle_key_down);
  }, [active_line, visible_count]);

  function advance() {
    if (!active_line) {
      return;
    }

    if (visible_count < active_line.text.length) {
      set_visible_count(active_line.text.length);
      return;
    }

    const next_index = active_index + 1;
    if (next_index >= lines.length) {
      set_is_finished(true);
      return;
    }

    set_active_index(next_index);
    set_visible_count(0);
  }

  function skip() {
    set_is_finished(true);
  }

  const speech_state: SpeechState = {
    active_line,
    visible_text: active_line ? active_line.text.slice(0, visible_count) : '',
    is_line_complete: active_line ? visible_count >= active_line.text.length : true,
    is_finished,
  };

  return {
    speech_state,
    advance,
    skip,
  };
}

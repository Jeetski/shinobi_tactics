import { useEffect, useMemo, useState } from 'react';
import type { SpeechLine, SpeechState } from './speech_types';

const typewriter_interval_ms = 24;

export function use_speech_controller(lines: SpeechLine[]) {
  const [active_index, set_active_index] = useState(0);
  const [visible_count, set_visible_count] = useState(0);
  const [is_finished, set_is_finished] = useState(lines.length === 0);
  const [is_hidden, set_is_hidden] = useState(false);
  const [fulfilled_waits, set_fulfilled_waits] = useState<Record<string, true>>({});

  useEffect(() => {
    set_active_index(0);
    set_visible_count(0);
    set_is_finished(lines.length === 0);
    set_is_hidden(false);
    set_fulfilled_waits({});
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
        if (is_hidden) {
          set_is_hidden(false);
          return;
        }
        advance();
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        dismiss();
      }
    };

    window.addEventListener('keydown', handle_key_down);
    return () => window.removeEventListener('keydown', handle_key_down);
  }, [active_line, is_hidden, visible_count]);

  useEffect(() => {
    if (!active_line || is_finished) {
      return;
    }

    set_is_hidden(false);
  }, [active_index, active_line, is_finished]);

  useEffect(() => {
    if (!active_line || visible_count < active_line.text.length || !active_line.wait) {
      return;
    }

    if (!fulfilled_waits[active_line.wait]) {
      return;
    }

    const timeout_id = window.setTimeout(() => {
      advance();
    }, 120);

    return () => window.clearTimeout(timeout_id);
  }, [active_line, fulfilled_waits, visible_count]);

  function advance() {
    if (!active_line) {
      return;
    }

    if (visible_count < active_line.text.length) {
      set_visible_count(active_line.text.length);
      return;
    }

    if (active_line.wait && !fulfilled_waits[active_line.wait]) {
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

  function dismiss() {
    set_is_hidden(true);
  }

  function fulfill_wait(wait_key: string) {
    set_fulfilled_waits((current) => {
      if (current[wait_key]) {
        return current;
      }

      return {
        ...current,
        [wait_key]: true,
      };
    });
  }

  const active_wait_satisfied = active_line?.wait ? Boolean(fulfilled_waits[active_line.wait]) : true;

  const speech_state: SpeechState = {
    active_line,
    visible_text: active_line ? active_line.text.slice(0, visible_count) : '',
    is_line_complete: active_line ? visible_count >= active_line.text.length : true,
    is_waiting: Boolean(active_line?.wait),
    wait_key: active_line?.wait ?? null,
    is_wait_satisfied: active_wait_satisfied,
    is_finished,
    is_hidden,
  };

  return {
    speech_state,
    advance,
    fulfill_wait,
    dismiss,
  };
}

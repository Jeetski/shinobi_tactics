export type SpeechLine = {
  speaker: string;
  text: string;
  wait?: string;
};

export type SpeechState = {
  active_line: SpeechLine | null;
  visible_text: string;
  is_line_complete: boolean;
  is_waiting: boolean;
  wait_key: string | null;
  is_wait_satisfied: boolean;
  is_finished: boolean;
  is_hidden: boolean;
};

export type SpeechLine = {
  speaker: string;
  text: string;
};

export type SpeechState = {
  active_line: SpeechLine | null;
  visible_text: string;
  is_line_complete: boolean;
  is_finished: boolean;
};

import { parse_simple_yaml } from '../map_loader/simple_yaml';
import type { DialogueFileSource } from '../map_loader/map_types';
import type { SpeechLine } from './speech_types';

export async function load_dialogue_script(path: string) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load dialogue from ${path}`);
  }

  const source = await response.text();
  const parsed = parse_simple_yaml(source) as DialogueFileSource;
  return (parsed.dialogue ?? []) as SpeechLine[];
}

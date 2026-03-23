export type MenuOption = {
  id: string;
  label: string;
  blurb: string;
};

export type MenuScreen = 'main' | 'story' | 'new_game';

export const main_menu_options: MenuOption[] = [
  { id: 'story', label: 'STORY', blurb: 'Follow a branching shinobi campaign through rival villages, betrayals, and squad tactics.' },
  { id: 'training', label: 'TRAINING', blurb: 'Practice movement, chakra timing, and combo routes against curated dojo challenges.' },
  { id: 'online', label: 'ONLINE', blurb: 'Fight live opponents, climb ranked ladders, and test team compositions in real time.' },
  { id: 'missions', label: 'MISSIONS', blurb: 'Take on short contracts with escalating objectives, modifiers, and reward paths.' },
  { id: 'sandbox', label: 'SANDBOX', blurb: 'Drop into an unrestricted arena to prototype builds, jutsu chains, and map interactions.' },
  { id: 'studio', label: 'STUDIO', blurb: 'Create scenes, tune camera framing, and preview custom encounters for future content.' },
  { id: 'settings', label: 'SETTINGS', blurb: 'Adjust visuals, audio, controls, and accessibility before heading into battle.' },
];

export const story_menu_options: MenuOption[] = [
  { id: 'new_game', label: 'NEW GAME', blurb: 'Start a new story campaign.' },
  { id: 'load_game', label: 'LOAD GAME', blurb: 'Continue from an existing save.' },
];

export const new_game_menu_options: MenuOption[] = [
  { id: 'naruto', label: 'NARUTO', blurb: 'Begin the story as Naruto.' },
  { id: 'sasuke', label: 'SASUKE', blurb: 'Begin the story as Sasuke.' },
];

export function get_menu_options(menu_screen: MenuScreen) {
  if (menu_screen === 'story') {
    return story_menu_options;
  }

  if (menu_screen === 'new_game') {
    return new_game_menu_options;
  }

  return main_menu_options;
}

export function get_main_menu_story_index() {
  return main_menu_options.findIndex((option) => option.id === 'story');
}

export function get_story_menu_new_game_index() {
  return story_menu_options.findIndex((option) => option.id === 'new_game');
}

export type HexOrientation = 'flat_top';
export type CharacterFacing = 'front' | 'back' | 'left' | 'right';

export type HexCoord = {
  q: number;
  r: number;
  s: number;
};

export type TileProperties = {
  flammable: boolean;
  slippery: boolean;
  blocks_movement: boolean;
  blocks_vision: boolean;
};

export type TileDefinition = {
  id: string;
  name: string;
  texture: string;
  properties: TileProperties;
};

export type StageMapSource = {
  id: string;
  layout: {
    orientation: HexOrientation;
    radius: number;
  };
  fill: {
    tile: string;
  };
  overrides?: {
    rings?: Array<{
      radius: number;
      tile: string;
    }>;
  };
};

export type StageTile = {
  coord: HexCoord;
  tile_id: string;
  tile: TileDefinition;
};

export type LoadedStageMap = {
  id: string;
  orientation: HexOrientation;
  radius: number;
  tiles: StageTile[];
};

export type SceneSource = {
  id: string;
  stage_name: string;
  scene_name: string;
  background?: {
    preset: string;
  };
  music?: string;
  map: string;
  characters: string;
  props?: string;
  dialogue?: string;
};

export type CharacterDefaults = {
  id: string;
  sprite_front: string;
  sprite_back: string;
  sprite_left: string;
  sprite_right: string;
};

export type CharacterInfo = {
  name: string;
  height_cm: number;
};

export type CharacterPlacementSource = {
  character: string;
  q: number;
  r: number;
  s: number;
  facing: CharacterFacing;
  scale?: number;
};

export type CharactersFileSource = {
  characters: Record<string, CharacterPlacementSource>;
};

export type LoadedCharacter = {
  id: string;
  coord: HexCoord;
  facing: CharacterFacing;
  scale: number;
  info: CharacterInfo;
  defaults: CharacterDefaults;
};

export type StagePropSource = {
  kind?: string;
  sprite: string;
  q: number;
  r: number;
  s: number;
  scale?: number;
  elevation?: number;
};

export type StagePropsFileSource = {
  props: Record<string, StagePropSource>;
};

export type LoadedStageProp = {
  id: string;
  kind: string | null;
  coord: HexCoord;
  sprite: string;
  scale: number;
  elevation: number;
};

export type DialogueLine = {
  speaker: string;
  text: string;
};

export type DialogueFileSource = {
  dialogue: DialogueLine[];
};

export type LoadedStageScene = {
  id: string;
  stage_name: string;
  scene_name: string;
  background_preset: string;
  music_path: string | null;
  dialogue_path: string | null;
  map: LoadedStageMap;
  characters: LoadedCharacter[];
  props: LoadedStageProp[];
};

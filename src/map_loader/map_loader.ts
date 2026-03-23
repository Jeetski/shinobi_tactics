import { build_hex_disc } from './hex';
import type {
  CharacterDefaults,
  CharacterInfo,
  CharactersFileSource,
  LoadedCharacter,
  LoadedStageMap,
  LoadedStageScene,
  SceneSource,
  StageMapSource,
  TileDefinition,
} from './map_types';
import { parse_simple_yaml } from './simple_yaml';

export async function load_stage_map(stage_path: string) {
  const map_source = (await load_yaml(stage_path)) as StageMapSource;
  const tile_definition = await load_tile_definition(map_source.fill.tile);
  const coords = build_hex_disc(map_source.layout.radius);

  const loaded_map: LoadedStageMap = {
    id: map_source.id,
    orientation: map_source.layout.orientation,
    radius: map_source.layout.radius,
    tiles: coords.map((coord) => ({
      coord,
      tile_id: tile_definition.id,
      tile: tile_definition,
    })),
  };

  return loaded_map;
}

export async function load_stage_scene(scene_root_path: string) {
  const scene_source = (await load_yaml(`${scene_root_path}/scene.yml`)) as SceneSource;
  const map = await load_stage_map(`${scene_root_path}/${scene_source.map}`);
  const characters = await load_scene_characters(scene_root_path, scene_source.characters);

  const loaded_scene: LoadedStageScene = {
    id: scene_source.id,
    stage_name: scene_source.stage_name,
    scene_name: scene_source.scene_name,
    background_preset: scene_source.background?.preset ?? 'void',
    music_path: scene_source.music ?? null,
    dialogue_path: scene_source.dialogue ? `${scene_root_path}/${scene_source.dialogue}` : null,
    map,
    characters,
  };

  return loaded_scene;
}

async function load_tile_definition(tile_id: string) {
  const tile = (await load_yaml(`/resources/tiles/${tile_id}.yml`)) as TileDefinition;
  return tile;
}

async function load_character_defaults(character_id: string) {
  const character = (await load_yaml(`/resources/characters/${character_id}/defaults.yaml`)) as CharacterDefaults;
  return character;
}

async function load_character_info(character_id: string) {
  const character = (await load_yaml(`/resources/characters/${character_id}/info.yaml`)) as CharacterInfo;
  return character;
}

async function load_scene_characters(scene_root_path: string, characters_file: string) {
  const characters_source = (await load_yaml(`${scene_root_path}/${characters_file}`)) as CharactersFileSource;
  const loaded_characters: LoadedCharacter[] = [];

  for (const [instance_id, placement] of Object.entries(characters_source.characters)) {
    const defaults = await load_character_defaults(placement.character);
    const info = await load_character_info(placement.character);

    loaded_characters.push({
      id: instance_id,
      coord: {
        q: placement.q,
        r: placement.r,
        s: placement.s,
      },
      facing: placement.facing,
      scale: placement.scale ?? 1,
      info,
      defaults,
    });
  }

  return loaded_characters;
}

async function load_yaml(path: string) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load YAML from ${path}`);
  }

  const source = await response.text();
  return parse_simple_yaml(source);
}

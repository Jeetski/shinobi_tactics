import { LIBRARY_ASSET_MAP } from "../data/library_assets.js";

function prettyYamlObject(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseYamlObject(text) {
  return JSON.parse(text);
}

export function buildEditorFiles(documentState) {
  const files = [
    {
      name: "character.yml",
      content: prettyYamlObject({
        version: documentState.version,
        files: {
          identity: "identity.yml",
          proportions: "proportions.yml",
          rig: "rig.yml",
          expressions: "expressions.yml",
          animations: "animations.yml",
          animation_composition: "animation_composition.yml",
          layers: "layers.yml",
          palettes: "palettes.yml",
          references: "references.yml",
          underlay: documentState.underlay.data_url ? "underlay.yml" : null,
        },
      }),
    },
    {
      name: "identity.yml",
      content: prettyYamlObject(documentState.identity),
    },
    {
      name: "proportions.yml",
      content: prettyYamlObject(documentState.proportions),
    },
    {
      name: "rig.yml",
      content: prettyYamlObject(documentState.rig),
    },
    {
      name: "expressions.yml",
      content: prettyYamlObject(documentState.expressions),
    },
    {
      name: "animations.yml",
      content: prettyYamlObject(documentState.animations),
    },
    {
      name: "animation_composition.yml",
      content: prettyYamlObject(documentState.animation_composition),
    },
    {
      name: "layers.yml",
      content: prettyYamlObject(documentState.layers),
    },
    {
      name: "palettes.yml",
      content: prettyYamlObject(documentState.palettes),
    },
    {
      name: "references.yml",
      content: prettyYamlObject(documentState.references),
    },
  ];

  if (documentState.underlay.data_url) {
    files.push({
      name: "underlay.yml",
      content: prettyYamlObject(documentState.underlay),
    });
  }

  return files;
}

export async function importEditorFiles(fileList) {
  const files = Array.from(fileList);
  const byName = new Map();

  for (const file of files) {
    byName.set(file.name, parseYamlObject(await file.text()));
  }

  const manifest = byName.get("character.yml");
  if (!manifest) {
    throw new Error("character.yml is required for import.");
  }

  return {
    version: manifest.version ?? 1,
    identity: byName.get("identity.yml") ?? {},
    proportions: byName.get("proportions.yml") ?? {},
    rig: byName.get("rig.yml") ?? { root_joint_id: "root", base_pose: "t_pose", directions: ["front", "back", "left", "right"], joints: [], bones: [], anchors: [], regions: [] },
    expressions: byName.get("expressions.yml") ?? { active_expression_id: "neutral", templates: [] },
    animations: byName.get("animations.yml") ?? { active_clip_id: "idle", clips: [] },
    animation_composition: byName.get("animation_composition.yml") ?? { root_motion_source: "locomotion", channels: [] },
    layers: byName.get("layers.yml") ?? { groups: [], items: [] },
    palettes: byName.get("palettes.yml") ?? { global: [], asset_overrides: {} },
    references: byName.get("references.yml") ?? { library: [] },
    underlay: byName.get("underlay.yml") ?? {
      enabled: false,
      opacity: 0.35,
      offset_x: 0,
      offset_y: 0,
      scale: 1,
      data_url: "",
      name: "",
    },
    meta: {
      document_id: `imported_${Date.now()}`,
      title: (byName.get("identity.yml")?.name || "Imported Character").trim(),
      active_mode: "paint",
      active_direction: "front",
      active_pose: "t_pose",
      active_expression_id: byName.get("expressions.yml")?.active_expression_id ?? "neutral",
      active_animation_id: byName.get("animations.yml")?.active_clip_id ?? "idle",
      active_tool: "pencil",
      active_palette_slot: 1,
    },
  };
}

export function buildRuntimeFiles(documentState, previewDataUrl) {
  const runtimePackage = {
    runtime_version: 1,
    identity: documentState.identity,
    proportions: documentState.proportions,
    rig: documentState.rig,
    expressions: documentState.expressions,
    animations: documentState.animations,
    animation_composition: documentState.animation_composition,
    layers: documentState.layers,
    palettes: documentState.palettes,
    references: {
      resolved: true,
      library: documentState.references.library.map((reference) => ({
        ...reference,
        resolved_asset: LIBRARY_ASSET_MAP.get(reference.asset_id) ?? null,
      })),
    },
    preview_png: "preview.png",
  };

  return [
    {
      name: "runtime_character.yml",
      content: prettyYamlObject(runtimePackage),
    },
    {
      name: "spritesheet_stub.yml",
      content: prettyYamlObject({
        directions: ["front", "back", "left", "right"],
        poses: ["t_pose"],
        animations: (documentState.animations?.clips ?? []).map((clip) => clip.id),
      }),
    },
    {
      name: "preview.png",
      dataUrl: previewDataUrl,
    },
  ];
}

export function buildLibraryAssetFile(asset) {
  return {
    name: `${asset.id.split(".").pop() || asset.id}.yml`,
    content: prettyYamlObject(asset),
  };
}

export function downloadTextFile(name, content) {
  const blob = new Blob([content], { type: "text/yaml" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadDataUrl(name, dataUrl) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = name;
  anchor.click();
}

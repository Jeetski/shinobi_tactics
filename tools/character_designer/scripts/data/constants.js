export const DOCUMENT_VERSION = 1;
export const CANVAS_SIZE = 64;
export const PREVIEW_SCALE = 6;
export const EDITOR_SCALE = 10;

export const MODES = [
  { id: "paint", label: "Paint" },
  { id: "rig", label: "Rig" },
  { id: "expressions", label: "Expressions" },
  { id: "animation", label: "Animation" },
  { id: "library", label: "Library" },
  { id: "export", label: "Export" },
];

export const DIRECTIONS = ["front", "back", "left", "right"];

export const TOOLS = [
  { id: "pencil", label: "Pencil", shortcut: "B" },
  { id: "erase", label: "Erase", shortcut: "E" },
  { id: "fill", label: "Fill", shortcut: "G" },
  { id: "eyedropper", label: "Pick", shortcut: "I" },
  { id: "select", label: "Select", shortcut: "R" },
  { id: "move", label: "Move", shortcut: "M" },
];

export const LAYER_GROUPS = [
  "body",
  "face",
  "hair",
  "garments",
  "accessories",
  "overlays",
];

export const DEFAULT_PALETTE = [
  { slot: 0, name: "Transparent", color: "#00000000" },
  { slot: 1, name: "Skin", color: "#f3c7a4" },
  { slot: 2, name: "Cloth Dark", color: "#293349" },
  { slot: 3, name: "Cloth Bright", color: "#ff9d42" },
  { slot: 4, name: "Hair", color: "#f2d06d" },
  { slot: 5, name: "Outline", color: "#dce7ff" },
  { slot: 6, name: "Accent", color: "#4cb1ff" },
  { slot: 7, name: "Shadow", color: "#0d0f16" },
];

export const BUILTIN_TEMPLATES = [
  {
    id: "blank",
    title: "Blank 64x64 Character",
    description: "Empty starter with sane default groups and palette slots.",
  },
  {
    id: "leaf_genin",
    title: "Leaf Genin Starter",
    description: "Starter palette and layer naming for a young shinobi silhouette.",
  },
];

export const TIMELINE_CHANNELS = [
  { id: "locomotion", label: "Locomotion", color: "#6fb0ff" },
  { id: "upper_body_action", label: "Upper Body Action", color: "#ffad66" },
  { id: "lower_body_action", label: "Lower Body Action", color: "#7be0a9" },
  { id: "hands", label: "Hands", color: "#d58dff" },
  { id: "face", label: "Face", color: "#ffd55e" },
  { id: "overlay_fx", label: "Overlay FX", color: "#ff6f91" },
  { id: "root_motion", label: "Root Motion", color: "#8ef5c6" },
];

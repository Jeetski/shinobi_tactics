import {
  CANVAS_SIZE,
  DEFAULT_PALETTE,
  DIRECTIONS,
  DOCUMENT_VERSION,
  LAYER_GROUPS,
} from "./constants.js";

function createEmptyPixels() {
  return Array(CANVAS_SIZE * CANVAS_SIZE).fill(0);
}

function paintRect(pixels, x, y, width, height, slot) {
  const next = pixels.slice();
  for (let row = y; row < y + height; row += 1) {
    for (let col = x; col < x + width; col += 1) {
      if (col < 0 || col >= CANVAS_SIZE || row < 0 || row >= CANVAS_SIZE) {
        continue;
      }
      next[row * CANVAS_SIZE + col] = slot;
    }
  }
  return next;
}

function createLayer(id, name, group, pixels, options = {}) {
  return {
    id,
    name,
    group,
    visible: options.visible ?? true,
    locked: options.locked ?? false,
    palette_scope: options.palette_scope ?? "global",
    palette_slot: options.palette_slot ?? 1,
    opacity: options.opacity ?? 1,
    offset_x: options.offset_x ?? 0,
    offset_y: options.offset_y ?? 0,
    pixels,
  };
}

function createStarterLayers() {
  let outlinePixels = createEmptyPixels();
  let skinPixels = createEmptyPixels();
  let clothPixels = createEmptyPixels();
  let hairPixels = createEmptyPixels();
  let browLeftPixels = createEmptyPixels();
  let browRightPixels = createEmptyPixels();
  let eyeLeftPixels = createEmptyPixels();
  let eyeRightPixels = createEmptyPixels();
  let mouthNeutralPixels = createEmptyPixels();
  let mouthSmilePixels = createEmptyPixels();
  let mouthAngryPixels = createEmptyPixels();
  let mouthSurprisedPixels = createEmptyPixels();
  let mouthHurtPixels = createEmptyPixels();

  outlinePixels = paintRect(outlinePixels, 26, 10, 12, 12, 5);
  outlinePixels = paintRect(outlinePixels, 24, 22, 16, 14, 5);
  outlinePixels = paintRect(outlinePixels, 20, 24, 4, 13, 5);
  outlinePixels = paintRect(outlinePixels, 40, 24, 4, 13, 5);
  outlinePixels = paintRect(outlinePixels, 26, 36, 5, 16, 5);
  outlinePixels = paintRect(outlinePixels, 33, 36, 5, 16, 5);

  skinPixels = paintRect(skinPixels, 27, 11, 10, 10, 1);
  skinPixels = paintRect(skinPixels, 21, 29, 2, 5, 1);
  skinPixels = paintRect(skinPixels, 41, 29, 2, 5, 1);

  clothPixels = paintRect(clothPixels, 26, 23, 12, 12, 3);
  clothPixels = paintRect(clothPixels, 27, 36, 4, 14, 2);
  clothPixels = paintRect(clothPixels, 33, 36, 4, 14, 2);

  hairPixels = paintRect(hairPixels, 26, 8, 12, 5, 4);
  browLeftPixels = paintRect(browLeftPixels, 29, 14, 3, 1, 5);
  browRightPixels = paintRect(browRightPixels, 33, 14, 3, 1, 5);
  eyeLeftPixels = paintRect(eyeLeftPixels, 29, 16, 2, 1, 5);
  eyeRightPixels = paintRect(eyeRightPixels, 34, 16, 2, 1, 5);
  mouthNeutralPixels = paintRect(mouthNeutralPixels, 31, 19, 3, 1, 5);
  mouthSmilePixels = paintRect(mouthSmilePixels, 30, 19, 5, 1, 5);
  mouthAngryPixels = paintRect(mouthAngryPixels, 31, 19, 3, 1, 5);
  mouthSurprisedPixels = paintRect(mouthSurprisedPixels, 32, 18, 1, 2, 5);
  mouthHurtPixels = paintRect(mouthHurtPixels, 31, 19, 3, 1, 5);

  return [
    createLayer("body_outline", "Body Outline", "body", outlinePixels, {
      palette_slot: 5,
    }),
    createLayer("skin_base", "Skin Base", "body", skinPixels, {
      palette_slot: 1,
    }),
    createLayer("cloth_base", "Cloth Base", "garments", clothPixels, {
      palette_slot: 3,
    }),
    createLayer("hair_base", "Hair Base", "hair", hairPixels, {
      palette_slot: 4,
    }),
    createLayer("brow_left", "Brow Left", "face", browLeftPixels, {
      palette_slot: 5,
    }),
    createLayer("brow_right", "Brow Right", "face", browRightPixels, {
      palette_slot: 5,
    }),
    createLayer("eye_left", "Eye Left", "face", eyeLeftPixels, {
      palette_slot: 5,
    }),
    createLayer("eye_right", "Eye Right", "face", eyeRightPixels, {
      palette_slot: 5,
    }),
    createLayer("mouth_neutral", "Mouth Neutral", "face", mouthNeutralPixels, {
      palette_slot: 5,
    }),
    createLayer("mouth_smile", "Mouth Smile", "face", mouthSmilePixels, {
      palette_slot: 5,
      visible: false,
    }),
    createLayer("mouth_angry", "Mouth Angry", "face", mouthAngryPixels, {
      palette_slot: 5,
      visible: false,
    }),
    createLayer("mouth_surprised", "Mouth Surprised", "face", mouthSurprisedPixels, {
      palette_slot: 5,
      visible: false,
    }),
    createLayer("mouth_hurt", "Mouth Hurt", "face", mouthHurtPixels, {
      palette_slot: 5,
      visible: false,
    }),
  ];
}

function createDefaultExpressions() {
  return {
    active_expression_id: "neutral",
    templates: [
      {
        id: "neutral",
        label: "Neutral",
        layer_visibility: {
          mouth_neutral: true,
          mouth_smile: false,
          mouth_angry: false,
          mouth_surprised: false,
          mouth_hurt: false,
        },
        layer_offsets: {
          brow_left: { x: 0, y: 0 },
          brow_right: { x: 0, y: 0 },
          mouth_neutral: { x: 0, y: 0 },
        },
      },
      {
        id: "smile",
        label: "Smile",
        layer_visibility: {
          mouth_neutral: false,
          mouth_smile: true,
          mouth_angry: false,
          mouth_surprised: false,
          mouth_hurt: false,
        },
        layer_offsets: {
          brow_left: { x: 0, y: -1 },
          brow_right: { x: 0, y: -1 },
          mouth_smile: { x: 0, y: 0 },
        },
      },
      {
        id: "angry",
        label: "Angry",
        layer_visibility: {
          mouth_neutral: false,
          mouth_smile: false,
          mouth_angry: true,
          mouth_surprised: false,
          mouth_hurt: false,
        },
        layer_offsets: {
          brow_left: { x: 1, y: 1 },
          brow_right: { x: -1, y: 1 },
          mouth_angry: { x: 0, y: 0 },
        },
      },
      {
        id: "surprised",
        label: "Surprised",
        layer_visibility: {
          mouth_neutral: false,
          mouth_smile: false,
          mouth_angry: false,
          mouth_surprised: true,
          mouth_hurt: false,
        },
        layer_offsets: {
          brow_left: { x: 0, y: -2 },
          brow_right: { x: 0, y: -2 },
          mouth_surprised: { x: 0, y: 0 },
        },
      },
      {
        id: "hurt",
        label: "Hurt",
        layer_visibility: {
          mouth_neutral: false,
          mouth_smile: false,
          mouth_angry: false,
          mouth_surprised: false,
          mouth_hurt: true,
        },
        layer_offsets: {
          brow_left: { x: 0, y: 1 },
          brow_right: { x: 0, y: 1 },
          mouth_hurt: { x: 0, y: 1 },
        },
      },
    ],
  };
}

function createDefaultAnimations() {
  return {
    active_clip_id: "idle",
    clips: [
      {
        id: "idle",
        label: "Idle",
        fps: 8,
        duration_frames: 16,
        direction_overrides: Object.fromEntries(
          DIRECTIONS.map((direction) => [
            direction,
            {
              expression_id: "neutral",
            },
          ]),
        ),
        tracks: {
          expressions: [
            { frame: 0, expression_id: "neutral" },
            { frame: 8, expression_id: "smile" },
          ],
          region_offsets: [
            { frame: 0, region_id: "torso", x: 0, y: 0 },
            { frame: 4, region_id: "torso", x: 0, y: -1 },
            { frame: 8, region_id: "torso", x: 0, y: 0 },
            { frame: 12, region_id: "torso", x: 0, y: 1 },
          ],
          events: [],
          root_motion: [
            { frame: 0, x: 0, y: 0 },
          ],
        },
      },
      {
        id: "walk",
        label: "Walk",
        fps: 10,
        duration_frames: 12,
        direction_overrides: Object.fromEntries(
          DIRECTIONS.map((direction) => [
            direction,
            {
              expression_id: "neutral",
            },
          ]),
        ),
        tracks: {
          expressions: [
            { frame: 0, expression_id: "neutral" },
          ],
          region_offsets: [
            { frame: 0, region_id: "lower_body", x: 0, y: 0 },
            { frame: 3, region_id: "lower_body", x: 1, y: 0 },
            { frame: 6, region_id: "lower_body", x: 0, y: 0 },
            { frame: 9, region_id: "lower_body", x: -1, y: 0 },
            { frame: 0, region_id: "torso", x: 0, y: 0 },
            { frame: 6, region_id: "torso", x: 0, y: -1 },
          ],
          events: [
            { frame: 0, id: "step_left" },
            { frame: 6, id: "step_right" },
          ],
          root_motion: [
            { frame: 0, x: 0, y: 0 },
            { frame: 11, x: 6, y: 0 },
          ],
        },
      },
    ],
  };
}

function createDefaultAnimationComposition() {
  return {
    root_motion_source: "locomotion",
    channels: [
      {
        id: "locomotion",
        enabled: true,
        priority: 10,
        target_regions: ["lower_body", "torso", "root"],
        active_clip_id: "idle",
      },
      {
        id: "upper_body_action",
        enabled: true,
        priority: 20,
        target_regions: ["upper_body", "both_arms"],
        active_clip_id: "",
      },
      {
        id: "hands",
        enabled: true,
        priority: 30,
        target_regions: ["both_hands"],
        active_clip_id: "",
      },
      {
        id: "lower_body_action",
        enabled: true,
        priority: 25,
        target_regions: ["lower_body", "both_legs"],
        active_clip_id: "",
      },
      {
        id: "face",
        enabled: true,
        priority: 40,
        target_regions: ["face", "head"],
        active_clip_id: "idle",
      },
      {
        id: "overlay_fx",
        enabled: true,
        priority: 45,
        target_regions: ["full_body"],
        active_clip_id: "",
      },
      {
        id: "root_motion",
        enabled: true,
        priority: 50,
        target_regions: ["root"],
        active_clip_id: "walk",
      },
    ],
  };
}

function createDirectionOverrides(joints, anchors) {
  return Object.fromEntries(
    DIRECTIONS.map((direction) => [
      direction,
      {
        joints: joints.map((joint) => ({ id: joint.id, x: joint.x, y: joint.y })),
        anchors: anchors.map((anchor) => ({ id: anchor.id, x: anchor.x, y: anchor.y })),
      },
    ]),
  );
}

function createDefaultRig() {
  const joints = [
    { id: "root", label: "Root", x: 32, y: 52 },
    { id: "pelvis", label: "Pelvis", x: 32, y: 37 },
    { id: "spine_mid", label: "Spine Mid", x: 32, y: 29 },
    { id: "neck", label: "Neck", x: 32, y: 22 },
    { id: "head", label: "Head", x: 32, y: 15 },
    { id: "shoulder_left", label: "Shoulder L", x: 24, y: 25 },
    { id: "elbow_left", label: "Elbow L", x: 21, y: 31 },
    { id: "hand_left", label: "Hand L", x: 22, y: 36 },
    { id: "shoulder_right", label: "Shoulder R", x: 40, y: 25 },
    { id: "elbow_right", label: "Elbow R", x: 43, y: 31 },
    { id: "hand_right", label: "Hand R", x: 42, y: 36 },
    { id: "hip_left", label: "Hip L", x: 28, y: 37 },
    { id: "knee_left", label: "Knee L", x: 28, y: 45 },
    { id: "foot_left", label: "Foot L", x: 28, y: 52 },
    { id: "hip_right", label: "Hip R", x: 36, y: 37 },
    { id: "knee_right", label: "Knee R", x: 36, y: 45 },
    { id: "foot_right", label: "Foot R", x: 36, y: 52 },
  ];
  const anchors = [
    { id: "face", joint_id: "head", x: 32, y: 18 },
    { id: "torso", joint_id: "spine_mid", x: 32, y: 29 },
    { id: "left_hand_attach", joint_id: "hand_left", x: 22, y: 36 },
    { id: "right_hand_attach", joint_id: "hand_right", x: 42, y: 36 },
    { id: "belt", joint_id: "pelvis", x: 32, y: 36 },
  ];

  return {
    root_joint_id: "root",
    base_pose: "t_pose",
    directions: DIRECTIONS.slice(),
    joints,
    bones: [
      { id: "root_spine", from: "root", to: "pelvis" },
      { id: "pelvis_spine", from: "pelvis", to: "spine_mid" },
      { id: "spine_neck", from: "spine_mid", to: "neck" },
      { id: "neck_head", from: "neck", to: "head" },
      { id: "left_upper_arm", from: "shoulder_left", to: "elbow_left" },
      { id: "left_lower_arm", from: "elbow_left", to: "hand_left" },
      { id: "right_upper_arm", from: "shoulder_right", to: "elbow_right" },
      { id: "right_lower_arm", from: "elbow_right", to: "hand_right" },
      { id: "left_clavicle", from: "spine_mid", to: "shoulder_left" },
      { id: "right_clavicle", from: "spine_mid", to: "shoulder_right" },
      { id: "left_upper_leg", from: "hip_left", to: "knee_left" },
      { id: "left_lower_leg", from: "knee_left", to: "foot_left" },
      { id: "right_upper_leg", from: "hip_right", to: "knee_right" },
      { id: "right_lower_leg", from: "knee_right", to: "foot_right" },
      { id: "pelvis_left_hip", from: "pelvis", to: "hip_left" },
      { id: "pelvis_right_hip", from: "pelvis", to: "hip_right" },
    ],
    anchors,
    direction_overrides: createDirectionOverrides(joints, anchors),
    regions: [
      { id: "full_body", joint_ids: ["root", "pelvis", "spine_mid", "neck", "head", "shoulder_left", "elbow_left", "hand_left", "shoulder_right", "elbow_right", "hand_right", "hip_left", "knee_left", "foot_left", "hip_right", "knee_right", "foot_right"] },
      { id: "upper_body", joint_ids: ["spine_mid", "neck", "head", "shoulder_left", "elbow_left", "hand_left", "shoulder_right", "elbow_right", "hand_right"] },
      { id: "lower_body", joint_ids: ["pelvis", "hip_left", "knee_left", "foot_left", "hip_right", "knee_right", "foot_right"] },
      { id: "torso", joint_ids: ["pelvis", "spine_mid", "neck"] },
      { id: "head", joint_ids: ["neck", "head"] },
      { id: "face", joint_ids: ["head"] },
      { id: "left_arm", joint_ids: ["shoulder_left", "elbow_left", "hand_left"] },
      { id: "right_arm", joint_ids: ["shoulder_right", "elbow_right", "hand_right"] },
      { id: "both_arms", joint_ids: ["shoulder_left", "elbow_left", "hand_left", "shoulder_right", "elbow_right", "hand_right"] },
      { id: "left_hand", joint_ids: ["hand_left"] },
      { id: "right_hand", joint_ids: ["hand_right"] },
      { id: "both_hands", joint_ids: ["hand_left", "hand_right"] },
      { id: "left_leg", joint_ids: ["hip_left", "knee_left", "foot_left"] },
      { id: "right_leg", joint_ids: ["hip_right", "knee_right", "foot_right"] },
      { id: "both_legs", joint_ids: ["hip_left", "knee_left", "foot_left", "hip_right", "knee_right", "foot_right"] },
      { id: "root", joint_ids: ["root"] },
    ],
  };
}

export function createDefaultDocument() {
  return {
    version: DOCUMENT_VERSION,
    meta: {
      document_id: `character_${Date.now()}`,
      title: "Untitled Shinobi Character",
      active_mode: "paint",
      active_direction: DIRECTIONS[0],
      active_pose: "t_pose",
      active_expression_id: "neutral",
      active_animation_id: "idle",
      active_tool: "pencil",
      active_palette_slot: 1,
    },
    identity: {
      id: "untitled_shinobi",
      name: "Untitled Shinobi",
      affiliations: "",
      origin_village: "",
      bio_short: "",
    },
    proportions: {
      canvas_size: CANVAS_SIZE,
      head_px: 12,
      base_pose: "t_pose",
      directions: DIRECTIONS.slice(),
    },
    rig: createDefaultRig(),
    expressions: createDefaultExpressions(),
    animations: createDefaultAnimations(),
    animation_composition: createDefaultAnimationComposition(),
    layers: {
      groups: LAYER_GROUPS.slice(),
      items: createStarterLayers(),
    },
    palettes: {
      global: DEFAULT_PALETTE.map((entry) => ({ ...entry })),
      asset_overrides: {},
    },
    references: {
      library: [],
    },
    underlay: {
      enabled: false,
      opacity: 0.35,
      offset_x: 0,
      offset_y: 0,
      scale: 1,
      data_url: "",
      name: "",
    },
  };
}

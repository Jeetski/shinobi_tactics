import { CANVAS_SIZE } from "./constants.js";

export function validateDocument(documentState) {
  const results = [];
  const layerIds = new Set();
  const paletteSlots = new Set(documentState.palettes.global.map((entry) => entry.slot));
  const jointIds = new Set();
  const expressionIds = new Set();
  const referenceIds = new Set();
  const animationIds = new Set();
  const channelIds = new Set();
  const requiredRegions = new Set([
    "full_body",
    "upper_body",
    "lower_body",
    "torso",
    "head",
    "face",
    "left_arm",
    "right_arm",
    "both_arms",
    "left_hand",
    "right_hand",
    "both_hands",
    "left_leg",
    "right_leg",
    "both_legs",
    "root",
  ]);

  if (!documentState.identity.id?.trim()) {
    results.push({
      level: "error",
      message: "Identity id is required before export.",
    });
  }

  if (!documentState.layers.items.length) {
    results.push({
      level: "error",
      message: "At least one layer is required.",
    });
  }

  for (const layer of documentState.layers.items) {
    if (layerIds.has(layer.id)) {
      results.push({
        level: "error",
        message: `Duplicate layer id "${layer.id}".`,
      });
    }
    layerIds.add(layer.id);

    if (!documentState.layers.groups.includes(layer.group)) {
      results.push({
        level: "error",
        message: `Layer "${layer.name}" references unknown group "${layer.group}".`,
      });
    }

    if (!paletteSlots.has(layer.palette_slot)) {
      results.push({
        level: "error",
        message: `Layer "${layer.name}" uses missing palette slot ${layer.palette_slot}.`,
      });
    }

    if (!Array.isArray(layer.pixels) || layer.pixels.length !== CANVAS_SIZE * CANVAS_SIZE) {
      results.push({
        level: "error",
        message: `Layer "${layer.name}" pixel data must contain exactly ${CANVAS_SIZE * CANVAS_SIZE} cells.`,
      });
    }
  }

  if (!documentState.rig?.joints?.length) {
    results.push({
      level: "error",
      message: "Rig must contain at least one joint.",
    });
  }

  for (const joint of documentState.rig?.joints ?? []) {
    if (jointIds.has(joint.id)) {
      results.push({
        level: "error",
        message: `Duplicate joint id "${joint.id}".`,
      });
    }
    jointIds.add(joint.id);

    if (typeof joint.x !== "number" || typeof joint.y !== "number" || joint.x < 0 || joint.x > CANVAS_SIZE || joint.y < 0 || joint.y > CANVAS_SIZE) {
      results.push({
        level: "error",
        message: `Joint "${joint.id}" must stay within the ${CANVAS_SIZE}x${CANVAS_SIZE} canvas.`,
      });
    }
  }

  if (documentState.rig?.root_joint_id && !jointIds.has(documentState.rig.root_joint_id)) {
    results.push({
      level: "error",
      message: `Rig root joint "${documentState.rig.root_joint_id}" is missing.`,
    });
  }

  for (const bone of documentState.rig?.bones ?? []) {
    if (!jointIds.has(bone.from) || !jointIds.has(bone.to)) {
      results.push({
        level: "error",
        message: `Bone "${bone.id}" references missing joints.`,
      });
    }
  }

  for (const anchor of documentState.rig?.anchors ?? []) {
    if (!jointIds.has(anchor.joint_id)) {
      results.push({
        level: "error",
        message: `Anchor "${anchor.id}" references missing joint "${anchor.joint_id}".`,
      });
    }
  }

  const regionIds = new Set((documentState.rig?.regions ?? []).map((region) => region.id));
  for (const region of requiredRegions) {
    if (!regionIds.has(region)) {
      results.push({
        level: "error",
        message: `Rig region "${region}" is required.`,
      });
    }
  }

  for (const direction of documentState.rig?.directions ?? []) {
    const override = documentState.rig?.direction_overrides?.[direction];
    if (!override) {
      results.push({
        level: "error",
        message: `Rig direction override "${direction}" is missing.`,
      });
      continue;
    }

    for (const joint of override.joints ?? []) {
      if (!jointIds.has(joint.id)) {
        results.push({
          level: "error",
          message: `Rig direction "${direction}" references missing joint "${joint.id}".`,
        });
      }
    }
  }

  for (const expression of documentState.expressions?.templates ?? []) {
    if (expressionIds.has(expression.id)) {
      results.push({
        level: "error",
        message: `Duplicate expression id "${expression.id}".`,
      });
    }
    expressionIds.add(expression.id);

    for (const layerId of Object.keys(expression.layer_visibility ?? {})) {
      if (!layerIds.has(layerId)) {
        results.push({
          level: "error",
          message: `Expression "${expression.id}" references missing layer "${layerId}".`,
        });
      }
    }

    for (const layerId of Object.keys(expression.layer_offsets ?? {})) {
      if (!layerIds.has(layerId)) {
        results.push({
          level: "error",
          message: `Expression "${expression.id}" offset references missing layer "${layerId}".`,
        });
      }
    }
  }

  if (!(documentState.expressions?.templates?.length ?? 0)) {
    results.push({
      level: "error",
      message: "At least one expression template is required.",
    });
  }

  if (!expressionIds.has(documentState.expressions?.active_expression_id)) {
    results.push({
      level: "error",
      message: `Active expression "${documentState.expressions?.active_expression_id}" is missing.`,
    });
  }

  for (const reference of documentState.references?.library ?? []) {
    if (referenceIds.has(reference.ref_id)) {
      results.push({
        level: "error",
        message: `Duplicate library reference id "${reference.ref_id}".`,
      });
    }
    referenceIds.add(reference.ref_id);

    if (!reference.asset_id?.trim()) {
      results.push({
        level: "error",
        message: `Library reference "${reference.ref_id}" is missing an asset id.`,
      });
    }

    if (!reference.type?.trim()) {
      results.push({
        level: "error",
        message: `Library reference "${reference.ref_id}" is missing a type.`,
      });
    }
  }

  for (const clip of documentState.animations?.clips ?? []) {
    if (animationIds.has(clip.id)) {
      results.push({
        level: "error",
        message: `Duplicate animation clip id "${clip.id}".`,
      });
    }
    animationIds.add(clip.id);

    if (!clip.duration_frames || clip.duration_frames < 1) {
      results.push({
        level: "error",
        message: `Animation "${clip.id}" must have at least one frame.`,
      });
    }

    if (!clip.fps || clip.fps < 1) {
      results.push({
        level: "error",
        message: `Animation "${clip.id}" must have an fps greater than 0.`,
      });
    }

    for (const key of clip.tracks?.expressions ?? []) {
      if (!expressionIds.has(key.expression_id)) {
        results.push({
          level: "error",
          message: `Animation "${clip.id}" references missing expression "${key.expression_id}".`,
        });
      }
    }

    for (const key of clip.tracks?.region_offsets ?? []) {
      if (!regionIds.has(key.region_id)) {
        results.push({
          level: "error",
          message: `Animation "${clip.id}" references missing region "${key.region_id}" in region offsets.`,
        });
      }
      if (typeof key.frame !== "number" || key.frame < 0 || key.frame >= clip.duration_frames) {
        results.push({
          level: "error",
          message: `Animation "${clip.id}" has a region offset key outside its frame range.`,
        });
      }
    }

    for (const direction of documentState.rig?.directions ?? []) {
      const override = clip.direction_overrides?.[direction];
      if (!override) {
        results.push({
          level: "error",
          message: `Animation "${clip.id}" is missing direction override "${direction}".`,
        });
        continue;
      }
      if (override.expression_id && !expressionIds.has(override.expression_id)) {
        results.push({
          level: "error",
          message: `Animation "${clip.id}" direction "${direction}" references missing expression "${override.expression_id}".`,
        });
      }
    }
  }

  if (!animationIds.has(documentState.animations?.active_clip_id)) {
    results.push({
      level: "error",
      message: `Active animation "${documentState.animations?.active_clip_id}" is missing.`,
    });
  }

  for (const channel of documentState.animation_composition?.channels ?? []) {
    if (channelIds.has(channel.id)) {
      results.push({
        level: "error",
        message: `Duplicate animation channel id "${channel.id}".`,
      });
    }
    channelIds.add(channel.id);

    if (channel.active_clip_id && !animationIds.has(channel.active_clip_id)) {
      results.push({
        level: "error",
        message: `Animation channel "${channel.id}" references missing clip "${channel.active_clip_id}".`,
      });
    }

    for (const regionId of channel.target_regions ?? []) {
      if (!regionIds.has(regionId)) {
        results.push({
          level: "error",
          message: `Animation channel "${channel.id}" references missing region "${regionId}".`,
        });
      }
    }
  }

  if (
    documentState.animation_composition?.root_motion_source
    && !channelIds.has(documentState.animation_composition.root_motion_source)
  ) {
    results.push({
      level: "error",
      message: `Root motion source "${documentState.animation_composition.root_motion_source}" is missing.`,
    });
  }

  if (documentState.underlay.enabled && !documentState.underlay.data_url) {
    results.push({
      level: "error",
      message: "Underlay is enabled but no PNG data is attached.",
    });
  }

  if (!results.length) {
    results.push({
      level: "ok",
      message: "Document is valid for editor and runtime export.",
    });
  }

  return results;
}

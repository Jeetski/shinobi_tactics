import { CANVAS_SIZE } from "../data/constants.js";

function normalizeHex(color) {
  return color || "rgba(0, 0, 0, 0)";
}

function getJointMap(documentState, rigPreviewPositions) {
  return new Map((documentState.rig?.joints ?? []).map((joint) => {
    const override = rigPreviewPositions?.[joint.id];
    return [joint.id, override ? { ...joint, ...override } : joint];
  }));
}

function getActiveExpression(documentState, overrideId) {
  const activeId = overrideId || documentState.meta?.active_expression_id || documentState.expressions?.active_expression_id;
  return (
    documentState.expressions?.templates?.find((expression) => expression.id === activeId)
    ?? documentState.expressions?.templates?.[0]
    ?? null
  );
}

function getCompositionOwner(options, jointId) {
  return options.compositionOwnership?.jointOwners?.[jointId] ?? null;
}

export function renderDocumentToCanvas(documentState, canvas, options = {}) {
  const context = canvas.getContext("2d");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  context.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  context.imageSmoothingEnabled = false;

  if (documentState.underlay.enabled && options.underlayImageElement) {
    context.save();
    context.globalAlpha = documentState.underlay.opacity;
    const image = options.underlayImageElement;
    const width = image.width * documentState.underlay.scale;
    const height = image.height * documentState.underlay.scale;
    context.drawImage(image, documentState.underlay.offset_x, documentState.underlay.offset_y, width, height);
    context.restore();
  }

  const paletteMap = new Map(
    documentState.palettes.global.map((entry) => [entry.slot, normalizeHex(entry.color)]),
  );
  const activeExpression = getActiveExpression(documentState, options.activeExpressionId);

  for (const layer of documentState.layers.items) {
    const expressionVisible = activeExpression?.layer_visibility?.[layer.id];
    const visible = expressionVisible ?? layer.visible;
    if (!visible) {
      continue;
    }
    context.save();
    context.globalAlpha = layer.opacity ?? 1;
    const offset = activeExpression?.layer_offsets?.[layer.id] ?? {};
    const offsetX = (layer.offset_x ?? 0) + (offset.x ?? 0);
    const offsetY = (layer.offset_y ?? 0) + (offset.y ?? 0);

    for (let index = 0; index < layer.pixels.length; index += 1) {
      const slot = layer.pixels[index];
      if (!slot) {
        continue;
      }
      const color = paletteMap.get(slot);
      if (!color || color === "#00000000") {
        continue;
      }
      const x = (index % CANVAS_SIZE) + offsetX;
      const y = Math.floor(index / CANVAS_SIZE) + offsetY;
      if (x < 0 || x >= CANVAS_SIZE || y < 0 || y >= CANVAS_SIZE) {
        continue;
      }
      context.fillStyle = color;
      context.fillRect(x, y, 1, 1);
    }

    context.restore();
  }

  if (options.showGrid) {
    context.save();
    context.strokeStyle = "rgba(255,255,255,0.08)";
    context.lineWidth = 0.05;
    for (let offset = 0; offset <= CANVAS_SIZE; offset += 1) {
      context.beginPath();
      context.moveTo(offset + 0.5, 0);
      context.lineTo(offset + 0.5, CANVAS_SIZE);
      context.stroke();
      context.beginPath();
      context.moveTo(0, offset + 0.5);
      context.lineTo(CANVAS_SIZE, offset + 0.5);
      context.stroke();
    }
    context.restore();
  }

  if (options.showRig && documentState.rig) {
    const jointMap = getJointMap(documentState, options.rigPreviewPositions);

    context.save();
    context.lineWidth = 0.8;
    context.lineCap = "round";

    for (const bone of documentState.rig.bones ?? []) {
      const from = jointMap.get(bone.from);
      const to = jointMap.get(bone.to);
      if (!from || !to) continue;
      const fromOwner = getCompositionOwner(options, bone.from);
      const toOwner = getCompositionOwner(options, bone.to);
      const owner = fromOwner && fromOwner === toOwner ? fromOwner : null;
      context.strokeStyle = bone.id === options.selectedRigBoneId
        ? "rgba(255, 213, 94, 0.98)"
        : owner?.color ?? "rgba(239, 73, 73, 0.92)";
      context.lineWidth = bone.id === options.selectedRigBoneId ? 1.2 : 0.8;
      context.beginPath();
      context.moveTo(from.x + 0.5, from.y + 0.5);
      context.lineTo(to.x + 0.5, to.y + 0.5);
      context.stroke();
    }
    context.restore();

    context.save();
    for (const joint of documentState.rig.joints ?? []) {
      const owner = getCompositionOwner(options, joint.id);
      context.fillStyle =
        joint.id === options.selectedRigJointId
          ? "rgba(255, 213, 94, 0.98)"
          : joint.id === documentState.rig.root_joint_id
            ? "rgba(111, 176, 255, 0.95)"
            : owner?.color ?? "rgba(255,255,255,0.96)";
      context.beginPath();
      context.arc(joint.x + 0.5, joint.y + 0.5, 1.25, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = "rgba(12, 15, 24, 0.95)";
      context.lineWidth = 0.25;
      context.stroke();
    }

    for (const anchor of documentState.rig.anchors ?? []) {
      context.fillStyle =
        anchor.id === options.selectedRigAnchorId
          ? "rgba(255, 213, 94, 0.98)"
          : "rgba(142, 245, 198, 0.92)";
      context.fillRect(anchor.x - 0.75 + 0.5, anchor.y - 0.75 + 0.5, 1.5, 1.5);
    }
    context.restore();
  }

  return context;
}

export function exportPreviewPng(canvas) {
  return canvas.toDataURL("image/png");
}

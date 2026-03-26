import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  BUILTIN_TEMPLATES,
  DIRECTIONS,
  EDITOR_SCALE,
  MODES,
  PREVIEW_SCALE,
  TIMELINE_CHANNELS,
  TOOLS,
} from "../scripts/data/constants.js";
import { LIBRARY_ASSETS } from "../scripts/data/library_assets.js";
import { createDefaultDocument } from "../scripts/data/defaults.js";
import { validateDocument } from "../scripts/data/validation.js";
import { createHistory } from "../scripts/core/history.js";
import { clearAutosave, loadAutosave, saveAutosave } from "../scripts/core/autosave.js";
import {
  buildEditorFiles,
  buildLibraryAssetFile,
  buildRuntimeFiles,
  downloadDataUrl,
  downloadTextFile,
  importEditorFiles,
} from "../scripts/io/yaml_io.js";
import { renderDocumentToCanvas, exportPreviewPng } from "../scripts/rendering/canvas_renderer.js";
import {
  BookIcon,
  BoneIcon,
  BrushIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  DownloadIcon,
  EraserIcon,
  EyeIcon,
  FillIcon,
  FilmIcon,
  LockIcon,
  MoveIcon,
  PaletteIcon,
  PencilIcon,
  ImportIcon,
  RedoIcon,
  SelectIcon,
  SmileIcon,
  TrashIcon,
  UndoIcon,
  UnlockIcon,
  UploadIcon,
  EyedropperIcon,
} from "./icons.jsx";

function clone(value) {
  return structuredClone(value);
}

function pixelIndex(x, y) {
  return y * 64 + x;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function floodFill(pixels, startIndex, nextSlot) {
  const targetSlot = pixels[startIndex];
  if (targetSlot === nextSlot) return pixels;
  const next = pixels.slice();
  const stack = [startIndex];
  while (stack.length) {
    const current = stack.pop();
    if (next[current] !== targetSlot) continue;
    next[current] = nextSlot;
    const x = current % 64;
    const y = Math.floor(current / 64);
    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [neighborX, neighborY] of neighbors) {
      if (neighborX < 0 || neighborX >= 64 || neighborY < 0 || neighborY >= 64) continue;
      const neighborIndex = pixelIndex(neighborX, neighborY);
      if (next[neighborIndex] === targetSlot) stack.push(neighborIndex);
    }
  }
  return next;
}

function movePixels(pixels, selectedIndexes, dx, dy) {
  const next = pixels.slice();
  for (const index of selectedIndexes) next[index] = 0;
  for (const index of selectedIndexes) {
    const x = index % 64;
    const y = Math.floor(index / 64);
    const targetX = x + dx;
    const targetY = y + dy;
    if (targetX < 0 || targetX >= 64 || targetY < 0 || targetY >= 64) continue;
    next[pixelIndex(targetX, targetY)] = pixels[index];
  }
  return next;
}

function iconForTool(toolId) {
  switch (toolId) {
    case "pencil": return PencilIcon;
    case "erase": return EraserIcon;
    case "fill": return FillIcon;
    case "eyedropper": return EyedropperIcon;
    case "select": return SelectIcon;
    case "move": return MoveIcon;
    default: return BrushIcon;
  }
}

function toCanvasPixel(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: Math.floor(((event.clientX - rect.left) / rect.width) * 64),
    y: Math.floor(((event.clientY - rect.top) / rect.height) * 64),
  };
}

function getNearestJoint(documentState, x, y, threshold = 3) {
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const joint of documentState.rig?.joints ?? []) {
    const dx = joint.x - x;
    const dy = joint.y - y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= threshold && distance < bestDistance) {
      best = joint;
      bestDistance = distance;
    }
  }

  return best;
}

function getNearestAnchor(documentState, x, y, threshold = 3) {
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const anchor of documentState.rig?.anchors ?? []) {
    const dx = anchor.x - x;
    const dy = anchor.y - y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= threshold && distance < bestDistance) {
      best = anchor;
      bestDistance = distance;
    }
  }

  return best;
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLengthSquared = abx * abx + aby * aby;
  if (abLengthSquared === 0) {
    return Math.sqrt((px - ax) ** 2 + (py - ay) ** 2);
  }
  const t = clamp((apx * abx + apy * aby) / abLengthSquared, 0, 1);
  const closestX = ax + abx * t;
  const closestY = ay + aby * t;
  return Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);
}

function getNearestBone(documentState, x, y, threshold = 2.5) {
  const joints = new Map((documentState.rig?.joints ?? []).map((joint) => [joint.id, joint]));
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const bone of documentState.rig?.bones ?? []) {
    const from = joints.get(bone.from);
    const to = joints.get(bone.to);
    if (!from || !to) continue;
    const distance = distanceToSegment(x, y, from.x, from.y, to.x, to.y);
    if (distance <= threshold && distance < bestDistance) {
      best = bone;
      bestDistance = distance;
    }
  }

  return best;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createRigDirectionSnapshot(rig) {
  return {
    joints: (rig.joints ?? []).map((joint) => ({ id: joint.id, x: joint.x, y: joint.y })),
    anchors: (rig.anchors ?? []).map((anchor) => ({ id: anchor.id, x: anchor.x, y: anchor.y })),
  };
}

function applyRigDirectionSnapshot(rig, direction) {
  const snapshot = rig.direction_overrides?.[direction];
  if (!snapshot) return;

  const jointPositions = new Map((snapshot.joints ?? []).map((joint) => [joint.id, joint]));
  for (const joint of rig.joints ?? []) {
    const override = jointPositions.get(joint.id);
    if (!override) continue;
    joint.x = override.x;
    joint.y = override.y;
  }

  const anchorPositions = new Map((snapshot.anchors ?? []).map((anchor) => [anchor.id, anchor]));
  for (const anchor of rig.anchors ?? []) {
    const override = anchorPositions.get(anchor.id);
    if (!override) continue;
    anchor.x = override.x;
    anchor.y = override.y;
  }
}

function startPointerDrag(event, onMove, onEnd) {
  const startX = event.clientX;
  const startY = event.clientY;

  const handleMove = (moveEvent) => {
    onMove(moveEvent.clientX - startX, moveEvent.clientY - startY);
  };

  const handleUp = () => {
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleUp);
    onEnd?.();
  };

  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerup", handleUp);
}

function PanelShell({ title, icon: Icon, collapsed = false, onToggle, bodyClassName = "", children, actions }) {
  return (
    <section className={`panel${collapsed ? " is-collapsed" : ""}`}>
      <div className="panel-header">
        <div className="panel-title">{Icon ? <Icon /> : null} {title}</div>
        <div className="panel-header-actions">
          {actions}
          {onToggle ? (
            <button
              type="button"
              className="icon-toggle active"
              aria-label={collapsed ? `Expand ${title}` : `Collapse ${title}`}
              onClick={onToggle}
            >
              {collapsed ? <ChevronDownIcon size={14} /> : <ChevronUpIcon size={14} />}
            </button>
          ) : null}
        </div>
      </div>
      {!collapsed ? <div className={`panel-body${bodyClassName ? ` ${bodyClassName}` : ""}`}>{children}</div> : null}
    </section>
  );
}

function getActiveExpression(documentState, selectedExpressionId) {
  return (
    documentState.expressions?.templates?.find((expression) => expression.id === selectedExpressionId)
    ?? documentState.expressions?.templates?.find((expression) => expression.id === documentState.meta?.active_expression_id)
    ?? documentState.expressions?.templates?.[0]
    ?? null
  );
}

function createExpressionTemplate(documentState, options = {}) {
  const expressionIndex = (documentState.expressions?.templates?.length ?? 0) + 1;
  const faceLayers = (documentState.layers?.items ?? []).filter((layer) => layer.group === "face");
  const layerVisibility = Object.fromEntries(faceLayers.map((layer) => [layer.id, layer.visible]));
  const layerOffsets = Object.fromEntries(faceLayers.map((layer) => [layer.id, { x: 0, y: 0 }]));

  return {
    id: options.id ?? `expression_${expressionIndex}`,
    label: options.label ?? `Expression ${expressionIndex}`,
    layer_visibility: options.layer_visibility ?? layerVisibility,
    layer_offsets: options.layer_offsets ?? layerOffsets,
  };
}

function createLibraryReference(asset, options = {}) {
  return {
    ref_id: options.ref_id ?? `ref_${asset.type}_${Date.now()}`,
    asset_id: asset.id,
    type: asset.type,
    label: options.label ?? asset.title,
    enabled: options.enabled ?? true,
    scope: options.scope ?? asset.payload?.reference_scope ?? asset.type,
    overrides: {
      palette_slot: options.overrides?.palette_slot ?? asset.payload?.default_overrides?.palette_slot ?? null,
      opacity: options.overrides?.opacity ?? asset.payload?.default_overrides?.opacity ?? 1,
      offset_x: options.overrides?.offset_x ?? asset.payload?.default_overrides?.offset_x ?? 0,
      offset_y: options.overrides?.offset_y ?? asset.payload?.default_overrides?.offset_y ?? 0,
      notes: options.overrides?.notes ?? "",
    },
  };
}

function createAnimationClip(documentState, options = {}) {
  const clipIndex = (documentState.animations?.clips?.length ?? 0) + 1;
  return {
    id: options.id ?? `clip_${clipIndex}`,
    label: options.label ?? `Clip ${clipIndex}`,
    fps: options.fps ?? 8,
    duration_frames: options.duration_frames ?? 12,
    direction_overrides: options.direction_overrides ?? Object.fromEntries(
      DIRECTIONS.map((direction) => [
        direction,
        {
          expression_id: documentState.meta?.active_expression_id ?? documentState.expressions?.active_expression_id ?? "neutral",
        },
      ]),
    ),
    tracks: {
      expressions: options.tracks?.expressions ?? [
        { frame: 0, expression_id: documentState.meta?.active_expression_id ?? documentState.expressions?.active_expression_id ?? "neutral" },
      ],
      region_offsets: options.tracks?.region_offsets ?? [
        { frame: 0, region_id: "torso", x: 0, y: 0 },
      ],
      events: options.tracks?.events ?? [],
      root_motion: options.tracks?.root_motion ?? [{ frame: 0, x: 0, y: 0 }],
    },
  };
}

function getActiveAnimationClip(documentState, selectedAnimationId) {
  return (
    documentState.animations?.clips?.find((clip) => clip.id === selectedAnimationId)
    ?? documentState.animations?.clips?.find((clip) => clip.id === documentState.meta?.active_animation_id)
    ?? documentState.animations?.clips?.[0]
    ?? null
  );
}

function resolveAnimationExpressionId(documentState, selectedAnimationId, currentFrame) {
  const clip = getActiveAnimationClip(documentState, selectedAnimationId);
  if (!clip) return documentState.meta?.active_expression_id ?? documentState.expressions?.active_expression_id ?? "neutral";

  const directionOverride = clip.direction_overrides?.[documentState.meta?.active_direction];
  const sorted = [...(clip.tracks?.expressions ?? [])].sort((a, b) => a.frame - b.frame);
  let resolved = directionOverride?.expression_id ?? documentState.meta?.active_expression_id ?? documentState.expressions?.active_expression_id ?? "neutral";
  for (const keyframe of sorted) {
    if (keyframe.frame <= currentFrame) {
      resolved = keyframe.expression_id;
    }
  }
  return resolved;
}

function resolveComposedAnimationExpressionId(documentState, selectedAnimationId, currentFrame) {
  const channels = [...(documentState.animation_composition?.channels ?? [])]
    .filter((channel) => channel.enabled && channel.active_clip_id)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const faceChannel = channels.find((channel) => (channel.target_regions ?? []).includes("face"));
  const chosenClipId = faceChannel?.active_clip_id ?? selectedAnimationId;
  return resolveAnimationExpressionId(documentState, chosenClipId, currentFrame);
}

function resolveRegionOffsetForFrame(clip, regionId, frame) {
  const keys = [...(clip?.tracks?.region_offsets ?? [])]
    .filter((key) => key.region_id === regionId)
    .sort((a, b) => a.frame - b.frame);

  let resolved = { x: 0, y: 0 };
  for (const key of keys) {
    if (key.frame <= frame) {
      resolved = { x: key.x ?? 0, y: key.y ?? 0 };
    }
  }
  return resolved;
}

function resolveCompositionOwnership(documentState) {
  const regions = new Map((documentState.rig?.regions ?? []).map((region) => [region.id, region]));
  const channelConfig = new Map(TIMELINE_CHANNELS.map((channel) => [channel.id, channel]));
  const sortedChannels = [...(documentState.animation_composition?.channels ?? [])]
    .filter((channel) => channel.enabled && channel.active_clip_id)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const jointOwners = {};
  const regionOwners = {};

  for (const channel of sortedChannels) {
    const channelMeta = channelConfig.get(channel.id);
    const owner = {
      id: channel.id,
      label: channelMeta?.label ?? channel.id,
      color: channelMeta?.color ?? "#ffffff",
      clipId: channel.active_clip_id,
      priority: channel.priority ?? 0,
    };

    for (const regionId of channel.target_regions ?? []) {
      regionOwners[regionId] = regionOwners[regionId] ?? owner;
      const region = regions.get(regionId);
      if (!region) continue;
      for (const jointId of region.joint_ids ?? []) {
        jointOwners[jointId] = jointOwners[jointId] ?? owner;
      }
    }
  }

  return { jointOwners, regionOwners };
}

function resolveComposedRigPreview(documentState, currentFrame) {
  const baseJoints = new Map((documentState.rig?.joints ?? []).map((joint) => [joint.id, { x: joint.x, y: joint.y }]));
  const regions = new Map((documentState.rig?.regions ?? []).map((region) => [region.id, region]));
  const clips = new Map((documentState.animations?.clips ?? []).map((clip) => [clip.id, clip]));
  const sortedChannels = [...(documentState.animation_composition?.channels ?? [])]
    .filter((channel) => channel.enabled && channel.active_clip_id)
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const claimedJoints = new Set();
  const rootSourceId = documentState.animation_composition?.root_motion_source;
  const rootSource = sortedChannels.find((channel) => channel.id === rootSourceId && channel.active_clip_id);
  const rootClip = rootSource ? clips.get(rootSource.active_clip_id) : null;
  let rootOffset = { x: 0, y: 0 };
  if (rootClip) {
    const rootKeys = [...(rootClip.tracks?.root_motion ?? [])].sort((a, b) => a.frame - b.frame);
    for (const key of rootKeys) {
      if (key.frame <= currentFrame) {
        rootOffset = { x: key.x ?? 0, y: key.y ?? 0 };
      }
    }
  }

  for (const position of baseJoints.values()) {
    position.x += rootOffset.x;
    position.y += rootOffset.y;
  }

  for (const channel of sortedChannels) {
    const clip = clips.get(channel.active_clip_id);
    if (!clip) continue;

    for (const regionId of channel.target_regions ?? []) {
      const region = regions.get(regionId);
      if (!region) continue;
      const offset = resolveRegionOffsetForFrame(clip, regionId, currentFrame);
      if (!offset.x && !offset.y) continue;

      for (const jointId of region.joint_ids ?? []) {
        if (claimedJoints.has(jointId)) continue;
        const joint = baseJoints.get(jointId);
        if (!joint) continue;
        joint.x += offset.x;
        joint.y += offset.y;
        claimedJoints.add(jointId);
      }
    }
  }

  return Object.fromEntries([...baseJoints.entries()]);
}

function useStudioController() {
  const initial = loadAutosave() ?? createDefaultDocument();
  const historyRef = useRef(createHistory(initial));
  const [documentState, setDocumentState] = useState(clone(initial));
  const [selectedLayerId, setSelectedLayerId] = useState(initial.layers.items[0]?.id ?? null);
  const [selection, setSelection] = useState(() => new Set());
  const [underlayImageElement, setUnderlayImageElement] = useState(null);

  useEffect(() => {
    if (!documentState.underlay?.data_url) return;
    const image = new Image();
    image.onload = () => setUnderlayImageElement(image);
    image.src = documentState.underlay.data_url;
  }, [documentState.underlay?.data_url]);

  const commitState = (next, push = true) => {
    if (push) historyRef.current.push(next);
    else historyRef.current.replace(next);
    setDocumentState(clone(next));
    saveAutosave(next);
  };

  const updateDocument = (mutator) => {
    const next = clone(documentState);
    mutator(next);
    commitState(next, true);
  };

  const updateLayer = (layerId, mutator) => {
    updateDocument((draft) => {
      const layer = draft.layers.items.find((item) => item.id === layerId);
      if (layer) mutator(layer, draft);
    });
  };

  const activeLayer = useMemo(
    () => documentState.layers.items.find((layer) => layer.id === selectedLayerId) ?? null,
    [documentState.layers.items, selectedLayerId],
  );

  const validation = useMemo(() => validateDocument(documentState), [documentState]);

  return {
    documentState,
    setDocumentState,
    updateDocument,
    updateLayer,
    activeLayer,
    selectedLayerId,
    setSelectedLayerId,
    selection,
    setSelection,
    validation,
    historyRef,
    underlayImageElement,
    setUnderlayImageElement,
    commitState,
  };
}

function Topbar({ documentState, canUndo, canRedo, onMode, onDirection, onUndo, onRedo, onClearAutosave }) {
  return (
    <div className="topbar">
      <div className="brand">
        <div>
          <div className="brand-title">Shinobi Character Studio</div>
          <div className="brand-subtitle">React shell · phases 1-3</div>
        </div>
      </div>
      <div className="mode-bar">
        {MODES.map((mode) => (
          <button key={mode.id} className={`pill-button${documentState.meta.active_mode === mode.id ? " active" : ""}`} onClick={() => onMode(mode.id)}>
            {mode.label}
          </button>
        ))}
      </div>
      <div className="section-stack">
        <div className="history-bar">
          <button className="mini-button" onClick={onUndo} disabled={!canUndo}><UndoIcon /> Undo</button>
          <button className="mini-button" onClick={onRedo} disabled={!canRedo}><RedoIcon /> Redo</button>
          <button className="mini-button" onClick={onClearAutosave}>Clear Autosave</button>
        </div>
        <div className="direction-bar">
          {DIRECTIONS.map((direction) => (
            <button key={direction} className={`chip${documentState.meta.active_direction === direction ? " active" : ""}`} onClick={() => onDirection(direction)}>
              {direction.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MenuStrip() {
  const items = ["File", "Edit", "View", "Layer", "Rig", "Expression", "Animation", "Library", "Help"];
  return (
    <div className="menu-strip" role="menubar" aria-label="Studio menu">
      {items.map((item) => (
        <button key={item} type="button" className="menu-item">
          {item}
        </button>
      ))}
    </div>
  );
}

function ToolsPanel({ documentState, onTool, onTitle, onIdentity, collapsed, onToggle }) {
  return (
    <PanelShell title="Tools" icon={BrushIcon} collapsed={collapsed} onToggle={onToggle}>
        <div className="tool-grid">
          {TOOLS.map((tool) => {
            const Icon = iconForTool(tool.id);
            return (
              <button key={tool.id} className={`mini-button${documentState.meta.active_tool === tool.id ? " active" : ""}`} onClick={() => onTool(tool.id)}>
                <Icon /> {tool.label} · {tool.shortcut}
              </button>
            );
          })}
        </div>
        <div className="field-grid">
          <div className="field">
            <label>Document Title</label>
            <input value={documentState.meta.title || ""} onChange={(event) => onTitle(event.target.value)} />
          </div>
          <div className="field">
            <label>Character Id</label>
            <input value={documentState.identity.id || ""} onChange={(event) => onIdentity(event.target.value)} />
          </div>
        </div>
        <div className="legend">
          <span className="chip">Modes 1–6</span>
          <span className="chip">Tools B/E/G/I/R/M</span>
          <span className="chip">Undo Ctrl+Z</span>
          <span className="chip">Redo Ctrl+Y</span>
          {documentState.meta.active_mode === "animation" ? <span className="chip">Play Space · Step ← →</span> : null}
        </div>
        {documentState.meta.active_mode === "rig" ? (
          <div className="empty-state">
            Rig mode: click a joint on the canvas to select it, then drag to reposition.
          </div>
        ) : null}
        {documentState.meta.active_mode === "expressions" ? (
          <div className="empty-state">
            Expressions mode: switch templates to preview face swaps and tune tiny offsets per layer.
          </div>
        ) : null}
        {documentState.meta.active_mode === "library" ? (
          <div className="empty-state">
            Library mode: attach shared assets as references, then edit local shadow overrides in the inspector.
          </div>
        ) : null}
        {documentState.meta.active_mode === "animation" ? (
          <div className="empty-state">
            Animation mode: author clips, scrub frames, and drive live preview expressions from the active timeline.
          </div>
        ) : null}
    </PanelShell>
  );
}

function LayersPanel({ documentState, selectedLayerId, onSelectLayer, onLayerVisible, onLayerLock, onMoveLayer, onDuplicateLayer, onDeleteLayer, onAddLayer, onActivateSlot, collapsed, onToggle }) {
  return (
    <PanelShell title="Layer Tree" icon={BookIcon} collapsed={collapsed} onToggle={onToggle} bodyClassName="tight">
        <div className="layers-groups">
          {documentState.layers.groups.map((groupName) => {
            const layers = documentState.layers.items.filter((layer) => layer.group === groupName);
            return (
              <div key={groupName} className="layer-group">
                <div className="layer-group-header">
                  <div className="layer-group-title">{groupName}</div>
                  <button className="mini-button" onClick={() => onAddLayer(groupName)}>Add</button>
                </div>
                <div className="layer-list">
                  {!layers.length && <div className="empty-state">No layers in this group yet.</div>}
                  {layers.map((layer) => (
                    <div key={layer.id} className={`layer-row${selectedLayerId === layer.id ? " active" : ""}`}>
                      <button className={`icon-toggle${layer.visible ? " active" : ""}`} onClick={() => onLayerVisible(layer.id)}>
                        <EyeIcon size={14} />
                      </button>
                      <button className={`icon-toggle${layer.locked ? " active" : ""}`} onClick={() => onLayerLock(layer.id)}>
                        {layer.locked ? <LockIcon size={14} /> : <UnlockIcon size={14} />}
                      </button>
                      <button className="icon-toggle" onClick={() => onActivateSlot(layer.id)}>{layer.palette_slot}</button>
                      <button className="layer-name-button" onClick={() => onSelectLayer(layer.id)}>{layer.name}</button>
                      <button className="icon-toggle" onClick={() => onMoveLayer(layer.id, -1)}><ChevronUpIcon size={14} /></button>
                      <button className="icon-toggle" onClick={() => onMoveLayer(layer.id, 1)}><ChevronDownIcon size={14} /></button>
                      <button className="icon-toggle" onClick={() => onDuplicateLayer(layer.id)}><CopyIcon size={14} /></button>
                      <button className="icon-toggle" onClick={() => onDeleteLayer(layer.id)}><TrashIcon size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
    </PanelShell>
  );
}

function LibraryPanel({
  onLoadTemplate,
  onAttachAsset,
  onImportAsset,
  references,
  selectedReferenceId,
  onSelectReference,
  collapsed,
  onToggle,
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const filteredAssets = useMemo(() => LIBRARY_ASSETS.filter((asset) => {
    if (typeFilter !== "all" && asset.type !== typeFilter) return false;
    const haystack = `${asset.title} ${asset.description} ${asset.id} ${(asset.tags ?? []).join(" ")}`.toLowerCase();
    return haystack.includes(search.trim().toLowerCase());
  }), [search, typeFilter]);

  const assetTypes = useMemo(
    () => ["all", ...new Set(LIBRARY_ASSETS.map((asset) => asset.type))],
    [],
  );

  return (
    <PanelShell title="Library" icon={BookIcon} collapsed={collapsed} onToggle={onToggle}>
        <div className="field-grid">
          <div className="field">
            <label>Search Assets</label>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="palette, rig, expression..." />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              {assetTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </div>
        </div>
        <div className="template-list">
          {BUILTIN_TEMPLATES.map((template) => (
            <div key={template.id} className="template-card">
              <div className="template-card-title">{template.title}</div>
              <div className="template-card-meta">{template.description}</div>
              <button className="mini-button" onClick={() => onLoadTemplate(template)}>Load Template</button>
            </div>
          ))}
        </div>
        <div className="library-list">
          {filteredAssets.map((asset) => (
            <div key={asset.id} className="asset-card">
              <div className="asset-card-title">{asset.title}</div>
              <div className="asset-card-meta">{asset.type} · {asset.description}</div>
              <div className="legend">
                {(asset.tags ?? []).map((tag) => <span key={tag} className="chip">{tag}</span>)}
              </div>
              <div className="panel-actions">
                <button className="mini-button" onClick={() => onAttachAsset(asset)}>Attach Ref</button>
                <button className="mini-button" onClick={() => onImportAsset(asset)}>Import</button>
              </div>
            </div>
          ))}
        </div>
        <div className="section-stack">
          <div className="panel-title">Attached References</div>
          <div className="library-list">
            {!references.length ? <div className="empty-state">No shared assets attached yet.</div> : null}
            {references.map((reference) => (
              <button
                key={reference.ref_id}
                type="button"
                className={`mini-button library-reference-button${selectedReferenceId === reference.ref_id ? " active" : ""}`}
                onClick={() => onSelectReference(reference.ref_id)}
              >
                {reference.label} · {reference.type}
              </button>
            ))}
          </div>
        </div>
    </PanelShell>
  );
}

function CenterPanels({
  documentState,
  editorCanvasRef,
  previewCanvasRef,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onTool,
}) {
  return (
    <section className="center">
      <section className="canvas-stage">
        <div className="stage-header">
          <div className="panel-title">Edit Canvas · Shared 64×64</div>
          <div className="status-strip">
            <span className="chip">Mode: {documentState.meta.active_mode}</span>
            <span className="chip">Tool: {documentState.meta.active_tool}</span>
            <span className="chip">Direction: {documentState.meta.active_direction}</span>
          </div>
        </div>
        <div className="canvas-shell">
          <div className="canvas-toolbar">
            <div className="tool-icon-row" role="toolbar" aria-label="Canvas tools">
              {TOOLS.map((tool) => {
                const Icon = iconForTool(tool.id);
                return (
                  <button
                    key={tool.id}
                    type="button"
                    className={`canvas-tool-button${documentState.meta.active_tool === tool.id ? " active" : ""}`}
                    aria-label={`${tool.label} (${tool.shortcut.toUpperCase()})`}
                    title={`${tool.label} (${tool.shortcut.toUpperCase()})`}
                    onClick={() => onTool(tool.id)}
                  >
                    <Icon size={16} />
                  </button>
                );
              })}
            </div>
          </div>
          <div className="canvas-wrap">
            <canvas
              ref={editorCanvasRef}
              className="pixel-canvas"
              width={64 * EDITOR_SCALE}
              height={64 * EDITOR_SCALE}
              onPointerDown={onCanvasPointerDown}
              onPointerMove={onCanvasPointerMove}
              onPointerUp={onCanvasPointerUp}
              onPointerLeave={onCanvasPointerUp}
            />
          </div>
          <section className="preview-overlay">
            <div className="preview-overlay-header">
              <div className="panel-title">Preview</div>
              <div className="status-strip">
                <span className="chip">64×64</span>
                <span className="chip">{PREVIEW_SCALE}x</span>
              </div>
            </div>
            <div className="preview-overlay-body">
              <canvas ref={previewCanvasRef} className="preview-canvas" width={64 * PREVIEW_SCALE} height={64 * PREVIEW_SCALE} />
            </div>
          </section>
        </div>
      </section>
    </section>
  );
}

function InspectorPanel({ documentState, activeLayer, validation, onLayerField, onPaletteSlotField, onPaletteColor, onExportEditor, onExportRuntime, onExportPaletteAsset, onExportRigAsset, onExportExpressionAsset, onExportAnimationAsset, onImportFiles, onImportUnderlay, onUnderlayToggle, onUnderlayField, onSetActivePaletteSlot, collapsedInspector, onToggleInspector, collapsedIo, onToggleIo, stackRef, stackRows, onResizeBetween, selectedRigJointId, onSelectRigJoint, onRigJointField, onAddRigJoint, onSetRigRoot, onAddRigBone, onAddRigAnchor, onAddRigRegion, selectedRigAnchorId, onSelectRigAnchor, onRigAnchorField, selectedRigBoneId, onSelectRigBone, onRigBoneField, selectedRigRegionId, onSelectRigRegion, onRigRegionField, onDeleteRigJoint, onDeleteRigAnchor, onDeleteRigBone, onDeleteRigRegion, rigCreationState, onCancelRigCreation, onSaveRigDirection, onLoadRigDirection, selectedExpressionId, onSelectExpression, onExpressionField, onExpressionLayerVisibility, onExpressionLayerOffset, onAddExpression, onDuplicateExpression, onDeleteExpression, selectedReferenceId, onSelectReference, onReferenceField, onReferenceOverrideField, onDeleteReference, selectedAnimationId, onSelectAnimation, onAnimationField, onAnimationDirectionField, onAnimationExpressionKeyField, onAnimationEventField, onAnimationRootMotionField, onAnimationRegionOffsetField, onAddAnimation, onDuplicateAnimation, onDeleteAnimation, onAddAnimationExpressionKey, onAddAnimationRegionOffset, onAddAnimationEvent, onAddAnimationRootMotion, currentAnimationFrame, onAnimationFrame, onCompositionField, onCompositionChannelField, onCompositionChannelRegionToggle }) {
  const activeRigJoint = documentState.rig?.joints?.find((joint) => joint.id === selectedRigJointId) ?? null;
  const activeRigAnchor = documentState.rig?.anchors?.find((anchor) => anchor.id === selectedRigAnchorId) ?? null;
  const activeRigBone = documentState.rig?.bones?.find((bone) => bone.id === selectedRigBoneId) ?? null;
  const activeRigRegion = documentState.rig?.regions?.find((region) => region.id === selectedRigRegionId) ?? null;
  const activeExpression = getActiveExpression(documentState, selectedExpressionId);
  const faceLayers = (documentState.layers?.items ?? []).filter((layer) => layer.group === "face");
  const activeReference = documentState.references?.library?.find((reference) => reference.ref_id === selectedReferenceId) ?? null;
  const activeAnimation = getActiveAnimationClip(documentState, selectedAnimationId);
  const compositionChannels = documentState.animation_composition?.channels ?? [];

  return (
    <aside ref={stackRef} className="inspector" style={{ gridTemplateRows: stackRows }}>
      <div className="stack-item">
      <PanelShell title="Inspector" icon={PaletteIcon} collapsed={collapsedInspector} onToggle={onToggleInspector}>
          {documentState.meta.active_mode === "rig" ? (
            <>
              <div className="panel-actions">
                <button className="mini-button" onClick={onAddRigJoint}><BoneIcon /> Add Joint</button>
                <button className={`mini-button${rigCreationState.type === "bone" ? " active" : ""}`} onClick={onAddRigBone}>Add Bone</button>
                <button className={`mini-button${rigCreationState.type === "anchor" ? " active" : ""}`} onClick={onAddRigAnchor}>Add Anchor</button>
                <button className="mini-button" onClick={onAddRigRegion}>Add Region</button>
                <button className="mini-button" onClick={onExportRigAsset}><DownloadIcon /> Export Rig Asset</button>
                {(rigCreationState.type === "bone" || rigCreationState.type === "anchor") ? (
                  <button className="mini-button" onClick={onCancelRigCreation}>Cancel</button>
                ) : null}
              </div>
              {(rigCreationState.type === "bone" || rigCreationState.type === "anchor") ? (
                <div className="empty-state">
                  {rigCreationState.type === "bone"
                    ? rigCreationState.fromJointId
                      ? `Add Bone: pick the second joint. From: ${rigCreationState.fromJointId}`
                      : "Add Bone: click the first joint on the canvas."
                    : "Add Anchor: click a joint on the canvas to attach the new anchor."}
                </div>
              ) : null}
              <div className="section-stack">
                <div className="panel-title">Direction Rig Pose</div>
                <div className="panel-actions">
                  <span className="chip active">{documentState.meta.active_direction.toUpperCase()}</span>
                  <button className="mini-button" onClick={onSaveRigDirection}>Save Current</button>
                  <button className="mini-button" onClick={onLoadRigDirection}>Load Saved</button>
                </div>
              </div>
              <div className="section-stack">
                <div className="panel-title">Joints</div>
                <div className="layers-groups">
                  {(documentState.rig?.joints ?? []).map((joint) => (
                    <button
                      key={joint.id}
                      type="button"
                      className={`mini-button rig-joint-button${selectedRigJointId === joint.id ? " active" : ""}`}
                      onClick={() => onSelectRigJoint(joint.id)}
                    >
                      {joint.label} · {joint.x}, {joint.y}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field-grid">
                <div className="field">
                  <label>Joint Label</label>
                  <input value={activeRigJoint?.label || ""} disabled={!activeRigJoint} onChange={(event) => activeRigJoint && onRigJointField(activeRigJoint.id, "label", event.target.value)} />
                </div>
                <div className="field">
                  <label>Joint Id</label>
                  <input value={activeRigJoint?.id || ""} disabled={!activeRigJoint} onChange={(event) => activeRigJoint && onRigJointField(activeRigJoint.id, "id", event.target.value)} />
                </div>
                <div className="field">
                  <label>X</label>
                  <input type="number" min="0" max="64" value={activeRigJoint?.x ?? 0} disabled={!activeRigJoint} onChange={(event) => activeRigJoint && onRigJointField(activeRigJoint.id, "x", Number(event.target.value))} />
                </div>
                <div className="field">
                  <label>Y</label>
                  <input type="number" min="0" max="64" value={activeRigJoint?.y ?? 0} disabled={!activeRigJoint} onChange={(event) => activeRigJoint && onRigJointField(activeRigJoint.id, "y", Number(event.target.value))} />
                </div>
              </div>
              <div className="panel-actions">
                <button className={`mini-button${activeRigJoint?.id === documentState.rig?.root_joint_id ? " active" : ""}`} disabled={!activeRigJoint} onClick={() => activeRigJoint && onSetRigRoot(activeRigJoint.id)}>
                  Set As Root
                </button>
                <button className="mini-button" disabled={!activeRigJoint} onClick={onDeleteRigJoint}>
                  <TrashIcon /> Delete Joint
                </button>
              </div>
              <div className="section-stack">
                <div className="panel-title">Bones</div>
                <div className="layers-groups">
                  {(documentState.rig?.bones ?? []).map((bone) => (
                    <button
                      key={bone.id}
                      type="button"
                      className={`mini-button rig-joint-button${selectedRigBoneId === bone.id ? " active" : ""}`}
                      onClick={() => onSelectRigBone(bone.id)}
                    >
                      {bone.id}: {bone.from} → {bone.to}
                    </button>
                  ))}
                </div>
                <div className="field-grid">
                  <div className="field">
                    <label>Bone Id</label>
                    <input value={activeRigBone?.id || ""} disabled={!activeRigBone} onChange={(event) => activeRigBone && onRigBoneField(activeRigBone.id, "id", event.target.value)} />
                  </div>
                  <div className="field">
                    <label>From</label>
                    <select value={activeRigBone?.from || ""} disabled={!activeRigBone} onChange={(event) => activeRigBone && onRigBoneField(activeRigBone.id, "from", event.target.value)}>
                      {(documentState.rig?.joints ?? []).map((joint) => <option key={joint.id} value={joint.id}>{joint.label}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>To</label>
                    <select value={activeRigBone?.to || ""} disabled={!activeRigBone} onChange={(event) => activeRigBone && onRigBoneField(activeRigBone.id, "to", event.target.value)}>
                      {(documentState.rig?.joints ?? []).map((joint) => <option key={joint.id} value={joint.id}>{joint.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="panel-actions">
                  <button className="mini-button" disabled={!activeRigBone} onClick={onDeleteRigBone}>
                    <TrashIcon /> Delete Bone
                  </button>
                </div>
              </div>
              <div className="section-stack">
                <div className="panel-title">Anchors</div>
                <div className="layers-groups">
                  {(documentState.rig?.anchors ?? []).map((anchor) => (
                    <button
                      key={anchor.id}
                      type="button"
                      className={`mini-button rig-joint-button${selectedRigAnchorId === anchor.id ? " active" : ""}`}
                      onClick={() => onSelectRigAnchor(anchor.id)}
                    >
                      {anchor.id}: {anchor.joint_id}
                    </button>
                  ))}
                </div>
                <div className="field-grid">
                  <div className="field">
                    <label>Anchor Id</label>
                    <input value={activeRigAnchor?.id || ""} disabled={!activeRigAnchor} onChange={(event) => activeRigAnchor && onRigAnchorField(activeRigAnchor.id, "id", event.target.value)} />
                  </div>
                  <div className="field">
                    <label>Joint</label>
                    <select value={activeRigAnchor?.joint_id || ""} disabled={!activeRigAnchor} onChange={(event) => activeRigAnchor && onRigAnchorField(activeRigAnchor.id, "joint_id", event.target.value)}>
                      {(documentState.rig?.joints ?? []).map((joint) => <option key={joint.id} value={joint.id}>{joint.label}</option>)}
                    </select>
                  </div>
                  <div className="field">
                    <label>X</label>
                    <input type="number" min="0" max="64" value={activeRigAnchor?.x ?? 0} disabled={!activeRigAnchor} onChange={(event) => activeRigAnchor && onRigAnchorField(activeRigAnchor.id, "x", Number(event.target.value))} />
                  </div>
                  <div className="field">
                    <label>Y</label>
                    <input type="number" min="0" max="64" value={activeRigAnchor?.y ?? 0} disabled={!activeRigAnchor} onChange={(event) => activeRigAnchor && onRigAnchorField(activeRigAnchor.id, "y", Number(event.target.value))} />
                  </div>
                </div>
                <div className="panel-actions">
                  <button className="mini-button" disabled={!activeRigAnchor} onClick={onDeleteRigAnchor}>
                    <TrashIcon /> Delete Anchor
                  </button>
                </div>
              </div>
              <div className="section-stack">
                <div className="panel-title">Regions</div>
                <div className="layers-groups">
                  {(documentState.rig?.regions ?? []).map((region) => (
                    <button
                      key={region.id}
                      type="button"
                      className={`mini-button rig-joint-button${selectedRigRegionId === region.id ? " active" : ""}`}
                      onClick={() => onSelectRigRegion(region.id)}
                    >
                      {region.id}
                    </button>
                  ))}
                </div>
                <div className="field-grid">
                  <div className="field">
                    <label>Region Id</label>
                    <input value={activeRigRegion?.id || ""} disabled={!activeRigRegion} onChange={(event) => activeRigRegion && onRigRegionField(activeRigRegion.id, "id", event.target.value)} />
                  </div>
                  <div className="field">
                    <label>Joint Membership</label>
                    <div className="rig-checklist">
                      {(documentState.rig?.joints ?? []).map((joint) => (
                        <label key={joint.id} className="rig-check-row">
                          <input
                            type="checkbox"
                            checked={Boolean(activeRigRegion?.joint_ids?.includes(joint.id))}
                            disabled={!activeRigRegion}
                            onChange={(event) => {
                              if (!activeRigRegion) return;
                              const next = new Set(activeRigRegion.joint_ids ?? []);
                              if (event.target.checked) next.add(joint.id);
                              else next.delete(joint.id);
                              onRigRegionField(activeRigRegion.id, "joint_ids", Array.from(next));
                            }}
                          />
                          <span>{joint.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="panel-actions">
                  <button className="mini-button" disabled={!activeRigRegion} onClick={onDeleteRigRegion}>
                    <TrashIcon /> Delete Region
                  </button>
                </div>
              </div>
            </>
          ) : documentState.meta.active_mode === "expressions" ? (
            <>
              <div className="section-stack">
                <div className="panel-title">Live Preview</div>
                <div className="expression-active-row">
                  <span className="chip active">{documentState.meta.active_expression_id || "none"}</span>
                  <span className="muted">Selected template is applied to the composed preview immediately.</span>
                </div>
              </div>
              <div className="section-stack">
                <div className="panel-title">Expression Templates</div>
                <div className="panel-actions">
                  <button className="mini-button" onClick={onAddExpression}><SmileIcon /> Add</button>
                  <button className="mini-button" disabled={!activeExpression} onClick={onDuplicateExpression}><CopyIcon /> Duplicate</button>
                  <button className="mini-button" disabled={!activeExpression} onClick={onDeleteExpression}><TrashIcon /> Delete</button>
                  <button className="mini-button" disabled={!activeExpression} onClick={onExportExpressionAsset}><DownloadIcon /> Export Asset</button>
                </div>
                <div className="layers-groups">
                  {(documentState.expressions?.templates ?? []).map((expression) => (
                    <button
                      key={expression.id}
                      type="button"
                      className={`mini-button rig-joint-button${activeExpression?.id === expression.id ? " active" : ""}`}
                      onClick={() => onSelectExpression(expression.id)}
                    >
                      {expression.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field-grid">
                <div className="field">
                  <label>Expression Label</label>
                  <input value={activeExpression?.label || ""} disabled={!activeExpression} onChange={(event) => activeExpression && onExpressionField(activeExpression.id, "label", event.target.value)} />
                </div>
                <div className="field">
                  <label>Expression Id</label>
                  <input value={activeExpression?.id || ""} disabled={!activeExpression} onChange={(event) => activeExpression && onExpressionField(activeExpression.id, "id", event.target.value)} />
                </div>
              </div>
              <div className="section-stack">
                <div className="panel-title">Layer Swaps</div>
                <div className="rig-checklist">
                  {faceLayers.map((layer) => (
                    <label key={layer.id} className="rig-check-row">
                      <input
                        type="checkbox"
                        checked={Boolean(activeExpression?.layer_visibility?.[layer.id])}
                        disabled={!activeExpression}
                        onChange={(event) => activeExpression && onExpressionLayerVisibility(activeExpression.id, layer.id, event.target.checked)}
                      />
                      <span>{layer.name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="section-stack">
                <div className="panel-title">Tiny Offsets</div>
                <div className="field-grid">
                  {faceLayers.map((layer) => (
                    <React.Fragment key={layer.id}>
                      <div className="field">
                        <label>{layer.name} X</label>
                        <input
                          type="number"
                          min="-8"
                          max="8"
                          value={activeExpression?.layer_offsets?.[layer.id]?.x ?? 0}
                          disabled={!activeExpression}
                          onChange={(event) => activeExpression && onExpressionLayerOffset(activeExpression.id, layer.id, "x", Number(event.target.value))}
                        />
                      </div>
                      <div className="field">
                        <label>{layer.name} Y</label>
                        <input
                          type="number"
                          min="-8"
                          max="8"
                          value={activeExpression?.layer_offsets?.[layer.id]?.y ?? 0}
                          disabled={!activeExpression}
                          onChange={(event) => activeExpression && onExpressionLayerOffset(activeExpression.id, layer.id, "y", Number(event.target.value))}
                        />
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </>
          ) : documentState.meta.active_mode === "library" ? (
            <>
              <div className="section-stack">
                <div className="panel-title">Attached Reference</div>
                {!activeReference ? (
                  <div className="empty-state">Select an attached library asset from the Library panel to inspect or override it.</div>
                ) : (
                  <>
                    <div className="field-grid">
                      <div className="field">
                        <label>Reference Label</label>
                        <input value={activeReference.label || ""} onChange={(event) => onReferenceField(activeReference.ref_id, "label", event.target.value)} />
                      </div>
                      <div className="field">
                        <label>Reference Id</label>
                        <input value={activeReference.ref_id || ""} onChange={(event) => onReferenceField(activeReference.ref_id, "ref_id", event.target.value)} />
                      </div>
                      <div className="field">
                        <label>Asset Id</label>
                        <input value={activeReference.asset_id || ""} disabled />
                      </div>
                      <div className="field">
                        <label>Scope</label>
                        <input value={activeReference.scope || ""} onChange={(event) => onReferenceField(activeReference.ref_id, "scope", event.target.value)} />
                      </div>
                    </div>
                    <div className="panel-actions">
                      <button className={`mini-button${activeReference.enabled ? " active" : ""}`} onClick={() => onReferenceField(activeReference.ref_id, "enabled", !activeReference.enabled)}>
                        {activeReference.enabled ? "Enabled" : "Disabled"}
                      </button>
                      <button className="mini-button" onClick={() => onSelectReference(activeReference.ref_id)}>
                        Active Ref
                      </button>
                      <button className="mini-button" onClick={onDeleteReference}>
                        <TrashIcon /> Detach
                      </button>
                    </div>
                  </>
                )}
              </div>
              {activeReference ? (
                <div className="section-stack">
                  <div className="panel-title">Local Shadow Overrides</div>
                  <div className="field-grid">
                    <div className="field">
                      <label>Palette Slot</label>
                      <select value={activeReference.overrides?.palette_slot ?? ""} onChange={(event) => onReferenceOverrideField(activeReference.ref_id, "palette_slot", event.target.value ? Number(event.target.value) : null)}>
                        <option value="">None</option>
                        {documentState.palettes.global.map((entry) => <option key={entry.slot} value={entry.slot}>{entry.slot} · {entry.name}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <label>Opacity</label>
                      <input type="number" min="0" max="1" step="0.05" value={activeReference.overrides?.opacity ?? 1} onChange={(event) => onReferenceOverrideField(activeReference.ref_id, "opacity", Number(event.target.value))} />
                    </div>
                    <div className="field">
                      <label>Offset X</label>
                      <input type="number" min="-32" max="32" value={activeReference.overrides?.offset_x ?? 0} onChange={(event) => onReferenceOverrideField(activeReference.ref_id, "offset_x", Number(event.target.value))} />
                    </div>
                    <div className="field">
                      <label>Offset Y</label>
                      <input type="number" min="-32" max="32" value={activeReference.overrides?.offset_y ?? 0} onChange={(event) => onReferenceOverrideField(activeReference.ref_id, "offset_y", Number(event.target.value))} />
                    </div>
                    <div className="field field-span-2">
                      <label>Notes</label>
                      <textarea value={activeReference.overrides?.notes ?? ""} onChange={(event) => onReferenceOverrideField(activeReference.ref_id, "notes", event.target.value)} />
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="section-stack">
                <div className="panel-title">Validation</div>
                <div className="validation-list">
                  {validation.map((item, index) => <div key={`${item.level}-${index}`} className={`validation-item ${item.level}`}>{item.message}</div>)}
                </div>
              </div>
            </>
          ) : documentState.meta.active_mode === "animation" ? (
            <>
              <div className="section-stack">
                <div className="panel-title">Animation Clips</div>
                <div className="panel-actions">
                  <button className="mini-button" onClick={onAddAnimation}><FilmIcon /> Add</button>
                  <button className="mini-button" disabled={!activeAnimation} onClick={onDuplicateAnimation}><CopyIcon /> Duplicate</button>
                  <button className="mini-button" disabled={!activeAnimation} onClick={onDeleteAnimation}><TrashIcon /> Delete</button>
                  <button className="mini-button" disabled={!activeAnimation} onClick={onExportAnimationAsset}><DownloadIcon /> Export Asset</button>
                </div>
                <div className="layers-groups">
                  {(documentState.animations?.clips ?? []).map((clip) => (
                    <button
                      key={clip.id}
                      type="button"
                      className={`mini-button rig-joint-button${activeAnimation?.id === clip.id ? " active" : ""}`}
                      onClick={() => onSelectAnimation(clip.id)}
                    >
                      {clip.label} · {clip.duration_frames}f @ {clip.fps}fps
                    </button>
                  ))}
                </div>
              </div>
              <div className="field-grid">
                <div className="field">
                  <label>Clip Label</label>
                  <input value={activeAnimation?.label || ""} disabled={!activeAnimation} onChange={(event) => activeAnimation && onAnimationField(activeAnimation.id, "label", event.target.value)} />
                </div>
                <div className="field">
                  <label>Clip Id</label>
                  <input value={activeAnimation?.id || ""} disabled={!activeAnimation} onChange={(event) => activeAnimation && onAnimationField(activeAnimation.id, "id", event.target.value)} />
                </div>
                <div className="field">
                  <label>FPS</label>
                  <input type="number" min="1" max="60" value={activeAnimation?.fps ?? 1} disabled={!activeAnimation} onChange={(event) => activeAnimation && onAnimationField(activeAnimation.id, "fps", Number(event.target.value))} />
                </div>
                <div className="field">
                  <label>Duration Frames</label>
                  <input type="number" min="1" max="240" value={activeAnimation?.duration_frames ?? 1} disabled={!activeAnimation} onChange={(event) => activeAnimation && onAnimationField(activeAnimation.id, "duration_frames", Number(event.target.value))} />
                </div>
                <div className="field field-span-2">
                  <label>Preview Frame</label>
                  <input type="range" min="0" max={Math.max((activeAnimation?.duration_frames ?? 1) - 1, 0)} value={currentAnimationFrame} disabled={!activeAnimation} onChange={(event) => onAnimationFrame(Number(event.target.value))} />
                </div>
              </div>
              <div className="section-stack">
                <div className="panel-title">Direction Expression Resolve</div>
                <div className="field-grid">
                  {DIRECTIONS.map((direction) => (
                    <div key={direction} className="field">
                      <label>{direction.toUpperCase()}</label>
                      <select
                        value={activeAnimation?.direction_overrides?.[direction]?.expression_id ?? ""}
                        disabled={!activeAnimation}
                        onChange={(event) => activeAnimation && onAnimationDirectionField(activeAnimation.id, direction, "expression_id", event.target.value)}
                      >
                        {(documentState.expressions?.templates ?? []).map((expression) => <option key={expression.id} value={expression.id}>{expression.label}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
              <div className="section-stack">
                <div className="panel-title">Expression Keyframes</div>
                <div className="panel-actions">
                  <button className="mini-button" disabled={!activeAnimation} onClick={onAddAnimationExpressionKey}>Add Key</button>
                </div>
                <div className="layers-groups">
                  {(activeAnimation?.tracks?.expressions ?? []).map((keyframe, index) => (
                    <div key={`${activeAnimation.id}-expr-${index}`} className="field-grid compact-grid">
                      <div className="field">
                        <label>Frame</label>
                        <input type="number" min="0" max={Math.max((activeAnimation?.duration_frames ?? 1) - 1, 0)} value={keyframe.frame} onChange={(event) => onAnimationExpressionKeyField(activeAnimation.id, index, "frame", Number(event.target.value))} />
                      </div>
                      <div className="field">
                        <label>Expression</label>
                        <select value={keyframe.expression_id} onChange={(event) => onAnimationExpressionKeyField(activeAnimation.id, index, "expression_id", event.target.value)}>
                          {(documentState.expressions?.templates ?? []).map((expression) => <option key={expression.id} value={expression.id}>{expression.label}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="section-stack">
                <div className="panel-title">Region Motion Keys</div>
                <div className="panel-actions">
                  <button className="mini-button" disabled={!activeAnimation} onClick={onAddAnimationRegionOffset}>Add Region Key</button>
                </div>
                <div className="layers-groups">
                  {(activeAnimation?.tracks?.region_offsets ?? []).map((keyframe, index) => (
                    <div key={`${activeAnimation.id}-region-${index}`} className="field-grid compact-grid">
                      <div className="field">
                        <label>Frame</label>
                        <input type="number" min="0" max={Math.max((activeAnimation?.duration_frames ?? 1) - 1, 0)} value={keyframe.frame} onChange={(event) => onAnimationRegionOffsetField(activeAnimation.id, index, "frame", Number(event.target.value))} />
                      </div>
                      <div className="field">
                        <label>Region</label>
                        <select value={keyframe.region_id} onChange={(event) => onAnimationRegionOffsetField(activeAnimation.id, index, "region_id", event.target.value)}>
                          {(documentState.rig?.regions ?? []).map((region) => <option key={region.id} value={region.id}>{region.id}</option>)}
                        </select>
                      </div>
                      <div className="field">
                        <label>X</label>
                        <input type="number" min="-16" max="16" value={keyframe.x ?? 0} onChange={(event) => onAnimationRegionOffsetField(activeAnimation.id, index, "x", Number(event.target.value))} />
                      </div>
                      <div className="field">
                        <label>Y</label>
                        <input type="number" min="-16" max="16" value={keyframe.y ?? 0} onChange={(event) => onAnimationRegionOffsetField(activeAnimation.id, index, "y", Number(event.target.value))} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="section-stack">
                <div className="panel-title">Events</div>
                <div className="panel-actions">
                  <button className="mini-button" disabled={!activeAnimation} onClick={onAddAnimationEvent}>Add Event</button>
                </div>
                <div className="layers-groups">
                  {(activeAnimation?.tracks?.events ?? []).map((keyframe, index) => (
                    <div key={`${activeAnimation.id}-event-${index}`} className="field-grid compact-grid">
                      <div className="field">
                        <label>Frame</label>
                        <input type="number" min="0" max={Math.max((activeAnimation?.duration_frames ?? 1) - 1, 0)} value={keyframe.frame} onChange={(event) => onAnimationEventField(activeAnimation.id, index, "frame", Number(event.target.value))} />
                      </div>
                      <div className="field">
                        <label>Event Id</label>
                        <input value={keyframe.id} onChange={(event) => onAnimationEventField(activeAnimation.id, index, "id", event.target.value)} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="section-stack">
                <div className="panel-title">Root Motion</div>
                <div className="panel-actions">
                  <button className="mini-button" disabled={!activeAnimation} onClick={onAddAnimationRootMotion}>Add Root Key</button>
                </div>
                <div className="layers-groups">
                  {(activeAnimation?.tracks?.root_motion ?? []).map((keyframe, index) => (
                    <div key={`${activeAnimation.id}-root-${index}`} className="field-grid compact-grid">
                      <div className="field">
                        <label>Frame</label>
                        <input type="number" min="0" max={Math.max((activeAnimation?.duration_frames ?? 1) - 1, 0)} value={keyframe.frame} onChange={(event) => onAnimationRootMotionField(activeAnimation.id, index, "frame", Number(event.target.value))} />
                      </div>
                      <div className="field">
                        <label>X</label>
                        <input type="number" min="-64" max="64" value={keyframe.x} onChange={(event) => onAnimationRootMotionField(activeAnimation.id, index, "x", Number(event.target.value))} />
                      </div>
                      <div className="field">
                        <label>Y</label>
                        <input type="number" min="-64" max="64" value={keyframe.y} onChange={(event) => onAnimationRootMotionField(activeAnimation.id, index, "y", Number(event.target.value))} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="section-stack">
                <div className="panel-title">Composition Channels</div>
                <div className="field">
                  <label>Root Motion Source</label>
                  <select
                    value={documentState.animation_composition?.root_motion_source ?? ""}
                    onChange={(event) => onCompositionField("root_motion_source", event.target.value)}
                  >
                    {compositionChannels.map((channel) => <option key={channel.id} value={channel.id}>{channel.id}</option>)}
                  </select>
                </div>
                <div className="layers-groups">
                  {compositionChannels.map((channel) => (
                    <div key={channel.id} className="asset-card">
                      <div className="panel-title">{channel.id}</div>
                      <div className="field-grid compact-grid">
                        <div className="field">
                          <label>Clip</label>
                          <select
                            value={channel.active_clip_id ?? ""}
                            onChange={(event) => onCompositionChannelField(channel.id, "active_clip_id", event.target.value)}
                          >
                            <option value="">None</option>
                            {(documentState.animations?.clips ?? []).map((clip) => <option key={clip.id} value={clip.id}>{clip.label}</option>)}
                          </select>
                        </div>
                        <div className="field">
                          <label>Priority</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={channel.priority ?? 0}
                            onChange={(event) => onCompositionChannelField(channel.id, "priority", Number(event.target.value))}
                          />
                        </div>
                      </div>
                      <div className="panel-actions">
                        <button
                          className={`mini-button${channel.enabled ? " active" : ""}`}
                          onClick={() => onCompositionChannelField(channel.id, "enabled", !channel.enabled)}
                        >
                          {channel.enabled ? "Enabled" : "Disabled"}
                        </button>
                      </div>
                      <div className="rig-checklist">
                        {(documentState.rig?.regions ?? []).map((region) => (
                          <label key={`${channel.id}-${region.id}`} className="rig-check-row">
                            <input
                              type="checkbox"
                              checked={Boolean(channel.target_regions?.includes(region.id))}
                              onChange={() => onCompositionChannelRegionToggle(channel.id, region.id)}
                            />
                            <span>{region.id}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="section-stack">
                <div className="panel-title">Priority Stack</div>
                <div className="library-list">
                  {[...compositionChannels]
                    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
                    .map((channel) => (
                      <div key={`priority-${channel.id}`} className="asset-card">
                        <div className="asset-card-title">{channel.id}</div>
                        <div className="asset-card-meta">
                          {channel.enabled ? "enabled" : "disabled"} · priority {channel.priority ?? 0} · {(channel.target_regions ?? []).join(", ") || "no regions"}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </>
          ) : (
            <>
          <div className="field-grid">
            <div className="field">
              <label>Layer Name</label>
              <input value={activeLayer?.name || ""} disabled={!activeLayer} onChange={(event) => activeLayer && onLayerField(activeLayer.id, "name", event.target.value)} />
            </div>
            <div className="field">
              <label>Layer Id</label>
              <input value={activeLayer?.id || ""} disabled={!activeLayer} onChange={(event) => activeLayer && onLayerField(activeLayer.id, "id", event.target.value)} />
            </div>
            <div className="field">
              <label>Group</label>
              <select value={activeLayer?.group || ""} disabled={!activeLayer} onChange={(event) => activeLayer && onLayerField(activeLayer.id, "group", event.target.value)}>
                {documentState.layers.groups.map((groupName) => <option key={groupName} value={groupName}>{groupName}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Palette Slot</label>
              <select value={activeLayer?.palette_slot ?? ""} disabled={!activeLayer} onChange={(event) => activeLayer && onPaletteSlotField(activeLayer.id, Number(event.target.value))}>
                {documentState.palettes.global.map((entry) => <option key={entry.slot} value={entry.slot}>{entry.slot} · {entry.name}</option>)}
              </select>
            </div>
          </div>
          <div className="section-stack">
            <div className="panel-title">Global Palette</div>
            <div className="palette-grid">
              {documentState.palettes.global.map((entry) => (
                <div key={entry.slot} className={`palette-slot${documentState.meta.active_palette_slot === entry.slot ? " active" : ""}`}>
                  <button className="palette-color" style={{ background: entry.color }} onClick={() => onSetActivePaletteSlot(entry.slot)} />
                  <input type="color" value={entry.color.startsWith("#") && entry.color.length >= 7 ? entry.color.slice(0, 7) : "#000000"} onChange={(event) => onPaletteColor(entry.slot, event.target.value)} />
                </div>
              ))}
            </div>
          </div>
          <div className="section-stack">
            <div className="panel-title">Validation</div>
            <div className="validation-list">
              {validation.map((item, index) => <div key={`${item.level}-${index}`} className={`validation-item ${item.level}`}>{item.message}</div>)}
            </div>
          </div>
            </>
          )}
      </PanelShell>
      </div>

      <div className="resize-handle resize-handle-horizontal" onPointerDown={onResizeBetween} />

      <div className="stack-item">
      <PanelShell title="Document IO" icon={DownloadIcon} collapsed={collapsedIo} onToggle={onToggleIo}>
          <div className="panel-actions">
            <button className="mini-button" onClick={onExportPaletteAsset}><PaletteIcon /> Export Palette Asset</button>
            <button className="mini-button" onClick={onExportEditor}><DownloadIcon /> Export Editor YAML</button>
            <button className="mini-button" onClick={onExportRuntime}><FilmIcon /> Export Runtime Package</button>
            <label className="mini-button"><ImportIcon /> Import YAML<input className="sr-only" type="file" multiple accept=".yml,.yaml,.txt" onChange={(event) => event.target.files?.length && onImportFiles(event.target.files)} /></label>
            <label className="mini-button"><UploadIcon /> PNG Underlay<input className="sr-only" type="file" accept="image/png" onChange={(event) => event.target.files?.[0] && onImportUnderlay(event.target.files[0])} /></label>
          </div>
          <button className={`mini-button${documentState.underlay.enabled ? " active" : ""}`} onClick={onUnderlayToggle}>
            {documentState.underlay.enabled ? "Underlay On" : "Underlay Off"}
          </button>
          <div className="field-grid">
            {[
              ["Opacity", "opacity", "0.05", "0", "1"],
              ["Offset X", "offset_x", "1"],
              ["Offset Y", "offset_y", "1"],
              ["Scale", "scale", "0.05", "0.1", "8"],
            ].map(([label, key, step, min, max]) => (
              <div key={key} className="field">
                <label>{label}</label>
                <input type="number" value={documentState.underlay[key]} step={step} min={min} max={max} onChange={(event) => onUnderlayField(key, Number(event.target.value))} />
              </div>
            ))}
          </div>
      </PanelShell>
      </div>
    </aside>
  );
}

function BottomTimeline({ documentState, validation, selectionSize, collapsed, onToggle, timelineSidebarWidth, onResizeTop, onResizeSidebar, height, activeAnimation, currentAnimationFrame, isAnimationPlaying, onAnimationFrame, onToggleAnimationPlayback, compositionOwnership }) {
  const ownedRegions = Object.entries(compositionOwnership?.regionOwners ?? {});
  return (
    <div className={`statusbar${collapsed ? " is-collapsed" : ""}`} style={{ height: collapsed ? 44 : height }}>
      <div className="timeline-top-resizer" onPointerDown={onResizeTop} />
      <div className="statusbar-header">
        <div className="panel-title"><FilmIcon /> Timeline · Compact Shell</div>
        <div className="status-strip">
          <span className="chip">Mode {documentState.meta.active_mode}</span>
          <span className="chip">Pose {documentState.meta.active_pose}</span>
          {documentState.meta.active_mode === "animation" && activeAnimation ? <span className="chip active">{activeAnimation.label} · frame {currentAnimationFrame}</span> : null}
          <span className="chip">Selection {selectionSize} px</span>
          <span className={`chip${validation.some((entry) => entry.level === "error") ? "" : " active"}`}>
            {validation.some((entry) => entry.level === "error") ? "Needs Fixes" : "Export Ready"}
          </span>
          <button type="button" className="icon-toggle active" aria-label={collapsed ? "Expand Timeline" : "Collapse Timeline"} onClick={onToggle}>
            {collapsed ? <ChevronDownIcon size={14} /> : <ChevronUpIcon size={14} />}
          </button>
        </div>
      </div>
      {!collapsed ? <div className="timeline-shell" style={{ gridTemplateColumns: `${timelineSidebarWidth}px 8px minmax(0, 1fr)` }}>
        <div className="timeline-sidebar">
          <div className="status-list">
            <div className="status-card">Document: {documentState.meta.title}</div>
            <div className="status-card">Direction: {documentState.meta.active_direction}</div>
            <div className="status-card">Tool: {documentState.meta.active_tool}</div>
            <div className="status-card">Autosave: enabled</div>
            {documentState.meta.active_mode === "animation" && activeAnimation ? (
              <div className="status-card">
                <div className="panel-title">Playback</div>
                <div className="panel-actions">
                  <button className={`mini-button${isAnimationPlaying ? " active" : ""}`} onClick={onToggleAnimationPlayback}>
                    {isAnimationPlaying ? "Pause" : "Play"}
                  </button>
                </div>
                <input
                  type="range"
                  min="0"
                  max={Math.max(activeAnimation.duration_frames - 1, 0)}
                  value={currentAnimationFrame}
                  onChange={(event) => onAnimationFrame(Number(event.target.value))}
                />
                <div className="status-line">{activeAnimation.fps} fps · {activeAnimation.duration_frames} frames</div>
              </div>
            ) : null}
            {documentState.meta.active_mode === "animation" ? (
              <div className="status-card">
                <div className="panel-title">Region Ownership</div>
                <div className="ownership-list">
                  {ownedRegions.length ? ownedRegions.map(([regionId, owner]) => (
                    <div key={regionId} className="ownership-row">
                      <span className="chip ownership-chip" style={{ borderColor: owner.color, boxShadow: `inset 0 0 0 1px ${owner.color}33` }}>
                        <span className="ownership-dot" style={{ backgroundColor: owner.color }} />
                        {regionId}
                      </span>
                      <span className="status-line">{owner.label} → {owner.clipId}</span>
                    </div>
                  )) : <div className="status-line">No composed regions yet.</div>}
                </div>
              </div>
            ) : null}
            <div className="status-card">Editor YAML: multi-file</div>
            <div className="status-card">Runtime Export: flattened package</div>
          </div>
        </div>
        <div className="resize-handle resize-handle-vertical" onPointerDown={onResizeSidebar} />
        <div className="timeline-main">
          <div className="timeline-lanes">
            {TIMELINE_CHANNELS.map((channel, index) => {
              const compositionChannel = documentState.animation_composition?.channels?.find((entry) => entry.id === channel.id);
              const activeClip = compositionChannel?.active_clip_id
                ? documentState.animations?.clips?.find((clip) => clip.id === compositionChannel.active_clip_id)
                : null;
              const width = activeClip ? Math.max(56, (activeClip.duration_frames ?? 1) * 8) : 32;
              const left = 4 + index * 18;
              return (
              <div key={channel.id} className="timeline-lane">
                <div className="lane-label">{channel.label}</div>
                <div className="lane-track">
                  <div
                    className={`lane-chip${compositionChannel?.enabled ? "" : " is-muted"}`}
                    style={{
                      width: `${width}px`,
                      left: `${left}px`,
                      background: `${channel.color}22`,
                      borderColor: `${channel.color}aa`,
                    }}
                    title={activeClip ? `${activeClip.label} · priority ${compositionChannel?.priority ?? 0}` : "No clip assigned"}
                  >
                    {activeClip?.label ?? "Empty"}
                  </div>
                </div>
              </div>
            )})}
          </div>
        </div>
      </div> : null}
    </div>
  );
}

export function CharacterStudioApp() {
  const {
    documentState,
    updateDocument,
    updateLayer,
    activeLayer,
    selectedLayerId,
    setSelectedLayerId,
    selection,
    setSelection,
    validation,
    historyRef,
    underlayImageElement,
    setUnderlayImageElement,
    commitState,
  } = useStudioController();

  const editorCanvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const dragStartRef = useRef(null);
  const pointerDownRef = useRef(false);
  const sidebarStackRef = useRef(null);
  const inspectorStackRef = useRef(null);
  const [selectedRigJointId, setSelectedRigJointId] = useState(documentState.rig?.joints?.[0]?.id ?? null);
  const [selectedRigAnchorId, setSelectedRigAnchorId] = useState(documentState.rig?.anchors?.[0]?.id ?? null);
  const [selectedRigBoneId, setSelectedRigBoneId] = useState(documentState.rig?.bones?.[0]?.id ?? null);
  const [selectedRigRegionId, setSelectedRigRegionId] = useState(documentState.rig?.regions?.[0]?.id ?? null);
  const [selectedExpressionId, setSelectedExpressionId] = useState(documentState.expressions?.templates?.[0]?.id ?? null);
  const [selectedReferenceId, setSelectedReferenceId] = useState(documentState.references?.library?.[0]?.ref_id ?? null);
  const [selectedAnimationId, setSelectedAnimationId] = useState(documentState.animations?.clips?.[0]?.id ?? null);
  const [currentAnimationFrame, setCurrentAnimationFrame] = useState(0);
  const [isAnimationPlaying, setIsAnimationPlaying] = useState(false);
  const [rigCreationState, setRigCreationState] = useState({ type: null, fromJointId: null });
  const [layout, setLayout] = useState({
    sidebarWidth: 296,
    inspectorWidth: 320,
    timelineHeight: 76,
    timelineSidebarWidth: 260,
    sidebarWeights: {
      layers: 1.45,
      library: 1.1,
    },
    inspectorWeights: {
      inspector: 1.15,
      io: 1,
    },
    collapsed: {
      tools: true,
      layers: true,
      library: true,
      inspector: true,
      io: true,
      timeline: true,
    },
  });

  const togglePanel = (key) => {
    setLayout((current) => ({
      ...current,
      collapsed: {
        ...current.collapsed,
        [key]: !current.collapsed[key],
      },
    }));
  };

  const beginSizeResize = (event, key, axis, min, max, multiplier = 1) => {
    const startValue = layout[key];
    startPointerDrag(event, (dx, dy) => {
      const delta = axis === "x" ? dx : dy;
      setLayout((current) => ({
        ...current,
        [key]: clamp(startValue + delta * multiplier, min, max),
      }));
    });
  };

  const beginWeightResize = (event, containerRef, sectionKey, leadingKey, trailingKey) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const startLeading = layout[sectionKey][leadingKey];
    const startTrailing = layout[sectionKey][trailingKey];
    const total = startLeading + startTrailing;

    startPointerDrag(event, (_dx, dy) => {
      const deltaWeight = (dy / Math.max(rect.height, 1)) * total;
      const nextLeading = clamp(startLeading + deltaWeight, 0.35, total - 0.35);
      const nextTrailing = clamp(total - nextLeading, 0.35, total - 0.35);

      setLayout((current) => ({
        ...current,
        [sectionKey]: {
          ...current[sectionKey],
          [leadingKey]: nextLeading,
          [trailingKey]: nextTrailing,
        },
      }));
    });
  };

  const sidebarRows = [
    layout.collapsed.layers ? "44px" : `${layout.sidebarWeights.layers}fr`,
    "8px",
    layout.collapsed.library ? "44px" : `${layout.sidebarWeights.library}fr`,
  ].join(" ");

  const inspectorRows = [
    layout.collapsed.inspector ? "44px" : `${layout.inspectorWeights.inspector}fr`,
    "8px",
    layout.collapsed.io ? "44px" : `${layout.inspectorWeights.io}fr`,
  ].join(" ");

  const activeAnimation = useMemo(
    () => getActiveAnimationClip(documentState, selectedAnimationId),
    [documentState, selectedAnimationId],
  );
  const compositionOwnership = useMemo(
    () => resolveCompositionOwnership(documentState),
    [documentState],
  );
  const rigPreviewPositions = useMemo(
    () => (documentState.meta.active_mode === "animation"
      ? resolveComposedRigPreview(documentState, currentAnimationFrame)
      : null),
    [documentState, currentAnimationFrame],
  );
  const previewExpressionId = useMemo(
    () => (documentState.meta.active_mode === "animation"
      ? resolveComposedAnimationExpressionId(documentState, selectedAnimationId, currentAnimationFrame)
      : undefined),
    [documentState, selectedAnimationId, currentAnimationFrame],
  );

  useEffect(() => {
    if (documentState.meta.active_mode !== "animation" || !isAnimationPlaying || !activeAnimation) return;
    const delay = 1000 / Math.max(activeAnimation.fps || 1, 1);
    const timer = window.setInterval(() => {
      setCurrentAnimationFrame((frame) => ((frame + 1) % Math.max(activeAnimation.duration_frames || 1, 1)));
    }, delay);
    return () => window.clearInterval(timer);
  }, [documentState.meta.active_mode, isAnimationPlaying, activeAnimation]);

  useEffect(() => {
    setCurrentAnimationFrame((frame) => {
      const maxFrame = Math.max((activeAnimation?.duration_frames ?? 1) - 1, 0);
      return Math.min(frame, maxFrame);
    });
  }, [activeAnimation?.id, activeAnimation?.duration_frames]);

  useEffect(() => {
    if (!editorCanvasRef.current || !previewCanvasRef.current) {
      return;
    }
    renderDocumentToCanvas(documentState, editorCanvasRef.current, {
      showGrid: true,
      underlayImageElement,
      activeExpressionId: previewExpressionId,
      showRig: documentState.meta.active_mode === "rig" || documentState.meta.active_mode === "animation",
      selectedRigJointId,
      selectedRigAnchorId,
      selectedRigBoneId,
      compositionOwnership: documentState.meta.active_mode === "animation" ? compositionOwnership : null,
      rigPreviewPositions,
    });
    const context = editorCanvasRef.current.getContext("2d");
    context.save();
    context.scale(EDITOR_SCALE, EDITOR_SCALE);
    context.strokeStyle = "rgba(111, 176, 255, 0.95)";
    context.lineWidth = 0.2;
    selection.forEach((index) => {
      const x = index % 64;
      const y = Math.floor(index / 64);
      context.strokeRect(x + 0.05, y + 0.05, 0.9, 0.9);
    });
    context.restore();
    renderDocumentToCanvas(documentState, previewCanvasRef.current, {
      underlayImageElement,
      activeExpressionId: previewExpressionId,
      showRig: documentState.meta.active_mode === "rig" || documentState.meta.active_mode === "animation",
      selectedRigJointId,
      selectedRigAnchorId,
      selectedRigBoneId,
      compositionOwnership: documentState.meta.active_mode === "animation" ? compositionOwnership : null,
      rigPreviewPositions,
    });
  }, [documentState, selection, underlayImageElement, selectedRigJointId, selectedRigAnchorId, selectedRigBoneId, previewExpressionId, compositionOwnership, rigPreviewPositions]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (event.key === "Escape" && (rigCreationState.type === "bone" || rigCreationState.type === "anchor")) {
        event.preventDefault();
        setRigCreationState({ type: null, fromJointId: null });
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        const next = event.shiftKey ? historyRef.current.redo() : historyRef.current.undo();
        commitState(next, false);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        const next = historyRef.current.redo();
        commitState(next, false);
        return;
      }

      const tool = TOOLS.find((item) => item.shortcut.toLowerCase() === event.key.toLowerCase());
      if (tool) {
        event.preventDefault();
        updateDocument((draft) => {
          draft.meta.active_tool = tool.id;
        });
        return;
      }

      const modeMap = { "1": "paint", "2": "rig", "3": "expressions", "4": "animation", "5": "library", "6": "export" };
      const mode = modeMap[event.key];
      if (mode) {
        event.preventDefault();
        updateDocument((draft) => {
          draft.meta.active_mode = mode;
        });
        return;
      }

      if (documentState.meta.active_mode === "animation" && activeAnimation) {
        if (event.key === " ") {
          event.preventDefault();
          setIsAnimationPlaying((value) => !value);
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          setCurrentAnimationFrame((frame) => Math.min(frame + 1, Math.max(activeAnimation.duration_frames - 1, 0)));
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          setCurrentAnimationFrame((frame) => Math.max(frame - 1, 0));
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeAnimation, commitState, documentState.meta.active_mode, historyRef, rigCreationState.type, updateDocument]);

  const applyToolAt = (x, y, options = {}) => {
    const layer = activeLayer;
    if (!layer || layer.locked || x < 0 || x >= 64 || y < 0 || y >= 64) return;
    const index = pixelIndex(x, y);
    const tool = documentState.meta.active_tool;

    if (tool === "select") {
      setSelection(new Set([index]));
      return;
    }

    updateLayer(layer.id, (draftLayer, draft) => {
      switch (tool) {
        case "pencil":
          draftLayer.pixels[index] = draft.meta.active_palette_slot;
          break;
        case "erase":
          draftLayer.pixels[index] = 0;
          break;
        case "fill":
          draftLayer.pixels = floodFill(draftLayer.pixels, index, draft.meta.active_palette_slot);
          break;
        case "eyedropper":
          draft.meta.active_palette_slot = draftLayer.pixels[index] || draft.meta.active_palette_slot;
          break;
        case "move":
          if (selection.size && options.delta) {
            draftLayer.pixels = movePixels(draftLayer.pixels, Array.from(selection), options.delta.dx, options.delta.dy);
          }
          break;
        default:
          break;
      }
    });
  };

  const handleCanvasPointerDown = (event) => {
    if (!editorCanvasRef.current) return;
    editorCanvasRef.current.setPointerCapture(event.pointerId);
    const { x, y } = toCanvasPixel(event, editorCanvasRef.current);
    dragStartRef.current = { x, y };
    pointerDownRef.current = true;
    if (documentState.meta.active_mode === "rig") {
      const nearestAnchor = getNearestAnchor(documentState, x, y, 2.5);
      const nearestJoint = getNearestJoint(documentState, x, y);

      if (rigCreationState.type === "anchor") {
        if (nearestJoint) {
          updateDocument((draft) => {
            const joint = draft.rig.joints.find((entry) => entry.id === nearestJoint.id);
            if (!joint) return;
            const id = `anchor_${draft.rig.anchors.length + 1}`;
            draft.rig.anchors.push({ id, joint_id: joint.id, x: joint.x, y: joint.y });
            setSelectedRigAnchorId(id);
            setSelectedRigJointId(null);
            setSelectedRigBoneId(null);
            setRigCreationState({ type: null, fromJointId: null });
          });
        }
        return;
      }

      if (rigCreationState.type === "bone") {
        if (!nearestJoint) {
          return;
        }
        if (!rigCreationState.fromJointId) {
          setRigCreationState({ type: "bone", fromJointId: nearestJoint.id });
          setSelectedRigJointId(nearestJoint.id);
          setSelectedRigAnchorId(null);
          setSelectedRigBoneId(null);
          return;
        }
        if (nearestJoint.id !== rigCreationState.fromJointId) {
          updateDocument((draft) => {
            const id = `bone_${draft.rig.bones.length + 1}`;
            draft.rig.bones.push({ id, from: rigCreationState.fromJointId, to: nearestJoint.id });
            setSelectedRigBoneId(id);
            setSelectedRigJointId(null);
            setSelectedRigAnchorId(null);
            setRigCreationState({ type: null, fromJointId: null });
          });
        }
        return;
      }

      if (nearestAnchor) {
        setSelectedRigAnchorId(nearestAnchor.id);
        setSelectedRigJointId(null);
        setSelectedRigBoneId(null);
        return;
      }
      if (nearestJoint) {
        setSelectedRigJointId(nearestJoint.id);
        setSelectedRigAnchorId(null);
        setSelectedRigBoneId(null);
        return;
      }
      const nearestBone = getNearestBone(documentState, x, y);
      if (nearestBone) {
        setSelectedRigBoneId(nearestBone.id);
        setSelectedRigJointId(null);
        setSelectedRigAnchorId(null);
      }
      return;
    }
    if (documentState.meta.active_tool !== "move") {
      applyToolAt(x, y);
    }
  };

  const handleCanvasPointerMove = (event) => {
    if (!editorCanvasRef.current || !pointerDownRef.current) return;
    const { x, y } = toCanvasPixel(event, editorCanvasRef.current);
    if (documentState.meta.active_mode === "rig") {
      if (selectedRigAnchorId) {
        updateDocument((draft) => {
          const anchor = draft.rig.anchors.find((entry) => entry.id === selectedRigAnchorId);
          if (!anchor) return;
          anchor.x = clamp(x, 0, 64);
          anchor.y = clamp(y, 0, 64);
        });
        return;
      }
      if (selectedRigJointId) {
        updateDocument((draft) => {
          const joint = draft.rig.joints.find((entry) => entry.id === selectedRigJointId);
          if (!joint) return;
          joint.x = clamp(x, 0, 64);
          joint.y = clamp(y, 0, 64);
        });
      }
      return;
    }
    if (documentState.meta.active_tool === "pencil" || documentState.meta.active_tool === "erase") {
      applyToolAt(x, y);
      return;
    }
    if (documentState.meta.active_tool === "select" && dragStartRef.current) {
      const x0 = Math.min(dragStartRef.current.x, x);
      const x1 = Math.max(dragStartRef.current.x, x);
      const y0 = Math.min(dragStartRef.current.y, y);
      const y1 = Math.max(dragStartRef.current.y, y);
      const next = new Set();
      for (let row = y0; row <= y1; row += 1) {
        for (let col = x0; col <= x1; col += 1) {
          next.add(pixelIndex(col, row));
        }
      }
      setSelection(next);
      return;
    }
    if (documentState.meta.active_tool === "move" && dragStartRef.current && selection.size) {
      const dx = x - dragStartRef.current.x;
      const dy = y - dragStartRef.current.y;
      if (dx !== 0 || dy !== 0) {
        applyToolAt(x, y, { delta: { dx, dy } });
        setSelection(new Set(Array.from(selection, (current) => {
          const col = current % 64;
          const row = Math.floor(current / 64);
          return pixelIndex(Math.max(0, Math.min(63, col + dx)), Math.max(0, Math.min(63, row + dy)));
        })));
        dragStartRef.current = { x, y };
      }
    }
  };

  const handleCanvasPointerUp = () => {
    pointerDownRef.current = false;
    dragStartRef.current = null;
  };

  const exportEditor = () => {
    const errors = validation.filter((entry) => entry.level === "error");
    if (errors.length) {
      window.alert(errors.map((entry) => entry.message).join("\n"));
      return;
    }
    buildEditorFiles(documentState).forEach((file) => downloadTextFile(file.name, file.content));
  };

  const exportRuntime = () => {
    const errors = validation.filter((entry) => entry.level === "error");
    if (errors.length) {
      window.alert(errors.map((entry) => entry.message).join("\n"));
      return;
    }
    const previewPng = previewCanvasRef.current ? exportPreviewPng(previewCanvasRef.current) : "";
    buildRuntimeFiles(documentState, previewPng).forEach((file) => {
      if (file.dataUrl) downloadDataUrl(file.name, file.dataUrl);
      else downloadTextFile(file.name, file.content);
    });
  };

  const exportPaletteAsset = () => {
    const asset = {
      id: `palette.${documentState.identity.id || "untitled"}`,
      type: "palette",
      title: `${documentState.identity.name || "Untitled"} Palette`,
      description: "Exported from Character Studio.",
      tags: ["palette", "exported"],
      payload: {
        colors: Object.fromEntries((documentState.palettes?.global ?? []).map((entry) => [String(entry.slot), entry.color])),
      },
    };
    const file = buildLibraryAssetFile(asset);
    downloadTextFile(file.name, file.content);
  };

  const exportRigAsset = () => {
    const asset = {
      id: `rig.${documentState.identity.id || "untitled"}`,
      type: "rig",
      title: `${documentState.identity.name || "Untitled"} Rig`,
      description: "Exported from Character Studio.",
      tags: ["rig", "exported"],
      payload: {
        rig: clone(documentState.rig),
      },
    };
    const file = buildLibraryAssetFile(asset);
    downloadTextFile(file.name, file.content);
  };

  const exportExpressionAsset = () => {
    const expression = getActiveExpression(documentState, selectedExpressionId);
    if (!expression) return;
    const asset = {
      id: `expression.${expression.id}`,
      type: "expression",
      title: expression.label || expression.id,
      description: "Exported from Character Studio.",
      tags: ["expression", "exported"],
      payload: {
        label: expression.label,
        layer_visibility: clone(expression.layer_visibility ?? {}),
        layer_offsets: clone(expression.layer_offsets ?? {}),
      },
    };
    const file = buildLibraryAssetFile(asset);
    downloadTextFile(file.name, file.content);
  };

  const exportAnimationAsset = () => {
    const clip = getActiveAnimationClip(documentState, selectedAnimationId);
    if (!clip) return;
    const asset = {
      id: `animation.${clip.id}`,
      type: "animation",
      title: clip.label || clip.id,
      description: "Exported from Character Studio.",
      tags: ["animation", "exported"],
      payload: {
        clip: clone(clip),
      },
    };
    const file = buildLibraryAssetFile(asset);
    downloadTextFile(file.name, file.content);
  };

  const importFiles = async (fileList) => {
    const imported = await importEditorFiles(fileList);
    if (imported.underlay.data_url) {
      const image = new Image();
      image.onload = () => setUnderlayImageElement(image);
      image.src = imported.underlay.data_url;
    } else {
      setUnderlayImageElement(null);
    }
    setSelection(new Set());
    setSelectedLayerId(imported.layers.items[0]?.id ?? null);
    setSelectedRigJointId(imported.rig?.joints?.[0]?.id ?? null);
    setSelectedRigAnchorId(imported.rig?.anchors?.[0]?.id ?? null);
    setSelectedRigBoneId(imported.rig?.bones?.[0]?.id ?? null);
    setSelectedRigRegionId(imported.rig?.regions?.[0]?.id ?? null);
    setSelectedExpressionId(imported.expressions?.templates?.[0]?.id ?? null);
    setSelectedReferenceId(imported.references?.library?.[0]?.ref_id ?? null);
    setSelectedAnimationId(imported.animations?.clips?.[0]?.id ?? null);
    setCurrentAnimationFrame(0);
    setIsAnimationPlaying(false);
    commitState(imported, false);
  };

  const importUnderlay = async (file) => {
    const dataUrl = await fileToDataUrl(file);
    const image = new Image();
    image.onload = () => setUnderlayImageElement(image);
    image.src = dataUrl;
    updateDocument((draft) => {
      draft.underlay.enabled = true;
      draft.underlay.data_url = dataUrl;
      draft.underlay.name = file.name;
    });
  };

  const addExpression = () => {
    updateDocument((draft) => {
      const expression = createExpressionTemplate(draft);
      draft.expressions.templates.push(expression);
      draft.expressions.active_expression_id = expression.id;
      draft.meta.active_expression_id = expression.id;
      setSelectedExpressionId(expression.id);
    });
  };

  const duplicateExpression = () => {
    if (!selectedExpressionId) return;
    updateDocument((draft) => {
      const source = draft.expressions.templates.find((entry) => entry.id === selectedExpressionId);
      if (!source) return;
      const copy = createExpressionTemplate(draft, {
        label: `${source.label} Copy`,
        layer_visibility: clone(source.layer_visibility ?? {}),
        layer_offsets: clone(source.layer_offsets ?? {}),
      });
      draft.expressions.templates.push(copy);
      draft.expressions.active_expression_id = copy.id;
      draft.meta.active_expression_id = copy.id;
      setSelectedExpressionId(copy.id);
    });
  };

  const deleteExpression = () => {
    if (!selectedExpressionId) return;
    updateDocument((draft) => {
      if ((draft.expressions.templates?.length ?? 0) <= 1) return;
      draft.expressions.templates = draft.expressions.templates.filter((entry) => entry.id !== selectedExpressionId);
      const fallbackId = draft.expressions.templates[0]?.id ?? null;
      draft.expressions.active_expression_id = fallbackId;
      draft.meta.active_expression_id = fallbackId;
      setSelectedExpressionId(fallbackId);
    });
  };

  const addAnimation = () => {
    updateDocument((draft) => {
      const clip = createAnimationClip(draft);
      draft.animations.clips.push(clip);
      draft.animations.active_clip_id = clip.id;
      draft.meta.active_animation_id = clip.id;
      setSelectedAnimationId(clip.id);
      setCurrentAnimationFrame(0);
      draft.meta.active_mode = "animation";
    });
  };

  const duplicateAnimation = () => {
    if (!selectedAnimationId) return;
    updateDocument((draft) => {
      const source = draft.animations.clips.find((entry) => entry.id === selectedAnimationId);
      if (!source) return;
      const copy = createAnimationClip(draft, {
        label: `${source.label} Copy`,
        fps: source.fps,
        duration_frames: source.duration_frames,
        direction_overrides: clone(source.direction_overrides ?? {}),
        tracks: clone(source.tracks ?? {}),
      });
      draft.animations.clips.push(copy);
      draft.animations.active_clip_id = copy.id;
      draft.meta.active_animation_id = copy.id;
      setSelectedAnimationId(copy.id);
      setCurrentAnimationFrame(0);
    });
  };

  const deleteAnimation = () => {
    if (!selectedAnimationId) return;
    updateDocument((draft) => {
      if ((draft.animations.clips?.length ?? 0) <= 1) return;
      draft.animations.clips = draft.animations.clips.filter((entry) => entry.id !== selectedAnimationId);
      const fallbackId = draft.animations.clips[0]?.id ?? null;
      draft.animations.active_clip_id = fallbackId;
      draft.meta.active_animation_id = fallbackId;
      setSelectedAnimationId(fallbackId);
      setCurrentAnimationFrame(0);
    });
  };

  const attachLibraryAsset = (asset) => {
    updateDocument((draft) => {
      const reference = createLibraryReference(asset);
      draft.references.library.push(reference);
      setSelectedReferenceId(reference.ref_id);
      draft.meta.active_mode = "library";
    });
  };

  const importLibraryAsset = (asset) => {
    updateDocument((draft) => {
      if (asset.type === "palette" && asset.payload?.colors) {
        for (const [slot, color] of Object.entries(asset.payload.colors)) {
          const paletteEntry = draft.palettes.global.find((entry) => entry.slot === Number(slot));
          if (paletteEntry) paletteEntry.color = color;
        }
      }

      if (asset.type === "expression" && asset.payload) {
        const expression = createExpressionTemplate(draft, {
          id: `${asset.id.split(".").pop()}_${Date.now()}`,
          label: asset.payload.label ?? asset.title,
          layer_visibility: clone(asset.payload.layer_visibility ?? {}),
          layer_offsets: clone(asset.payload.layer_offsets ?? {}),
        });
        draft.expressions.templates.push(expression);
        draft.expressions.active_expression_id = expression.id;
        draft.meta.active_expression_id = expression.id;
        setSelectedExpressionId(expression.id);
        draft.meta.active_mode = "expressions";
      }

      if (asset.type === "animation" && asset.payload?.clip) {
        const baseClip = clone(asset.payload.clip);
        const clip = createAnimationClip(draft, {
          id: `${baseClip.id}_${Date.now()}`,
          label: baseClip.label ?? asset.title,
          fps: baseClip.fps,
          duration_frames: baseClip.duration_frames,
          direction_overrides: clone(baseClip.direction_overrides ?? {}),
          tracks: clone(baseClip.tracks ?? {}),
        });
        draft.animations.clips.push(clip);
        draft.animations.active_clip_id = clip.id;
        draft.meta.active_animation_id = clip.id;
        setSelectedAnimationId(clip.id);
        setCurrentAnimationFrame(0);
        setIsAnimationPlaying(false);
        draft.meta.active_mode = "animation";
      }

      if (asset.type === "preset" && asset.id === "preset.blank_base") {
        const next = createDefaultDocument();
        next.meta.title = draft.meta.title;
        next.identity.id = draft.identity.id;
        next.identity.name = draft.identity.name;
        Object.assign(draft, next);
        setSelectedLayerId(next.layers.items[0]?.id ?? null);
        setSelectedRigJointId(next.rig?.joints?.[0]?.id ?? null);
        setSelectedRigAnchorId(next.rig?.anchors?.[0]?.id ?? null);
        setSelectedRigBoneId(next.rig?.bones?.[0]?.id ?? null);
        setSelectedRigRegionId(next.rig?.regions?.[0]?.id ?? null);
        setSelectedExpressionId(next.expressions?.templates?.[0]?.id ?? null);
        setSelectedReferenceId(next.references?.library?.[0]?.ref_id ?? null);
        setSelectedAnimationId(next.animations?.clips?.[0]?.id ?? null);
        setCurrentAnimationFrame(0);
        setIsAnimationPlaying(false);
      }
    });
  };

  return (
    <div className="studio-root">
      <MenuStrip />
      <Topbar
        documentState={documentState}
        canUndo={historyRef.current.canUndo()}
        canRedo={historyRef.current.canRedo()}
        onMode={(mode) => updateDocument((draft) => { draft.meta.active_mode = mode; })}
        onDirection={(direction) => updateDocument((draft) => {
          draft.meta.active_direction = direction;
          if (draft.meta.active_mode === "rig") {
            applyRigDirectionSnapshot(draft.rig, direction);
          }
        })}
        onUndo={() => commitState(historyRef.current.undo(), false)}
        onRedo={() => commitState(historyRef.current.redo(), false)}
        onClearAutosave={() => {
          clearAutosave();
          const draft = createDefaultDocument();
          setSelectedLayerId(draft.layers.items[0]?.id ?? null);
          setSelectedRigJointId(draft.rig?.joints?.[0]?.id ?? null);
          setSelectedRigAnchorId(draft.rig?.anchors?.[0]?.id ?? null);
          setSelectedRigBoneId(draft.rig?.bones?.[0]?.id ?? null);
          setSelectedRigRegionId(draft.rig?.regions?.[0]?.id ?? null);
          setSelectedExpressionId(draft.expressions?.templates?.[0]?.id ?? null);
          setSelectedReferenceId(draft.references?.library?.[0]?.ref_id ?? null);
          setSelectedAnimationId(draft.animations?.clips?.[0]?.id ?? null);
          setCurrentAnimationFrame(0);
          setIsAnimationPlaying(false);
          setSelection(new Set());
          setUnderlayImageElement(null);
          commitState(draft, false);
        }}
      />
      <div
        className="workspace"
        style={{ gridTemplateColumns: `${layout.sidebarWidth}px 8px minmax(0, 1fr) 8px ${layout.inspectorWidth}px` }}
      >
        <aside className="sidebar">
          <div ref={sidebarStackRef} className="panel-stack" style={{ gridTemplateRows: sidebarRows }}>
            <div className="stack-item">
          <LayersPanel
            documentState={documentState}
            selectedLayerId={selectedLayerId}
            onSelectLayer={setSelectedLayerId}
            onLayerVisible={(layerId) => updateLayer(layerId, (draftLayer) => { draftLayer.visible = !draftLayer.visible; })}
            onLayerLock={(layerId) => updateLayer(layerId, (draftLayer) => { draftLayer.locked = !draftLayer.locked; })}
            onMoveLayer={(layerId, delta) => {
              updateDocument((draft) => {
                const index = draft.layers.items.findIndex((item) => item.id === layerId);
                const nextIndex = index + delta;
                if (index < 0 || nextIndex < 0 || nextIndex >= draft.layers.items.length) return;
                const [item] = draft.layers.items.splice(index, 1);
                draft.layers.items.splice(nextIndex, 0, item);
              });
            }}
            onDuplicateLayer={(layerId) => {
              updateDocument((draft) => {
                const index = draft.layers.items.findIndex((item) => item.id === layerId);
                if (index < 0) return;
                const copy = clone(draft.layers.items[index]);
                copy.id = `${copy.id}_copy_${Date.now()}`;
                copy.name = `${copy.name} Copy`;
                draft.layers.items.splice(index + 1, 0, copy);
                setSelectedLayerId(copy.id);
              });
            }}
            onDeleteLayer={(layerId) => {
              updateDocument((draft) => {
                draft.layers.items = draft.layers.items.filter((item) => item.id !== layerId);
                setSelectedLayerId(draft.layers.items[0]?.id ?? null);
              });
            }}
            onAddLayer={(groupName) => {
              updateDocument((draft) => {
                const id = `${groupName}_${draft.layers.items.length + 1}`;
                draft.layers.items.push({
                  id,
                  name: `New ${groupName} Layer`,
                  group: groupName,
                  visible: true,
                  locked: false,
                  palette_scope: "global",
                  palette_slot: draft.meta.active_palette_slot,
                  opacity: 1,
                  pixels: Array(64 * 64).fill(0),
                });
                setSelectedLayerId(id);
              });
            }}
            onActivateSlot={(layerId) => {
              setSelectedLayerId(layerId);
              const layer = documentState.layers.items.find((item) => item.id === layerId);
              if (layer) {
                updateDocument((draft) => { draft.meta.active_palette_slot = layer.palette_slot; });
              }
            }}
            collapsed={layout.collapsed.layers}
            onToggle={() => togglePanel("layers")}
          />
            </div>
            <div className="resize-handle resize-handle-horizontal" onPointerDown={(event) => beginWeightResize(event, sidebarStackRef, "sidebarWeights", "layers", "library")} />
            <div className="stack-item">
          <LibraryPanel
            onLoadTemplate={(template) => {
              const draft = createDefaultDocument();
              draft.meta.title = template.title;
              draft.identity.name = template.title;
              setSelectedLayerId(draft.layers.items[0]?.id ?? null);
              setSelectedRigJointId(draft.rig?.joints?.[0]?.id ?? null);
              setSelectedRigAnchorId(draft.rig?.anchors?.[0]?.id ?? null);
              setSelectedRigBoneId(draft.rig?.bones?.[0]?.id ?? null);
              setSelectedRigRegionId(draft.rig?.regions?.[0]?.id ?? null);
              setSelectedExpressionId(draft.expressions?.templates?.[0]?.id ?? null);
              setSelectedReferenceId(draft.references?.library?.[0]?.ref_id ?? null);
              setSelectedAnimationId(draft.animations?.clips?.[0]?.id ?? null);
              setCurrentAnimationFrame(0);
              setIsAnimationPlaying(false);
              commitState(draft, false);
            }}
            onAttachAsset={attachLibraryAsset}
            onImportAsset={importLibraryAsset}
            references={documentState.references?.library ?? []}
            selectedReferenceId={selectedReferenceId}
            onSelectReference={setSelectedReferenceId}
            collapsed={layout.collapsed.library}
            onToggle={() => togglePanel("library")}
          />
            </div>
          </div>
        </aside>
        <div className="resize-handle resize-handle-vertical" onPointerDown={(event) => beginSizeResize(event, "sidebarWidth", "x", 260, 520, 1)} />
        <CenterPanels
          documentState={documentState}
          editorCanvasRef={editorCanvasRef}
          previewCanvasRef={previewCanvasRef}
          onCanvasPointerDown={handleCanvasPointerDown}
          onCanvasPointerMove={handleCanvasPointerMove}
          onCanvasPointerUp={handleCanvasPointerUp}
          onTool={(tool) => updateDocument((draft) => { draft.meta.active_tool = tool; })}
        />
        <div className="resize-handle resize-handle-vertical" onPointerDown={(event) => beginSizeResize(event, "inspectorWidth", "x", 260, 520, -1)} />
        <InspectorPanel
          documentState={documentState}
          activeLayer={activeLayer}
          validation={validation}
          onLayerField={(layerId, key, value) => updateLayer(layerId, (draftLayer) => { draftLayer[key] = value; })}
          onPaletteSlotField={(layerId, slot) => updateLayer(layerId, (draftLayer) => { draftLayer.palette_slot = slot; })}
          onPaletteColor={(slot, color) => updateDocument((draft) => {
            const target = draft.palettes.global.find((entry) => entry.slot === slot);
            if (target) target.color = color;
          })}
          onExportEditor={exportEditor}
          onExportRuntime={exportRuntime}
          onExportPaletteAsset={exportPaletteAsset}
          onExportRigAsset={exportRigAsset}
          onExportExpressionAsset={exportExpressionAsset}
          onExportAnimationAsset={exportAnimationAsset}
          onImportFiles={importFiles}
          onImportUnderlay={importUnderlay}
          onUnderlayToggle={() => updateDocument((draft) => { draft.underlay.enabled = !draft.underlay.enabled; })}
          onUnderlayField={(key, value) => updateDocument((draft) => { draft.underlay[key] = value; })}
          onSetActivePaletteSlot={(slot) => updateDocument((draft) => { draft.meta.active_palette_slot = slot; })}
          collapsedInspector={layout.collapsed.inspector}
          onToggleInspector={() => togglePanel("inspector")}
          collapsedIo={layout.collapsed.io}
          onToggleIo={() => togglePanel("io")}
          stackRef={inspectorStackRef}
          stackRows={inspectorRows}
          onResizeBetween={(event) => beginWeightResize(event, inspectorStackRef, "inspectorWeights", "inspector", "io")}
          selectedRigJointId={selectedRigJointId}
          onSelectRigJoint={(jointId) => {
            setSelectedRigJointId(jointId);
            setSelectedRigAnchorId(null);
          }}
          onRigJointField={(jointId, key, value) => updateDocument((draft) => {
            const joint = draft.rig.joints.find((entry) => entry.id === jointId);
            if (!joint) return;
            joint[key] = key === "x" || key === "y" ? clamp(value, 0, 64) : value;
          })}
          onAddRigJoint={() => updateDocument((draft) => {
            const id = `joint_${draft.rig.joints.length + 1}`;
            draft.rig.joints.push({ id, label: `Joint ${draft.rig.joints.length + 1}`, x: 32, y: 32 });
            setSelectedRigJointId(id);
            setSelectedRigAnchorId(null);
            setSelectedRigBoneId(null);
            setRigCreationState({ type: null, fromJointId: null });
          })}
          onSetRigRoot={(jointId) => updateDocument((draft) => {
            draft.rig.root_joint_id = jointId;
          })}
          onAddRigBone={() => {
            setRigCreationState({ type: "bone", fromJointId: null });
            setSelectedRigBoneId(null);
            setSelectedRigAnchorId(null);
          }}
          onAddRigAnchor={() => {
            setRigCreationState({ type: "anchor", fromJointId: null });
            setSelectedRigAnchorId(null);
            setSelectedRigBoneId(null);
          }}
          onAddRigRegion={() => updateDocument((draft) => {
            const jointId = selectedRigJointId || draft.rig.root_joint_id;
            const id = `region_${draft.rig.regions.length + 1}`;
            draft.rig.regions.push({ id, joint_ids: [jointId] });
            setSelectedRigRegionId(id);
          })}
          selectedRigAnchorId={selectedRigAnchorId}
          onSelectRigAnchor={(anchorId) => {
            setSelectedRigAnchorId(anchorId);
            setSelectedRigJointId(null);
          }}
          onRigAnchorField={(anchorId, key, value) => updateDocument((draft) => {
            const anchor = draft.rig.anchors.find((entry) => entry.id === anchorId);
            if (!anchor) return;
            anchor[key] = key === "x" || key === "y" ? clamp(value, 0, 64) : value;
          })}
          selectedRigBoneId={selectedRigBoneId}
          onSelectRigBone={setSelectedRigBoneId}
          onRigBoneField={(boneId, key, value) => updateDocument((draft) => {
            const bone = draft.rig.bones.find((entry) => entry.id === boneId);
            if (!bone) return;
            bone[key] = value;
          })}
          selectedRigRegionId={selectedRigRegionId}
          onSelectRigRegion={setSelectedRigRegionId}
          onRigRegionField={(regionId, key, value) => updateDocument((draft) => {
            const region = draft.rig.regions.find((entry) => entry.id === regionId);
            if (!region) return;
            region[key] = value;
          })}
          onDeleteRigJoint={() => updateDocument((draft) => {
            if (!selectedRigJointId) return;
            draft.rig.joints = draft.rig.joints.filter((joint) => joint.id !== selectedRigJointId);
            draft.rig.bones = draft.rig.bones.filter((bone) => bone.from !== selectedRigJointId && bone.to !== selectedRigJointId);
            draft.rig.anchors = draft.rig.anchors.filter((anchor) => anchor.joint_id !== selectedRigJointId);
            draft.rig.regions = draft.rig.regions.map((region) => ({
              ...region,
              joint_ids: region.joint_ids.filter((jointId) => jointId !== selectedRigJointId),
            }));
            if (draft.rig.root_joint_id === selectedRigJointId) {
              draft.rig.root_joint_id = draft.rig.joints[0]?.id ?? "";
            }
            setSelectedRigJointId(draft.rig.joints[0]?.id ?? null);
            setSelectedRigBoneId(draft.rig.bones[0]?.id ?? null);
            setSelectedRigAnchorId(draft.rig.anchors[0]?.id ?? null);
          })}
          onDeleteRigAnchor={() => updateDocument((draft) => {
            if (!selectedRigAnchorId) return;
            draft.rig.anchors = draft.rig.anchors.filter((anchor) => anchor.id !== selectedRigAnchorId);
            setSelectedRigAnchorId(draft.rig.anchors[0]?.id ?? null);
          })}
          onDeleteRigBone={() => updateDocument((draft) => {
            if (!selectedRigBoneId) return;
            draft.rig.bones = draft.rig.bones.filter((bone) => bone.id !== selectedRigBoneId);
            setSelectedRigBoneId(draft.rig.bones[0]?.id ?? null);
          })}
          onDeleteRigRegion={() => updateDocument((draft) => {
            if (!selectedRigRegionId) return;
            draft.rig.regions = draft.rig.regions.filter((region) => region.id !== selectedRigRegionId);
            setSelectedRigRegionId(draft.rig.regions[0]?.id ?? null);
          })}
          rigCreationState={rigCreationState}
          onCancelRigCreation={() => setRigCreationState({ type: null, fromJointId: null })}
          onSaveRigDirection={() => updateDocument((draft) => {
            draft.rig.direction_overrides = draft.rig.direction_overrides || {};
            draft.rig.direction_overrides[draft.meta.active_direction] = createRigDirectionSnapshot(draft.rig);
          })}
          onLoadRigDirection={() => updateDocument((draft) => {
            applyRigDirectionSnapshot(draft.rig, draft.meta.active_direction);
          })}
          selectedExpressionId={selectedExpressionId}
          onSelectExpression={(expressionId) => {
            setSelectedExpressionId(expressionId);
            updateDocument((draft) => {
              draft.meta.active_expression_id = expressionId;
              draft.expressions.active_expression_id = expressionId;
            });
          }}
          onExpressionField={(expressionId, key, value) => updateDocument((draft) => {
            const expression = draft.expressions.templates.find((entry) => entry.id === expressionId);
            if (!expression) return;
            expression[key] = value;
            if (key === "id" && draft.meta.active_expression_id === expressionId) {
              draft.meta.active_expression_id = value;
              draft.expressions.active_expression_id = value;
              setSelectedExpressionId(value);
            }
          })}
          onExpressionLayerVisibility={(expressionId, layerId, visible) => updateDocument((draft) => {
            const expression = draft.expressions.templates.find((entry) => entry.id === expressionId);
            if (!expression) return;
            expression.layer_visibility = expression.layer_visibility || {};
            expression.layer_visibility[layerId] = visible;
          })}
          onExpressionLayerOffset={(expressionId, layerId, axis, value) => updateDocument((draft) => {
            const expression = draft.expressions.templates.find((entry) => entry.id === expressionId);
            if (!expression) return;
            expression.layer_offsets = expression.layer_offsets || {};
            expression.layer_offsets[layerId] = expression.layer_offsets[layerId] || { x: 0, y: 0 };
            expression.layer_offsets[layerId][axis] = clamp(value, -8, 8);
          })}
          onAddExpression={addExpression}
          onDuplicateExpression={duplicateExpression}
          onDeleteExpression={deleteExpression}
          selectedReferenceId={selectedReferenceId}
          onSelectReference={setSelectedReferenceId}
          onReferenceField={(referenceId, key, value) => updateDocument((draft) => {
            const reference = draft.references.library.find((entry) => entry.ref_id === referenceId);
            if (!reference) return;
            reference[key] = value;
            if (key === "ref_id") {
              setSelectedReferenceId(value);
            }
          })}
          onReferenceOverrideField={(referenceId, key, value) => updateDocument((draft) => {
            const reference = draft.references.library.find((entry) => entry.ref_id === referenceId);
            if (!reference) return;
            reference.overrides = reference.overrides || {};
            reference.overrides[key] = value;
          })}
          onDeleteReference={() => updateDocument((draft) => {
            if (!selectedReferenceId) return;
            draft.references.library = draft.references.library.filter((entry) => entry.ref_id !== selectedReferenceId);
            setSelectedReferenceId(draft.references.library[0]?.ref_id ?? null);
          })}
          selectedAnimationId={selectedAnimationId}
          onSelectAnimation={(animationId) => {
            setSelectedAnimationId(animationId);
            setCurrentAnimationFrame(0);
            updateDocument((draft) => {
              draft.animations.active_clip_id = animationId;
              draft.meta.active_animation_id = animationId;
            });
          }}
          onAnimationField={(animationId, key, value) => updateDocument((draft) => {
            const clip = draft.animations.clips.find((entry) => entry.id === animationId);
            if (!clip) return;
            clip[key] = value;
            if (key === "id" && draft.animations.active_clip_id === animationId) {
              draft.animations.active_clip_id = value;
              draft.meta.active_animation_id = value;
              setSelectedAnimationId(value);
            }
          })}
          onAnimationDirectionField={(animationId, direction, key, value) => updateDocument((draft) => {
            const clip = draft.animations.clips.find((entry) => entry.id === animationId);
            if (!clip) return;
            clip.direction_overrides = clip.direction_overrides || {};
            clip.direction_overrides[direction] = clip.direction_overrides[direction] || {};
            clip.direction_overrides[direction][key] = value;
          })}
          onAnimationExpressionKeyField={(animationId, index, key, value) => updateDocument((draft) => {
            const clip = draft.animations.clips.find((entry) => entry.id === animationId);
            if (!clip) return;
            clip.tracks = clip.tracks || {};
            clip.tracks.expressions = clip.tracks.expressions || [];
            if (!clip.tracks.expressions[index]) return;
            clip.tracks.expressions[index][key] = value;
            clip.tracks.expressions.sort((a, b) => a.frame - b.frame);
          })}
          onAnimationRegionOffsetField={(animationId, index, key, value) => updateDocument((draft) => {
            const clip = draft.animations.clips.find((entry) => entry.id === animationId);
            if (!clip) return;
            clip.tracks = clip.tracks || {};
            clip.tracks.region_offsets = clip.tracks.region_offsets || [];
            if (!clip.tracks.region_offsets[index]) return;
            clip.tracks.region_offsets[index][key] = value;
            clip.tracks.region_offsets.sort((a, b) => a.frame - b.frame);
          })}
          onAnimationEventField={(animationId, index, key, value) => updateDocument((draft) => {
            const clip = draft.animations.clips.find((entry) => entry.id === animationId);
            if (!clip) return;
            clip.tracks = clip.tracks || {};
            clip.tracks.events = clip.tracks.events || [];
            if (!clip.tracks.events[index]) return;
            clip.tracks.events[index][key] = value;
            clip.tracks.events.sort((a, b) => a.frame - b.frame);
          })}
          onAnimationRootMotionField={(animationId, index, key, value) => updateDocument((draft) => {
            const clip = draft.animations.clips.find((entry) => entry.id === animationId);
            if (!clip) return;
            clip.tracks = clip.tracks || {};
            clip.tracks.root_motion = clip.tracks.root_motion || [];
            if (!clip.tracks.root_motion[index]) return;
            clip.tracks.root_motion[index][key] = value;
            clip.tracks.root_motion.sort((a, b) => a.frame - b.frame);
          })}
          onAddAnimation={addAnimation}
          onDuplicateAnimation={duplicateAnimation}
          onDeleteAnimation={deleteAnimation}
          onAddAnimationExpressionKey={() => updateDocument((draft) => {
            const clip = draft.animations.clips.find((entry) => entry.id === selectedAnimationId);
            if (!clip) return;
            clip.tracks.expressions.push({ frame: Math.max((clip.duration_frames ?? 1) - 1, 0), expression_id: draft.meta.active_expression_id });
          })}
          onAddAnimationRegionOffset={() => updateDocument((draft) => {
            const clip = draft.animations.clips.find((entry) => entry.id === selectedAnimationId);
            if (!clip) return;
            clip.tracks.region_offsets = clip.tracks.region_offsets || [];
            clip.tracks.region_offsets.push({
              frame: Math.max((clip.duration_frames ?? 1) - 1, 0),
              region_id: draft.rig?.regions?.[0]?.id ?? "torso",
              x: 0,
              y: 0,
            });
          })}
          onAddAnimationEvent={() => updateDocument((draft) => {
            const clip = draft.animations.clips.find((entry) => entry.id === selectedAnimationId);
            if (!clip) return;
            clip.tracks.events.push({ frame: Math.max((clip.duration_frames ?? 1) - 1, 0), id: `event_${clip.tracks.events.length + 1}` });
          })}
          onAddAnimationRootMotion={() => updateDocument((draft) => {
            const clip = draft.animations.clips.find((entry) => entry.id === selectedAnimationId);
            if (!clip) return;
            clip.tracks.root_motion.push({ frame: Math.max((clip.duration_frames ?? 1) - 1, 0), x: 0, y: 0 });
          })}
          currentAnimationFrame={currentAnimationFrame}
          onAnimationFrame={setCurrentAnimationFrame}
          onCompositionField={(key, value) => updateDocument((draft) => {
            draft.animation_composition[key] = value;
          })}
          onCompositionChannelField={(channelId, key, value) => updateDocument((draft) => {
            const channel = draft.animation_composition.channels.find((entry) => entry.id === channelId);
            if (!channel) return;
            channel[key] = value;
          })}
          onCompositionChannelRegionToggle={(channelId, regionId) => updateDocument((draft) => {
            const channel = draft.animation_composition.channels.find((entry) => entry.id === channelId);
            if (!channel) return;
            const next = new Set(channel.target_regions ?? []);
            if (next.has(regionId)) next.delete(regionId);
            else next.add(regionId);
            channel.target_regions = Array.from(next);
          })}
        />
      </div>
      <BottomTimeline
        documentState={documentState}
        validation={validation}
        selectionSize={selection.size}
        collapsed={layout.collapsed.timeline}
        onToggle={() => togglePanel("timeline")}
        timelineSidebarWidth={layout.timelineSidebarWidth}
        onResizeTop={(event) => beginSizeResize(event, "timelineHeight", "y", 120, 420, -1)}
        onResizeSidebar={(event) => beginSizeResize(event, "timelineSidebarWidth", "x", 180, 420, 1)}
        height={layout.timelineHeight}
        activeAnimation={activeAnimation}
        currentAnimationFrame={currentAnimationFrame}
        isAnimationPlaying={isAnimationPlaying}
        onAnimationFrame={setCurrentAnimationFrame}
        onToggleAnimationPlayback={() => setIsAnimationPlaying((value) => !value)}
        compositionOwnership={compositionOwnership}
      />
    </div>
  );
}

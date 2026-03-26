import {
  BUILTIN_LIBRARY_ASSETS,
  BUILTIN_TEMPLATES,
  DIRECTIONS,
  EDITOR_SCALE,
  MODES,
  PREVIEW_SCALE,
  TIMELINE_CHANNELS,
  TOOLS,
} from "../data/constants.js";
import { createDefaultDocument } from "../data/defaults.js";
import { validateDocument } from "../data/validation.js";
import { createHistory } from "../core/history.js";
import { clearAutosave, loadAutosave, saveAutosave } from "../core/autosave.js";
import {
  buildEditorFiles,
  buildRuntimeFiles,
  downloadDataUrl,
  downloadTextFile,
  importEditorFiles,
} from "../io/yaml_io.js";
import { exportPreviewPng, renderDocumentToCanvas } from "../rendering/canvas_renderer.js";

function pixelIndex(x, y) {
  return y * 64 + x;
}

function clone(value) {
  return structuredClone(value);
}

function el(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
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
  if (targetSlot === nextSlot) {
    return pixels;
  }
  const next = pixels.slice();
  const stack = [startIndex];
  while (stack.length) {
    const current = stack.pop();
    if (next[current] !== targetSlot) {
      continue;
    }
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
      if (neighborX < 0 || neighborX >= 64 || neighborY < 0 || neighborY >= 64) {
        continue;
      }
      const neighborIndex = pixelIndex(neighborX, neighborY);
      if (next[neighborIndex] === targetSlot) {
        stack.push(neighborIndex);
      }
    }
  }
  return next;
}

function movePixels(pixels, selectedIndexes, dx, dy) {
  const next = pixels.slice();
  for (const index of selectedIndexes) {
    next[index] = 0;
  }
  for (const index of selectedIndexes) {
    const x = index % 64;
    const y = Math.floor(index / 64);
    const targetX = x + dx;
    const targetY = y + dy;
    if (targetX < 0 || targetX >= 64 || targetY < 0 || targetY >= 64) {
      continue;
    }
    next[pixelIndex(targetX, targetY)] = pixels[index];
  }
  return next;
}

export function mountStudio(root) {
  const autosaved = loadAutosave();
  const history = createHistory(autosaved ?? createDefaultDocument());
  let documentState = clone(history.present);
  let selectedLayerId = documentState.layers.items[0]?.id ?? null;
  let selection = new Set();
  let isPointerDown = false;
  let dragStart = null;
  let editorCanvas = null;
  let previewCanvas = null;
  let lastPreviewPng = "";
  let underlayImageElement = null;

  function getActiveLayer() {
    return documentState.layers.items.find((layer) => layer.id === selectedLayerId) ?? null;
  }

  function replaceDocument(nextState, push = true) {
    documentState = clone(nextState);
    if (push) {
      history.push(documentState);
    } else {
      history.replace(documentState);
    }
    saveAutosave(documentState);
    render();
  }

  function updateDocument(mutator) {
    const next = clone(documentState);
    mutator(next);
    replaceDocument(next);
  }

  function updateLayer(layerId, mutate) {
    updateDocument((draft) => {
      const layer = draft.layers.items.find((item) => item.id === layerId);
      if (layer) {
        mutate(layer, draft);
      }
    });
  }

  async function hydrateUnderlay(dataUrl, name) {
    if (!dataUrl) {
      underlayImageElement = null;
      return;
    }
    await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        underlayImageElement = image;
        documentState.underlay.name = name || documentState.underlay.name;
        resolve();
      };
      image.src = dataUrl;
    });
  }

  function toCanvasPixel(event, canvas) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.floor(((event.clientX - rect.left) / rect.width) * 64),
      y: Math.floor(((event.clientY - rect.top) / rect.height) * 64),
    };
  }

  function drawSelectionOverlay() {
    if (!editorCanvas) {
      return;
    }
    const context = editorCanvas.getContext("2d");
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
  }

  function refreshCanvases() {
    if (!editorCanvas || !previewCanvas) {
      return;
    }
    renderDocumentToCanvas(documentState, editorCanvas, {
      showGrid: true,
      underlayImageElement,
    });
    drawSelectionOverlay();
    renderDocumentToCanvas(documentState, previewCanvas, {
      underlayImageElement,
    });
    lastPreviewPng = exportPreviewPng(previewCanvas);
  }

  function applyToolAt(x, y, options = {}) {
    const layer = getActiveLayer();
    if (!layer || layer.locked || x < 0 || x >= 64 || y < 0 || y >= 64) {
      return;
    }
    const index = pixelIndex(x, y);
    const tool = documentState.meta.active_tool;
    let shouldRenderOnly = false;
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
        case "select":
          shouldRenderOnly = true;
          selection = new Set([index]);
          break;
        case "move":
          if (selection.size && options.delta) {
            draftLayer.pixels = movePixels(draftLayer.pixels, Array.from(selection), options.delta.dx, options.delta.dy);
          } else {
            shouldRenderOnly = true;
          }
          break;
        default:
          shouldRenderOnly = true;
      }
    });
    if (shouldRenderOnly) {
      render();
    }
  }

  function onCanvasPointerDown(event) {
    if (!editorCanvas) {
      return;
    }
    editorCanvas.setPointerCapture(event.pointerId);
    const { x, y } = toCanvasPixel(event, editorCanvas);
    dragStart = { x, y };
    isPointerDown = true;
    if (documentState.meta.active_tool !== "move") {
      applyToolAt(x, y);
    }
  }

  function onCanvasPointerMove(event) {
    if (!editorCanvas || !isPointerDown) {
      return;
    }
    const { x, y } = toCanvasPixel(event, editorCanvas);
    if (documentState.meta.active_tool === "pencil" || documentState.meta.active_tool === "erase") {
      applyToolAt(x, y);
      return;
    }
    if (documentState.meta.active_tool === "select" && dragStart) {
      const x0 = Math.min(dragStart.x, x);
      const x1 = Math.max(dragStart.x, x);
      const y0 = Math.min(dragStart.y, y);
      const y1 = Math.max(dragStart.y, y);
      const nextSelection = new Set();
      for (let row = y0; row <= y1; row += 1) {
        for (let col = x0; col <= x1; col += 1) {
          nextSelection.add(pixelIndex(col, row));
        }
      }
      selection = nextSelection;
      render();
      return;
    }
    if (documentState.meta.active_tool === "move" && dragStart && selection.size) {
      const dx = x - dragStart.x;
      const dy = y - dragStart.y;
      if (dx !== 0 || dy !== 0) {
        applyToolAt(x, y, { delta: { dx, dy } });
        selection = new Set(Array.from(selection, (index) => {
          const col = index % 64;
          const row = Math.floor(index / 64);
          return pixelIndex(Math.max(0, Math.min(63, col + dx)), Math.max(0, Math.min(63, row + dy)));
        }));
        dragStart = { x, y };
      }
    }
  }

  function onCanvasPointerUp() {
    isPointerDown = false;
    dragStart = null;
  }

  function addLayer(group) {
    updateDocument((draft) => {
      const id = `${group}_${draft.layers.items.length + 1}`;
      draft.layers.items.push({
        id,
        name: `New ${group} Layer`,
        group,
        visible: true,
        locked: false,
        palette_scope: "global",
        palette_slot: draft.meta.active_palette_slot,
        opacity: 1,
        pixels: Array(64 * 64).fill(0),
      });
      selectedLayerId = id;
    });
  }

  function duplicateLayer(layerId) {
    updateDocument((draft) => {
      const index = draft.layers.items.findIndex((item) => item.id === layerId);
      if (index < 0) {
        return;
      }
      const copy = clone(draft.layers.items[index]);
      copy.id = `${copy.id}_copy_${Date.now()}`;
      copy.name = `${copy.name} Copy`;
      draft.layers.items.splice(index + 1, 0, copy);
      selectedLayerId = copy.id;
    });
  }

  function deleteLayer(layerId) {
    updateDocument((draft) => {
      draft.layers.items = draft.layers.items.filter((item) => item.id !== layerId);
      selectedLayerId = draft.layers.items[0]?.id ?? null;
    });
  }

  function moveLayer(layerId, delta) {
    updateDocument((draft) => {
      const index = draft.layers.items.findIndex((item) => item.id === layerId);
      const nextIndex = index + delta;
      if (index < 0 || nextIndex < 0 || nextIndex >= draft.layers.items.length) {
        return;
      }
      const [item] = draft.layers.items.splice(index, 1);
      draft.layers.items.splice(nextIndex, 0, item);
    });
  }

  async function importDocument(files) {
    try {
      const imported = await importEditorFiles(files);
      if (imported.underlay.data_url) {
        await hydrateUnderlay(imported.underlay.data_url, imported.underlay.name);
      }
      documentState = imported;
      history.replace(imported);
      saveAutosave(imported);
      selectedLayerId = imported.layers.items[0]?.id ?? null;
      selection = new Set();
      render();
    } catch (error) {
      window.alert(error.message || "Could not import the selected files.");
    }
  }

  function exportEditorYaml() {
    const errors = validateDocument(documentState).filter((entry) => entry.level === "error");
    if (errors.length) {
      window.alert(errors.map((entry) => entry.message).join("\n"));
      return;
    }
    buildEditorFiles(documentState).forEach((file) => downloadTextFile(file.name, file.content));
  }

  function exportRuntimePackage() {
    const errors = validateDocument(documentState).filter((entry) => entry.level === "error");
    if (errors.length) {
      window.alert(errors.map((entry) => entry.message).join("\n"));
      return;
    }
    const previewPng = lastPreviewPng || exportPreviewPng(previewCanvas);
    buildRuntimeFiles(documentState, previewPng).forEach((file) => {
      if (file.dataUrl) {
        downloadDataUrl(file.name, file.dataUrl);
      } else {
        downloadTextFile(file.name, file.content);
      }
    });
  }

  function setupKeyboardShortcuts() {
    window.addEventListener("keydown", (event) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        documentState = event.shiftKey ? history.redo() : history.undo();
        saveAutosave(documentState);
        render();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        documentState = history.redo();
        saveAutosave(documentState);
        render();
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
      }
    });
  }

  function renderTopbar() {
    const topbar = el("div", "topbar");
    const brand = el("div", "brand");
    const brandInfo = document.createElement("div");
    brandInfo.append(el("div", "brand-title", "Shinobi Character Studio"), el("div", "brand-subtitle", "Modular 64x64 shell · phases 1-3"));
    brand.append(brandInfo);
    const modes = el("div", "mode-bar");
    MODES.forEach((mode) => {
      const button = el("button", `pill-button${documentState.meta.active_mode === mode.id ? " active" : ""}`, mode.label);
      button.addEventListener("click", () => updateDocument((draft) => {
        draft.meta.active_mode = mode.id;
      }));
      modes.append(button);
    });

    const right = el("div", "section-stack");
    const historyBar = el("div", "history-bar");
    const undo = el("button", "mini-button", "Undo");
    undo.disabled = !history.canUndo();
    undo.addEventListener("click", () => {
      documentState = history.undo();
      saveAutosave(documentState);
      render();
    });
    const redo = el("button", "mini-button", "Redo");
    redo.disabled = !history.canRedo();
    redo.addEventListener("click", () => {
      documentState = history.redo();
      saveAutosave(documentState);
      render();
    });
    const clear = el("button", "mini-button", "Clear Autosave");
    clear.addEventListener("click", () => {
      clearAutosave();
      documentState = createDefaultDocument();
      history.replace(documentState);
      selectedLayerId = documentState.layers.items[0]?.id ?? null;
      render();
    });
    historyBar.append(undo, redo, clear);

    const directions = el("div", "direction-bar");
    DIRECTIONS.forEach((direction) => {
      const button = el("button", `chip${documentState.meta.active_direction === direction ? " active" : ""}`, direction.toUpperCase());
      button.addEventListener("click", () => updateDocument((draft) => {
        draft.meta.active_direction = direction;
      }));
      directions.append(button);
    });

    right.append(historyBar, directions);
    topbar.append(brand, modes, right);
    return topbar;
  }

  function renderToolsPanel() {
    const panel = el("section", "panel");
    panel.append(el("div", "panel-header").appendChild(el("div", "panel-title", "Tools")).parentElement);
    const body = el("div", "panel-body");

    const toolGrid = el("div", "tool-grid");
    TOOLS.forEach((tool) => {
      const button = el("button", `mini-button${documentState.meta.active_tool === tool.id ? " active" : ""}`, `${tool.label} · ${tool.shortcut}`);
      button.addEventListener("click", () => updateDocument((draft) => {
        draft.meta.active_tool = tool.id;
      }));
      toolGrid.append(button);
    });

    const fieldGrid = el("div", "field-grid");
    const titleField = el("div", "field");
    titleField.append(el("label", "", "Document Title"));
    const titleInput = document.createElement("input");
    titleInput.value = documentState.meta.title || "";
    titleInput.addEventListener("input", (event) => updateDocument((draft) => {
      draft.meta.title = event.target.value;
    }));
    titleField.append(titleInput);

    const idField = el("div", "field");
    idField.append(el("label", "", "Character Id"));
    const idInput = document.createElement("input");
    idInput.value = documentState.identity.id || "";
    idInput.addEventListener("input", (event) => updateDocument((draft) => {
      draft.identity.id = event.target.value;
    }));
    idField.append(idInput);
    fieldGrid.append(titleField, idField);

    const legend = el("div", "legend");
    legend.append(el("span", "chip", "Modes 1–6"), el("span", "chip", "Tools B/E/G/I/R/M"), el("span", "chip", "Undo Ctrl+Z"), el("span", "chip", "Redo Ctrl+Y"));

    body.append(toolGrid, fieldGrid, legend);
    panel.append(body);
    return panel;
  }

  function renderLayersPanel() {
    const panel = el("section", "panel");
    panel.append(el("div", "panel-header").appendChild(el("div", "panel-title", "Layer Tree")).parentElement);
    const body = el("div", "panel-body tight");
    const groups = el("div", "layers-groups");

    for (const groupName of documentState.layers.groups) {
      const group = el("div", "layer-group");
      const header = el("div", "layer-group-header");
      header.append(el("div", "layer-group-title", groupName));
      const add = el("button", "mini-button", "Add");
      add.addEventListener("click", () => addLayer(groupName));
      header.append(add);
      const list = el("div", "layer-list");
      const layers = documentState.layers.items.filter((layer) => layer.group === groupName);
      if (!layers.length) {
        list.append(el("div", "empty-state", "No layers in this group yet."));
      } else {
        for (const layer of layers) {
          const row = el("div", `layer-row${selectedLayerId === layer.id ? " active" : ""}`);
          const visible = el("button", `icon-toggle${layer.visible ? " active" : ""}`, layer.visible ? "👁" : "·");
          visible.addEventListener("click", () => updateLayer(layer.id, (draftLayer) => {
            draftLayer.visible = !draftLayer.visible;
          }));
          const lock = el("button", `icon-toggle${layer.locked ? " active" : ""}`, layer.locked ? "🔒" : "🔓");
          lock.addEventListener("click", () => updateLayer(layer.id, (draftLayer) => {
            draftLayer.locked = !draftLayer.locked;
          }));
          const slot = el("button", "icon-toggle", String(layer.palette_slot));
          slot.addEventListener("click", () => {
            selectedLayerId = layer.id;
            updateDocument((draft) => {
              draft.meta.active_palette_slot = layer.palette_slot;
            });
          });
          const nameButton = el("button", "layer-name-button", layer.name);
          nameButton.addEventListener("click", () => {
            selectedLayerId = layer.id;
            render();
          });
          const up = el("button", "icon-toggle", "↑");
          up.addEventListener("click", () => moveLayer(layer.id, -1));
          const down = el("button", "icon-toggle", "↓");
          down.addEventListener("click", () => moveLayer(layer.id, 1));
          const copy = el("button", "icon-toggle", "⧉");
          copy.addEventListener("click", () => duplicateLayer(layer.id));
          const remove = el("button", "icon-toggle", "✕");
          remove.addEventListener("click", () => deleteLayer(layer.id));
          row.append(visible, lock, slot, nameButton, up, down, copy, remove);
          list.append(row);
        }
      }
      group.append(header, list);
      groups.append(group);
    }

    body.append(groups);
    panel.append(body);
    return panel;
  }

  function renderLibraryPanel() {
    const panel = el("section", "panel");
    panel.append(el("div", "panel-header").appendChild(el("div", "panel-title", "Library")).parentElement);
    const body = el("div", "panel-body");
    const templates = el("div", "template-list");

    for (const template of BUILTIN_TEMPLATES) {
      const card = el("div", "template-card");
      card.append(el("div", "template-card-title", template.title), el("div", "template-card-meta", template.description));
      const button = el("button", "mini-button", "Load Template");
      button.addEventListener("click", () => {
        const draft = createDefaultDocument();
        draft.meta.title = template.title;
        draft.identity.name = template.title;
        replaceDocument(draft);
        selectedLayerId = draft.layers.items[0]?.id ?? null;
      });
      card.append(button);
      templates.append(card);
    }

    const assets = el("div", "library-list");
    for (const asset of BUILTIN_LIBRARY_ASSETS) {
      const card = el("div", "asset-card");
      card.append(el("div", "asset-card-title", asset.title), el("div", "asset-card-meta", `${asset.type} · ${asset.description}`));
      const button = el("button", "mini-button", "Attach Placeholder");
      button.addEventListener("click", () => updateDocument((draft) => {
        draft.references.library.push({ asset_id: asset.id, type: asset.type, overrides: {} });
      }));
      card.append(button);
      assets.append(card);
    }

    body.append(templates, assets);
    panel.append(body);
    return panel;
  }

  function renderCenter() {
    const center = el("section", "center");

    const leftStage = el("section", "canvas-stage");
    const leftHeader = el("div", "stage-header");
    leftHeader.append(el("div", "panel-title", "Edit Canvas · Shared 64×64"));
    const leftStrip = el("div", "status-strip");
    leftStrip.append(el("span", "chip", `Mode: ${documentState.meta.active_mode}`), el("span", "chip", `Tool: ${documentState.meta.active_tool}`), el("span", "chip", `Direction: ${documentState.meta.active_direction}`));
    leftHeader.append(leftStrip);
    const leftShell = el("div", "canvas-shell");
    const leftWrap = el("div", "canvas-wrap");
    editorCanvas = el("canvas", "pixel-canvas");
    editorCanvas.addEventListener("pointerdown", onCanvasPointerDown);
    editorCanvas.addEventListener("pointermove", onCanvasPointerMove);
    editorCanvas.addEventListener("pointerup", onCanvasPointerUp);
    editorCanvas.addEventListener("pointerleave", onCanvasPointerUp);
    leftWrap.append(editorCanvas);
    leftShell.append(leftWrap);
    leftStage.append(leftHeader, leftShell);

    const rightStage = el("section", "preview-stage");
    const rightHeader = el("div", "stage-header");
    rightHeader.append(el("div", "panel-title", "Composed Live Preview"));
    const rightStrip = el("div", "status-strip");
    rightStrip.append(el("span", "chip", "64×64 source"), el("span", "chip", `${PREVIEW_SCALE}x preview`));
    rightHeader.append(rightStrip);
    const rightShell = el("div", "preview-shell");
    const rightWrap = el("div", "preview-wrap");
    previewCanvas = el("canvas", "preview-canvas");
    rightWrap.append(previewCanvas);
    rightShell.append(rightWrap);
    rightStage.append(rightHeader, rightShell);

    center.append(leftStage, rightStage);
    return center;
  }

  function renderInspector() {
    const aside = el("aside", "inspector");
    const activeLayer = getActiveLayer();
    const validations = validateDocument(documentState);

    const inspectorPanel = el("section", "panel");
    inspectorPanel.append(el("div", "panel-header").appendChild(el("div", "panel-title", "Inspector")).parentElement);
    const body = el("div", "panel-body");
    const grid = el("div", "field-grid");

    const nameField = el("div", "field");
    nameField.append(el("label", "", "Layer Name"));
    const nameInput = document.createElement("input");
    nameInput.value = activeLayer?.name || "";
    nameInput.disabled = !activeLayer;
    nameInput.addEventListener("input", (event) => activeLayer && updateLayer(activeLayer.id, (draftLayer) => {
      draftLayer.name = event.target.value;
    }));
    nameField.append(nameInput);

    const idField = el("div", "field");
    idField.append(el("label", "", "Layer Id"));
    const idInput = document.createElement("input");
    idInput.value = activeLayer?.id || "";
    idInput.disabled = !activeLayer;
    idInput.addEventListener("input", (event) => activeLayer && updateLayer(activeLayer.id, (draftLayer) => {
      draftLayer.id = event.target.value;
    }));
    idField.append(idInput);

    const groupField = el("div", "field");
    groupField.append(el("label", "", "Group"));
    const groupSelect = document.createElement("select");
    for (const groupName of documentState.layers.groups) {
      const option = document.createElement("option");
      option.value = groupName;
      option.textContent = groupName;
      option.selected = activeLayer?.group === groupName;
      groupSelect.append(option);
    }
    groupSelect.disabled = !activeLayer;
    groupSelect.addEventListener("change", (event) => activeLayer && updateLayer(activeLayer.id, (draftLayer) => {
      draftLayer.group = event.target.value;
    }));
    groupField.append(groupSelect);

    const paletteField = el("div", "field");
    paletteField.append(el("label", "", "Palette Slot"));
    const paletteSelect = document.createElement("select");
    for (const entry of documentState.palettes.global) {
      const option = document.createElement("option");
      option.value = String(entry.slot);
      option.textContent = `${entry.slot} · ${entry.name}`;
      option.selected = activeLayer?.palette_slot === entry.slot;
      paletteSelect.append(option);
    }
    paletteSelect.disabled = !activeLayer;
    paletteSelect.addEventListener("change", (event) => activeLayer && updateLayer(activeLayer.id, (draftLayer) => {
      draftLayer.palette_slot = Number(event.target.value);
    }));
    paletteField.append(paletteSelect);
    grid.append(nameField, idField, groupField, paletteField);

    const palettePanel = el("div", "section-stack");
    palettePanel.append(el("div", "panel-title", "Global Palette"));
    const paletteGrid = el("div", "palette-grid");
    for (const entry of documentState.palettes.global) {
      const slot = el("div", `palette-slot${documentState.meta.active_palette_slot === entry.slot ? " active" : ""}`);
      const swatch = el("button", "palette-color");
      swatch.style.background = entry.color;
      swatch.addEventListener("click", () => updateDocument((draft) => {
        draft.meta.active_palette_slot = entry.slot;
      }));
      const input = document.createElement("input");
      input.type = "color";
      input.value = entry.color.startsWith("#") && entry.color.length >= 7 ? entry.color.slice(0, 7) : "#000000";
      input.addEventListener("input", (event) => updateDocument((draft) => {
        const target = draft.palettes.global.find((item) => item.slot === entry.slot);
        if (target) {
          target.color = event.target.value;
        }
      }));
      slot.append(swatch, input);
      paletteGrid.append(slot);
    }
    palettePanel.append(paletteGrid);

    const validationPanel = el("div", "section-stack");
    validationPanel.append(el("div", "panel-title", "Validation"));
    const validationList = el("div", "validation-list");
    for (const item of validations) {
      validationList.append(el("div", `validation-item ${item.level}`, item.message));
    }
    validationPanel.append(validationList);

    body.append(grid, palettePanel, validationPanel);
    inspectorPanel.append(body);

    const ioPanel = el("section", "panel");
    ioPanel.append(el("div", "panel-header").appendChild(el("div", "panel-title", "Document IO")).parentElement);
    const ioBody = el("div", "panel-body");
    const actions = el("div", "panel-actions");
    const exportEditor = el("button", "mini-button", "Export Editor YAML");
    exportEditor.addEventListener("click", exportEditorYaml);
    const exportRuntime = el("button", "mini-button", "Export Runtime Package");
    exportRuntime.addEventListener("click", exportRuntimePackage);
    const importInput = document.createElement("input");
    importInput.type = "file";
    importInput.multiple = true;
    importInput.accept = ".yml,.yaml,.txt";
    importInput.addEventListener("change", async (event) => {
      if (event.target.files?.length) {
        await importDocument(event.target.files);
        event.target.value = "";
      }
    });
    const underlayInput = document.createElement("input");
    underlayInput.type = "file";
    underlayInput.accept = "image/png";
    underlayInput.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      const dataUrl = await fileToDataUrl(file);
      await hydrateUnderlay(dataUrl, file.name);
      updateDocument((draft) => {
        draft.underlay.enabled = true;
        draft.underlay.data_url = dataUrl;
        draft.underlay.name = file.name;
      });
      event.target.value = "";
    });
    actions.append(exportEditor, exportRuntime, importInput, underlayInput);

    const underlayToggle = el("button", `mini-button${documentState.underlay.enabled ? " active" : ""}`, documentState.underlay.enabled ? "Underlay On" : "Underlay Off");
    underlayToggle.addEventListener("click", () => updateDocument((draft) => {
      draft.underlay.enabled = !draft.underlay.enabled;
    }));

    const underlayFields = el("div", "field-grid");
    [
      ["Opacity", "opacity", "0.05", "0", "1"],
      ["Offset X", "offset_x", "1"],
      ["Offset Y", "offset_y", "1"],
      ["Scale", "scale", "0.05", "0.1", "8"],
    ].forEach(([label, key, step, min, max]) => {
      const field = el("div", "field");
      field.append(el("label", "", label));
      const input = document.createElement("input");
      input.type = "number";
      input.value = documentState.underlay[key];
      input.step = step;
      if (min) input.min = min;
      if (max) input.max = max;
      input.addEventListener("input", (event) => updateDocument((draft) => {
        draft.underlay[key] = Number(event.target.value);
      }));
      field.append(input);
      underlayFields.append(field);
    });

    ioBody.append(actions, underlayToggle, underlayFields);
    ioPanel.append(ioBody);
    aside.append(inspectorPanel, ioPanel);
    return aside;
  }

  function renderBottomBar() {
    const validation = validateDocument(documentState);
    const statusbar = el("div", "statusbar");
    const header = el("div", "statusbar-header");
    header.append(el("div", "panel-title", "Timeline · Compact Shell"));
    const strip = el("div", "status-strip");
    strip.append(
      el("span", "chip", `Mode ${documentState.meta.active_mode}`),
      el("span", "chip", `Pose ${documentState.meta.active_pose}`),
      el("span", "chip", `Selection ${selection.size} px`),
      el("span", `chip${validation.some((entry) => entry.level === "error") ? "" : " active"}`, validation.some((entry) => entry.level === "error") ? "Needs Fixes" : "Export Ready"),
    );
    header.append(strip);
    const shell = el("div", "timeline-shell");
    const sidebar = el("div", "timeline-sidebar");
    const statusList = el("div", "status-list");
    [
      `Document: ${documentState.meta.title}`,
      `Direction: ${documentState.meta.active_direction}`,
      `Tool: ${documentState.meta.active_tool}`,
      "Autosave: enabled",
      "Editor YAML: multi-file",
      "Runtime Export: flattened package",
    ].forEach((line) => statusList.append(el("div", "status-card", line)));
    sidebar.append(statusList);

    const main = el("div", "timeline-main");
    const lanes = el("div", "timeline-lanes");
    TIMELINE_CHANNELS.forEach((channel, index) => {
      const lane = el("div", "timeline-lane");
      lane.append(el("div", "lane-label", channel.label));
      const track = el("div", "lane-track");
      const chip = el("div", "lane-chip");
      chip.style.width = `${80 + index * 36}px`;
      chip.style.left = `${4 + index * 18}px`;
      track.append(chip);
      lane.append(track);
      lanes.append(lane);
    });
    main.append(lanes);
    shell.append(sidebar, main);
    statusbar.append(header, shell);
    return statusbar;
  }

  function render() {
    root.innerHTML = "";
    const workspace = el("div", "workspace");
    const sidebar = el("aside", "sidebar");
    sidebar.append(renderToolsPanel(), renderLayersPanel(), renderLibraryPanel());
    workspace.append(sidebar, renderCenter(), renderInspector());
    root.append(renderTopbar(), workspace, renderBottomBar());
    refreshCanvases();
  }

  setupKeyboardShortcuts();
  if (documentState.underlay.data_url) {
    hydrateUnderlay(documentState.underlay.data_url, documentState.underlay.name).then(render);
  } else {
    render();
  }
}

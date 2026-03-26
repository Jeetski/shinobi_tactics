import { useEffect } from "react";
import { exportPreviewPng, renderDocumentToCanvas } from "../scripts/rendering/canvas_renderer.js";

export function useRenderedCanvas(canvasRef, documentState, options) {
  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }
    renderDocumentToCanvas(documentState, canvasRef.current, options);
  }, [canvasRef, documentState, options]);
}

export function renderPreviewDataUrl(canvasRef) {
  if (!canvasRef.current) {
    return "";
  }
  return exportPreviewPng(canvasRef.current);
}

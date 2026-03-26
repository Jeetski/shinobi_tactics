import React from "react";

function makeIcon(path, options = {}) {
  const { fill = "none", strokeWidth = 1.8 } = options;
  return function Icon({ size = 16 }) {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} fill={fill} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {path}
      </svg>
    );
  };
}

export const PencilIcon = makeIcon(<path d="M3 21l3.7-1 11-11a2 2 0 0 0-2.8-2.8l-11 11L3 21zM13 6l5 5" />);
export const EraserIcon = makeIcon(<path d="M7 16l8.5-8.5a2.1 2.1 0 0 1 3 0l.9.9a2.1 2.1 0 0 1 0 3L13 18H7l-2-2 7-7" />);
export const FillIcon = makeIcon(<><path d="M12 3l6 7-6 7-6-7 6-7z" /><path d="M5 20h14" /></>);
export const EyedropperIcon = makeIcon(<path d="M4 20l5-5m4-8l6 6m-8-6l-2 2a2 2 0 0 0 0 2.8l3.2 3.2a2 2 0 0 0 2.8 0l2-2a2 2 0 0 0 0-2.8L13.8 7a2 2 0 0 0-2.8 0z" />);
export const SelectIcon = makeIcon(<path d="M4 4h5M4 4v5M20 4h-5M20 4v5M4 20h5M4 20v-5M20 20h-5M20 20v-5" />);
export const MoveIcon = makeIcon(<><path d="M12 3l2.5 2.5L12 8 9.5 5.5 12 3zM12 21l-2.5-2.5L12 16l2.5 2.5L12 21zM3 12l2.5-2.5L8 12l-2.5 2.5L3 12zM21 12l-2.5 2.5L16 12l2.5-2.5L21 12z" /><path d="M12 5v14M5 12h14" /></>);
export const EyeIcon = makeIcon(<><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.5" /></>);
export const LockIcon = makeIcon(<><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V8a4 4 0 1 1 8 0v2" /></>);
export const UnlockIcon = makeIcon(<><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M16 10V8a4 4 0 0 0-8 0" /></>);
export const ChevronUpIcon = makeIcon(<path d="M6 14l6-6 6 6" />);
export const ChevronDownIcon = makeIcon(<path d="M6 10l6 6 6-6" />);
export const CopyIcon = makeIcon(<><rect x="9" y="9" width="11" height="11" rx="2" /><rect x="4" y="4" width="11" height="11" rx="2" /></>);
export const TrashIcon = makeIcon(<><path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 12h10l1-12" /><path d="M9 7V4h6v3" /></>);
export const BrushIcon = makeIcon(<path d="M7 16c-2 0-4 1-4 4 2 0 4-1 4-4zm2-8l6-5 4 4-5 6-5-5z" />);
export const BoneIcon = makeIcon(<><path d="M6 8a2 2 0 1 1-2-2c.6 0 1.1.2 1.5.6L10 11m4 4l4.5 4.4A2 2 0 1 0 20 18a2 2 0 0 0-2 2" /><path d="M10 11l4 4" /></>);
export const SmileIcon = makeIcon(<><circle cx="12" cy="12" r="9" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><path d="M9 10h.01M15 10h.01" /></>);
export const FilmIcon = makeIcon(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 5v14M17 5v14M3 10h4M17 10h4M3 14h4M17 14h4" /></>);
export const BookIcon = makeIcon(<><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22V5.5z" /><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20" /></>);
export const UploadIcon = makeIcon(<><path d="M12 16V4" /><path d="M8 8l4-4 4 4" /><path d="M4 20h16" /></>);
export const DownloadIcon = makeIcon(<><path d="M12 4v12" /><path d="M8 12l4 4 4-4" /><path d="M4 20h16" /></>);
export const UndoIcon = makeIcon(<><path d="M9 14L4 9l5-5" /><path d="M20 20a8 8 0 0 0-8-8H4" /></>);
export const RedoIcon = makeIcon(<><path d="M15 14l5-5-5-5" /><path d="M4 20a8 8 0 0 1 8-8h8" /></>);
export const LayersIcon = makeIcon(<><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 12l9 5 9-5" /><path d="M3 16l9 5 9-5" /></>);
export const PaletteIcon = makeIcon(<path d="M12 3a9 9 0 1 0 0 18h1.4a2.1 2.1 0 1 0 0-4.2h-1a2.3 2.3 0 0 1 0-4.6H14a7 7 0 1 1 0-14h-2z" />);
export const ImportIcon = UploadIcon;
export const ExportIcon = DownloadIcon;

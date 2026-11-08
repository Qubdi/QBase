import React from 'react';

/**
 * Where the floating controls sit. The workspace may set these CSS variables
 * on the canvas or any ancestor to leave room for its own controls:
 * `--canvas-inset-top`, `--canvas-inset-bottom`, `--canvas-inset-left`,
 * `--canvas-inset-right` (all default to 0px).
 * Wide window: corner tools top-left, toolbar bottom-centre.
 * Narrow window (under 768 px): corner tools top-left, the toolbar in a row
 * below them, the Show All pill below the toolbar, so nothing overlaps.
 */
export const CHROME_CSS = `
.qb-corner { position:absolute; z-index:30; display:flex; gap:8px;
  left:calc(var(--canvas-inset-left,0px) + 12px); top:calc(var(--canvas-inset-top,0px) + 12px); }
.qb-legend { position:absolute; z-index:30;
  right:calc(var(--canvas-inset-right,0px) + 12px); top:calc(var(--canvas-inset-top,0px) + 12px); }
.qb-toolbar { position:absolute; z-index:30; left:50%; transform:translateX(-50%);
  max-width:calc(100% - 24px); overflow-x:auto;
  bottom:calc(var(--canvas-inset-bottom,0px) + 16px); }
.qb-pill { position:absolute; z-index:30; left:50%; transform:translateX(-50%);
  bottom:calc(var(--canvas-inset-bottom,0px) + 64px); }
.qb-minimap { margin-bottom:calc(var(--canvas-inset-bottom,0px) + 24px) !important;
  margin-right:calc(var(--canvas-inset-right,0px) + 15px) !important; }
/* keyboard focus on a table, area, note or line: xyflow removes its outline */
.react-flow .react-flow__node.react-flow__node:focus-visible { outline:3px solid hsl(var(--ring)); outline-offset:4px;
  border-radius:12px; box-shadow:0 0 0 7px hsl(var(--background)); }
.react-flow__edge:focus-visible .react-flow__edge-path:not(.react-flow__edge-interaction) {
  stroke:hsl(var(--ring)) !important; stroke-width:4px !important;
  filter:drop-shadow(0 0 3px hsl(var(--background))); }
@media (max-width: 767px) {
  .qb-legend { display:none; }
  .qb-toolbar { bottom:auto; top:calc(var(--canvas-inset-top,0px) + 56px); }
  .qb-pill { bottom:auto; top:calc(var(--canvas-inset-top,0px) + 104px); }
  .qb-minimap, .qb-minimap svg { height:60px !important; }
}`;

export function ChromeStyle() {
    return <style data-testid="canvas-chrome-style">{CHROME_CSS}</style>;
}

const DROP_TARGET_CSS =
    '.react-flow__node-entity:hover > div { box-shadow:0 0 0 3px hsl(var(--primary)); }';

/** While a dependency is dragged the table under the pointer shows it can take it. */
export function DropTargetStyle() {
    return <style data-testid="canvas-drop-style">{DROP_TARGET_CSS}</style>;
}

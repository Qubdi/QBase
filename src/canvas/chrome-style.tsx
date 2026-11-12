import React from 'react';
import { cspNonce } from '@/platform/csp-nonce';

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
:root { --minimap-bg:#fff; --minimap-node:rgb(226,226,226); --minimap-mask:rgba(240,240,240,0.6); }
.dark { --minimap-bg:rgb(20,20,20); --minimap-node:rgb(43,43,43); --minimap-mask:rgba(60,60,60,0.6); --memo-base:#000; }
.dark .react-flow { background-color:rgb(20,20,20) !important; }
.qb-corner { position:absolute; z-index:30; display:flex; gap:8px;
  left:calc(var(--canvas-inset-left,0px) + 15px); top:calc(var(--canvas-inset-top,0px) + 15px); }
.qb-legend { position:absolute; z-index:30;
  right:calc(var(--canvas-inset-right,0px) + 8px); top:calc(var(--canvas-inset-top,0px) + 8px); }
.qb-toolbar { position:absolute; z-index:30; left:50%; transform:translateX(-50%);
  max-width:calc(100% - 24px); overflow:hidden;
  bottom:calc(var(--canvas-inset-bottom,0px) + 15px); }
.qb-pill { position:absolute; z-index:30; left:50%; transform:translateX(-50%);
  bottom:calc(var(--canvas-inset-bottom,0px) + 64px); }
.qb-minimap { margin-bottom:calc(var(--canvas-inset-bottom,0px) + 32px) !important;
  margin-right:calc(var(--canvas-inset-right,0px) + 15px) !important;
  width:100px !important; height:100px !important; border-radius:0 !important; box-shadow:none !important; }
.qb-powered { margin:0 calc(var(--canvas-inset-right,0px) + 8px) calc(var(--canvas-inset-bottom,0px) + 8px) 0 !important; }
.qb-minimap svg { width:100% !important; height:100% !important; }
.react-flow__edge.selected .react-flow__edge-path:not(.react-flow__edge-interaction) { animation:qb-dash 0.5s linear infinite; }
@keyframes qb-dash { to { stroke-dashoffset:-10; } }
/* tables, areas and notes show the grab hand; a column row and a line show the
   pointing finger (field-row.tsx, xyflow), and the dots the crosshair */
.react-flow__node:hover { cursor:grab; }
/* while a node is dragged the whole of it shows grabbing, even a row that has its own cursor */
.react-flow__node.dragging, .react-flow__node.dragging * { cursor:grabbing; }
/* the table being edited sits above the tables around it, so its card is never covered */
.react-flow__node:has([data-edit-card]) { z-index:1000 !important; }
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
  .qb-minimap { width:60px !important; height:60px !important; }
}`;

export function ChromeStyle() {
    return (
        <style data-testid="canvas-chrome-style" nonce={cspNonce()}>
            {CHROME_CSS}
        </style>
    );
}

const DROP_TARGET_CSS =
    '.react-flow__node-entity:hover > div { box-shadow:0 0 0 3px hsl(var(--primary)); }';

/** While a dependency is dragged the table under the pointer shows it can take it. */
export function DropTargetStyle() {
    return (
        <style data-testid="canvas-drop-style" nonce={cspNonce()}>
            {DROP_TARGET_CSS}
        </style>
    );
}

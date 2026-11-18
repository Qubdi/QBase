/**
 * The classes of a list in the side panel that scrolls by itself (it holds the
 * rows of the Tables, Refs and Custom Types tabs).
 *
 * The browser's scrollbar sits right at the edge of the scrolling box, so the
 * rows ran up against it. The box now reaches 6 px into the panel's own side
 * padding (`-mr-1.5`) and keeps its rows 6 px clear of the bar (`pr-1.5`): the
 * bar moves out by 6 px, and the rows keep the place they had, so they still
 * line up with the filter row above them. It needs a parent with at least 6 px
 * of side padding, which the three tabs have (`px-2`).
 */
export const PANEL_LIST = 'min-h-0 flex-1 overflow-y-auto -mr-1.5 pr-1.5';

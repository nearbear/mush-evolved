// Which renderer draws the isometric room. PixiJS is the default (decided 2026-10-18, #194); the DOM
// renderer is kept in the tree and can be picked by changing this one constant.

export type RendererChoice = "dom" | "pixi";

export const ROOM_RENDERER: RendererChoice = "pixi";

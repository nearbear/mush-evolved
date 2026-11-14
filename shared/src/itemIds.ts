/** The iTrackie everyone starts with, which opens global chat and feature threads. */
export const ITRACKIE_ITEM = "super_talky";

/** Reading this skill book fills the book slot with its `ItemState.teaches` skill. */
export const BOOK_ITEM = "book";

/** The 12 seeded alien fruit item IDs (`Data.ods` `Skins` rows 1–12). */
export const ALIEN_FRUIT_ITEMS = [
  "fruit01",
  "fruit02",
  "fruit03",
  "fruit04",
  "fruit05",
  "fruit06",
  "fruit07",
  "fruit08",
  "fruit09",
  "fruit10",
  "fruit11",
  "fruit12",
] as const;

export type AlienFruitItem = (typeof ALIEN_FRUIT_ITEMS)[number];

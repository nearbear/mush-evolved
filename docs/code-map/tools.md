# Code map: tools

All under `tools/src/`.

- `shipLayout/` (`npm run ship-layout`): build-time converter. `convert.ts` turns `tiles.xml` into `ship-art.json` and writes `ship-rooms.json` from the hand-edited `ship-map.json`; `shipMap.ts` reads and writes the map (`readShip` gives art and map together; `formatShipMap` keeps one tile per line); `png.ts` (a decoder and an RGBA encoder), `xml.ts`, `haxe.ts` are hand-written decoders; `pages.ts` repacks sheets over 4096 px (`BigFill`, `BigFill2`) into `Mush/derived/pages/` so phone GPUs can load them; `check.ts` (`npm run ship-check`) reports overlaps, misaligned doors and gaps in the map; `validate.ts` (`validateMap`) is what a map must pass before the editor saves it (a test runs it on the committed map); `shipPlan.ts` writes `ship-plan.json`. `query.ts` (`npm run layout-query -- <regex>`) prints only the slices, tiles and bindings that match, capped at 60 lines, since reading the JSON directly is denied.
- `play/screenshot.ts`: `npm run screenshot`. `play/shipView.ts`: `npm run ship-view`. `play/shipRender.ts`: `npm run ship-render`, the iso scene drawn offline from the atlases (imports `placeScene` from `web/src/iso/placement.ts`), with wall ends that touch nothing marked. `play/shipTop.ts`: `npm run ship-top`, the same scene from above as plain shapes (floor, walls on cell edges, doors, furniture, room names, a numbered grid). `play/shipScene.ts`: what both share: loading the scene on the ship plan, and walls as cell edges with their free ends. `play/isoProbe.ts`: finding and pointing at things in the iso room through IsoRoom's dev-only probe, and waiting for the art, with either renderer.
- `contactSheet/contactSheet.ts`: `npm run contact-sheet`.
- `assetIndex/assetIndex.ts`: `npm run asset-index`.
- `odsData/`: `npm run ods-data` (`odsData.ts`; `ods.ts` reads the spreadsheets).
- `dev/`: `npm run dev` (`dev.ts`) and per-worktree ports (`ports.ts`).
- `i18n/`: catalog checks (`catalog.ts`) and the hardcoded-text ratchet (`hardcoded.ts`, `baseline.json`).
- `death/hpWrites.test.ts`: fails if any file other than `cheats.ts` and `actions/heal.ts` writes `.hp`.
- `editor/vitePlugin.ts`: the ship map editor's save, a Vite dev-server plugin (`web/vite.config.ts`): `PUT /__editor/map` checks the map, writes `ship-map.json` and `ship-rooms.json`, and keeps its own writes from reloading pages (the editor would lose its undo history).

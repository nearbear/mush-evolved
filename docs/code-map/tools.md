# Code map: tools

All under `tools/src/`.

- `shipLayout/` (`npm run ship-layout`): build-time converter. `convert.ts` drives it; `png.ts` (a decoder and an RGBA encoder), `xml.ts`, `haxe.ts` are hand-written decoders; `pages.ts` repacks sheets over 4096 px (`BigFill`, `BigFill2`) into `Mush/derived/pages/` so phone GPUs can load them; `stretch.ts` applies our room-shape changes; `walkways.ts` paints our added walkways (the milky blue `GROUND` frame 1) over plain floor; `roomPositions.ts` holds each room's fixed place on the ship (`ROOM_POSITIONS`, copied to `RoomLayout.at`) and slides doors along their walls and edges to meet their neighbours' (a door with a walkway to it stays put); `check.ts` (`npm run ship-check`) reports overlaps, doors moved off their walkways, misaligned doors and gaps in that plan, and can seed and fit a new table; `shipPlan.ts` writes `ship-plan.json`. `query.ts` (`npm run layout-query -- <regex>`) prints only the slices, tiles and bindings that match, capped at 60 lines, since reading `ship-layout.json` directly is denied.
- `play/screenshot.ts`: `npm run screenshot`. `play/shipView.ts`: `npm run ship-view`. `play/isoProbe.ts`: finding and pointing at things in the iso room through IsoRoom's dev-only probe, and waiting for the art, with either renderer.
- `contactSheet/contactSheet.ts`: `npm run contact-sheet`.
- `assetIndex/assetIndex.ts`: `npm run asset-index`.
- `odsData/`: `npm run ods-data` (`odsData.ts`; `ods.ts` reads the spreadsheets).
- `dev/`: `npm run dev` (`dev.ts`) and per-worktree ports (`ports.ts`).
- `i18n/`: catalog checks (`catalog.ts`) and the hardcoded-text ratchet (`hardcoded.ts`, `baseline.json`).
- `death/hpWrites.test.ts`: fails if any file other than `cheats.ts` and `actions/heal.ts` writes `.hp`.

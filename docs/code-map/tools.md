# Code map: tools

All under `tools/src/`.

- `shipLayout/` (`npm run ship-layout`): build-time converter. `convert.ts` drives it; `png.ts`, `xml.ts`, `haxe.ts` are hand-written decoders; `stretch.ts` applies our room-shape changes; `shipPlan.ts` writes `ship-plan.json`.
- `play/screenshot.ts`: `npm run screenshot`. `play/shipView.ts`: `npm run ship-view`.
- `contactSheet/contactSheet.ts`: `npm run contact-sheet`.
- `assetIndex/assetIndex.ts`: `npm run asset-index`.
- `odsData/`: `npm run ods-data` (`odsData.ts`; `ods.ts` reads the spreadsheets).
- `dev/`: `npm run dev` (`dev.ts`) and per-worktree ports (`ports.ts`).
- `i18n/`: catalog checks (`catalog.ts`) and the hardcoded-text ratchet (`hardcoded.ts`, `baseline.json`).
- `death/hpWrites.test.ts`: fails if any file other than `cheats.ts` and `actions/heal.ts` writes `.hp`.

# Mush source folder: asset inventory

Reference for AI assistants and contributors. Describes what is in `Mush/` (repo root), what is usable, and what to watch out for. Scanned 2026-09-30. Facts here come from inspecting the files; anything uncertain is marked.

## What the folder is

- A snapshot of the **original Motion Twin Mush** source (Haxe compiled to Flash), **not** the eMush remake. Evidence: Haxe `.hx` sources, `.hxml` build files targeting `swf`, and a Motion-Twin support URL in `src/common/Debug.hx`.
- About 77 MB: ~1,100 PNG, ~440 JPG, ~70 GIF, 50 GraphicsGale `.gal`, 13 LibreOffice `.ods`, a few XML and SWF files.
- All game text is **French**.
- Only shared/client code is present (`src/common`, `src/as`, `clients/iso`). The server-side game logic is not included (`src/common/Logic.hx` is 5 lines).

## Licensing

- **Source:** the `Mush/` folder of [motion-twin/WebGamesArchives](https://github.com/motion-twin/WebGamesArchives). The license lives one level up, at the repo root (`LICENSE.txt`, last changed in commit `1e8ae15`, 2022-08-09), not inside `Mush/`. Copy that file next to any assets we use, because the folder itself has none.
- **License:** Creative Commons **Attribution-NonCommercial-ShareAlike 4.0 International** (CC BY-NC-SA 4.0), covering the whole archive, code and data as well as art.
- What that means here:
  - **Attribution:** credit Motion Twin, link the repo and the license, and say if the material was changed.
  - **NonCommercial:** no ads, paid features, or other monetization of anything that uses this material.
  - **ShareAlike:** anything adapted from it (edited sprites, ported code, translated text or data tables) must be released under CC BY-NC-SA 4.0.
- **Keep project code independent.** If our TypeScript is written from scratch, it can carry its own license (AGPL-3.0-or-later per `CLAUDE.md`; it was MIT up to commit `256d721`). Porting Haxe code or copying data tables or text verbatim would arguably make that part an adaptation under ShareAlike. Reimplement rules in our own words and keep any copied data in the asset tree. This is the reading of a non-lawyer; flag it to the user when it matters.
- **What the license does not cover:**
  - Trademarks. CC licenses grant no trademark rights, so don't present the project as official Mush or use the Mush or Twinoid logos as our branding.
  - Third-party material inside the archive that Motion Twin couldn't relicense (see "Do not use").
  - `src/as/Hash.hx` and `IntHash.hx`, which carry their own Haxe Foundation MIT header.

## Directory map

| Path | Contents | Usefulness |
|---|---|---|
| `clients/iso/gfx/anim/perso/` | Per-character walk cycles, `<name>_face.png` / `<name>_back.png`, plus `crew_male/female`, `mush`, `spacesuit_*` | **High.** Core character sprites |
| `clients/iso/gfx/` | Large isometric sprite atlases (`BigFill*.png`, `MidFill*.png`, `SmallFill.png`, `gfx_01/02.png`, `char*.png`, `fx.png`, `ShipMap.png`) | High for an isometric ship view; needs slicing data |
| `clients/iso/xml/tiles.xml` | Slice definitions for the atlases | Needed to cut atlases into tiles |
| `www/img/art/site/rooms/` | 18 room illustrations (bridge, sick bay, refectory, engineering, hydroponics, corridor, storage, etc.) | **High** for a DOM prototype: one image per room |
| `www/img/art/char/`, `art/large/` | Character portraits/art (JPG, about 210x300), one per crew member, plus Mush art. | High: lobby, profile, role reveal. **Used:** `char/*.jpg` in the inspector and the lobby character picker |
| `www/img/art/{end,eden,destroyed}.jpg` | 785x294 ending banners: the ship reaching Sol, reaching Eden, and destroyed | **Used:** `ENDING_ART` in `web/src/art/assets.ts`, on the end screen (Sol, Eden, all humans dead; the owner's choice, 2026-10-22) |
| `www/img/icons/portraits/` (+ `mini/`) | Small character portrait icons (PNG) | High: player list, chat |
| `www/img/icons/items/` | 152 item icons: 50x50 JPGs drawn on the original blue slot tile. `empty.jpg` is the bare tile (empty slot); `todo`, `body`, `sofa`, `super_calc`, `life_capsule`, `sold_out` are text or blank placeholders. `ration_0`..`ration_9` are different foods, not ration variants (e.g. `ration_7` is a cup of coffee, `ration_1` the cooked ration). `archive/` holds 4 older versions (blaster, camera, body_cat_dead, shackles) | **Used:** all top-level icons via `ITEM_ICONS` / `itemIcon(type)` in `web/src/art/assets.ts`; inventory rows and empty slots |
| `www/img/icons/skills/` | 104 skill icons | Medium (slice may not use skills) |
| `www/img/icons/ui/` (+ `status/`) | 327 UI icons, 37 status icons | Medium |
| `www/img/icons/astro`, `bases`, `grp` | Planet/exploration icons, misc | Low for the slice |
| `www/img/design/` | 327 website chrome images (buttons, arrows, bars, alarm frames, banners) | Low–medium; tied to the old site look |
| `www/img/cards/` | Project/research/skin/vanity cards | Low for the slice |
| `www/img/fx/` | A few hit-effect sprites | Low |
| `data/*.ods` | Game design spreadsheets (see below) | High as **rules reference**, not as assets |
| `data/dataGen.xml` | French text-generation templates (log lines, suspicion flavor text) | Reference only |
| `src/common/Gameplay.hx`, `Protocol.hx` | Gameplay constants and enums/protocol types | Reference only |
| `derived/pages/*.png` | Ours, generated by `npm run ship-layout` (`tools/src/shipLayout/pages.ts`): `BigFill.png` and `BigFill2.png` repacked into images of at most 4096 px a side, since many phone GPUs can't load bigger textures. The originals are mostly empty space, so each packs onto one page; `bay_window` (16 frames, 5344 px wide) is wrapped onto two rows. The layout points at the pages, not the originals | Loaded by `web/src/iso/shipLayout.ts` |
| `derived/asset-index.txt` | Ours, generated by `npm run asset-index`: every file under `Mush/` with its size. Search it by name; project settings ask for approval before reading anything in `www/` or `clients/` (`ls` there included) | Use instead of listing directories |
| `derived/pip-bar/*.svg` | Ours, generated by `npm run pip-bar`: the pixels of `www/img/design/pabar.png` (11x79, vertical) transposed to run sideways, as SVG `<rect>`s in the sprite's exact colors (start cap, the sprite's 12 slots, which fade from bright to dark, thin variants, end cap). Crisp at any scale, not tintable | Used by `web/src/hud/PipBar.tsx` |
| `derived/techno-box.png` | Ours, made by hand by the project owner: `www/img/design/xp_counter.png` closed into a full box (right cap mirrored, no fade), 128x35. Rows 14-20 are identical and the centre is one colour, so it 9-slices at 14/21 px with `repeat` at 1x | Used by `web/src/hud/TechnoBox.tsx` (`styles/techno-box.css`) |
| `derived/items/*.{jpg,png}` | Ours, made by hand by the project owner: item icons built on the original's art (the blue slot tile). Named after the item type; a name shared with an original icon replaces it. Each file is listed in `ATTRIBUTION.md` | Merged into `ITEM_ICONS` in `web/src/art/assets.ts` |

**iTrackie art (2026-10-13):** the user chose `www/img/icons/items/super_talky.jpg` (a green tablet) as the iTrackie item icon; the item type is `super_talky`. Not to be confused with `talky_walky.jpg` (a walkie-talkie) or `tracker.jpg` (a separate item; the original client shows the minimap while you carry `TRACKER` or `SUPER_TALKY`, `clients/iso/src/Main.hx:291`). `www/img/icons/ui/slot_itrakie.png` is unused iTrackie UI art.

## Character sprites

- Isometric pixel art. Walk strips are **192 x 48 px = 6 frames of 32 x 48** (`derek_*` is 192 x 64; `spacesuit_*` is 200 x 40). One strip faces toward the camera (`_face`), one away (`_back`). Other directions are presumably mirrored (`char_flipped.png` exists).
- `www/img/art/large/pixel_characters_gfx.png` is a full cast sheet. It includes the Mush logo and a `mush.twinoid.com` URL, so crop rather than use as-is.
- **Delivery format answers the open question in `CLAUDE.md`:** characters are frame-by-frame pixel sprite strips. There is no layered or skeletal rig and no talking or emote animation. A 2D sprite renderer (DOM/canvas) fits this art directly. Talking animations would require new art, not just code.
- Source files are GraphicsGale `.gal` (header `Gale106`). Use the PNG exports instead. Known gaps: `Jinsu_back.gal` / `Jinsu_face.gal` have PNGs named `jinsu_back.png` / `jinsu_faec.png` (case mismatch and typo), and `mush_face_alt.gal` has no PNG.
- `propulsor.ase` is an Aseprite file (4 frames, 23 x 22) with PNG exports alongside.

## Ship map and sprite atlases (`ShipMap.png`, `tiles.xml`)

The rooms were converted from `ShipMap.png` into what is now `Mush/derived/ship-map.json` (frozen 2026-10-21 and edited by hand since); `tiles.xml` is still converted to `ship-art.json` by `npm run ship-layout` (`tools/src/shipLayout/convert.ts`, which cites the Haxe functions it reproduces). Facts established while writing the converter:

- `ShipMap.png` has one 32-px row per room, in `RoomId` order (the `rooms` sheet of `Data.ods`). All patrol ships share one row. Starting at x=64, each row holds four 32x32 layers: base (floor/walls/doors), props, non-pathable entities, and extra entities (chairs, cameras). One pixel = one isometric grid cell; white = empty.
- Pixel colors are lookup keys into `<frame color>` entries in `tiles.xml`, not meanings. Three colors in the map are undefined and were ignored by the original client.
- `<slice params>` is `x,y,width,height,framesX,framesY` (the XML comment saying `top,left` is wrong).
- Door targets live in `tiles.xml` `<extras><room><makeDoor tgt>`, assigned to door pixels in scan order. Door counts match in every room and the resulting graph is symmetric, but which physical door gets which target is not yet visually verified.
- Flash sheet classes map to images: `BmpGfx2` = `gfx_01.png` (not `gfx_02.png`), `BmpGfxFx` = `fx.png`, `BmpGfxChar` = `char.png`, `BmpSmallFill`/`BmpMidFill`/`BmpMidFill2`/`BmpBigFill`/`BmpBigFill2`/`BmpMasks` = the same-named PNGs, `BmpGfxDev` = `dev.png`. Inferred from sizes and by eye; the original binding file is missing.
- `char.png` (the cast sheet, `Mush/derived/webp/char.webp`): rows 0-15 are the 16 crew (`CAST_ROW` in `web/src/art/assets.ts`; Terrence is row 15). Rows 16 and 17 are two uncast characters with full standing, sitting and walk frames and a tied-up frame but no lying pose: row 16 a woman with long orange hair in a short maroon dress (the intruder hostile NPC's art, `HOSTILE_ROW`), row 17 a brown-haired man in a maroon vest. Row 18 holds four small cat frames. Seen by eye, 2026-11-23.

## Game data spreadsheets

`.ods` files are zip archives. Read with `unzip -p file.ods content.xml`, or convert with LibreOffice (`soffice --headless --convert-to csv`) if installed. Sheets:

- `Data.ods`: `heros`, `heros_status`, `titles`, `skills`, `room_status`, `rooms`, `roomType`, `research`, `projets`, `ships`, `Skins`, `mush_genome`, ...
- `DataAction.ods`: `actions`. Columns include `id`, `cost` (action points), `name`, `proba`, `desc`, `need_target`, `stealth`, `discrete`, `aggro`, plus requirement expressions such as `Not(InHand)+BaseAction`.
- `DataEvents.ods`: `events`, `decay_events`, `atk_evt`, `surgery_event`, ...
- `Data.ods` `Skins` (2026-11-14): one row per fruit species, in icon order. Row 0 is `BANANA` (`fruit00.jpg` is byte-identical to `fruit_banana.jpg`), rows 1–12 the 12 alien species (`fruit01`–`fruit12`, Lianube/Lianiste to Filandru/Asperginulk; `fruit_tree<NN>` is the plant), row 13 `CUCURBITATROUILLE` (Citrouïd, the Halloween event fruit). Columns: tree and fruit name, description, gender (French). `genFruitList`/`genTreeList` in `src/common/Gameplay.hx` index fruit effects and grow times by this order.
- `DataExt.ods`: `objects`, `blueprints`, `deaths`, `wounds`, `disease`, ...
- `DataExt2.ods`: `neronAdmin`, `objectives`, `quips`, `books`
- `DataConsumable.ods`, `DataExplore*.ods`, `DataEco.ods`, `DataTuto.ods`, `DataTease.ods`, `Ebe-Neron.ods`: consumables, exploration, progression/economy, tutorial, quiz, NERON events.

Per `CLAUDE.md`, do not invent rules. These sheets are a legitimate source for real Mush values (action costs, starting O2/fuel/rations in `Gameplay.hx`), but the vertical slice is a deliberate subset. Propose which values to adopt and confirm with the user.

## Do not use

- **Pruned 2026-09-30:** third-party logos that the CC license can't cover were deleted from the local copy: 20 press and gaming-site logos in `www/img/social/` (Rock Paper Shotgun, Jeuxvideo.com, etc.) and the `design/facebook.png` / `design/twitter.png` icons. They remain in the upstream repo if ever needed for reference.
- **Pruned 2026-10-13:** the European Indie Game Days award logos (`www/img/loc/{en,es,fr}/eigd.png`, `www/img/art/eigd_award_en.png`), a third-party mark.
- `www/img/social/`: the whole folder is gone from the local copy (none of it is present).
- `www/img/jquery/`: jQuery UI theme images. MIT-licensed, so legally usable, but irrelevant to a React client.
- `www/img/teasing/`, `www/img/news/`, `www/img/loc/`: marketing/teaser material and localized text images.
- Anything with Twinoid or Motion Twin branding or logos.
- `.swf` files (`loading.swf`, `obj/*Resources.swf`): compiled Flash bundles. The source PNGs exist separately.
- Haxe code: Flash-era and not reusable in the TypeScript stack. Read it for reference only.

No fonts, sounds, or music were found in this folder.

**Tab icons (2026-10-13):** 14 files from `www/img/icons/ui/` are exported as `TAB_ICONS` (`web/src/art/assets.ts`); mapping and status in `docs/assets/tab-icons.md`. `neron.png` here is the small icon (not `design/neron.png`); the user's "favorite.png" is `fav.png`.

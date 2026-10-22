---
name: asset
description: Bring Motion Twin art from Mush/ into the game (sprites, icons, room art, site chrome, backgrounds). Use whenever a change would reference a new file under Mush/, or when asked which assets exist or where one should go. Covers license checks, viewing images without image tools, wiring them through Vite, handling sprites without transparency, attribution, and when to skip an image instead of guessing.
---

# Use an asset from `Mush/`

Everything in `Mush/` is CC BY-NC-SA 4.0 (see `Mush/LICENSE.txt` and `docs/mush-assets.md`). Read `docs/mush-assets.md` first: it maps the folders and lists what not to use.

## 1. Check you're allowed to use it

- **Not on the "Do not use" list** in `docs/mush-assets.md`: Mush or Twinoid logos (trademark, never our branding), third-party logos, `www/img/teasing`, `news`, `loc`, `.swf` files.
- **No different third-party terms** in that folder (fonts, sounds, music especially). If a folder looks like it came from somewhere else, ask the user.
- **No AI-generated art.** Never create, edit, upscale, or recolor image files with AI tools without the user's explicit approval (CLAUDE.md). Recoloring in CSS (`filter`) is code, not a new asset; mention it anyway.
- **Never monetize.** Nothing using these files can carry ads or paid features.

## 2. Look at it before deciding where it goes

The archive has no CSS or templates for the site chrome, so placement has to be inferred. WSL has no ImageMagick or PIL. Use:

```bash
npm run contact-sheet -- Mush/www/img/design                       # everything, fit to cells
npm run contact-sheet -- Mush/www/img/design --match "^but" --zoom 4 --bg "#0d1424"
```

Sheets land in `.screenshots/contact/`. **Look at them** through the `visual-check` subagent (tell it what you're hunting for), reading one yourself only when you need to see it directly. Get sizes with `file <path>`. Clues to placement: file names (`*over` = hover, `*_on` = pressed/active, `*left/*bg/*right` = 3-slice, `*top/*bg/*bottom` = vertical 3-slice), sizes that match an original layout width (424 px was the Flash centre column, 1000 px the site), and how pieces fit together.

**If you can't tell where an image belongs, don't use it.** Tell the user which images you skipped and why. Inventing a home for art is the asset version of inventing a rule.

## 3. Wire it in

- **From TypeScript:** add it to the `import.meta.glob` in `web/src/art/assets.ts` (eager, `?url`), and export a named constant or lookup. Vite bundles only matched files, so globs must stay narrow.
- **From CSS:** `url("../../../Mush/...")` relative to a file in `web/src/styles/`works (Vite allows the workspace root). Good for chrome: buttons, tabs, backgrounds. Use multiple background layers for 3-slice art and `image-rendering: pixelated` when scaling pixel art.
- **Never copy files out of `Mush/`** into `web/` or `public/`. The art stays in its licensed folder (CLAUDE.md).
- **Sprites with no alpha:** character strips use a solid background colour. `web/src/art/keyedSprite.ts` keys out the top-left pixel at load time; reuse it rather than shipping edited copies.
- **Data from the art** (slices, layouts) is generated at build time by `tools/` into `Mush/derived/` (see `npm run ship-layout`), so derived data stays in the CC tree too. The ship's rooms are in the hand-edited `ship-map.json`. Reading `ship-art.json` and `ship-map.json` directly is denied; search them with `npm run layout-query -- <regex>` (slice names, equipment ids, room ids; a room id alone lists its entities and bindings).
- Rendering stays separate from rules: assets are looked up by ids from the `PlayerView`, never the other way round.

## 4. Check it

- `npm run typecheck && npm run build` (the build fails on a bad import path).
- If the user asks for a visual check, run the `play` skill and look at the screenshots, including hover/pressed states if you skinned controls. The lobby isn't in the screenshot script; check it separately if you touched it.

## 5. Record it

- Attribution: the in-game credits footer (`Credits` in `web/src/GameScreen.tsx`) and `Mush/ATTRIBUTION.md` must still cover what's used; add a line if you changed the art (e.g. "sprite backgrounds made transparent").
- `docs/mush-assets.md`: update if you learned something about a folder (format quirks, what a file actually is).
- `docs/ai-workflow.md`: a dated entry listing what was placed, what was skipped and why. Only ever append with cat >> as a cost optimization; do not rewrite existing entries.

## Tooling commands

- `npm run contact-sheet -- <folder> [--match regex] [--zoom n]`: render labeled contact sheets of an image folder to `.screenshots/contact/` (Playwright; WSL has no image tools). See the `asset` skill.
- `npm run asset-index`: regenerate `Mush/derived/asset-index.txt` (every file under `Mush/` with its size) after adding or removing files there. Search it to find assets by name; reading `Mush/www` and `Mush/clients` asks the user for approval each time.
- `npm run ods-data`: convert every sheet of `Mush/data/*.ods` (the original design tables: actions, items, diseases, explore, ...) to JSON under `Mush/derived/data/<file>/<sheet>.json`, so they can be grepped. Rerun after changing `Mush/data/`.

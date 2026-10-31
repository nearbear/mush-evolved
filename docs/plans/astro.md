# Astro terminal: planet discovery (plan)

Status: **built 2026-10-19** (see the Planets bullet in `docs/rules/implemented-rules.md`). The decisions below come from the owner (2026-10-19). The implementation follows the plan below, with two differences: the tag table and syllables are copied into `shared/src/planets.ts` rather than imported, and the planets live in `GameState.planets` (not `PlayerState`), because `viewFor` copies `PlayerState` into your own view whole and would send the hidden tags.

## What the original gives us

The snapshot has no server code, so we have the data and the generator but not the action logic.

- **Generator:** `Gameplay.getPlanet(ship, id)` (`Mush/src/common/Gameplay.hx:98`), seeded by the planet id:
  - size (sector count) = `2 + rand(6) * 2`, so 2 to 12. The hard and very hard sizes don't apply here.
  - Each sector draws a tag by weight `we` from the pool. A tag with `max` uses runs out and leaves the pool. Tags with a `cond` are skipped when it fails (none of the live tags has one).
  - The sector list is shuffled. Each sector starts `TS_Unknown` (the other states are `TS_Known` and `TS_Explored`).
  - Name: syllable table 0, then table 1 with a 1/10 chance and again with 1/40, then table 2. A table-3 word follows with a 1/3 chance, or else comes first with a 1/30 chance. The original picks syllables with the unseeded `Std.random`; we use the game's seeded RNG for all of it. `mt.Rand` isn't in the snapshot, so we can't match the original's numbers exactly, only its distribution.
- **Data:** `Mush/derived/data/DataExplore/planetTags.json` has the 25 tags with `we` (weight), `seek` (how easy the tag is to spot, used for analysis below), `explo`, `max`, and 4 exploration events each (unused for now). The syllables are in `planet_syl.json`. LANDING and LOST have weight 0, so they never generate.
- **Actions** (`DataAction/actions.json`): `SCAN_FOR_PLANETS` costs 3 AP at 50%, `fail_coef 1,25`. `REMOTE_PLANET_ANALYSIS` costs 2 AP. `DEEP_PLANET_ANALYSIS` costs 1 AP and is for the planet the ship orbits, so it's out of scope without travel. `DISMISS_SCAN` has no definition row.
- **Modifiers in the original** (not planned yet): the Astrophysicist skill and the CHIPSET_ACCELERATION project each give −1 AP on scanning. The PLANET_SCANNER item gives +30% scan odds.
- **Art:** `www/img/icons/astro/` holds `planet_0..4` (large and `_small`), `empty_planet.png`, and the 25 `tag_*.png` icons. `www/img/design/astro_bg.png` is the window background.

## Decisions (owner, 2026-10-19)

1. **Scan:** at the Astro terminal (`ASTRO_MODULE`), 3 AP, 50% success. Each failed scan multiplies that player's next chance by 1.25 (50 → 62.5 → 78 → 98%). The bonus is tracked per player.
2. **Planets are private to the player who found them.** No one else ever sees them, so players can scan in parallel. A Mush player could describe a hazardous planet as safe, and no one can check.
3. **Cap: 2 planets per player.** Scanning is illegal when you hold 2.
4. **Delete:** a player can delete one of their own planets at any time, from a trash-bin icon button. It's free.
5. **Analysis:** 2 AP at the terminal, on one of your own planets. It reveals one unknown sector, picked weighted by that tag's `seek` value. A new planet shows its name and sector count, with every sector unknown.
6. **Log:** scanning and analysing are public actions, and no log line ever shows sectors.
   - A scan logs "X scanned for planets" whether it worked or not. Only the scanner learns the result, privately with the planet's name.
   - An analysis logs `X analysed planet <name>`. Sector contents appear only in the finder's own view.
7. **Who:** any living player who is not dirty, Mush included (the same rule as research).
8. **Reset:** a successful scan resets the chance to 50%.
9. **Delete is silent:** no log line.
10. **No modifiers yet:** add the cost/odds hook only. The Astrophysicist skill, the CHIPSET_ACCELERATION project and the PLANET_SCANNER item come later.

## Planned implementation

- `shared/src/planets.ts`: `generatePlanet(rng)` returning `{ id, name, size, sectors: { tag, known }[] }`, the tag table (`we`, `seek`, `max`), and `pickSeekSector(rng, planet)`. Tag data is imported from `@mush2/assets/derived/...`, or copied into a small typed table if the import is awkward.
- State: `PlayerState.planets: Planet[]` and `PlayerState.scanFailures: number` (plain JSON). Bump `STATE_VERSION`.
- Actions, one file each: `actions/scan.ts` (`getSuccessChance` = `config.astro.scanChance * 1.25^failures`, capped at 1; `fail` increments failures; success resets them and adds a planet), `actions/analyze_planet.ts`, `actions/delete_planet.ts`. Costs and odds go in `config.astro`. Scan cost goes through a modifier hook so Astrophysicist and the project can lower it later.
- `viewFor`: `PlayerView.planets` holds the viewer's own planets only. Unknown sectors are sent as unknown with no tag, so the client never gets them. Other players' planets never appear in `OtherPlayerView`.
- Tests: the generator is deterministic for a seed and respects size and `max`; odds compound and reset; cap; delete; analysis reveals exactly one sector by seek; illegal actions leave state unchanged; a `viewFor` leak test (another player's planets and your own unknown tags never appear).
- Client: the Astro terminal window lists your planets (name, size, tag icons or `tag_unknown`, a trash button) plus scan and analyse buttons from `view.actions`. Delete is terminal-only (owner, 2026-10-25), so the trash button lives in that window only.
- i18n: tag names and descriptions in en/fr/es (French from the sheet). Planet names stay as generated (French syllables, proper nouns).

## Positions and sizes (owner, 2026-10-22)

Planets now have a direction and a distance (2 to 9 fuel) unique on the ship, and grow with the day, following eMush's `PlanetService`. See the Planets bullet in `docs/rules/implemented-rules.md`.

## Open questions

None for discovery. Travel and orbit are decided and built (2026-10-22, `docs/rules/rules-design.md` "Ship travel", `shared/src/navigation.ts`). Deep analysis in orbit (`DEEP_PLANET_ANALYSIS`, the wiki's +1 sector at 1 AP) and exploration (the per-tag events in `planetTags.json`) need their own decisions.

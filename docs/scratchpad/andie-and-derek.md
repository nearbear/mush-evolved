# Andie and Derek in the original Mush code

Notes from a search of `Mush/` (2026-10-21). Paths are relative to `Mush/`.

Andie Graham and Derek Hogan are in the original Motion Twin code and data. They are an alternate pair who swap in for two of the regular crew.

## How they're used

- `src/common/data/Level.hx:106-120`: `getCast()` builds the roster. If the season has the `SF_ANDREK` flag, Finola Keegan and Wang Chao are removed. Otherwise Derek and Andie are removed. Either way a ship has 16 characters, never all 18.
- `derived/data/DataEco/conf.json`: a ship option, `USE_ANDREK` ("Andie&Derek"). Description: "Ce vaisseau démarre avec Andie et Derek au lieu de Finola et Chao." ("This ship starts with Andie and Derek instead of Finola and Chao.")
- `derived/data/DataEco/casting.json`: a casting upgrade, `MUSHRUVERY` ("Troupe de province"), "Débloque Andie et Derek !" ("Unlocks Andie and Derek!"). Its `opt` is `USE_ANDREK`.
- `Level.hx:88`: a commented-out line that left both out of the initial crew.
- `clients/iso/src/Main.hx:1395`: `DEREK_HOGAN` is a commented-out choice for the debug hero.

## Character data (`derived/data/Data/heros.json`)

- **Derek Hogan**: a sergeant, focused on security and protection.
  - Skills: `GUNMAN, WRESTLER, FIREMAN, MOTIVATOR, STRONG_SKIN`.
  - Starts with the status `FIRST_TIME`.
  - Triumph: `LOVER`, +2 for each mutual love with Derek (`DataEvents/glory_event.json`).
- **Andie Graham**: an all-rounder.
  - Skills: `PILOT, DEVOTED, SKILFUL, CONFIDENT, EXPERT`.
  - Starts with the status `INDETERMINATED`, because the player chooses Andie's gender ("Homme ou femme, à vous de choisir", "man or woman, it's your choice").
  - Triumph: `ANDIE_FATE`, +4 for each successful trade with alien merchants.
- After the `$EOF` marker the file has older draft rows (`HERO_17` Derek Hogan, `HERO_18` "Andrew Graham") with different skill lists.

## Elsewhere in the data

- `derived/data/DataDesc/char_desc.json`: their backstories. Derek is a former FDS drill sergeant who caused Wang Chao's death while failing to capture Finola, and took Chao's place aboard. Andie is an elite FDS pilot and Derek's former student.
- `derived/data/Data/projets.json`: several projects check for `DEREK_HOGAN` or `ANDIE_GRAHAM` alongside other heroes.
- `derived/data/Data/titles.json`: both appear in the priority lists for the titles' lines of succession.
- `derived/data/Data/skills.json`: one skill's footnote mentions losing morale when sharing a room with Derek at the end of the cycle.
- `derived/data/DataEco/songs.json`: each is the "fan" of a song.

## Art

- `clients/iso/gfx/anim/perso/derek_face.png`, `derek_back.png` (plus `.gal` files): Derek's iso sprites.
- `www/img/art/large/` and `www/img/art/char/`: `andie_graham.jpg` and `derek_hogan.jpg` portraits.
- `www/img/icons/ui/andie.png`, `derek.png`: icons.
- No `andie_*` iso sprite sheet was found in `clients/iso/gfx/anim/perso/`. `clients/iso/src/Data.hx:262-264` registers both characters with `regChar`, so Andie may reuse another character's sprite. Not checked which.

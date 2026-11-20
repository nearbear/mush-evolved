# Character Innate Traits: Original Mush & eMush vs. mush2

Audit of all character innate traits from original Mush (`Mush/data/Data.ods` `heros` / `heros_status`, `Mush/data/DataExt.ods`) and upstream eMush (`reference/emush`), compared against `mush2` (`shared/src/config.ts` `characterModifiers`, `shared/src/statuses.ts` `TRAIT_STATUS_IDS`).

## Missing (Not Implemented)

### 1. Finola Keegan — Germaphobe (`GERMAPHOBIC` / `GERMAPHOBE`)
- **Original Mush / eMush:** Loses 1 morale at each cycle change while `dirty`; cannot pet Schrödinger (or play with the fake dog in eMush).
- **mush2:** Not implemented (`finola` has no entry in `characterModifiers`).

### 2. Eleesha Williams — Chronic Vertigo (`VERTIGO` / `CHRONIC_VERTIGO`)
- **Original Mush / eMush:** Starts with the `chronic_vertigo` disorder (`initDiseases` in eMush; `AddDisease( VERTIGO)` in original Mush's `Data.ods`), giving the `VERTIGO` symptom (which grounds her from flying patrol ships in `DataExt.ods`).
- **mush2:** Not implemented (`chronic_vertigo` is not in `shared/src/diseases.ts`; only `vertigo.png` is listed in `docs/assets/icon-catalog.md`).

### 3. Raluca Tomescu — Cat Owner (`CAT_OWNER`, eMush)
- **eMush:** Raluca starts with `cat_owner_default` — Schrödinger moves toward her, cannot hurt her, has a 100% cure chance for her, and she loses 4 morale if Schrödinger dies. (Original Mush `Data.ods` notes Raluca's relation to the cat in `notes` rather than as an `AddStatus`.)
- **mush2:** Missing (`body_cat` in `shared/src/items.ts` is currently a static item with no NPC AI or owner mechanics).

### 4. Season 2 Characters (Not in `mush2`'s 16-character roster)
Neither character is in `shared/src/characters.ts`:
- **Derek Hogan — First Time (`FIRST_TIME`):** First *Do The Thing* / *Relax* restores morale to max.
- **Andie Graham — Indeterminate (`INDETERMINATED`):** Bypasses same-gender restrictions on *Flirt* and *Do The Thing*.

---

## Partially Implemented (or Intentionally Divergent)

### 1. Terrence Archer — Disabled / Wheelchair (`DISABLED` vs `wheelchair`)
- **Original Mush / eMush:** `DISABLED` reduces AP→MP conversions by 2 MP (`DecrPMPerTransfert(2)`, giving 1 MP instead of 3 MP per AP), lets him move for free when leaving a room containing another crewmember, and swaps `Sprinter` for `Disabled Sprinter` (`DISABLED_SPRINTER`).
- **mush2:** Implemented differently as `wheelchair` (`shared/src/modifiers/wheelchair.ts`, `shared/src/actions/accommodate.ts`): crewmates in his room can offer to push him, moving him at no cost when his pusher moves. The AP→MP conversion penalty, free solo movement with a crewmate, and `Disabled Sprinter` are not implemented.

### 2. Zhong Chun — Immunity (`IMMUNE` / `IMMUNIZED`)
- **mush2:** `shared/src/modifiers/immunity.ts` and `shared/src/statuses.ts` block `contaminate` (spiking / DTT never infect her) and display the public `immunity` status. eMush-only actions that check `IMMUNIZED` (such as `RemoveSpore` or `PrintZeList`) do not exist in `mush2` yet.
- **Note:** `mush2` also moved **Mankind's Only Hope** (`shared/src/modifiers/mankind_only_hope.ts`) from a skill into Chun's second innate trait (`-1` daily crew morale loss while she is alive).

---

## Fully Implemented

- **Wang Chao — Hyperactive (`hyperactive`)** (`shared/src/modifiers/hyperactive.ts`, `shared/src/modifiers/lying_down.ts`): +1 MP per cycle, and the bed's +1 AP per cycle does not apply to him.
- **Ian Soulton — Pacifist (`pacifist`)** (`shared/src/modifiers/pacifist.ts`): +2 AP surcharge on all `aggressive`-tagged actions in his room (his own included).
- **Raluca Tomescu — Antisocial (`antisocial`)** (`shared/src/modifiers/antisocial.ts`, `shared/src/actions/bond.ts`): -1 morale at each cycle change if another living player is in her room, and cannot initiate `bond` (others can still `bond` with her). *(Intentionally diverges from eMush in that Mush Raluca still loses morale in `mush2`, and `Flirt` is not in `mush2`.)*

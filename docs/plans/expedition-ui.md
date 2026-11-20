# Expedition UI: the sector timeline, the compact report and shared sectors (plan)

2026-11-19. Slices 1 (the view data), 2 (the timeline) and 3 (the compact report) built; slice 4 not built. No open questions. The concept and the decisions below are the owner's (2026-11-19); the layout details and
build order are Claude's proposal. Builds on `docs/plans/expedition.md` (the rules, all built),
`docs/plans/expedition-boarding.md` (boarding, the next sector) and `docs/plans/astro.md` (planets, sharing).

## Goals

- While away, members see the sectors explored so far, the current sector, and each other's HP.
- U-turn and Traitor holders see the next sector; everyone else sees it as a mystery.
- The sector icons (`Mush/www/img/icons/astro/tag_*.png`, through `planetTagIcon` in `web/src/art/assets.ts`) carry the
  screen.
- What an Astrophysicist shared about the planet is shown as sector icons too, kept **separate** from what was explored.
- The report is a compact summary to read afterwards, not the screen to watch during the expedition.

## What exists

- Each `ExpeditionEvent` names its sector (`LANDING` and `U_TURN` included), so the members' report already holds the
  explored history in order.
- `PlayerView.expedition.next` is the next sector's tag, sent only to a U-turn or Traitor holder still with the crew
  (`nextSectorFor`). No UI shows it yet.
- `IcarusPanel.tsx` draws podiums and a TechnoBox bar (planet, countdown, Read report); `LostPanel.tsx` is the lost
  member's screen; `ExpeditionReportDialog.tsx` is the report.
- Shared planets are free text, never parsed (`SharePlanetForm.tsx`, `sharedPlanets.ts`), so there are no sectors to
  draw as icons.
- `OtherPlayerView` has no HP.

## Decisions (owner, 2026-11-19)

1. **Crewmates' HP:** exact HP, to members still with the crew, while away (a lost member sees only themselves; see "Answered"),
   as of the latest step, not live (owner, 2026-11-19, after the leak check): live HP would show losses between steps
   that only humans take (hunger, a disease at a cycle change). Still visible, and disliked but accepted for now: a
   hidden disease's extra damage on an expedition hit.
2. **Shared sectors are structured and editable:** the Share form gets one slot per sector, each starting as the
   sharer's knowledge (the tag, or unknown) and changeable to any tag or unknown, so lying stays possible. The **number
   of slots is fixed** to the planet's true size.
3. **A shared planet links to the planet it came from.** Its name comes from that planet and isn't editable (there's no
   reason to lie about it). The expedition screen finds the entry for the planet being explored through this link.
4. **No ticking off:** the shared strip stays separate from the explored sectors; the client doesn't compare them.

**Leaks accepted (owner, 2026-11-19):** a shared planet reveals its true name and its true sector count. Both are easy
to check anyway: the sector count from an expedition's public timer, and whether there is an Oxygen sector from the
spacesuit rule at boarding (`expedition-boarding.md`). **Disclaimer:** the Share form says so, so that a Mush
Astrophysicist doesn't post an obvious lie: the name and the number of sectors can't be changed, and the crew can tell
whether the planet has an Oxygen sector when boarding the Icarus.

## The expedition screen (while away)

Sits above the podiums in `IcarusPanel` (owner, 2026-11-19: the podiums stay, one row that scrolls sideways, while the
current column scrolls up and down; the bar says only "Exploring <planet>") while the Icarus (or a patrol ship's solo landing) is away. Docked, the panel
stays as it is.

```text
 ◀ │ ░ previous ░ │      CURRENT SECTOR       │ ░ next ░ │ ▶
   │  [Forest]    │      [ Ruins, 3× ]        │   [ ? ]  │
   │  Harvest 2   │  Fight: Alien zombies 15  │ in 6:12  │
   │              │  crew 13 · won · artifact │          │
   │              │  Kuan Ti −3  Chun −2      │          │
 ──────────────────────────────────────────────────────────
  Podiums:  Kuan Ti 9 HP   Chun 6 HP   ...
  ▸ Shared by the Astrophysicist: [ox][?][forest][?][ruins][?]
```

- **A timeline of columns**, oldest left: Landing, each step in order, then the steps still to come, then a Return
  column.
- **Current column** (centered, full size): the latest resolved step. The sector's large icon and name, a one-line
  headline, then what the step did: oxygen or fuel gained, the creature against the crew's strength and the outcome,
  items found (`ItemIcon`), each member's HP lost, deaths, who got lost or was found.
- **Neighbours:** the previous and next columns show clipped at each side. Large arrow buttons on both sides move one
  column in chronological order; Left and Right keys do the same.
- **The next step:** `tag_unknown` with the countdown to it. A U-turn or Traitor holder sees the real tag from
  `expedition.next`, with a `VisibilityBadge` saying only they see it. After it come plain unknown columns for the steps
  left, then Return.
- **Special steps** get a badge on their column: Again (the sector can come up again), Lost (a lost member's timeline
  stops at their `lostAt`), U-turn and Back (the timeline ends there).
- **New steps don't move the view:** when one resolves while you look back, the right arrow gets a "new" marker; a
  polite live region announces the new sector. On first open, the view starts at the latest step.
- **HP on the podiums:** each member's exact HP under their name (decision 1); never a max HP, which the server does
  not send (owner, 2026-11-19).
- **Shared strip:** collapsible, under the timeline: the shared planet's slots as icons, with who shared it and when.
  Shown only when the planet has an entry and you can read the Astrophysics feature (the view already gates
  `sharedPlanets`).
- **`LostPanel`** shows the same timeline up to the line where the member got lost.
- **Mobile (below 1024px):** the current column fills the width with about 24px of each neighbour showing; the arrows
  overlay the edges. A sideways swipe moves one column, with plain pointer events (no new dependency; owner, 2026-11-19). The arrows
  are the plain rectangular button turned upright (an experiment, owner 2026-11-19).

### Art

- The tag icons are 40×40 pixel art: scale by whole numbers (2× in the neighbours and the strips, 3× in the current
  column) with `image-rendering: pixelated`.
- `tag_unknown.png` is 36×36 with no alpha channel: it needs the `asset` skill's handling for sprites without
  transparency before it sits on a styled background.
- `planet_0..4.png` (268×191) may serve as a faint backdrop behind the current column (the orbited planet's
  `orbitPicture`).

## The report (afterwards)

`ExpeditionReportDialog` becomes a vertical list of compact rows, one per step: the icon, the sector's name, the outcome
in one line, and HP lost per member. Opened from the return line and the Expeditions feature, as now. The text it
produces for sharing is unchanged.

## Sharing planets with sectors

- **State:** `SharedPlanet` gains the planet it came from (by id) and `sectors: (PlanetTag | null)[]`, one per sector of
  that planet. Defaults for older entries in `normalizeState.ts` (the databases are empty, so a version bump is fine).
- **Server:** the share action takes the slots; it checks the count equals the planet's size and each tag is a real tag
  (or null). The name comes from the planet. The free text keeps its limits and moderation.
- **Share form:** the name shown read-only, the row of sector slots (each a picker of the tag icons plus unknown), the
  disclaimer, and the free text. The text's prefilled sectors line goes away, since the slots carry the sectors.
- **Astrophysics feature** (`SharedPlanets.tsx`) **and the Features tab:** each entry shows the name, the icon strip, and
  the text.
- **Expedition screen:** the shared strip above, found through the link to the planet being explored.

## Data the view needs

- `view.expedition.steps`: how many steps are left, and `view.expedition.nextAt`: when the next resolves. Public: the
  timer already reveals both (accepted in `expedition.md`, phase 2).
- `view.expedition.hp`: each member's exact HP by character, only to members still with the crew while away. Leak tests:
  never to someone aboard the ship, never after the return.
- `SharedPlanet.planet` and `sectors`, to whoever reads the Astrophysics feature, as for the text now.

Run the `leak-check` skill on slices 1 and 4.

## Build order

1. **View data:** `steps`, `nextAt`, members' HP, with tests and leak tests.
2. **The timeline:** the component in `IcarusPanel` and `LostPanel`, desktop and mobile, a design-kit sample
   (`web/src/designKit/`), en/fr/es strings (`i18n` skill).
3. **The compact report:** `ExpeditionReportDialog` as rows.
4. **Structured shares:** a rule pass (`rule` skill) for the share action, then the form and its disclaimer, the
   Astrophysics entry, the Features tab, and the shared strip on the expedition screen.

One commit per slice.

## Answered (owner, 2026-11-19)

1. **Lost members and HP:** no, both ways. A lost member's screen shows them alone; the crew no longer sees their HP.
2. **The free text's sectors line:** dropped from the prefilled text; the slots carry the sectors.
3. **After the return:** the timeline goes away; only the compact report remains.

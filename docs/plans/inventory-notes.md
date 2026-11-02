# Crew inventory notes (plan)

Status: **draft 2026-11-01, not decided, not built.** A first sketch to refine. Nothing here is a settled rule; every open question needs the owner's answer before building.

## Idea

A tab where the whole crew keeps shared, manual notes about the ship's items: what is where, in what state. Inspired by AstroPad, a third-party userscript for the original game (ideas only: it has no license, so none of its code, text or data is used here).

Decided by the owner (2026-11-01):

- **Manual notes.** Players type in what they have seen. Nothing is filled in automatically.
- **Whole crew.** One shared pad per ship, readable and editable by every living seat.
- **Item states:** every item state that exists in the slice today (list below).

## What AstroPad does that is worth borrowing

- A tab beside chat, which fits the tabbed phone layout.
- Notes grouped by room, in a fixed room order.
- Add and edit through a categorized item picker, then a small properties dialog.
- A plain-text export of chosen rooms, to paste into chat.
- A customizable share message with placeholders.
- Links in chat messages that open the pad.

## Item states that exist today

From `ItemState` in `shared/src/types.ts` and `ItemView` in `shared/src/types/view.ts`. Re-check the list when building, since the slice keeps growing.

| State | Applies to | Who can see it in a view today |
|---|---|---|
| Type (the item itself) | all | anyone who can see the item |
| Room it is in | all | anyone in the room (or carrying) |
| `charges` | microwave (express cooks left); weapons also have charges, to confirm | anyone who can see the item |
| `builds` (recipe) | blueprint | anyone who can see it |
| `teaches` (skill) | skill book | anyone who can see it |
| `of` (whose body) | corpse | public |
| `hidden` | an item you hid | only you, until someone searches |
| `plant`: species, age, thirst (0, 1, 2) | planted hydropot | public |
| `plant.sick` | planted hydropot | Botanist role only |
| `spores` | food trapped by Fungal cuisine | living Mush only |
| Equipment `broken` | room equipment, not items | your room's equipment only |

## The central design problem: notes can lie

Manual notes mean a player can write anything, and Mush have reason to. The plan has to settle what the pad promises.

Proposed starting point (to confirm):

- A note is a **claim by a named author**, shown with who wrote it and when (cycle). It is never presented as fact.
- The server stores notes in game state and sends the same pad to every living seat. The pad holds only what players typed, so it leaks nothing the server did not already allow; a note is information the author chose to share.
- Players pick from item types and states the game defines, so a note cannot carry free text through a side door. Whether to allow a free-text comment is open (moderation needs it if so; see Open questions).
- The client never decides whether a note is true. Optionally the room view could mark a note "stale" when its author sees the item has moved; this is a convenience, not a rule, and is open.

## Hidden information rules for notes

These follow the architecture rules in CLAUDE.md and need a leak check (`leak-check` skill) when built.

- **Do not auto-fill from private state.** The note form may only offer states the author's own `PlayerView` shows. A player must not be able to type `sick` for a plant unless their view carries `plant.sick`, nor `spores` unless their view carries it.
- The server should also check this on write: reject a state the author's seat could not see. Otherwise a modified client could probe hidden state by whether the write is accepted. (Open: whether the rejection can itself leak; the simplest answer is to accept any state value and let the author's claim stand, since the claim is unverified anyway.)
- A dead player: their notes stay, their seat can no longer edit (open).
- Notes about hidden items (`hidden`) are the author's own business; sharing them reveals nothing the server did not already let that player know.

## Data sketch

Server-only game state, sent whole to every living seat (no per-seat filtering needed, because every note is crew-wide):

```text
InventoryNote {
  id
  author: PlayerId
  cycle: number          // when it was written
  room: RoomId
  item: string           // an ITEM_TYPES key
  count?: number
  state?: { charges?, plant?, broken?, ... }  // only the states in the table above
  text?: string          // open: free comment
}
```

Per-room view groups the notes by room and orders rooms in the fixed map order. Text export builds from the same notes on the client, so no extra server work.

## Pieces to build (rough order)

1. Types and one config block in `shared`, with the note shape and limits (notes per ship, per player, per room).
2. Pure rules in `shared`: add, edit, remove a note, who may do each, per-player rate limit, tests (including that a dead seat cannot edit and the limits hold).
3. `viewFor`: include the pad for living seats; test that it is identical for every seat and that no private state is added.
4. Server: a note action through the existing intent path; abuse limits like chat.
5. Web: the tab, a room-grouped list, the item picker and state form, a text export. Phone layout first, then desktop. All text through the i18n seam (en/fr/es).
6. Optional later: share message, links from chat, stale marks.

Bots: no bot uses the pad at first.

## Open questions for the owner

1. **Who may edit a note:** only its author, or any living seat (a crew wiki)? Editing others' notes lets a Mush corrupt the pad; author-only lets stale notes stay.
2. **Free text:** allow a comment on a note, or structured fields only? Free text needs chat moderation and the i18n rules; structured fields are safer and translate cleanly.
3. **Stale marks:** show that a note may be out of date (the author later saw the item elsewhere)? How is that decided without leaking?
4. **Limits:** how many notes per ship, per player, per room? How often can a player write?
5. **Dead seats and bodies:** keep a dead player's notes visible and attributed? Can a corpse's note exist as an item (`of`)?
6. **Equipment:** the table lists `broken` equipment, which is not an item. Is room equipment in scope, or only items?
7. **Pre-selection and single player:** is the pad on in pre-selection, or only once the game starts? Does a single-player game get it?
8. **Cost:** free (no AP) like chat, or an action with a cost? Costing AP would stop spam but changes the economy and is a rule decision.
9. **Name and placement:** what the tab is called, and whether it sits with chat or beside the room list.
10. **Share message and chat links:** in scope, or later?

## Out of scope for now

- Automatic tracking from what the author sees.
- A pad shared outside the ship, or across games.
- Bot use of the pad.
- Any item state the slice does not have yet (diseases on food, frozen, unstable, decaying): add them when the rules exist.

## Licensing note

The idea and feature list come from AstroPad. No code, strings or item data are copied, and none should be, as the repository carries no license. Item facts come from our own sources (`Mush/` and the wiki skill).

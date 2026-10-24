// Every field of the server-side state, and who may see it (issue #102). A new field on GameState, PlayerState
// (Seat included) or ItemState fails `leaks.test.ts` (runtime keys) and `tools/tests/leaks/fields.test.ts` (the
// interfaces in the source) until it is listed here. Listing it is the prompt to add the matching viewFor test:
// a sentinel in `leaks.test.ts` when the value can be made unique, otherwise a named test elsewhere.

/**
 * - `public`: the same for every seat.
 * - `room`: only to living people in the owner's room (or a narrower rule, see the note).
 * - `own`: only in the owner's view.
 * - `filtered`: a collection `viewFor` filters entry by entry (log, chat, items).
 * - `never`: in no view at all, the owner's included.
 */
export type Reach = "public" | "room" | "own" | "filtered" | "never";

export interface FieldRule {
  reach: Reach;
  /** The test file that checks it doesn't reach anyone else. `leaks.test.ts` means a sentinel there. */
  test: string;
  note?: string;
}

export const GAME_STATE_FIELDS: Record<string, FieldRule> = {
  config: { reach: "public", test: "rules.test.ts", note: "Only `rooms`, your room's equipment and `PublicConfig` go out." },
  rng: { reach: "never", test: "leaks.test.ts" },
  cycle: { reach: "public", test: "rules.test.ts" },
  phase: { reach: "public", test: "rules.test.ts" },
  winner: { reach: "public", test: "pilgred.test.ts", note: "Who won; null until the game ends." },
  ending: { reach: "public", test: "victory.test.ts", note: "How it ended; null until the game ends." },
  players: { reach: "filtered", test: "leaks.test.ts", note: "Field by field: PLAYER_STATE_FIELDS." },
  items: { reach: "filtered", test: "leaks.test.ts", note: "Your inventory and your room's storage only." },
  nextItemId: { reach: "never", test: "leaks.test.ts", note: "Not secret (item ids show it), just not sent." },
  dispensedOn: { reach: "never", test: "leaks.test.ts" },
  log: { reach: "filtered", test: "leaks.test.ts", note: "Your room's public entries, ship-wide ones, and your private ones." },
  chat: { reach: "filtered", test: "leaks.test.ts", note: "Messages in your read channels." },
  nextChatId: { reach: "never", test: "leaks.test.ts", note: "Not secret (message ids show it), just not sent." },
  channels: { reach: "filtered", test: "leaks.test.ts", note: "Private channels you are a member of." },
  nextChannelId: { reach: "never", test: "leaks.test.ts", note: "Not secret (channel ids show it), just not sent." },
  threads: { reach: "filtered", test: "threads.test.ts", note: "All of them, to whoever can read global chat." },
  nextThreadId: { reach: "never", test: "leaks.test.ts", note: "Not secret (thread ids show it), just not sent." },
  bios: { reach: "room", test: "bios.test.ts", note: "The values, to the living at a BIOS terminal; their effects (whose room you are told, death announcements) reach everyone." },
  bonds: { reach: "own", test: "leaks.test.ts", note: "Each bond to its two partners only." },
  sharedOnDay: { reach: "never", test: "leaks.test.ts" },
  contamination: { reach: "never", test: "leaks.test.ts", note: "Except to a living Mush in the human's room (infection.test.ts)." },
  ship: { reach: "public", test: "ship.test.ts" },
  sporesToday: { reach: "never", test: "leaks.test.ts" },
  sporeExtractedOn: { reach: "never", test: "leaks.test.ts" },
  research: { reach: "public", test: "research.test.ts" },
  projects: { reach: "public", test: "projects.test.ts" },
  pilgred: { reach: "room", test: "pilgred.test.ts", note: "Only `progress`, to the living in a room with the PILGRED terminal; `lastBy` and `streak` never. Whether it is repaired is public (`pilgredRepaired`), as the crew-wide message announces it." },
  planets: { reach: "own", test: "leaks.test.ts", note: "Without the unknown sectors' tags." },
  scanFailures: { reach: "never", test: "leaks.test.ts" },
  nextPlanetId: { reach: "never", test: "leaks.test.ts", note: "Not secret (planet ids show it), just not sent." },
  navigation: { reach: "room", test: "navigation.test.ts", note: "`heading` to the living at a Command terminal; `orbit` only as a public in-orbit flag, the planet id to its finder alone (as `orbited` on their planet)." },
  comms: { reach: "room", test: "comms.test.ts", note: "`linked` to everyone; the terminal screen to the living at a Com center terminal, without which Xyloph entries were drawn." },
  titles: { reach: "public", test: "titles.test.ts", note: "Holders and lines, by character (owner, 2026-10-20)." },
  now: { reach: "never", test: "leaks.test.ts", note: "The rules' clock; offers' expiry times reach their owner only." },
};

export const PLAYER_STATE_FIELDS: Record<string, FieldRule> = {
  // Seat
  id: { reach: "public", test: "rules.test.ts" },
  name: { reach: "never", test: "leaks.test.ts", note: "Not even your own while the game runs; everyone's, moderated, once it has ended (victory.test.ts)." },
  isBot: { reach: "public", test: "rules.test.ts" },
  botKind: { reach: "public", test: "rules.test.ts" },
  character: { reach: "public", test: "rules.test.ts" },
  // PlayerState
  role: { reach: "own", test: "leaks.test.ts", note: "Death announces it crew-wide (death.test.ts); everyone's once the game has ended (victory.test.ts)." },
  alpha: { reach: "own", test: "leaks.test.ts" },
  room: { reach: "room", test: "rules.test.ts", note: "Everyone's while ACTOPI is on; never a dead player's (death.test.ts)." },
  ap: { reach: "own", test: "leaks.test.ts" },
  lyingIn: { reach: "room", test: "leaks.test.ts" },
  spot: { reach: "room", test: "leaks.test.ts" },
  pushedBy: { reach: "room", test: "leaks.test.ts", note: "Also as the public `accommodated` status." },
  accommodationOffers: { reach: "own", test: "leaks.test.ts", note: "The offers themselves are public room log lines." },
  mp: { reach: "own", test: "leaks.test.ts" },
  hp: { reach: "own", test: "leaks.test.ts" },
  morale: { reach: "own", test: "leaks.test.ts" },
  satiety: { reach: "own", test: "leaks.test.ts" },
  satietyZeroSince: { reach: "own", test: "leaks.test.ts" },
  statuses: { reach: "room", test: "leaks.test.ts", note: "Public statuses only; private ones are your own." },
  outcastBy: { reach: "never", test: "anathema.test.ts", note: "Who cursed them is never sent; only the public `outcast` status is." },
  boringToday: { reach: "own", test: "speech.test.ts", note: "Only gates the Boring speech; roommates never see it." },
  immuneUntil: { reach: "own", test: "leaks.test.ts", note: "As the `immune` status." },
  spores: { reach: "own", test: "leaks.test.ts" },
  resources: { reach: "own", test: "leaks.test.ts" },
  modifiers: { reach: "own", test: "leaks.test.ts" },
  skills: { reach: "room", test: "leaks.test.ts" },
  bookSkill: { reach: "room", test: "leaks.test.ts" },
  alive: { reach: "public", test: "death.test.ts" },
  ready: { reach: "public", test: "rules.test.ts" },
  current: { reach: "own", test: "leaks.test.ts", note: "Roommates get a bar without the action (queue.test.ts)." },
  queue: { reach: "own", test: "leaks.test.ts" },
  cheats: { reach: "own", test: "cheats.test.ts" },
  actopiCheat: { reach: "own", test: "cheats.test.ts" },
};

export const ITEM_STATE_FIELDS: Record<string, FieldRule> = {
  id: { reach: "filtered", test: "leaks.test.ts" },
  type: { reach: "filtered", test: "items.test.ts" },
  at: { reach: "never", test: "leaks.test.ts", note: "Implied by which list the item is in." },
  of: { reach: "filtered", test: "death.test.ts" },
  builds: { reach: "filtered", test: "build.test.ts" },
  charges: { reach: "filtered", test: "express_cook.test.ts" },
  teaches: { reach: "filtered", test: "read_book.test.ts" },
  plant: { reach: "filtered", test: "botany.test.ts", note: "Species, age and thirst with the item; `sick` only to the Botanist role (Botanist or Skilful), never to anyone else, Mush included." },
};

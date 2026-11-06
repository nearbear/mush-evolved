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
  config: { reach: "public", test: "rules.test.ts", note: "Only `rooms` and `PublicConfig` go out." },
  rng: { reach: "never", test: "leaks.test.ts" },
  cycle: { reach: "public", test: "rules.test.ts" },
  phase: { reach: "public", test: "rules.test.ts" },
  preselection: { reach: "public", test: "preselection.test.ts" },
  winner: { reach: "public", test: "pilgred.test.ts", note: "Who won; null until the game ends." },
  ending: { reach: "public", test: "victory.test.ts", note: "How it ended; null until the game ends." },
  players: { reach: "filtered", test: "leaks.test.ts", note: "Field by field: PLAYER_STATE_FIELDS." },
  items: { reach: "filtered", test: "leaks.test.ts", note: "Your inventory and your room's storage only." },
  nextItemId: { reach: "never", test: "leaks.test.ts", note: "Not secret (item ids show it), just not sent." },
  equipment: { reach: "room", test: "build.test.ts", note: "Your room's, while alive (`roomEquipment`)." },
  dispensedOn: { reach: "never", test: "leaks.test.ts" },
  log: { reach: "filtered", test: "leaks.test.ts", note: "Your room's public entries, ship-wide ones, and your private ones." },
  chat: { reach: "filtered", test: "leaks.test.ts", note: "Messages in your read channels." },
  nextChatId: { reach: "never", test: "leaks.test.ts", note: "Not secret (message ids show it), just not sent." },
  channels: { reach: "filtered", test: "leaks.test.ts", note: "Private channels you are a member of." },
  nextChannelId: { reach: "never", test: "leaks.test.ts", note: "Not secret (channel ids show it), just not sent." },
  plans: { reach: "filtered", test: "leaks.test.ts", note: "Plans of the private channels you are a member of (plans.test.ts too); a summoned holder's stop reason is only in their own log." },
  nextPlanId: { reach: "never", test: "leaks.test.ts", note: "Not secret (plan ids show it), just not sent." },
  threads: { reach: "filtered", test: "threads.test.ts", note: "All of them, to whoever can read global chat." },
  nextThreadId: { reach: "never", test: "leaks.test.ts", note: "Not secret (thread ids show it), just not sent." },
  bios: { reach: "room", test: "bios.test.ts", note: "The values, to the living at a BIOS terminal; their effects (whose room you are told, death announcements) reach everyone." },
  bonds: { reach: "own", test: "leaks.test.ts", note: "Each bond to its two partners only." },
  sharedOnDay: { reach: "never", test: "leaks.test.ts" },
  contamination: { reach: "never", test: "leaks.test.ts", note: "Except to a living Mush in the human's room (infection.test.ts)." },
  ship: { reach: "public", test: "ship.test.ts" },
  sporesToday: { reach: "never", test: "leaks.test.ts" },
  spikedOn: { reach: "never", test: "leaks.test.ts" },
  research: { reach: "room", test: "research.test.ts", note: "To the living in the lab; elsewhere only completed researches (owner, 2026-10-31)." },
  relay: { reach: "room", test: "leaks.test.ts", note: "Each research's and project's relay tokens (research's samples, verified and pending): contributor and value to the living in the target's room; each viewer's own token count anywhere; rolls and contamination (contaminatedBy) never (relayView.ts, assay.ts)." },
  projects: { reach: "room", test: "projects.test.ts", note: "To the living at NERON's core; elsewhere only completed projects (owner, 2026-10-31)." },
  pilgred: { reach: "room", test: "pilgred.test.ts", note: "`progress` and the pool's contributors and values, to the living in a room with the PILGRED terminal; rolls never; each viewer's own token count anywhere. Whether it is repaired is public (`pilgredRepaired`), as the crew-wide message announces it." },
  planets: { reach: "own", test: "leaks.test.ts", note: "Without the unknown sectors' tags." },
  failureStreaks: { reach: "never", test: "leaks.test.ts" },
  nextPlanetId: { reach: "never", test: "leaks.test.ts", note: "Not secret (planet ids show it), just not sent." },
  sharedPlanets: { reach: "filtered", test: "sharedPlanets.test.ts", note: "To whoever can read the Astrophysics feature, without `planet` (leaks.test.ts: never sent)." },
  nextSharedPlanetId: { reach: "never", test: "leaks.test.ts", note: "Not secret (entry ids show it), just not sent." },
  navigation: { reach: "room", test: "navigation.test.ts", note: "`heading` to the living at a Command terminal; `orbit` only as a public in-orbit flag, the planet id to its finder alone (as `orbited` on their planet); `lastTurn` public to everyone (owner, 2026-10-29)." },
  comms: { reach: "room", test: "comms.test.ts", note: "`linked` to everyone; the terminal screen to the living at a Com center terminal, with the Xyloph entries drawn so far (in database order)." },
  titles: { reach: "public", test: "titles.test.ts", note: "Holders and lines, by character (owner, 2026-10-20)." },
  hunters: { reach: "room", test: "hunters.test.ts", note: "How many, to everyone; each hunter's hp and id to the living in a turret room; `points`, `since`, `nextId`, `hitChance` and `target` never (leaks.test.ts)." },
  turrets: { reach: "room", test: "hunters.test.ts", note: "Every turret's charges, to the living in a turret room." },
  incidentPoints: { reach: "never", test: "leaks.test.ts", note: "The incident pool (#189): no one, no skill or role." },
  pendingFires: { reach: "never", test: "leaks.test.ts", note: "Rooms a Pyromaniac set to ignite at the next cycle change (2026-11-03)." },
  fires: { reach: "room", test: "incidents.test.ts", note: "Only as `roomOnFire` to the living in the room, or `burningRooms` to the living when Fire Detectors is complete (owner, 2026-11-02)." },
  patrolShips: { reach: "room", test: "patrol.test.ts", note: "`out` to the living in the ship's bay, on its interface, with `armor` while docked (owner, 2026-10-28, so Renovate's offer reveals nothing); `armor` in flight and `charges` to its pilot only, aboard (leaks.test.ts)." },
  space: { reach: "never", test: "leaks.test.ts", note: "Only its length, to a pilot aboard (`patrolShip.debris`); the pieces never." },
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
  mind: { reach: "never", test: "leaks.test.ts", note: "Which seat plays the body; would reveal a Transfer." },
  transferUsed: { reach: "never", test: "leaks.test.ts" },
  bodyTakenBy: { reach: "own", test: "body_transfer.test.ts", note: "The victim's pop-up; never to anyone else." },
  role: { reach: "own", test: "leaks.test.ts", note: "Death announces it crew-wide (death.test.ts); everyone's once the game has ended (victory.test.ts)." },
  alpha: { reach: "own", test: "leaks.test.ts" },
  room: { reach: "room", test: "rules.test.ts", note: "Everyone's while ACTOPI is on; never a dead player's (death.test.ts)." },
  ap: { reach: "own", test: "leaks.test.ts" },
  maxAp: { reach: "own", test: "leaks.test.ts" },
  lyingIn: { reach: "room", test: "leaks.test.ts" },
  lyingSince: { reach: "never", test: "leaks.test.ts", note: "Lethargy's count; only its AP reaches the owner." },
  spot: { reach: "room", test: "leaks.test.ts" },
  pushedBy: { reach: "room", test: "leaks.test.ts", note: "Also as the public `accommodated` status." },
  accommodationOffers: { reach: "own", test: "leaks.test.ts", note: "The offers themselves are public room log lines." },
  mp: { reach: "own", test: "leaks.test.ts" },
  maxMp: { reach: "own", test: "leaks.test.ts" },
  hp: { reach: "own", test: "leaks.test.ts" },
  maxHp: { reach: "own", test: "leaks.test.ts" },
  morale: { reach: "own", test: "leaks.test.ts" },
  maxMorale: { reach: "own", test: "leaks.test.ts" },
  satiety: { reach: "own", test: "leaks.test.ts" },
  satietyZeroSince: { reach: "own", test: "leaks.test.ts" },
  statuses: { reach: "room", test: "leaks.test.ts", note: "Public statuses only; private ones are your own." },
  diseaseTrackers: { reach: "own", test: "leaks.test.ts" },
  lastSeenAt: { reach: "never", test: "leaks.test.ts", note: "Only the public `inactive` and `super_inactive` statuses it leads to go out." },
  inactivity: { reach: "never", test: "inactivity.test.ts", note: "The field itself; the public `inactive` and `super_inactive` statuses go out instead." },
  outcastBy: { reach: "never", test: "anathema.test.ts", note: "Who cursed them is never sent; only the public `outcast` status is." },
  geniusUsed: { reach: "own", test: "genius.test.ts", note: "Only stops Eureka moment being used again; roommates never see it." },
  apprenticeUsed: { reach: "own", test: "apprenticeship.test.ts", note: "Only stops Apprentice being picked again; roommates never see it." },
  fertileToday: { reach: "own", test: "fertile.test.ts", note: "Only gates the free extraction; roommates never see it." },
  boringToday: { reach: "own", test: "speech.test.ts", note: "Only gates the Boring speech; roommates never see it." },
  chitchatToday: { reach: "own", test: "history.test.ts", note: "Only gates Chitchat; roommates never see it." },
  interrogatedToday: { reach: "own", test: "history.test.ts", note: "Only gates Interrogate; roommates never see it." },
  mycoscannedToday: { reach: "own", test: "mycoscan.test.ts", note: "Only gates the MycoScan check; roommates never see it." },
  snoopedToday: { reach: "own", test: "snoop.test.ts", note: "Only gates Snoop; roommates never see it." },
  history: { reach: "never", test: "leaks.test.ts", note: "Revealed only as private log lines, by Interrogate and Chitchat (history.ts)." },
  immuneUntil: { reach: "own", test: "leaks.test.ts", note: "As the `immune` status." },
  spores: { reach: "own", test: "leaks.test.ts" },
  resources: { reach: "own", test: "leaks.test.ts" },
  modifiers: { reach: "own", test: "leaks.test.ts" },
  skills: { reach: "room", test: "leaks.test.ts" },
  bookSkill: { reach: "room", test: "leaks.test.ts" },
  mushSkills: { reach: "own", test: "leaks.test.ts", note: "Not to roommates, and not to other Mush." },
  alive: { reach: "public", test: "death.test.ts" },
  ready: { reach: "public", test: "rules.test.ts" },
  current: { reach: "own", test: "leaks.test.ts", note: "Roommates get a bar without the action (queue.test.ts)." },
  queue: { reach: "own", test: "leaks.test.ts" },
  cheats: { reach: "own", test: "cheats.test.ts" },
};

export const ITEM_STATE_FIELDS: Record<string, FieldRule> = {
  id: { reach: "filtered", test: "leaks.test.ts" },
  type: { reach: "filtered", test: "items.test.ts" },
  at: { reach: "never", test: "leaks.test.ts", note: "Implied by which list the item is in." },
  of: { reach: "filtered", test: "death.test.ts" },
  builds: { reach: "filtered", test: "build.test.ts" },
  charges: { reach: "filtered", test: "express_cook.test.ts" },
  teaches: { reach: "filtered", test: "read_book.test.ts" },
  spores: { reach: "filtered", test: "fungal_cuisine.test.ts", note: "Mush only (living): the trapped food's contamination level." },
  hiddenBy: { reach: "never", test: "hide.test.ts", note: "The hidden item is in its hider's view only, flagged `hidden`; the field itself is never sent." },
  plant: { reach: "filtered", test: "botany.test.ts", note: "Species, age and thirst with the item; `sick` only to the Botanist role (Botanist or Skilful), never to anyone else, Mush included." },
};

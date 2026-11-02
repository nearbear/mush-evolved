// The site API's bodies as zod schemas (#324): the source of the OpenAPI document (openapi.ts), and of the parsing of
// `{ name }` bodies. Each is registered in `apiSchemas` under the name it has in the document.
//
// The TypeScript types stay in shared (accounts.ts, setups.ts), where `web` and the rest of the server read them.
// `SchemasMatchShared` below holds every schema to its shared type, so a change to either that isn't made to the
// other fails `npm run typecheck`.
//
// A setup post is still parsed by shared's `parsePostSetup`, not by its schema here: its rules (knob ranges, a Mush
// count that leaves enough humans) are the game's, and shared applies the same ones to stored setups. The schema
// describes the same shape for the document.

import {
  AUTH_PROVIDERS,
  CHARACTERS,
  type CharacterId,
  CYCLE_HOURS,
  type FinishedGamesResponse,
  LOBBY_LANGUAGES,
  MAX_NAME_LENGTH,
  MAX_PRESELECTION_DAYS,
  MAX_RULES_VERSION_LENGTH,
  MAX_SEATS,
  MAX_SETUP_DESCRIPTION_LENGTH,
  MAX_SETUP_ID_LENGTH,
  MAX_SETUP_NAME_LENGTH,
  type MeResponse,
  MIN_PRESELECTION_DAYS,
  MIN_SEATS,
  MUSH_COUNTS,
  MUSH_SEAT_MARGIN,
  type PostSetupRequest,
  type PostSetupResponse,
  type RenameResponse,
  type ReplayIndex,
  type SetupListResponse,
  type SetupLookupResponse,
  type SignupResponse,
} from "@mush2/shared";
import * as z from "zod";

/** Every named schema, by its name in the document's `components.schemas`. Its own registry, not zod's global one. */
export const apiSchemas = z.registry<{ id: string; description: string }>();

function named<T extends z.ZodType>(id: string, description: string, schema: T): T {
  apiSchemas.add(schema, { id, description });
  return schema;
}

// ---- Accounts (shared/src/accounts.ts)

export const NameRequestSchema = named(
  "NameRequest",
  "The body of /api/signup and /api/rename. Other fields are ignored.",
  z.object({
    name: z.string().meta({
      description: `The display name. Whitespace runs are folded to one space and the ends trimmed; then it must be 1 to ${MAX_NAME_LENGTH} characters, with no link or blocked word.`,
    }),
  }),
);
export type NameRequest = z.infer<typeof NameRequestSchema>;

/** `{ name }` with a string name (other fields dropped), or null. The name itself is checked by the route (checkDisplayName). */
export function parseNameRequest(value: unknown): NameRequest | null {
  const result = NameRequestSchema.safeParse(value);
  return result.success ? result.data : null;
}

const DISPLAY_NAME_ERRORS = ["name_empty", "name_too_long", "name_rejected"] as const;

const AuthProviderSchema = named("AuthProvider", "A sign-in provider.", z.enum(AUTH_PROVIDERS));

export const MeResponseSchema = named(
  "MeResponse",
  "This browser's account. `signup`: back from a first sign-in with the name not confirmed yet (POST /api/signup); `suggestedName` is the provider's name when it is valid and free.",
  z.discriminatedUnion("status", [
    z.object({ status: z.literal("signed_out") }),
    z.object({ status: z.literal("signup"), suggestedName: z.string().nullable() }),
    z.object({
      status: z.literal("signed_in"),
      account: z.object({
        id: z.string(),
        displayName: z.string(),
        providers: z.array(AuthProviderSchema).meta({ description: "Sign-in methods linked to the account, at most one per provider." }),
        renameAllowedAt: z.int().nullable().meta({ description: "When the next rename is allowed (Unix ms); null if allowed now." }),
        aboard: z.boolean().meta({ description: "Whether the account is aboard a multiplayer ship (the ship itself isn't named). It may have ended since." }),
      }),
    }),
  ]),
);

export const SignupResponseSchema = named(
  "SignupResponse",
  "`no_signup`: no pending sign-up on this browser (it expires an hour after the provider's callback).",
  z.union([
    z.object({ ok: z.literal(true) }),
    z.object({ ok: z.literal(false), reason: z.enum([...DISPLAY_NAME_ERRORS, "name_taken", "no_signup", "rate_limited"]) }),
  ]),
);

export const RenameResponseSchema = named(
  "RenameResponse",
  "`too_soon`: within a day of the last rename. `name_unchanged`: the same name (a change of case only is a rename).",
  z.union([
    z.object({ ok: z.literal(true) }),
    z.object({
      ok: z.literal(false),
      reason: z.enum([...DISPLAY_NAME_ERRORS, "name_taken", "name_unchanged", "too_soon", "signed_out", "rate_limited"]),
    }),
  ]),
);

export const LogoutResponseSchema = named("LogoutResponse", "Always ok, signed in or not.", z.object({ ok: z.literal(true) }));

// ---- Setups (shared/src/setups.ts)

const LobbyLanguageSchema = named("LobbyLanguage", "A lobby language.", z.enum(LOBBY_LANGUAGES));

const SetupTextsSchema = named(
  "SetupTexts",
  "A setup's name and description in each language it has, at least one. The description may be empty.",
  z.partialRecord(
    LobbyLanguageSchema,
    z.strictObject({ name: z.string().max(MAX_SETUP_NAME_LENGTH), description: z.string().max(MAX_SETUP_DESCRIPTION_LENGTH) }),
  ),
);

const SetupKnobsSchema = named(
  "SetupKnobs",
  `A setup's rules. A fixed \`mushCount\` must leave at least ${MUSH_SEAT_MARGIN} seats to humans (at most \`seats\` - ${MUSH_SEAT_MARGIN}).`,
  z.strictObject({
    seats: z.int().min(MIN_SEATS).max(MAX_SEATS),
    preselectionDays: z.int().min(MIN_PRESELECTION_DAYS).max(MAX_PRESELECTION_DAYS),
    mushCount: z.literal(MUSH_COUNTS).meta({ description: "`auto`: 2 Mush above 8 players, otherwise 1." }),
    cycleHours: z.literal(CYCLE_HOURS),
    sharedSpots: z.boolean().meta({ description: "Off: where a player stands or sits is only on their own screen." }),
  }),
);

const setupFields = {
  id: z.string().min(1).max(MAX_SETUP_ID_LENGTH),
  text: SetupTextsSchema,
  ownerName: z.string().max(MAX_NAME_LENGTH).meta({ description: "The owner's current display name." }),
  version: z.int().min(1).meta({ description: "1 for a new setup; each new version follows the newest." }),
  previousId: z.string().min(1).max(MAX_SETUP_ID_LENGTH).optional().meta({ description: "The version this one follows; present exactly when `version` > 1." }),
  rulesVersion: z.string().max(MAX_RULES_VERSION_LENGTH).meta({ description: "The rules build it was posted under. Display only." }),
  createdAt: z.int().min(0).meta({ description: "Unix ms." }),
};

const SetupSchema = named("Setup", "A posted setup (or the standard one).", z.strictObject({ ...setupFields, knobs: SetupKnobsSchema }));

const SetupRecordSchema = named(
  "SetupRecord",
  "A setup found by ID, any version. `knobs` is null when it no longer validates; `latest`: it is its setup's newest version.",
  z.strictObject({ ...setupFields, knobs: SetupKnobsSchema.nullable(), latest: z.boolean() }),
);

export const SetupListResponseSchema = named(
  "SetupListResponse",
  "The newest version of every setup that validates, newest first, in every language. `mine` is null when signed out.",
  z.object({
    setups: z.array(SetupSchema),
    mine: z
      .object({
        ids: z.array(z.string()).meta({ description: "This account's setups in the list." }),
        setups: z.int().meta({ description: "New setups posted, toward the cap of 50." }),
        posts: z.int().meta({ description: "Posts in all, new versions too, toward the cap of 500." }),
      })
      .nullable(),
  }),
);

export const SetupLookupResponseSchema = named("SetupLookupResponse", "A setup by ID.", z.object({ setup: SetupRecordSchema }));

export const PostSetupRequestSchema = named(
  "PostSetupRequest",
  "A new setup, or with `previousId` a new version of one of this account's setups (its newest). The texts are moderated when posted.",
  z.strictObject({
    text: SetupTextsSchema,
    knobs: SetupKnobsSchema,
    previousId: z.string().min(1).max(MAX_SETUP_ID_LENGTH).optional(),
  }),
);

export const PostSetupResponseSchema = named(
  "PostSetupResponse",
  "`invalid`: a malformed body or knobs. `setup_cap`, `post_cap`: the account's caps (50 setups, 500 posts). `not_found`, `not_owner`, `not_latest`: about `previousId`. A text error names its language in `lang`.",
  z.union([
    z.object({ ok: z.literal(true), setup: SetupSchema }),
    z.object({
      ok: z.literal(false),
      reason: z.enum([
        "no_text",
        "name_empty",
        "name_too_long",
        "description_too_long",
        "invalid",
        "signed_out",
        "rate_limited",
        "setup_cap",
        "post_cap",
        "not_found",
        "not_owner",
        "not_latest",
      ]),
      lang: LobbyLanguageSchema.optional(),
    }),
  ]),
);

// ---- Finished games (shared/src/finishedGames.ts)

const RoleSchema = z.enum(["human", "mush"]);
const CharacterIdSchema = named("CharacterId", "A character.", z.enum(CHARACTERS.map((c) => c.id) as [CharacterId, ...CharacterId[]]));

const FinishedGameSchema = named(
  "FinishedGame",
  "A finished multiplayer game. `id` is its room's. Times are Unix ms; `cycles` counts from launch.",
  z.object({
    id: z.string(),
    language: LobbyLanguageSchema.nullable(),
    startedAt: z.int(),
    endedAt: z.int(),
    cycles: z.int(),
    winner: z.enum(["mush", "humans"]),
    ending: z.enum(["sol", "eden", "humans_dead", "ship_destroyed"]),
    crew: z.array(
      z.object({
        seat: z.string().meta({ description: "The player's seat; a Transfer moves a player to another character, not another seat." }),
        name: z.string().nullable().meta({ description: "The player's name at the time of the game; null if it fails today's name moderation." }),
        isBot: z.boolean(),
        startCharacter: CharacterIdSchema,
        endCharacter: CharacterIdSchema,
        startRole: RoleSchema.meta({ description: "When the Mush were chosen: `mush` is an alpha Mush." }),
        endRole: RoleSchema.meta({ description: "At the end: `mush` after a `human` start is a beta Mush." }),
        alive: z.boolean(),
      }),
    ),
  }),
);

export const FinishedGamesResponseSchema = named(
  "FinishedGamesResponse",
  "Finished multiplayer games, newest first. `next` is the cursor for the page of older games (`before`), or null on the last page.",
  z.object({ games: z.array(FinishedGameSchema), next: z.string().nullable() }),
);

// ---- Replays (shared/src/replayChunks.ts)

export const ReplayIndexSchema = named(
  "ReplayIndex",
  "A finished game's replay index. `v` is the history format of every chunk. Times are Unix ms.",
  z.object({
    v: z.int(),
    roomId: z.string(),
    rulesVersion: z.string(),
    endedAt: z.int(),
    seats: z.array(
      z.object({
        seat: z.string(),
        role: RoleSchema.meta({ description: "When the Mush were chosen." }),
        character: CharacterIdSchema.meta({ description: "When the Mush were chosen." }),
      }),
    ),
    chunks: z.array(
      z.object({
        cycle: z.int().meta({ description: "The game cycle of the full copy the chunk starts from." }),
        firstInput: z.int(),
        inputs: z.int(),
        from: z.int(),
        to: z.int(),
      }),
    ),
  }),
);

/** Not held to `ChunkEntry`: a history step is the whole full view and its changes, described here only in words. */
export const ReplayChunkSchema = named(
  "ReplayChunk",
  "One chunk of a replay, in record order: each input's server time and its history step. The first step carries a full copy of the view (`full` or `base`), so the chunk rebuilds by itself (shared `rebuildHistory`).",
  z.array(z.object({ at: z.int(), history: z.record(z.string(), z.unknown()).meta({ description: "A history step (shared `HistoryStep`)." }) })),
);

export const NotReadySchema = named(
  "NotReady",
  "The game has ended but its replay isn't copied yet; try again later.",
  z.object({ error: z.literal("not_ready") }),
);

export const InvalidCursorSchema = named("InvalidCursor", "A `before` cursor that isn't one from `next`.", z.object({ error: z.literal("invalid_cursor") }));

// ---- Errors any route may answer

export const RateLimitedSchema = named(
  "RateLimited",
  "Too many requests from this address or account (429, with Retry-After).",
  z.object({ ok: z.literal(false), error: z.literal("rate_limited"), reason: z.literal("rate_limited") }),
);

export const NotFoundSchema = named("NotFound", "No such route, setup or game (a running game, or another account's single-player game, answers this too).", z.object({ error: z.literal("not_found") }));

// ---- The schemas hold to shared's types

/** True when each of A and B is assignable to the other. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Expect<T extends true> = T;

/** Never used: compiling it is the check (see the top of this file). */
export type SchemasMatchShared = [
  Expect<Same<z.infer<typeof MeResponseSchema>, MeResponse>>,
  Expect<Same<z.infer<typeof SignupResponseSchema>, SignupResponse>>,
  Expect<Same<z.infer<typeof RenameResponseSchema>, RenameResponse>>,
  Expect<Same<z.infer<typeof SetupListResponseSchema>, SetupListResponse>>,
  Expect<Same<z.infer<typeof SetupLookupResponseSchema>, SetupLookupResponse>>,
  Expect<Same<z.infer<typeof PostSetupRequestSchema>, PostSetupRequest>>,
  Expect<Same<z.infer<typeof PostSetupResponseSchema>, PostSetupResponse>>,
  Expect<Same<z.infer<typeof FinishedGamesResponseSchema>, FinishedGamesResponse>>,
  Expect<Same<z.infer<typeof ReplayIndexSchema>, ReplayIndex>>,
];

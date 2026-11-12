// One authoritative game. Wraps the pure rules from @mush2/shared and sends
// each connection only the PlayerView for its own seat. Records every accepted
// input so the game can be replayed after it ends (docs/rules/rules-design.md, "Replays").

import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import {
  applyInput,
  moderateChat,
  MAX_SHARED_PLANET_LENGTH,
  MAX_SHARED_PLANET_LINES,
  parseGameMessage,
  startGame,
  stampEntries,
  takeChatOutbox,
  chatPageKey,
  chatMarkKey,
  chatPageSource,
  chatPageView,
  bodyOf,
  legalActions,
  nextDue,
  CHARACTERS,
  preselectionDeadline,
  resolveConfig,
  setupOverrides,
  STANDARD_SETUP,
  STANDARD_SETUP_ID,
  validateSetup,
  singlePlayerGame,
  SINGLE_PLAYER_HUMAN,
  viewFor,
  seatStarts,
  fullViewFor,
  historyStep,
  readChannels,
  chatReadFor,
  mergeChatRead,
  pruneChatRead,
  type ChannelId,
  type ChatRead,
  type ChatMessage,
  MUSH_CHANNEL,
  type FullView,
  type SeatStart,
  type CharacterId,
  type ConfigOverrides,
  type GameClientMessage,
  type BotPause,
  type GameServerMessage,
  type GameSetup,
  type GameState,
  type Input,
  type LobbyLanguage,
  type RecordedInput,
  type PlayerId,
  type PlayerState,
  type Role,
  type Seat,
  type Setup,
  normalizeGame,
  normalizeOverrides,
  normalizeSeatStarts,
  hasQueues,
  MIN_STATE_VERSION,
  STATE_VERSION,
  upgrade,
  type BuildStamp,
} from "@mush2/shared";
import { accountStoreFor } from "./accountStore.ts";
import { buildRouterPrompt, parseRouterReply, routerInput } from "./router.ts";
import { BOT_CHAT_CHAIN_DEPTH, LogParrotBot, ModelBot, WanderBot, type Bot } from "./bots.ts";
import type { BotMessage } from "./prompt.ts";
import { finishedEntry, gameStoreFor } from "./gameStore.ts";
import { clockCycle, clockCycleStart, cycleMs, cycleOfDay } from "./cycleClock.ts";
import { devModelCredentials, ModelGate, playerModelCredentials } from "./model.ts";
import { RateLimiter } from "./rateLimit.ts";
import { copyReplay } from "./replayStore.ts";

declare global {
  interface Env {
    /** Cheats and End cycle: `npm run dev` passes it with `--var`, and only the test deployment sets it. */
    ALLOW_CHEATS?: "true";
    /** Local development only: `npm run dev` passes it with `--var`, and no deployment sets it. */
    DEV_SERVER?: string;
  }
}

/** Error code (not text) for a cheat input on a server that doesn't allow them. */
const CHEATS_DISABLED = "cheats_disabled";
/** The one refusal for a `chatPage` request (#355), whatever the reason. */
const CHAT_PAGE_UNAVAILABLE = "chat_page_unavailable";

/** Where a seat's chat read counts are kept (#400): Durable Object storage, outside the snapshot and the record. */
const CHAT_READ_PREFIX = "chatRead:";
const chatReadKey = (seat: PlayerId) => `${CHAT_READ_PREFIX}${seat}`;

/** Deliberate pacing so bots don't act instantly. */
const BOT_DELAY_MS = 50;

/** Dev servers wait this long after the first join before seating bots, so a second window can join as another character. */
export const DEV_FILL_DELAY_MS = 8000;

/** A dev server (`DEV_SERVER`) allows this many times the usual message rate, so testing and scripted clients don't trip it. */
export const DEV_RATE_SCALE = 10;

/**
 * Model bots' limits per game (ModelGate). The budget is a backstop against a runaway bug, set high enough not to
 * bind in a normal game; a player will choose their own once they bring their own key.
 */
const MODEL_CALL_BUDGET = 3000;
const MODEL_MAX_IN_FLIGHT = 2;
const MODEL_TIMEOUT_MS = 20_000;
/** While model calls fail in passing, paused bots are asked again after this, doubling up to the max. */
const MODEL_RETRY_MS = 2_000;
const MODEL_RETRY_MAX_MS = 60_000;
/** A finished game whose entry in the list (#155) couldn't be written is tried again after this, doubling up to the max. */
const LIST_RETRY_MS = 60_000;
const LIST_RETRY_MAX_MS = 60 * 60_000;
/** The same for its history's copy to R2 (#336). */
const REPLAY_RETRY_MS = 60_000;
const REPLAY_RETRY_MAX_MS = 60 * 60_000;

/**
 * A ship's overrides from its setup (#232): the knobs, plus the setup's id for the record and the view. The setup is
 * checked again rather than trusted from the RPC; one that doesn't validate gives the standard setup.
 */
export function shipOverrides(setup: unknown): ConfigOverrides {
  const valid = validateSetup(setup);
  // The matchmaker learns the setup the ship really has from `status().setupId` (#236).
  if (!valid) console.warn("A ship's setup didn't validate; it launches with the standard setup.");
  const used = valid ?? STANDARD_SETUP;
  return { ...setupOverrides(used.knobs), setupId: used.id };
}

/** The room's snapshot in Durable Object storage, under "game". */
interface StoredRoom {
  version?: number;
  /** Without its config, which is resolved from `overrides` on each load, so live games pick up balance changes. */
  game: Omit<GameState, "config">;
  overrides: ConfigOverrides;
  /** Seat token -> seat id. Tokens are secrets handed out by the matchmaker. */
  tokens: Record<string, PlayerId>;
  /** How many inputs are recorded; the next one is stored at `inputKey(inputs)`. */
  inputs: number;
  /** Per seat, messages the rate limits rejected. Moderators see the count, never the messages. */
  rateLimited: Record<PlayerId, number>;
  /** The clock cycle (cycleClock.ts) the game is in. Each boundary past it becomes a `cycle` input. */
  clockCycle: number;
  /** Model calls made so far (ModelGate.used), so a restart doesn't refill the budget. Missing on older games. */
  modelCalls?: number;
  /** A single-player game (shared/src/singlePlayer.ts): no clock, cycles end by End cycle. Missing on older games. */
  singlePlayer?: boolean;
  /** Seat -> the account that took it (#285). Its name at the time is the seat's `name`. Never in a view. */
  accounts: Record<PlayerId, string>;
  /** The seats in `accounts` whose `account_ships` row is still open; freed when the body dies or the game ends. */
  aboard: Record<PlayerId, string>;
  /** Seat token -> the hash of the session it was handed to, so ending that session (logout, or another account signing in) revokes them. */
  tokenSessions: Record<string, string>;
  /** The lobby it was launched from (the matchmaker's), for the list of finished games (#155). Missing on older games and in tests. */
  language?: LobbyLanguage;
  /** Per seat, its role and character when the Mush were chosen (#155); missing until then. */
  starts?: Record<PlayerId, SeatStart>;
  /** The finished game is in the list (#155), or needs no entry. */
  listed: boolean;
  /** When the game ended (the time of the input that ended it); missing while it runs. */
  endedAt?: number;
  /** The finished game's history is in R2, every chunk and the index confirmed (#336). */
  replayReady: boolean;
}

// The game's record, beside the snapshot in this room's storage:
//   "setup"         GameSetup, written once
//   "input:<seq>"   RecordedInput, one per accepted input, never rewritten, with its change to the full view for
//                   the replay (`history`, shared/src/viewHistory.ts)
//   "blocked:<seq>" BlockedText, text moderation refused (moderators only)
//   "account:<seat>" the account that took the seat (#292), written with its join and never rewritten, so moderators
//                    can tell who played a seat after a rename or once the snapshot is gone. Moderators only.

interface BlockedText {
  at: number;
  by: PlayerId;
  type: "chat" | "createChannel" | "createThread" | "sharePlanet" | "shareReport";
  raw: string;
  reason: string;
}

/** Close code for a ship whose snapshot this build can't read (#384): kept for a later build, distinct from 4001. */
const UNAVAILABLE_CLOSE = 4002;

/** Zero-padded so keys list in order. */
const inputKey = (seq: number) => `input:${String(seq).padStart(9, "0")}`;

/** The record's seat-to-account entry (#292). */
const accountKey = (seat: PlayerId) => `account:${seat}`;

/** Who is taking a seat: the account, and the session (its hash) the seat token is handed to. */
export interface SeatAccount {
  accountId: string;
  sessionKey: string;
}

/** What `status` tells the matchmaker about a ship. */
export interface ShipStatus {
  aboard: number;
  seats: number;
  taken: CharacterId[];
  closesAt: number | null;
  setupId: string;
}

/** What `join` tells the matchmaker. */
export type JoinResult =
  | ({ ok: true; token: string } & ShipStatus)
  /** The rules' error code: `character_taken`, or `ship_closed` once it is full or Mush are chosen. */
  | { ok: false; error: string };

interface SeatState {
  /** The seat (`PlayerState.mind`), not the body: a Transfer moves a seat to another body (`bodyOf`). */
  playerId: PlayerId;
  /** The token it connected with, so revoking the token closes it. */
  token: string;
}

export class GameRoom extends Server<Env> {
  private game: GameState | null = null;
  /** A record with no live game (its snapshot was dropped as older than `MIN_STATE_VERSION`): never launch over it. */
  private retired = false;
  /**
   * The snapshot is kept but this build can't read it (#384): stored by a newer build (a rollback across an upgrade
   * step), or rejected by the normalizers. No game runs; connections are refused as unavailable, and the accounts
   * aboard stay aboard, so a later build that reads it lets them resume.
   */
  private unavailable = false;
  private tokens: Record<string, PlayerId> = {};
  private accounts: Record<PlayerId, string> = {};
  private aboard: Record<PlayerId, string> = {};
  private tokenSessions: Record<string, string> = {};
  private language: LobbyLanguage | null = null;
  private starts: Record<PlayerId, SeatStart> | null = null;
  /**
   * The full view after the last input recorded since this room started, which the next input's change is taken
   * from (#335). Null after a start, so the next input carries a full copy of the view as loaded.
   */
  private lastFull: FullView | null = null;
  private listed = false;
  private endedAt: number | null = null;
  /** When to try writing the finished game's entry again (`recordFinished`), and the wait after the next failure. */
  private listRetryAt: number | null = null;
  private listRetryMs = LIST_RETRY_MS;
  /** The history's copy to R2 (#336): done, when to try it again, the wait after the next failure, and one at a time. */
  private replayReady = false;
  private replayRetryAt: number | null = null;
  private replayRetryMs = REPLAY_RETRY_MS;
  private copying: Promise<void> | null = null;
  private inputs = 0;
  private rateLimited: Record<PlayerId, number> = {};
  private clockCycle = 0;
  private blocked = 0;
  private bots = new Map<PlayerId, Bot>();
  private pendingBots = new Set<PlayerId>();
  /**
   * Per bot seat woken by chat, the depth of the newest message that woke it, so its reply is stamped one deeper. Memory
   * only: not in game state, a message, a view or the record; after a restart it starts again at 0, which is harmless.
   */
  private wakes = new Map<PlayerId, { depth: number }>();
  /** Chat router calls under way (#341): bots hold back `ready` until they say whom a message wakes. */
  private routing = 0;
  /** Made by `initBots` when the game has a model bot. */
  private modelGate: ModelGate | null = null;
  /** Restored from storage before `initBots` makes the gate. */
  private modelCalls = 0;
  /** Cycles end only by End cycle, never on the clock. */
  private singlePlayer = false;
  /** How this game's config differs from `DEFAULT_CONFIG` (`resolveConfig`). */
  private overrides: ConfigOverrides = {};
  /** Asks paused bots again while model calls fail in passing (`retryPausedBots`). */
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryMs = MODEL_RETRY_MS;
  /** Counts key changes (`setModel`), so a bot whose turn spanned one is asked again with the new key. */
  private keyChanges = 0;
  /** The pause last sent to clients, so a change is sent once. */
  private sentPause: BotPause | null = null;
  /** The pre-selection launch `join` started, so a second join waits for it instead of launching again. */
  private launching: Promise<void> | null = null;
  /** Per seat, so a second device on the seat doesn't double it. */
  private limiter = new RateLimiter(10, 1000);
  /** Per seat, not per connection, so reconnecting doesn't reset it. */
  private chatLimiter = new RateLimiter(5, 10_000);
  /** Per seat, chat pages asked for (#355): chat's numbers, but apart from it, so reading back never stops you posting. */
  private pageLimiter = new RateLimiter(5, 10_000);
  /** Per seat, read count updates (#400). The client sends at most one every 5 s per tab, so this is room for a few tabs. */
  private readLimiter = new RateLimiter(6, 10_000);
  /**
   * Each seat's chat read counts (#400), all loaded in `onStart` and saved under `chatReadKey` as they rise. Keyed by
   * seat (the mind), so they follow a Transfer. Not game state: never in the snapshot, the record or a view.
   */
  private chatRead = new Map<PlayerId, ChatRead>();

  /** This build, stamped on every copy of the view in the history (#384). */
  private get build(): BuildStamp {
    return { stateVersion: STATE_VERSION, rulesVersion: this.env.RULES_VERSION ?? "dev" };
  }

  /** Cheats and End cycle (`ALLOW_CHEATS`): `npm run dev` and the test deployment, never staging or production. */
  private get cheatsAllowed(): boolean {
    return this.env.ALLOW_CHEATS === "true";
  }

  /** Local development only (`DEV_SERVER`, passed by `npm run dev`): bot fill, looser rate limits, the dev model key. Never set on a deployment. */
  private get devServer(): boolean {
    return this.env.DEV_SERVER === "true";
  }

  override async onStart(): Promise<void> {
    const stored = await this.ctx.storage.get<StoredRoom>("game");
    const version = stored?.version ?? 0;
    // Every seat's read counts (#400): at most one small entry per seat, so loaded whole, and kept in step after.
    for (const [key, read] of await this.ctx.storage.list<ChatRead>({ prefix: CHAT_READ_PREFIX })) this.chatRead.set(key.slice(CHAT_READ_PREFIX.length), read);
    if (!stored || version < MIN_STATE_VERSION) {
      // Only the snapshot goes; the record ("setup", "input:*", "blocked:*", "account:*") is kept for the replay (#167).
      if (stored) await this.ctx.storage.delete("game");
      this.retired = (await this.ctx.storage.get("setup")) !== undefined;
      return;
    }
    // Upgraded and normalized on load (#384): only known fields survive, and every action under way or queued is
    // dropped. What this build can't read is kept, never deleted: the fix is a later build that can.
    let loaded: { dropped: boolean; overrides: ConfigOverrides; game: GameState; starts: Record<PlayerId, SeatStart> | null };
    try {
      upgrade(stored, version);
      const overrides = normalizeOverrides(stored.overrides);
      loaded = {
        dropped: hasQueues(stored.game),
        overrides,
        game: normalizeGame(stored.game, overrides),
        starts: stored.starts ? normalizeSeatStarts(stored.starts) : null,
      };
    } catch (e) {
      this.unavailable = true;
      console.error(
        `UNAVAILABLE: ship ${this.name}'s snapshot (state version ${version}) can't be read by this build (state version ${STATE_VERSION}). ` +
          `Kept; connections refused until a build that reads it is deployed. ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`,
      );
      return;
    }
    const { dropped } = loaded;
    this.overrides = loaded.overrides;
    this.game = loaded.game;
    this.tokens = stored.tokens;
    this.inputs = stored.inputs;
    this.rateLimited = stored.rateLimited;
    this.clockCycle = stored.clockCycle;
    this.modelCalls = stored.modelCalls ?? 0;
    this.singlePlayer = stored.singlePlayer ?? false;
    this.accounts = stored.accounts;
    this.aboard = stored.aboard;
    this.tokenSessions = stored.tokenSessions;
    this.language = stored.language ?? null;
    this.starts = loaded.starts;
    this.listed = stored.listed;
    this.endedAt = stored.endedAt ?? null;
    // A finished game whose entry wasn't written yet: try at once.
    if (this.game.phase === "ended" && !this.listed) this.listRetryAt = Date.now();
    this.replayReady = stored.replayReady;
    // The same for its history's copy, which may have failed partway.
    if (this.game.phase === "ended" && !this.replayReady) this.replayRetryAt = Date.now();
    this.blocked = (await this.ctx.storage.list({ prefix: "blocked:" })).size;
    if (dropped) await this.recordDropped();
    this.initBots();
    this.scheduleBots();
    await this.scheduleTick();
  }

  /** Seats everyone at launch, with Mush picked at once (tests). Called once, over RPC. */
  async setup(seats: Seat[], tokens: Record<string, PlayerId>, forcedRoles?: Record<PlayerId, Role>): Promise<void> {
    if (this.game || this.retired || this.unavailable) throw new Error("Game already set up");
    await this.launch(seats, tokens, {}, forcedRoles);
  }

  /**
   * Launches a single-player game (rules: singlePlayer.ts) for one player, with 8 model bots: scripted where there is
   * no key, which is every deployment until players bring their own. Called once, over RPC, by the matchmaker.
   * Returns the player's seat token.
   */
  async setupSinglePlayer(name: string, character: CharacterId, language?: LobbyLanguage, accountId?: string): Promise<string> {
    if (this.game || this.retired || this.unavailable) throw new Error("Game already set up");
    const { seats, overrides, forcedRoles } = singlePlayerGame(name, character, crypto.getRandomValues(new Uint32Array(1))[0]!);
    const token = crypto.randomUUID();
    this.singlePlayer = true;
    this.language = language ?? null;
    // Only so the finished game is recorded under the account (#155, #332). Single player never boards: no
    // `account_ships` row, nothing in `aboard`, so it never keeps the account off a multiplayer ship.
    if (accountId !== undefined) this.accounts[SINGLE_PLAYER_HUMAN] = accountId;
    await this.launch(seats, { [token]: SINGLE_PLAYER_HUMAN }, overrides, forcedRoles);
    return token;
  }

  /**
   * The matchmaker boards a player (rules: preselection.ts). The first one launches the ship, empty and in
   * pre-selection. Returns the player's seat token, how many are aboard, and when the ship stops taking crew (server
   * ms), or null once it has (full, Mush chosen). Only the first join's setup counts: it is the ship's for good.
   * `account` is the signed-in player's (the matchmaker always gives one; tests may not), and `name` their display name.
   * `language` is the matchmaker's lobby; the first join's is the ship's.
   */
  async join(name: string, character: CharacterId, setup: Setup = STANDARD_SETUP, account?: SeatAccount, language?: LobbyLanguage): Promise<JoinResult> {
    // The matchmaker launches a new ship elsewhere.
    if (this.retired || this.unavailable) return { ok: false, error: "ship_closed" };
    if (!this.game && !this.launching) this.language = language ?? null;
    // One launch even if two joins arrive together.
    this.launching ??= this.game ? Promise.resolve() : this.launch([], {}, shipOverrides(setup));
    await this.launching;
    const game = this.game!;
    const seat: Seat = { id: `p${game.players.length}`, name, isBot: false, character };
    const token = crypto.randomUUID();
    // Saved with the join itself, so the seat never exists without its token or account.
    this.tokens[token] = seat.id;
    if (account) {
      this.accounts[seat.id] = account.accountId;
      this.aboard[seat.id] = account.accountId;
      this.tokenSessions[token] = account.sessionKey;
    }
    const error = await this.act({ type: "join", seat });
    if (error) {
      delete this.tokens[token];
      delete this.accounts[seat.id];
      delete this.aboard[seat.id];
      delete this.tokenSessions[token];
      return { ok: false, error };
    }
    if (this.devServer && this.game!.players.length === 1) setTimeout(() => void this.fillWithBots(), DEV_FILL_DELAY_MS);
    return { ok: true, token, ...this.status() };
  }

  /**
   * Dev servers only (never a deployment: multiplayer has no bots): seats a bot in every free seat, with a character
   * nobody took, `DEV_FILL_DELAY_MS` after the first join. The last one fills the ship, which chooses the Mush. All
   * are log parrots.
   */
  private async fillWithBots(): Promise<void> {
    if (!this.game?.preselection) return;
    const taken = this.takenCharacters();
    const free = CHARACTERS.map((c) => c.id).filter((id) => !taken.includes(id));
    // Characters are cosmetic, so Math.random is fine for the shuffle.
    free.sort(() => Math.random() - 0.5);
    for (const [i, character] of free.entries()) {
      // Full, or the Mush are chosen.
      if (!this.game!.preselection) break;
      // Bots are always labeled as AI to players.
      // i18n-ignore: a player name; the client marks bots as AI from isBot
      const seat: Seat = { id: `p${this.game!.players.length}`, name: `Bot ${i + 1} (AI)`, isBot: true, botKind: "logParrot", character };
      await this.act({ type: "join", seat });
    }
    this.initBots();
    this.scheduleBots();
  }

  /**
   * Resume from another device (#285): a new seat token for the account's seat, if it is still aboard (the game runs
   * and the body is alive). Otherwise `ok: false`, and the matchmaker closes its `account_ships` row: the ship ended,
   * was retired, or the player died (dying frees the account), or the row was stale. `unavailable` when this build
   * can't read the ship's snapshot (#384): the account stays aboard, and the matchmaker keeps its row.
   */
  async resume(accountId: string, sessionKey: string): Promise<{ ok: true; token: string } | { ok: false; unavailable?: true }> {
    if (this.unavailable) return { ok: false, unavailable: true };
    const seat = Object.keys(this.aboard).find((s) => this.aboard[s] === accountId && this.stillAboard(s));
    if (!seat) return { ok: false };
    const token = crypto.randomUUID();
    this.tokens[token] = seat;
    this.tokenSessions[token] = sessionKey;
    await this.persist();
    return { ok: true, token };
  }

  /**
   * The accounts still aboard, for the sweep of stale `account_ships` rows (shipSweep.ts). Throws for a ship this
   * build can't read (#384), so the sweep leaves its rows alone.
   */
  seatAccounts(): string[] {
    if (this.unavailable) throw new Error("Ship unavailable: its snapshot can't be read by this build");
    return Object.keys(this.aboard)
      .filter((s) => this.stillAboard(s))
      .map((s) => this.aboard[s]!);
  }

  /**
   * Leave ship, a developer cheat (`ALLOW_CHEATS` only): frees the seat's account in D1 so the lobby offers other
   * ships, and drops every token for the seat, closing its sockets (4001 sends the client to the lobby). The character
   * stays aboard, unplayed; nothing goes through the rules. Not a player rule: a living player can't leave a ship.
   */
  private async leaveShip(seat: PlayerId): Promise<void> {
    const accountId = this.aboard[seat];
    if (accountId) {
      try {
        await accountStoreFor(this.env).leaveShip(accountId, this.name, Date.now());
      } catch (e) {
        console.warn(`Leaving the ship failed: ${e instanceof Error ? e.message : typeof e}`);
        return;
      }
      delete this.aboard[seat];
    }
    const dropped = new Set(Object.keys(this.tokens).filter((t) => this.tokens[t] === seat));
    for (const token of dropped) {
      delete this.tokens[token];
      delete this.tokenSessions[token];
    }
    this.chatRead.delete(seat);
    await this.ctx.storage.delete(chatReadKey(seat));
    await this.persist();
    for (const conn of this.getConnections<SeatState>()) {
      if (conn.state && dropped.has(conn.state.token)) conn.close(4001, "Left the ship");
    }
  }

  /** Logging out (or signing in as someone else) on a device: its seat tokens stop working and its sockets close. The account stays aboard. */
  async revokeSession(sessionKey: string): Promise<void> {
    if (this.unavailable) return this.revokeInKept(sessionKey);
    const revoked = new Set(Object.keys(this.tokenSessions).filter((t) => this.tokenSessions[t] === sessionKey));
    if (revoked.size === 0) return;
    for (const token of revoked) {
      delete this.tokens[token];
      delete this.tokenSessions[token];
    }
    await this.persist();
    for (const conn of this.getConnections<SeatState>()) {
      if (conn.state && revoked.has(conn.state.token)) conn.close(4001, "Invalid seat token");
    }
  }

  /**
   * Logging out while this build can't read the snapshot (#384): the session's tokens go from the kept snapshot
   * itself, so they don't work again once a build that reads it is deployed. `tokens` and `tokenSessions` are plain
   * fields of the wrapper, outside what the normalizers read, so this needs no reading of the game. No socket is open.
   */
  private async revokeInKept(sessionKey: string): Promise<void> {
    const stored = await this.ctx.storage.get<StoredRoom>("game");
    if (!stored) return;
    const revoked = Object.keys(stored.tokenSessions).filter((t) => stored.tokenSessions[t] === sessionKey);
    if (revoked.length === 0) return;
    for (const token of revoked) {
      delete stored.tokens[token];
      delete stored.tokenSessions[token];
    }
    await this.ctx.storage.put("game", stored);
  }

  /** A seat whose account is still on this ship: the game runs and the seat's body is alive. */
  private stillAboard(seat: PlayerId): boolean {
    const by = this.body(seat);
    return this.game?.phase === "playing" && !!by && !!this.game.players.find((p) => p.id === by)?.alive;
  }

  /**
   * Frees accounts in D1 once they're no longer aboard: a body died (dying frees the account at once), or the game
   * ended. Idempotent. A failure is retried after the next input if there is one (a finished game takes none), and the
   * matchmaker's check on joining (`resume`) and the daily sweep close whatever is left.
   */
  private async releaseAccounts(): Promise<void> {
    const leaving = Object.keys(this.aboard).filter((s) => !this.stillAboard(s));
    if (leaving.length === 0) return;
    const store = accountStoreFor(this.env);
    const now = Date.now();
    try {
      if (this.game?.phase !== "playing") {
        await store.endShip(this.name, now);
        this.aboard = {};
        return;
      }
      for (const seat of leaving) {
        await store.leaveShip(this.aboard[seat]!, this.name, now);
        delete this.aboard[seat];
      }
    } catch (e) {
      console.warn(`Freeing accounts failed: ${e instanceof Error ? e.message : typeof e}`);
    }
  }

  /**
   * Remembers each seat's role and character the moment the Mush are chosen (at launch when there is no
   * pre-selection), for the list of finished games: alpha Mush are the ones Mush then (#155). Saved with the input.
   */
  private noteStarts(): void {
    const game = this.game;
    if (this.starts !== null || !game || game.preselection) return;
    this.starts = seatStarts(game);
  }

  /**
   * Once the game has ended, writes its entry to the list of finished games in D1 (#155), once. The write isn't
   * atomic with the room's storage, so it is idempotent; a failure is tried again from the alarm with backoff
   * (`listRetryAt`), since a finished game takes no more inputs.
   */
  private async recordFinished(): Promise<void> {
    const game = this.game;
    if (this.listed || game?.phase !== "ended") return;
    const endedAt = this.endedAt ?? Date.now();
    try {
      const setup = await this.ctx.storage.get<GameSetup>("setup");
      const entry = finishedEntry(game, {
        roomId: this.name,
        language: this.language,
        singlePlayer: this.singlePlayer,
        startedAt: setup?.launchedAt ?? endedAt,
        endedAt,
        rulesVersion: setup?.rulesVersion ?? "",
        starts: this.starts ?? {},
        accounts: this.accounts,
      });
      if (entry) await gameStoreFor(this.env).recordFinished(entry);
      this.listed = true;
      this.listRetryAt = null;
      await this.persist();
    } catch (e) {
      console.warn(`Listing the finished game failed: ${e instanceof Error ? e.message : typeof e}`);
      this.listRetryAt = Date.now() + this.listRetryMs;
      this.listRetryMs = Math.min(this.listRetryMs * 2, LIST_RETRY_MAX_MS);
    }
  }

  /**
   * Once the game has ended, copies its history to R2 (#336, replayStore.ts). `replayReady` is set only after every
   * chunk and the index are written; a failure is tried again from the alarm with backoff (`replayRetryAt`), apart
   * from the listing so neither outage holds up the other. Room storage is kept (retention is #132).
   */
  private copyReplay(): Promise<void> {
    this.copying ??= this.tryCopyReplay().finally(() => (this.copying = null));
    return this.copying;
  }

  private async tryCopyReplay(): Promise<void> {
    if (this.replayReady || this.game?.phase !== "ended") return;
    // A single-player game played without an account is never recorded (#155, #332), so nobody can ever read its replay.
    if (this.singlePlayer && this.accounts[SINGLE_PLAYER_HUMAN] === undefined) {
      this.replayReady = true;
      this.replayRetryAt = null;
      await this.persist();
      return;
    }
    try {
      const setup = await this.ctx.storage.get<GameSetup>("setup");
      if (!this.env.REPLAYS) throw new Error("no REPLAYS bucket bound");
      await copyReplay(this.ctx.storage, this.env.REPLAYS, {
        roomId: this.name,
        rulesVersion: setup?.rulesVersion ?? "",
        endedAt: this.endedAt ?? Date.now(),
        // Multiplayer cycles run on a clock (`nextCycleAt`); single player's end by End cycle. Not hidden information.
        realTime: !this.singlePlayer,
        starts: this.starts ?? {},
      });
      this.replayReady = true;
      this.replayRetryAt = null;
      await this.persist();
    } catch (e) {
      console.warn(`Copying the replay failed: ${e instanceof Error ? e.message : typeof e}`);
      this.replayRetryAt = Date.now() + this.replayRetryMs;
      this.replayRetryMs = Math.min(this.replayRetryMs * 2, REPLAY_RETRY_MAX_MS);
    }
  }

  /**
   * How full the ship is, when it stops taking crew (null once closed), and the setup it launched with (the standard
   * one if the setup it was given didn't validate, #236): lets the matchmaker catch up with a dev fill.
   */
  status(): ShipStatus {
    const seats = this.game?.config.preselection?.seats ?? 0;
    const setupId = this.game?.config.setupId ?? STANDARD_SETUP_ID;
    return { aboard: this.game?.players.length ?? 0, seats, taken: this.takenCharacters(), closesAt: this.closesAt(), setupId };
  }

  /** The characters chosen aboard (public: the picker grays them out). */
  private takenCharacters(): CharacterId[] {
    return this.game?.players.map((p) => p.character) ?? [];
  }

  /** When a ship in pre-selection reaches its deadline cycle (server ms), or null when it isn't taking crew. */
  private closesAt(): number | null {
    const game = this.game;
    const rules = game?.config.preselection;
    if (!game?.preselection || !rules || game.phase !== "playing") return null;
    return clockCycleStart(this.clockCycle + preselectionDeadline(game, rules) - game.cycle, cycleMs(this.env, game.config.cycleHours));
  }

  private async launch(seats: Seat[], tokens: Record<string, PlayerId>, overrides: ConfigOverrides, forcedRoles?: Record<PlayerId, Role>): Promise<void> {
    const now = Date.now();
    // End cycle is for testing (only where cheats are allowed, owner, 2026-10-19) and single player.
    this.overrides = this.cheatsAllowed ? { ...overrides, manualCycles: true } : overrides;
    const config = resolveConfig(this.overrides);
    this.clockCycle = clockCycle(now, cycleMs(this.env, config.cycleHours));
    const setup: GameSetup = {
      seats,
      config,
      overrides: this.overrides,
      ...(forcedRoles && { forcedRoles }),
      seed: crypto.getRandomValues(new Uint32Array(1))[0]!,
      // Its own draw, so what NPCs show from day 1 (a drone's name) says nothing of `seed` (npcs.ts).
      npcSeed: crypto.getRandomValues(new Uint32Array(1))[0]!,
      rulesVersion: this.env.RULES_VERSION,
      startCycle: cycleOfDay(this.clockCycle, config.cyclesPerDay),
      launchedAt: now,
    };
    this.game = stampEntries(startGame(setup), now);
    this.tokens = tokens;
    this.listed = false;
    this.noteStarts();
    await this.ctx.storage.put("setup", setup);
    await this.persist();
    this.initBots();
    this.scheduleBots();
    await this.scheduleTick();
  }

  override async onConnect(connection: Connection<SeatState>, ctx: ConnectionContext): Promise<void> {
    const token = new URL(ctx.request.url).searchParams.get("token");
    if (this.unavailable) {
      connection.close(UNAVAILABLE_CLOSE, "Ship unavailable");
      return;
    }
    const playerId = token ? this.tokens[token] : undefined;
    if (!this.game || !playerId) {
      // Expect a harmless "Network connection lost" in the wrangler log here:
      // partyserver echoes the client's close frame on a socket we already closed.
      connection.close(4001, "Invalid seat token");
      return;
    }
    connection.setState({ playerId, token: token! });
    this.sendView(connection, playerId);
    this.sendChatRead(connection, playerId);
    // Connecting is what counts as activity (inactivity.ts, #145).
    await this.markSeen([playerId], true);
  }

  /**
   * Tells the rules these seats are connected now (a `seen` input with the server time), so they don't go inactive.
   * With `onlyIfNews`, only seats the rules would learn something from: an inactive one, or one not seen since this
   * clock cycle began. The rules check inactivity only at cycle changes, in whole hours, so a later sighting in the same
   * cycle changes nothing, and skipping it keeps the record to about one `seen` per seat per cycle. A seat the rules
   * haven't heard of yet (just joined) starts counting at the next cycle change anyway.
   */
  private async markSeen(seats: readonly PlayerId[], onlyIfNews = false): Promise<void> {
    const game = this.game;
    if (!game) return;
    const cycleStart = this.singlePlayer ? Number.POSITIVE_INFINITY : clockCycleStart(this.clockCycle, cycleMs(this.env, game.config.cycleHours));
    const news = (p: PlayerState) => p.inactivity !== undefined || (p.lastSeenAt !== undefined && p.lastSeenAt < cycleStart);
    const players = [...new Set(seats.map((seat) => this.body(seat)))]
      .map((id) => game.players.find((p) => p.id === id))
      .filter((p): p is PlayerState => p !== undefined && (!onlyIfNews || news(p)));
    if (players.length === 0) return;
    // Only ending an inactivity changes a view (a status, maybe titles). Otherwise send nothing, so a push doesn't
    // tell everyone that somebody just came online.
    const waking = players.some((p) => p.inactivity !== undefined);
    await this.act({ type: "seen", players: players.map((p) => p.id), at: Date.now() }, undefined, waking ? undefined : null);
  }

  override async onMessage(connection: Connection<SeatState>, raw: WSMessage): Promise<void> {
    const playerId = connection.state?.playerId;
    const by = playerId && this.body(playerId);
    if (!playerId || !by || !this.game) return;
    if (!this.limiter.allow(playerId, Date.now(), this.devServer ? DEV_RATE_SCALE : 1)) {
      this.countRateLimited(playerId);
      this.send(connection, { type: "error", message: "slow_down" });
      return;
    }
    const msg = typeof raw === "string" ? parseGameMessage(raw) : null;
    if (!msg) {
      this.send(connection, { type: "error", message: "malformed_message" });
      return;
    }
    if (
      ((msg.type === "cheat" || msg.type === "roleCheat" || msg.type === "solCheat" || msg.type === "leaveShip") ||
        (msg.type === "action" && (msg.action.type === "self_disease" || msg.action.type === "self_injury" || msg.action.type === "warp_to_planet"))) &&
      !this.cheatsAllowed
    ) {
      this.send(connection, { type: "error", message: CHEATS_DISABLED });
      return;
    }
    if (msg.type === "leaveShip") {
      await this.leaveShip(playerId);
      return;
    }
    if (msg.type === "chatPage") {
      await this.sendChatPage(connection, playerId, by, msg.channel, msg.page);
      return;
    }
    // Read state (#400): stored per seat, never an input, and never answered, so a refusal, a rate limit and a count
    // that is no news look the same. Bot seats keep none.
    if (msg.type === "chatRead") {
      if (!this.readLimiter.allow(playerId, Date.now(), this.devServer ? DEV_RATE_SCALE : 1)) this.countRateLimited(playerId);
      else if (!this.isBotSeat(playerId)) await this.raiseChatRead(playerId, msg.read, connection);
      return;
    }
    if (msg.type === "setModel" || msg.type === "clearModel") {
      const error = this.setModel(playerId, msg);
      if (error) this.send(connection, { type: "error", message: error });
      return;
    }
    const error =
      msg.type === "action"
        ? await this.act({ ...msg, by, at: Date.now() })
        : msg.type === "walk"
          ? await this.act({ ...msg, by }, undefined, this.game.players.find((p) => p.id === by)?.room)
          : msg.type === "clearQueue" || msg.type === "acknowledgeTransfer" || msg.type === "cheat" || msg.type === "roleCheat" || msg.type === "solCheat"
            ? await this.act({ ...msg, by })
            : await this.social(playerId, by, msg);
    if (error) this.send(connection, { type: "error", message: error });
  }

  /**
   * An action bar ran out or a cycle boundary passed: tell the rules (queue.ts, `cycle`). Everything due happens in
   * time order, so after the room was down every missed cycle and bar happens as it would have. The alarm is set for
   * the earliest of them, so that one happens even if the alarm fires a moment early by this isolate's clock.
   */
  override async onAlarm(): Promise<void> {
    for (let first = true; this.game?.phase === "playing"; first = false) {
      const now = Date.now();
      const due = nextDue(this.game);
      const boundary = this.nextCycleAt() ?? Number.POSITIVE_INFINITY;
      const bar = due !== null && due <= boundary;
      // Single player has no clock boundary: only action bars.
      if (!bar && boundary === Number.POSITIVE_INFINITY) break;
      if (!first && (bar ? due : boundary) > now) break;
      if (bar) {
        // Never stamp the tick before the bar's end.
        const error = await this.act({ type: "tick", at: Math.max(now, due) });
        if (error) {
          console.warn(`Tick failed: ${error}`);
          break;
        }
      } else {
        this.clockCycle++;
        // Whoever is connected as the cycle ends was there for all of it.
        await this.markSeen([...this.getConnections<SeatState>()].flatMap((c) => (c.state ? [c.state.playerId] : [])));
        const error = await this.act({ type: "cycle", at: boundary });
        if (error) {
          console.warn(`Cycle failed: ${error}`);
          await this.persist();
        }
      }
    }
    if (this.listRetryAt !== null && this.listRetryAt <= Date.now()) await this.recordFinished();
    if (this.replayRetryAt !== null && this.replayRetryAt <= Date.now()) await this.copyReplay();
    await this.scheduleTick();
  }

  /** When the next cycle begins (server ms), or null in single player, where the clock doesn't change cycles. */
  private nextCycleAt(): number | null {
    return this.singlePlayer || !this.game ? null : clockCycleStart(this.clockCycle + 1, cycleMs(this.env, this.game.config.cycleHours));
  }

  /**
   * Chat, channel management and plans (`postPlan`), under the per-seat chat rate limit. Untrusted text: rate limit,
   * then moderate, then let the rules decide; a plan has no free text, so it goes straight to the rules. `playerId` is
   * the seat, `by` its body.
   */
  private async social(
    playerId: PlayerId,
    by: PlayerId,
    msg: Exclude<GameClientMessage, { type: "action" | "clearQueue" | "acknowledgeTransfer" | "walk" | "cheat" | "roleCheat" | "solCheat" | "setModel" | "clearModel" | "leaveShip" | "chatPage" | "chatRead" }>,
    /** A chat message's reply depth (`BOT_CHAT_CHAIN_DEPTH`): 0 unless a bot is replying to chat. */
    depth = 0,
  ): Promise<string | null> {
    if (!this.game) return "no_game";
    if (!this.chatLimiter.allow(playerId, Date.now(), this.devServer ? DEV_RATE_SCALE : 1)) {
      this.countRateLimited(playerId);
      return "too_many_messages";
    }
    if (msg.type !== "chat" && msg.type !== "createChannel" && msg.type !== "createThread" && msg.type !== "sharePlanet" && msg.type !== "shareReport") return this.act({ ...msg, by });
    const raw = msg.type === "chat" || msg.type === "sharePlanet" || msg.type === "shareReport" ? msg.text : (msg.name ?? "");
    // A private channel may be created without a name (it shows its day and cycle instead).
    if (msg.type === "createChannel" && !raw.trim()) return this.act({ ...msg, by, name: "" });
    // A shared planet's text is longer than a chat message (owner, 2026-10-31); a shared report's takes the same limits.
    const sharing = msg.type === "sharePlanet" || msg.type === "shareReport";
    const moderated = sharing ? moderateChat(raw, undefined, { length: MAX_SHARED_PLANET_LENGTH, lines: MAX_SHARED_PLANET_LINES }) : moderateChat(raw);
    if (!moderated.ok) {
      const blocked: BlockedText = { at: Date.now(), by: playerId, type: msg.type, raw, reason: moderated.reason };
      await this.ctx.storage.put(`blocked:${String(this.blocked++).padStart(9, "0")}`, blocked);
      // The size errors name chat's limits; a shared planet has its own.
      return sharing ? "share_text_invalid" : moderated.reason;
    }
    const input: Input =
      msg.type === "chat" || msg.type === "sharePlanet" || msg.type === "shareReport" ? { ...msg, by, text: moderated.text } : { ...msg, by, name: moderated.text };
    const error = await this.act(input, moderated.text === raw ? undefined : raw);
    if (!error && msg.type === "chat") {
      this.wakeBots(playerId, msg.channel, depth);
      // Posting reads the channel (#400): your own message is never unread, nor anything before it.
      if (!this.isBotSeat(playerId)) await this.raiseChatRead(playerId, { [msg.channel]: this.game.chatSeq[msg.channel] ?? 0 });
    }
    return error;
  }

  /**
   * A chat message was posted: the listening bots that read its channel, except its author, are candidates for a turn
   * to reply (bot-goals.md, "Waking"), unless the message is at the chain depth limit. A private channel wakes its
   * members outright; anywhere else the chat router (`router.ts`, #341) asks the model which of them, if any, it is
   * meant for. Only bots that listen (a model with a key) are candidates.
   */
  private wakeBots(author: PlayerId, channel: ChannelId, depth: number): void {
    if (!this.game || depth >= BOT_CHAT_CHAIN_DEPTH) return;
    /** Listening bots by what is public (alive, not ready): body to seat. */
    const listening = new Map<PlayerId, PlayerId>();
    /** The seats among them that really read the channel. */
    const readers = new Set<PlayerId>();
    for (const [seat, bot] of this.bots) {
      if (seat === author || !bot.listens) continue;
      const body = this.game.players.find((p) => p.id === this.body(seat));
      if (!body || !body.alive || body.ready) continue;
      listening.set(body.id, seat);
      if (readChannels(this.game, body).includes(channel)) readers.add(seat);
    }
    const message = this.game.chat.filter((m) => m.channel === channel && m.from === this.body(author)).at(-1);
    if (this.game.channels.some((c) => c.id === channel) || !message || !this.modelGate) {
      if (readers.size > 0) this.wake([...readers], depth);
      return;
    }
    // The router is offered every listening bot, not only the readers, and is asked even when none of them reads the
    // channel: who reads global chat (who carries an iTrackie) is hidden, and the router prompt goes to the player's own
    // provider. Only the Mush channel's readers are its Mush.
    const candidates = channel === MUSH_CHANNEL ? new Map([...listening].filter(([, seat]) => readers.has(seat))) : listening;
    if (candidates.size === 0) return;
    this.routing++;
    void this.route(channel, message, candidates, readers, depth);
  }

  /** Gives `seats` a turn to reply to a message of `depth`. */
  private wake(seats: readonly PlayerId[], depth: number): void {
    for (const seat of seats) if (this.bots.get(seat)?.wake?.()) this.wakes.set(seat, { depth });
    this.scheduleBots();
  }

  /**
   * One router call through the game's gate (budget, in-flight limit, timeout). No reply, or one that names nobody it
   * may wake, wakes nobody: a missed wake only delays a reply to the bot's next choice. Woken bots re-check (pruneWakes).
   */
  private async route(
    channel: ChannelId,
    message: ChatMessage,
    candidates: ReadonlyMap<PlayerId, PlayerId>,
    readers: ReadonlySet<PlayerId>,
    depth: number,
  ): Promise<void> {
    let seats: PlayerId[] = [];
    try {
      if (!this.game || !this.modelGate) return;
      const input = routerInput(this.game, channel, message, new Set(candidates.keys()));
      const reply = await this.modelGate.ask(buildRouterPrompt(input));
      // A named bot that can't read the channel isn't woken: it would only see the message it was woken for missing.
      if (reply !== null) seats = parseRouterReply(reply, input).flatMap((body) => candidates.get(body) ?? []).filter((seat) => readers.has(seat));
    } catch (e) {
      console.warn(`Chat router failed: ${e instanceof Error ? e.message : typeof e}`);
    } finally {
      this.routing--;
      // Also when it wakes nobody: bots held their ready back while it ran.
      this.wake(seats, depth);
    }
  }

  /**
   * Posts what a bot's turn wants to say, through the same path as a person's chat (rate limit, moderation, the rules'
   * checks, `isBot`). "To" someone posts in a private channel the two share alone, opening one if there is none.
   */
  private async botSay(seat: PlayerId, by: PlayerId, message: BotMessage, depth: number): Promise<void> {
    if (!this.game) return;
    let channel: ChannelId | undefined;
    if ("channel" in message) channel = message.channel;
    else {
      const pair = (c: { members: PlayerId[] }) => c.members.length === 2 && c.members.includes(by) && c.members.includes(message.to);
      channel = this.game.channels.find(pair)?.id;
      if (channel === undefined) {
        const error = await this.social(seat, by, { type: "createChannel", members: [message.to] });
        if (error) return console.warn(`Bot ${seat} couldn't open a channel: ${error}`);
        const opened = this.game.channels.filter((c) => c.createdBy === by).at(-1);
        if (!opened) return;
        // The invite was refused (they are in too many channels): leave the empty channel rather than talk to no one.
        if (!pair(opened)) {
          await this.social(seat, by, { type: "leaveChannel", channel: opened.id });
          return console.warn(`Bot ${seat} couldn't reach ${message.to} privately`);
        }
        channel = opened.id;
      }
    }
    const error = await this.social(seat, by, { type: "chat", channel, text: message.text }, depth);
    if (error) console.warn(`Bot ${seat} couldn't chat: ${error}`);
  }

  /** Rejections are counted in memory and saved with the next change, so spam doesn't cost a write each. */
  private countRateLimited(playerId: PlayerId): void {
    this.rateLimited[playerId] = (this.rateLimited[playerId] ?? 0) + 1;
  }

  /**
   * The player's own model key (BYOK, #216): single player only, from the human seat. Kept only in the gate's
   * memory, never in the game, its record, a view or a log; the dev key (if any) comes back when it's cleared.
   * Returns an error code, or null.
   */
  private setModel(playerId: PlayerId, msg: Extract<GameClientMessage, { type: "setModel" | "clearModel" }>): string | null {
    if (!this.singlePlayer || playerId !== SINGLE_PLAYER_HUMAN) return "not_single_player";
    this.gate().setCredentials(msg.type === "setModel" ? playerModelCredentials(msg.provider, msg.model, msg.apiKey) : devModelCredentials(this.env));
    this.keyChanges++;
    // Bots paused on the old key (or playing scripted without one) try the new one.
    this.scheduleBots();
    this.afterBotTurn();
    return null;
  }

  override onClose(connection: Connection<SeatState>): void {
    // The key lives only while its player is connected; the client sends it again on reconnect.
    const playerId = connection.state?.playerId;
    if (!this.singlePlayer || playerId !== SINGLE_PLAYER_HUMAN || !this.modelGate) return;
    for (const conn of this.getConnections<SeatState>()) {
      if (conn.id !== connection.id && conn.state?.playerId === playerId) return;
    }
    this.modelGate.setCredentials(devModelCredentials(this.env));
    this.keyChanges++;
    this.scheduleBots();
    this.afterBotTurn();
  }

  /**
   * The only place the game changes. Applies the input, then records it with
   * the new snapshot. Returns an error message, or null on success. With `room`, only the views of people in that
   * room are sent again (a walk changes no one else's); with null, none are.
   */
  private async act(input: Input, raw?: string, room?: string | null): Promise<string | null> {
    if (!this.game) return "no_game";
    const firstChatId = this.game.nextChatId;
    const before = this.game;
    const starts = this.starts;
    const result = applyInput(this.game, input);
    if (!result.ok) return result.error;
    // One time for the stamps and the record, so a rebuild stamps the same (rebuildGame).
    const now = Date.now();
    this.game = stampEntries(result.state, now);
    // Sealed chat pages are stored beside the snapshot, in the same write (#355, chat.ts `pushChat`).
    const outbox = takeChatOutbox(this.game);
    this.noteStarts();
    if (this.game.phase === "ended") this.endedAt ??= now;
    // The message the chat input posted: the only player message an input makes.
    const chatId = input.type === "chat" ? this.game.chat.find((m) => m.id >= firstChatId && m.from !== null)?.id : undefined;
    const full = fullViewFor(this.game, this.starts);
    const history = historyStep(this.lastFull, () => fullViewFor(before, starts), full, input.type === "cycle", this.build);
    this.lastFull = full;
    const recorded: RecordedInput = { at: now, input, ...(raw !== undefined && { raw }), ...(chatId !== undefined && { chatId }), history };
    const entries: Record<string, unknown> = { [inputKey(this.inputs++)]: recorded };
    const account = input.type === "join" ? this.accounts[input.seat.id] : undefined;
    if (input.type === "join" && account !== undefined) entries[accountKey(input.seat.id)] = account;
    for (const { channel, page, messages } of outbox.sealed) entries[chatPageKey(channel, page)] = messages;
    await this.persist(entries, outbox.dropped.flatMap(({ channel, pages }) => Array.from({ length: pages }, (_, page) => chatPageKey(channel, page))));
    if (room !== null) this.broadcastViews(room);
    if (input.type === "toggleCheckbox") this.sendChatEdit(input.channel, input.seq);
    // Saved with the next input; until then a restart only repeats an idempotent write.
    await this.releaseAccounts();
    await this.recordFinished();
    await this.copyReplay();
    this.scheduleBots();
    await this.scheduleTick();
    return null;
  }

  /**
   * Records a `dropQueues` input for the actions the load dropped (#384, docs/plans/normalize-state.md "The action queue"), so the record still rebuilds the
   * stored state. It isn't applied: `normalizeGame` has already done the same thing. It carries the view as loaded,
   * with no change, and is saved with the snapshot in one write. Nobody is told; they press again.
   */
  private async recordDropped(): Promise<void> {
    if (!this.game) return;
    const full = fullViewFor(this.game, this.starts);
    const history = historyStep(this.lastFull, () => full, full, false, this.build);
    this.lastFull = full;
    const recorded: RecordedInput = { at: Date.now(), input: { type: "dropQueues" }, history };
    await this.persist({ [inputKey(this.inputs++)]: recorded });
  }


  /** One alarm, for the earliest action bar to run out or the next cycle. An alarm survives the room being evicted from memory. */
  private async scheduleTick(): Promise<void> {
    const bar = this.game ? nextDue(this.game) : null;
    const cycle = this.game?.phase === "playing" ? this.nextCycleAt() : null;
    const due = [bar, cycle, this.listRetryAt, this.replayRetryAt].reduce<number | null>((a, b) => (a === null ? b : b === null ? a : Math.min(a, b)), null);
    if (due === null) await this.ctx.storage.deleteAlarm();
    else if ((await this.ctx.storage.getAlarm()) !== due) await this.ctx.storage.setAlarm(due);
  }

  /** The body a seat plays now (rules: mind.ts); a Transfer moves it. */
  private body(seat: PlayerId): PlayerId | undefined {
    return this.game ? bodyOf(this.game, seat) : undefined;
  }

  /** Sends every connection its view, or with `room`, only those of people in that room. */
  private broadcastViews(room?: string): void {
    for (const conn of this.getConnections<SeatState>()) {
      const playerId = conn.state?.playerId;
      if (!playerId) continue;
      const by = this.body(playerId);
      if (room === undefined || this.game?.players.find((p) => p.id === by)?.room === room) this.sendView(conn, playerId);
    }
  }

  /**
   * A checklist ticked on a message no view carries any more (two or more pages back, #355): its ticks go to every
   * connection whose body reads the channel, for a copy the client fetched. A message still in the state is in the
   * views just sent.
   */
  private sendChatEdit(channel: ChannelId, seq: number): void {
    const game = this.game;
    const mark = game?.chatMarks[chatMarkKey(channel, seq)];
    if (!game || !mark || game.chat.some((m) => m.channel === channel && m.seq === seq)) return;
    const msg: GameServerMessage = { type: "chatEdit", channel, seq, mark: { tasks: [...mark.tasks], checked: [...mark.checked] } };
    for (const conn of this.getConnections<SeatState>()) {
      const seat = conn.state?.playerId;
      const body = seat && game.players.find((p) => p.id === this.body(seat));
      if (body && readChannels(game, body).includes(channel)) this.send(conn, msg);
    }
  }

  /**
   * Answers a `chatPage` (#355): the access check (`chatPageSource`, for the body the seat plays now) comes before any
   * storage read, and `chatPageView` checks again after it. Every refusal is the same error. Not an input: nothing is
   * recorded and no view changes.
   */
  private async sendChatPage(conn: Connection, seat: PlayerId, by: PlayerId, channel: ChannelId, page: number): Promise<void> {
    if (!this.pageLimiter.allow(seat, Date.now(), this.devServer ? DEV_RATE_SCALE : 1)) {
      this.countRateLimited(seat);
      this.send(conn, { type: "error", message: "too_many_messages" });
      return;
    }
    const source = this.game ? chatPageSource(this.game, by, channel, page) : null;
    const stored = source === "stored" ? await this.ctx.storage.get<ChatMessage[]>(chatPageKey(channel, page)) : undefined;
    if (source === "stored" && !stored) console.warn(`Chat page ${chatPageKey(channel, page)} is missing from storage`);
    // The body again: a Transfer may have moved the seat while storage was read.
    const body = this.body(seat);
    const messages = this.game && body ? chatPageView(this.game, body, channel, page, stored) : null;
    this.send(conn, messages ? { type: "chatPage", channel, page, messages } : { type: "error", message: CHAT_PAGE_UNAVAILABLE });
  }

  /** A seat played by a bot (`isBot` is the mind's, so it follows a Transfer). */
  private isBotSeat(seat: PlayerId): boolean {
    return !!this.game?.players.find((p) => p.mind === seat)?.isBot;
  }

  /** The body a seat plays now. */
  private bodyState(seat: PlayerId): PlayerState | undefined {
    const by = this.body(seat);
    return by === undefined ? undefined : this.game?.players.find((p) => p.id === by);
  }

  /** Sends a seat's read counts (#400) for the channels its body reads now, to one connection: on connect, after the view. */
  private sendChatRead(conn: Connection, seat: PlayerId): void {
    const body = this.bodyState(seat);
    if (this.game && body && !this.isBotSeat(seat)) this.send(conn, { type: "chatRead", read: chatReadFor(this.game, body, this.chatRead.get(seat) ?? {}) });
  }

  /**
   * Raises a seat's read counts (#400) by `incoming` (`mergeChatRead`: only channels its body reads now, clamped, only
   * up), dropping deleted channels (`pruneChatRead`). When any rose, they are saved and sent to the seat's connections,
   * except `except` (the sender, which is never answered). Never to another seat. Synchronous up to the write, so the
   * body can't change in between.
   */
  private async raiseChatRead(seat: PlayerId, incoming: ChatRead, except?: Connection): Promise<void> {
    const body = this.bodyState(seat);
    if (!this.game || !body) return;
    const { read, raised } = mergeChatRead(this.game, body, pruneChatRead(this.game, this.chatRead.get(seat) ?? {}), incoming);
    if (Object.keys(raised).length === 0) return;
    this.chatRead.set(seat, read);
    const msg: GameServerMessage = { type: "chatRead", read: chatReadFor(this.game, body, read) };
    for (const conn of this.getConnections<SeatState>()) {
      if (conn.state?.playerId === seat && conn.id !== except?.id) this.send(conn, msg);
    }
    await this.ctx.storage.put(chatReadKey(seat), read);
  }

  /** `playerId` is the seat; it gets its current body's view. */
  private sendView(conn: Connection, playerId: PlayerId): void {
    const by = this.body(playerId);
    if (!this.game || !by) return;
    const msg: GameServerMessage = {
      type: "view",
      view: viewFor(this.game, by),
      cheatsAllowed: this.cheatsAllowed,
      now: Date.now(),
      nextCycleAt: this.nextCycleAt(),
      botsPaused: this.botsPaused(),
    };
    this.send(conn, msg);
  }

  /** A bot decides only once its last action is done, so it never fills a queue. Bots are keyed by seat, like connections. */
  private botIdle(playerId: PlayerId): boolean {
    const p = this.game?.players.find((pl) => pl.mind === playerId);
    return !!p && p.current === null && p.queue.length === 0 && legalActions(this.game!, p.id).length > 0;
  }

  private initBots(): void {
    for (const p of this.game?.players ?? []) {
      if (!p.isBot || this.bots.has(p.mind)) continue;
      const seed = (): number => crypto.getRandomValues(new Uint32Array(1))[0]!;
      this.bots.set(
        p.mind,
        p.botKind === "wander" ? new WanderBot(seed()) : p.botKind === "model" ? new ModelBot(this.gate(), seed(), undefined, undefined, this.language ?? undefined) : new LogParrotBot(),
      );
    }
  }

  /** The game's one model gate. No credentials (a deployment has none of its own) and model bots play scripted. */
  private gate(): ModelGate {
    this.modelGate ??= new ModelGate(devModelCredentials(this.env), {
      budget: MODEL_CALL_BUDGET,
      maxInFlight: MODEL_MAX_IN_FLIGHT,
      timeoutMs: MODEL_TIMEOUT_MS,
      used: this.modelCalls,
    });
    return this.modelGate;
  }

  /** Why the model bots are waiting (ModelGate.pause), or null. Only while the game is on. */
  private botsPaused(): BotPause | null {
    return this.game?.phase === "playing" ? (this.modelGate?.pause ?? null) : null;
  }

  /**
   * After a bot's turn: tells everyone when the pause changes, and while calls fail in passing, asks the paused bots
   * again after a backoff (owner, 2026-10-24, #114). A refused key or a spent budget waits for a new key or budget
   * (BYOK, #216 and #221), so it doesn't retry.
   */
  private afterBotTurn(): void {
    const pause = this.botsPaused();
    if (pause !== this.sentPause) {
      this.sentPause = pause;
      this.broadcastViews();
    }
    if (pause !== "unavailable") {
      this.retryMs = MODEL_RETRY_MS;
      return;
    }
    if (this.retryTimer !== null) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.scheduleBots();
    }, this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, MODEL_RETRY_MAX_MS);
  }

  /** Post the lines a bot wants to say in global chat, as that bot. */
  private async botChat(playerId: PlayerId, bot: Bot): Promise<void> {
    const by = this.body(playerId);
    if (!this.game || !bot.chatLines || !by) return;
    for (const text of bot.chatLines(viewFor(this.game, by))) {
      const error = await this.act({ type: "chat", channel: "global", text, by });
      if (error) console.warn(`Bot ${playerId} couldn't chat: ${error}`);
    }
  }

  /** Drops chat wakes for bots that are dead, have ended their cycle, lost their key, or have no legal actions left. */
  private pruneWakes(): void {
    if (!this.game || this.game.phase !== "playing") {
      this.wakes.clear();
      return;
    }
    for (const seat of this.wakes.keys()) {
      const p = this.game.players.find((pl) => pl.mind === seat);
      const bot = this.bots.get(seat);
      if (!p || !p.alive || p.ready || !bot?.woken || (p.current === null && p.queue.length === 0 && legalActions(this.game, p.id).length === 0)) {
        this.wakes.delete(seat);
      }
    }
  }

  /** Give every bot that can act a delayed turn. Bots see only their own view. */
  private scheduleBots(): void {
    this.pruneWakes();
    for (const [playerId, bot] of this.bots) {
      if (this.pendingBots.has(playerId)) continue;
      if (!this.game) continue;
      if (!this.botIdle(playerId) && !bot.chatLines) continue;
      this.pendingBots.add(playerId);
      setTimeout(async () => {
        // Still pending while it decides: a model call takes seconds, and the bot must not be asked twice meanwhile.
        const inputs = this.inputs;
        const keyChanges = this.keyChanges;
        const hadWake = this.wakes.has(playerId);
        try {
          if (!this.game) return;
          await this.botChat(playerId, bot);
          const by = this.body(playerId);
          if (!this.game || !by || !this.botIdle(playerId)) return;
          const wake = this.wakes.get(playerId);
          const action = await bot.decideAction(viewFor(this.game, by));
          // The wake was answered, unless another came in during the call (it replaced the entry and woke the bot again).
          if (this.wakes.get(playerId) === wake && !bot.woken) this.wakes.delete(playerId);
          // The game may have moved on during a slow decision; the rules reject a choice that is no longer legal. A
          // choice made for a body the bot no longer plays (a Transfer) is dropped, and so is what it wanted to say.
          const message = bot.takeMessage?.() ?? null;
          if (this.body(playerId) !== by) return;
          // Said before it acts: "I'll heal you", then the walk.
          if (message) await this.botSay(playerId, by, message, wake ? wake.depth + 1 : 0);
          if (!action || this.body(playerId) !== by) return;
          this.pruneWakes();
          // Waits for pending wakes, and for the router to say whether there are any.
          if (action.type === "ready" && (this.wakes.size > 0 || this.routing > 0)) return;
          const error = await this.act({ type: "action", action, by, at: Date.now() });
          if (error) {
            console.warn(`Bot ${playerId} chose an illegal action: ${error}`);
            bot.refused?.(action, error);
          }
        } catch (e) {
          // A throwing bot must not take the room down (#114); it is asked again after the next change.
          console.warn(`Bot ${playerId} failed: ${e instanceof Error ? e.message : typeof e}`);
        } finally {
          this.pendingBots.delete(playerId);
          this.pruneWakes();
          // What it did (or anything else accepted meanwhile) rescheduled the others but skipped it, being pending.
          // So did a new key, if the old one's call left it waiting, or the last chat wake finishing so ready bots can close the cycle.
          if (this.inputs !== inputs || this.keyChanges !== keyChanges || (hadWake && this.wakes.size === 0)) this.scheduleBots();
          this.afterBotTurn();
        }
      }, BOT_DELAY_MS);
    }
  }

  /**
   * Saves the snapshot, plus any record entries and chat pages, in one atomic write so they can't disagree. `deletes`
   * (a deleted private channel's pages) are issued in the same turn with no await between, so storage commits them
   * with it.
   */
  private async persist(entries: Record<string, unknown> = {}, deletes: readonly string[] = []): Promise<void> {
    if (!this.game) return;
    const { config: _, ...game } = this.game;
    const stored: StoredRoom = {
      version: STATE_VERSION,
      game,
      overrides: this.overrides,
      tokens: this.tokens,
      inputs: this.inputs,
      rateLimited: this.rateLimited,
      clockCycle: this.clockCycle,
      modelCalls: this.modelGate?.used ?? this.modelCalls,
      singlePlayer: this.singlePlayer,
      accounts: this.accounts,
      aboard: this.aboard,
      tokenSessions: this.tokenSessions,
      ...(this.language !== null && { language: this.language }),
      ...(this.starts !== null && { starts: this.starts }),
      listed: this.listed,
      ...(this.endedAt !== null && { endedAt: this.endedAt }),
      replayReady: this.replayReady,
    };
    const writes: Promise<unknown>[] = [];
    // Storage deletes at most 128 keys a call.
    for (let i = 0; i < deletes.length; i += 128) writes.push(this.ctx.storage.delete(deletes.slice(i, i + 128)));
    writes.push(this.ctx.storage.put({ ...entries, game: stored }));
    await Promise.all(writes);
  }

  private send(connection: Connection, msg: GameServerMessage): void {
    connection.send(JSON.stringify(msg));
  }
}

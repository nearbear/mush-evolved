// One authoritative game. Wraps the pure rules from @mush2/shared and sends
// each connection only the PlayerView for its own seat. Records every accepted
// input so the game can be replayed after it ends (docs/rules-design.md, "Replays").

import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import {
  applyInput,
  moderateChat,
  parseGameMessage,
  startGame,
  stampEntries,
  bodyOf,
  legalActions,
  nextDue,
  CHARACTERS,
  PRESELECTION,
  preselectionDeadline,
  resolveConfig,
  singlePlayerGame,
  SINGLE_PLAYER_HUMAN,
  viewFor,
  type CharacterId,
  type ConfigOverrides,
  type PreselectionRules,
  type GameClientMessage,
  type BotPause,
  type GameServerMessage,
  type GameSetup,
  type GameState,
  type Input,
  type RecordedInput,
  type PlayerId,
  type Role,
  type Seat,
} from "@mush2/shared";
import { LogParrotBot, ModelBot, WanderBot, type Bot } from "./bots.ts";
import { clockCycle, clockCycleStart, cycleMs, cycleOfDay } from "./cycleClock.ts";
import { devModelCredentials, ModelGate, playerModelCredentials } from "./model.ts";
import { RateLimiter } from "./rateLimit.ts";

/** Error code (not text) for a cheat input on a server that doesn't allow them. */
const CHEATS_DISABLED = "cheats_disabled";

/** Deliberate pacing so bots don't act instantly. */
const BOT_DELAY_MS = 50;

/** Dev servers wait this long after the first join before seating bots, so a second window can join as another character. */
export const DEV_FILL_DELAY_MS = 8000;

/** A dev server (`ALLOW_CHEATS`) allows this many times the usual message rate, so testing and scripted clients don't trip it. */
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

/**
 * Bump when GameState's shape changes, or ConfigOverrides' (or what resolveConfig derives from a key). Games stored
 * under another version are discarded on load (there is no migration; games are short-lived).
 */
export const STATE_VERSION = 78;

interface Stored {
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
}

// The game's record, beside the snapshot in this room's storage:
//   "setup"         GameSetup, written once
//   "input:<seq>"   RecordedInput, one per accepted input, never rewritten
//   "blocked:<seq>" BlockedText, text moderation refused (moderators only)

interface BlockedText {
  at: number;
  by: PlayerId;
  type: "chat" | "createChannel" | "createThread";
  raw: string;
  reason: string;
}

/** Zero-padded so keys list in order. */
const inputKey = (seq: number) => `input:${String(seq).padStart(9, "0")}`;

/** What `join` tells the matchmaker. */
export type JoinResult =
  | { ok: true; token: string; aboard: number; taken: CharacterId[]; closesAt: number | null }
  /** The rules' error code: `character_taken`, or `ship_closed` once it is full or Mush are chosen. */
  | { ok: false; error: string };

interface SeatState {
  /** The seat (`PlayerState.mind`), not the body: a Transfer moves a seat to another body (`bodyOf`). */
  playerId: PlayerId;
}

export class GameRoom extends Server<Env> {
  private game: GameState | null = null;
  /** A record with no live game (its snapshot was dropped for another state version): never launch over it. */
  private retired = false;
  private tokens: Record<string, PlayerId> = {};
  private inputs = 0;
  private rateLimited: Record<PlayerId, number> = {};
  private clockCycle = 0;
  private blocked = 0;
  private bots = new Map<PlayerId, Bot>();
  private pendingBots = new Set<PlayerId>();
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
  private limiter = new RateLimiter(10, 1000);
  /** Per seat, not per connection, so reconnecting doesn't reset it. */
  private chatLimiter = new RateLimiter(5, 10_000);

  /** Development flag (`ALLOW_CHEATS` in server/.dev.vars). Never set on a deployment. */
  private get cheatsAllowed(): boolean {
    return this.env.ALLOW_CHEATS === "true";
  }

  override async onStart(): Promise<void> {
    const stored = await this.ctx.storage.get<Stored>("game");
    if (stored?.version !== STATE_VERSION) {
      // Only the snapshot goes; the record ("setup", "input:*", "blocked:*") is kept for the replay (#167).
      if (stored) await this.ctx.storage.delete("game");
      this.retired = (await this.ctx.storage.get("setup")) !== undefined;
      return;
    }
    this.overrides = stored.overrides;
    this.game = { ...stored.game, config: resolveConfig(stored.overrides) };
    this.tokens = stored.tokens;
    this.inputs = stored.inputs;
    this.rateLimited = stored.rateLimited;
    this.clockCycle = stored.clockCycle;
    this.modelCalls = stored.modelCalls ?? 0;
    this.singlePlayer = stored.singlePlayer ?? false;
    this.blocked = (await this.ctx.storage.list({ prefix: "blocked:" })).size;
    this.initBots();
    this.scheduleBots();
    await this.scheduleTick();
  }

  /** Seats everyone at launch, with Mush picked at once (tests). Called once, over RPC. */
  async setup(seats: Seat[], tokens: Record<string, PlayerId>): Promise<void> {
    if (this.game || this.retired) throw new Error("Game already set up");
    await this.launch(seats, tokens, {});
  }

  /**
   * Launches a single-player game (rules: singlePlayer.ts) for one player, with 8 model bots: scripted where there is
   * no key, which is every deployment until players bring their own. Called once, over RPC, by the matchmaker.
   * Returns the player's seat token.
   */
  async setupSinglePlayer(name: string, character: CharacterId): Promise<string> {
    if (this.game || this.retired) throw new Error("Game already set up");
    const { seats, overrides, forcedRoles } = singlePlayerGame(name, character, crypto.getRandomValues(new Uint32Array(1))[0]!);
    const token = crypto.randomUUID();
    this.singlePlayer = true;
    await this.launch(seats, { [token]: SINGLE_PLAYER_HUMAN }, overrides, forcedRoles);
    return token;
  }

  /**
   * The matchmaker boards a player (rules: preselection.ts). The first one launches the ship, empty and in
   * pre-selection. Returns the player's seat token, how many are aboard, and when the ship stops taking crew (server
   * ms), or null once it has (full, Mush chosen).
   */
  async join(name: string, character: CharacterId): Promise<JoinResult> {
    // The matchmaker launches a new ship elsewhere.
    if (this.retired) return { ok: false, error: "ship_closed" };
    // One launch even if two joins arrive together.
    this.launching ??= this.game ? Promise.resolve() : this.launch([], {}, { preselection: this.shipRules() });
    await this.launching;
    const game = this.game!;
    const seat: Seat = { id: `p${game.players.length}`, name, isBot: false, character };
    const token = crypto.randomUUID();
    // Saved with the join itself, so the seat never exists without its token.
    this.tokens[token] = seat.id;
    const error = await this.act({ type: "join", seat });
    if (error) {
      delete this.tokens[token];
      return { ok: false, error };
    }
    if (this.cheatsAllowed && this.game!.players.length === 1) setTimeout(() => void this.fillWithBots(), DEV_FILL_DELAY_MS);
    return { ok: true, token, aboard: this.game!.players.length, taken: this.game!.players.map((p) => p.character), closesAt: this.closesAt() };
  }

  /** A dev server's ship seats the whole cast, so it fills (and Mush are chosen) once the bots are seated, `DEV_FILL_DELAY_MS` after the first join. */
  private shipRules(): PreselectionRules {
    return this.cheatsAllowed ? { ...PRESELECTION, seats: CHARACTERS.length } : PRESELECTION;
  }

  /**
   * Dev servers only (never a deployment: multiplayer has no bots): seats a bot for every character nobody took.
   * The last one fills the ship, which chooses the Mush. All are log parrots.
   */
  private async fillWithBots(): Promise<void> {
    if (!this.game?.preselection) return;
    const taken = this.takenCharacters();
    const free = CHARACTERS.map((c) => c.id).filter((id) => !taken.includes(id));
    // Characters are cosmetic, so Math.random is fine for the shuffle.
    free.sort(() => Math.random() - 0.5);
    for (const [i, character] of free.entries()) {
      // Bots are always labeled as AI to players.
      // i18n-ignore: a player name; the client marks bots as AI from isBot
      const seat: Seat = { id: `p${this.game!.players.length}`, name: `Bot ${i + 1} (AI)`, isBot: true, botKind: "logParrot", character };
      await this.act({ type: "join", seat });
    }
    this.initBots();
    this.scheduleBots();
  }

  /** How full the ship is and when it stops taking crew (null once closed): lets the matchmaker catch up with a dev fill. */
  status(): { aboard: number; taken: CharacterId[]; closesAt: number | null } {
    return { aboard: this.game?.players.length ?? 0, taken: this.takenCharacters(), closesAt: this.closesAt() };
  }

  /** The characters chosen aboard (public: the picker grays them out). */
  takenCharacters(): CharacterId[] {
    return this.game?.players.map((p) => p.character) ?? [];
  }

  /** When a ship in pre-selection reaches its deadline cycle (server ms), or null when it isn't taking crew. */
  private closesAt(): number | null {
    const game = this.game;
    const rules = game?.config.preselection;
    if (!game?.preselection || !rules || game.phase !== "playing") return null;
    return clockCycleStart(this.clockCycle + preselectionDeadline(game, rules) - game.cycle, cycleMs(this.env));
  }

  private async launch(seats: Seat[], tokens: Record<string, PlayerId>, overrides: ConfigOverrides, forcedRoles?: Record<PlayerId, Role>): Promise<void> {
    const now = Date.now();
    this.clockCycle = clockCycle(now, cycleMs(this.env));
    // End cycle is for testing (only where cheats are allowed, owner, 2026-10-19) and single player.
    this.overrides = this.cheatsAllowed ? { ...overrides, manualCycles: true } : overrides;
    const config = resolveConfig(this.overrides);
    const setup: GameSetup = {
      seats,
      config,
      overrides: this.overrides,
      ...(forcedRoles && { forcedRoles }),
      seed: crypto.getRandomValues(new Uint32Array(1))[0]!,
      rulesVersion: this.env.RULES_VERSION,
      startCycle: cycleOfDay(this.clockCycle, config.cyclesPerDay),
      launchedAt: now,
    };
    this.game = stampEntries(startGame(setup), now);
    this.tokens = tokens;
    await this.ctx.storage.put("setup", setup);
    await this.persist();
    this.initBots();
    this.scheduleBots();
    await this.scheduleTick();
  }

  override onConnect(connection: Connection<SeatState>, ctx: ConnectionContext): void {
    const token = new URL(ctx.request.url).searchParams.get("token");
    const playerId = token ? this.tokens[token] : undefined;
    if (!this.game || !playerId) {
      // Expect a harmless "Network connection lost" in the wrangler log here:
      // partyserver echoes the client's close frame on a socket we already closed.
      connection.close(4001, "Invalid seat token");
      return;
    }
    connection.setState({ playerId });
    this.sendView(connection, playerId);
  }

  override async onMessage(connection: Connection<SeatState>, raw: WSMessage): Promise<void> {
    const playerId = connection.state?.playerId;
    const by = playerId && this.body(playerId);
    if (!playerId || !by || !this.game) return;
    if (!this.limiter.allow(connection.id, Date.now(), this.cheatsAllowed ? DEV_RATE_SCALE : 1)) {
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
      ((msg.type === "cheat" || msg.type === "actopiCheat" || msg.type === "roleCheat") ||
        (msg.type === "action" && (msg.action.type === "self_disease" || msg.action.type === "self_injury"))) &&
      !this.cheatsAllowed
    ) {
      this.send(connection, { type: "error", message: CHEATS_DISABLED });
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
          : msg.type === "clearQueue" || msg.type === "acknowledgeTransfer" || msg.type === "cheat" || msg.type === "actopiCheat" || msg.type === "roleCheat"
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
        const error = await this.act({ type: "cycle" });
        if (error) {
          console.warn(`Cycle failed: ${error}`);
          await this.persist();
        }
      }
    }
    await this.scheduleTick();
  }

  /** When the next cycle begins (server ms), or null in single player, where the clock doesn't change cycles. */
  private nextCycleAt(): number | null {
    return this.singlePlayer ? null : clockCycleStart(this.clockCycle + 1, cycleMs(this.env));
  }

  /** Chat and channel management. Untrusted text: rate limit, then moderate, then let the rules decide. `playerId` is the seat, `by` its body. */
  private async social(
    playerId: PlayerId,
    by: PlayerId,
    msg: Exclude<GameClientMessage, { type: "action" | "clearQueue" | "acknowledgeTransfer" | "walk" | "cheat" | "actopiCheat" | "roleCheat" | "setModel" | "clearModel" }>,
  ): Promise<string | null> {
    if (!this.game) return "no_game";
    if (!this.chatLimiter.allow(playerId, Date.now(), this.cheatsAllowed ? DEV_RATE_SCALE : 1)) {
      this.countRateLimited(playerId);
      return "too_many_messages";
    }
    if (msg.type !== "chat" && msg.type !== "createChannel" && msg.type !== "createThread") return this.act({ ...msg, by });
    const raw = msg.type === "chat" ? msg.text : msg.name;
    const moderated = moderateChat(raw);
    if (!moderated.ok) {
      const blocked: BlockedText = { at: Date.now(), by: playerId, type: msg.type, raw, reason: moderated.reason };
      await this.ctx.storage.put(`blocked:${String(this.blocked++).padStart(9, "0")}`, blocked);
      return moderated.reason;
    }
    const input: Input =
      msg.type === "chat" ? { ...msg, by, text: moderated.text } : { ...msg, by, name: moderated.text };
    return this.act(input, moderated.text === raw ? undefined : raw);
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
    this.limiter.forget(connection.id);
    // The key lives only while its player is connected; the client sends it again on reconnect.
    const playerId = connection.state?.playerId;
    if (!this.singlePlayer || playerId !== SINGLE_PLAYER_HUMAN || !this.modelGate) return;
    for (const conn of this.getConnections<SeatState>()) {
      if (conn.id !== connection.id && conn.state?.playerId === playerId) return;
    }
    this.modelGate.setCredentials(devModelCredentials(this.env));
    this.keyChanges++;
    this.afterBotTurn();
  }

  /**
   * The only place the game changes. Applies the input, then records it with
   * the new snapshot. Returns an error message, or null on success. With `room`, only the views of people in that
   * room are sent again (a walk changes no one else's).
   */
  private async act(input: Input, raw?: string, room?: string): Promise<string | null> {
    if (!this.game) return "no_game";
    const result = applyInput(this.game, input);
    if (!result.ok) return result.error;
    // One time for the stamps and the record, so a rebuild stamps the same (rebuildGame).
    const now = Date.now();
    this.game = stampEntries(result.state, now);
    const recorded: RecordedInput = { at: now, input, ...(raw !== undefined && { raw }) };
    await this.persist({ [inputKey(this.inputs++)]: recorded });
    this.broadcastViews(room);
    this.scheduleBots();
    await this.scheduleTick();
    return null;
  }

  /** One alarm, for the earliest action bar to run out or the next cycle. An alarm survives the room being evicted from memory. */
  private async scheduleTick(): Promise<void> {
    const bar = this.game ? nextDue(this.game) : null;
    const cycle = this.game?.phase === "playing" ? this.nextCycleAt() : null;
    const due = bar === null ? cycle : cycle === null ? bar : Math.min(bar, cycle);
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
        p.botKind === "wander" ? new WanderBot(seed()) : p.botKind === "model" ? new ModelBot(this.gate(), new WanderBot(seed())) : new LogParrotBot(),
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

  /** Give every bot that can act a delayed turn. Bots see only their own view. */
  private scheduleBots(): void {
    for (const [playerId, bot] of this.bots) {
      if (this.pendingBots.has(playerId)) continue;
      if (!this.game) continue;
      if (!this.botIdle(playerId) && !bot.chatLines) continue;
      this.pendingBots.add(playerId);
      setTimeout(async () => {
        // Still pending while it decides: a model call takes seconds, and the bot must not be asked twice meanwhile.
        const inputs = this.inputs;
        const keyChanges = this.keyChanges;
        try {
          if (!this.game) return;
          await this.botChat(playerId, bot);
          const by = this.body(playerId);
          if (!this.game || !by || !this.botIdle(playerId)) return;
          const action = await bot.decideAction(viewFor(this.game, by));
          // The game may have moved on during a slow decision; the rules reject a choice that is no longer legal. A
          // choice made for a body the bot no longer plays (a Transfer) is dropped.
          if (!action || this.body(playerId) !== by) return;
          const error = await this.act({ type: "action", action, by, at: Date.now() });
          if (error) console.warn(`Bot ${playerId} chose an illegal action: ${error}`);
        } catch (e) {
          // A throwing bot must not take the room down (#114); it is asked again after the next change.
          console.warn(`Bot ${playerId} failed: ${e instanceof Error ? e.message : typeof e}`);
        } finally {
          this.pendingBots.delete(playerId);
          // What it did (or anything else accepted meanwhile) rescheduled the others but skipped it, being pending.
          // So did a new key, if the old one's call left it waiting.
          if (this.inputs !== inputs || this.keyChanges !== keyChanges) this.scheduleBots();
          this.afterBotTurn();
        }
      }, BOT_DELAY_MS);
    }
  }

  /** Saves the snapshot, plus any record entries, in one atomic write so they can't disagree. */
  private async persist(entries: Record<string, unknown> = {}): Promise<void> {
    if (!this.game) return;
    const { config: _, ...game } = this.game;
    const stored: Stored = {
      version: STATE_VERSION,
      game,
      overrides: this.overrides,
      tokens: this.tokens,
      inputs: this.inputs,
      rateLimited: this.rateLimited,
      clockCycle: this.clockCycle,
      modelCalls: this.modelGate?.used ?? this.modelCalls,
      singlePlayer: this.singlePlayer,
    };
    await this.ctx.storage.put({ ...entries, game: stored });
  }

  private send(connection: Connection, msg: GameServerMessage): void {
    connection.send(JSON.stringify(msg));
  }
}

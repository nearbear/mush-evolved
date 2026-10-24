// One authoritative game. Wraps the pure rules from @mush2/shared and sends
// each connection only the PlayerView for its own seat. Records every accepted
// input so the game can be replayed after it ends (docs/rules-design.md, "Replays").

import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import {
  applyInput,
  DEFAULT_CONFIG,
  moderateChat,
  parseGameMessage,
  startGame,
  legalActions,
  nextDue,
  viewFor,
  type GameClientMessage,
  type GameServerMessage,
  type GameSetup,
  type GameState,
  type Input,
  type PlayerId,
  type Seat,
} from "@mush2/shared";
import { LogParrotBot, WanderBot, type Bot } from "./bots.ts";
import { clockCycle, clockCycleStart, cycleMs, cycleOfDay } from "./cycleClock.ts";
import { RateLimiter } from "./rateLimit.ts";

/** Error code (not text) for a cheat input on a server that doesn't allow them. */
const CHEATS_DISABLED = "cheats_disabled";

/**
 * Gives the entries the rules just appended a wall-clock time. The rules are
 * pure and have no clock, so the server stamps them; the log and chat only
 * grow at the end, so walk back until we reach one already stamped.
 */
function stamp(state: GameState): GameState {
  const now = Date.now();
  for (const list of [state.log, state.chat]) {
    for (let i = list.length - 1; i >= 0 && list[i]!.at === undefined; i--) list[i]!.at = now;
  }
  return state;
}

/** Deliberate pacing so bots don't act instantly. */
const BOT_DELAY_MS = 50;

/**
 * Bump when GameState's shape changes. Games stored under another version are
 * discarded on load (there is no migration; games are short-lived).
 */
const STATE_VERSION = 60;

interface Stored {
  version?: number;
  game: GameState;
  /** Seat token -> seat id. Tokens are secrets handed out by the matchmaker. */
  tokens: Record<string, PlayerId>;
  /** How many inputs are recorded; the next one is stored at `inputKey(inputs)`. */
  inputs: number;
  /** Per seat, messages the rate limits rejected. Moderators see the count, never the messages. */
  rateLimited: Record<PlayerId, number>;
  /** The clock cycle (cycleClock.ts) the game is in. Each boundary past it becomes a `cycle` input. */
  clockCycle: number;
}

// The game's record, beside the snapshot in this room's storage:
//   "setup"         GameSetup, written once
//   "input:<seq>"   RecordedInput, one per accepted input, never rewritten
//   "blocked:<seq>" BlockedText, text moderation refused (moderators only)

interface RecordedInput {
  /** Server time it was accepted (ms). Kept out of GameState: the rules never read a clock. */
  at: number;
  input: Input;
  /** The text as typed, when moderation changed it. Moderators only. */
  raw?: string;
}

interface BlockedText {
  at: number;
  by: PlayerId;
  type: "chat" | "createChannel" | "createThread";
  raw: string;
  reason: string;
}

/** Zero-padded so keys list in order. */
const inputKey = (seq: number) => `input:${String(seq).padStart(9, "0")}`;

interface SeatState {
  playerId: PlayerId;
}

export class GameRoom extends Server<Env> {
  private game: GameState | null = null;
  private tokens: Record<string, PlayerId> = {};
  private inputs = 0;
  private rateLimited: Record<PlayerId, number> = {};
  private clockCycle = 0;
  private blocked = 0;
  private bots = new Map<PlayerId, Bot>();
  private pendingBots = new Set<PlayerId>();
  private limiter = new RateLimiter(10, 1000);
  /** Per seat, not per connection, so reconnecting doesn't reset it. */
  private chatLimiter = new RateLimiter(5, 10_000);

  /** Development flag (`ALLOW_CHEATS` in server/.dev.vars). Never set on a deployment. */
  private get cheatsAllowed(): boolean {
    return this.env.ALLOW_CHEATS === "true";
  }

  override async onStart(): Promise<void> {
    const stored = await this.ctx.storage.get<Stored>("game");
    if (!stored) return;
    if (stored.version !== STATE_VERSION) {
      await this.ctx.storage.deleteAll();
      return;
    }
    this.game = stored.game;
    this.tokens = stored.tokens;
    this.inputs = stored.inputs;
    this.rateLimited = stored.rateLimited;
    this.clockCycle = stored.clockCycle;
    this.blocked = (await this.ctx.storage.list({ prefix: "blocked:" })).size;
    this.initBots();
    this.scheduleBots();
    await this.scheduleTick();
  }

  /** Called once by the matchmaker over RPC. */
  async setup(seats: Seat[], tokens: Record<string, PlayerId>): Promise<void> {
    if (this.game) throw new Error("Game already set up");
    this.clockCycle = clockCycle(Date.now(), cycleMs(this.env));
    const setup: GameSetup = {
      seats,
      // End cycle is for testing: only where cheats are allowed (owner, 2026-10-19).
      config: { ...DEFAULT_CONFIG, manualCycles: this.cheatsAllowed },
      seed: crypto.getRandomValues(new Uint32Array(1))[0]!,
      rulesVersion: this.env.RULES_VERSION,
      startCycle: cycleOfDay(this.clockCycle, DEFAULT_CONFIG.cyclesPerDay),
    };
    this.game = stamp(startGame(setup));
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
    if (!playerId || !this.game) return;
    if (!this.limiter.allow(connection.id)) {
      this.countRateLimited(playerId);
      this.send(connection, { type: "error", message: "slow_down" });
      return;
    }
    const msg = typeof raw === "string" ? parseGameMessage(raw) : null;
    if (!msg) {
      this.send(connection, { type: "error", message: "malformed_message" });
      return;
    }
    if ((msg.type === "cheat" || msg.type === "actopiCheat" || msg.type === "roleCheat") && !this.cheatsAllowed) {
      this.send(connection, { type: "error", message: CHEATS_DISABLED });
      return;
    }
    const error =
      msg.type === "action"
        ? await this.act({ ...msg, by: playerId, at: Date.now() })
        : msg.type === "walk"
          ? await this.act({ ...msg, by: playerId }, undefined, this.game.players.find((p) => p.id === playerId)?.room)
          : msg.type === "clearQueue" || msg.type === "cheat" || msg.type === "actopiCheat" || msg.type === "roleCheat"
            ? await this.act({ ...msg, by: playerId })
            : await this.social(playerId, msg);
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
      const boundary = this.nextCycleAt();
      const bar = due !== null && due <= boundary;
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

  /** When the next cycle begins (server ms). */
  private nextCycleAt(): number {
    return clockCycleStart(this.clockCycle + 1, cycleMs(this.env));
  }

  /** Chat and channel management. Untrusted text: rate limit, then moderate, then let the rules decide. */
  private async social(playerId: PlayerId, msg: Exclude<GameClientMessage, { type: "action" | "clearQueue" | "walk" | "cheat" | "actopiCheat" | "roleCheat" }>): Promise<string | null> {
    if (!this.game) return "no_game";
    if (!this.chatLimiter.allow(playerId)) {
      this.countRateLimited(playerId);
      return "too_many_messages";
    }
    if (msg.type !== "chat" && msg.type !== "createChannel" && msg.type !== "createThread") return this.act({ ...msg, by: playerId });
    const raw = msg.type === "chat" ? msg.text : msg.name;
    const moderated = moderateChat(raw);
    if (!moderated.ok) {
      const blocked: BlockedText = { at: Date.now(), by: playerId, type: msg.type, raw, reason: moderated.reason };
      await this.ctx.storage.put(`blocked:${String(this.blocked++).padStart(9, "0")}`, blocked);
      return moderated.reason;
    }
    const input: Input =
      msg.type === "chat" ? { ...msg, by: playerId, text: moderated.text } : { ...msg, by: playerId, name: moderated.text };
    return this.act(input, moderated.text === raw ? undefined : raw);
  }

  /** Rejections are counted in memory and saved with the next change, so spam doesn't cost a write each. */
  private countRateLimited(playerId: PlayerId): void {
    this.rateLimited[playerId] = (this.rateLimited[playerId] ?? 0) + 1;
  }

  override onClose(connection: Connection): void {
    this.limiter.forget(connection.id);
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
    this.game = stamp(result.state);
    const recorded: RecordedInput = { at: Date.now(), input, ...(raw !== undefined && { raw }) };
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

  /** Sends every connection its view, or with `room`, only those of people in that room. */
  private broadcastViews(room?: string): void {
    for (const conn of this.getConnections<SeatState>()) {
      const playerId = conn.state?.playerId;
      if (!playerId) continue;
      if (room === undefined || this.game?.players.find((p) => p.id === playerId)?.room === room) this.sendView(conn, playerId);
    }
  }

  private sendView(conn: Connection, playerId: PlayerId): void {
    if (!this.game) return;
    const msg: GameServerMessage = {
      type: "view",
      view: viewFor(this.game, playerId),
      cheatsAllowed: this.cheatsAllowed,
      now: Date.now(),
      nextCycleAt: this.nextCycleAt(),
    };
    this.send(conn, msg);
  }

  /** A bot decides only once its last action is done, so it never fills a queue. */
  private botIdle(playerId: PlayerId): boolean {
    const p = this.game?.players.find((pl) => pl.id === playerId);
    return !!p && p.current === null && p.queue.length === 0 && legalActions(this.game!, playerId).length > 0;
  }

  private initBots(): void {
    for (const p of this.game?.players ?? []) {
      if (!p.isBot || this.bots.has(p.id)) continue;
      this.bots.set(
        p.id,
        p.botKind === "wander" ? new WanderBot(crypto.getRandomValues(new Uint32Array(1))[0]!) : new LogParrotBot(),
      );
    }
  }

  /** Post the lines a bot wants to say in global chat, as that bot. */
  private async botChat(playerId: PlayerId, bot: Bot): Promise<void> {
    if (!this.game || !bot.chatLines) return;
    for (const text of bot.chatLines(viewFor(this.game, playerId))) {
      const error = await this.act({ type: "chat", channel: "global", text, by: playerId });
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
        this.pendingBots.delete(playerId);
        if (!this.game) return;
        await this.botChat(playerId, bot);
        if (!this.game || !this.botIdle(playerId)) return;
        const action = await bot.decideAction(viewFor(this.game, playerId));
        if (!action) return;
        const error = await this.act({ type: "action", action, by: playerId, at: Date.now() });
        if (error) console.warn(`Bot ${playerId} chose an illegal action: ${error}`);
      }, BOT_DELAY_MS);
    }
  }

  /** Saves the snapshot, plus any record entries, in one atomic write so they can't disagree. */
  private async persist(entries: Record<string, unknown> = {}): Promise<void> {
    if (!this.game) return;
    const stored: Stored = {
      version: STATE_VERSION,
      game: this.game,
      tokens: this.tokens,
      inputs: this.inputs,
      rateLimited: this.rateLimited,
      clockCycle: this.clockCycle,
    };
    await this.ctx.storage.put({ ...entries, game: stored });
  }

  private send(connection: Connection, msg: GameServerMessage): void {
    connection.send(JSON.stringify(msg));
  }
}

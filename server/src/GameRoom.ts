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
  viewFor,
  type GameClientMessage,
  type GameServerMessage,
  type GameSetup,
  type GameState,
  type Input,
  type PlayerId,
  type Role,
  type Seat,
} from "@mush2/shared";
import { LogParrotBot, WanderBot, type Bot } from "./bots.ts";
import { RateLimiter } from "./rateLimit.ts";

/** Error code (not text) for a cheat input on a server that doesn't allow them. */
const CHEATS_DISABLED = "cheats_disabled";

/** Deliberate pacing so bots don't act instantly. */
const BOT_DELAY_MS = 50;

/**
 * Bump when GameState's shape changes. Games stored under another version are
 * discarded on load (there is no migration; games are short-lived).
 */
const STATE_VERSION = 28;

interface Stored {
  version?: number;
  game: GameState;
  /** Seat token -> seat id. Tokens are secrets handed out by the matchmaker. */
  tokens: Record<string, PlayerId>;
  /** How many inputs are recorded; the next one is stored at `inputKey(inputs)`. */
  inputs: number;
  /** Per seat, messages the rate limits rejected. Moderators see the count, never the messages. */
  rateLimited: Record<PlayerId, number>;
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
  type: "chat" | "createChannel";
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

  async onStart(): Promise<void> {
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
    this.blocked = (await this.ctx.storage.list({ prefix: "blocked:" })).size;
    this.initBots();
    this.scheduleBots();
  }

  /** Called once by the matchmaker over RPC. */
  async setup(seats: Seat[], tokens: Record<string, PlayerId>, forcedRoles?: Record<PlayerId, Role>): Promise<void> {
    if (this.game) throw new Error("Game already set up");
    const setup: GameSetup = {
      seats,
      config: DEFAULT_CONFIG,
      seed: crypto.getRandomValues(new Uint32Array(1))[0]!,
      rulesVersion: this.env.RULES_VERSION,
      ...(forcedRoles && Object.keys(forcedRoles).length > 0 ? { forcedRoles } : {}),
    };
    this.game = startGame(setup);
    this.tokens = tokens;
    await this.ctx.storage.put("setup", setup);
    await this.persist();
    this.initBots();
    this.scheduleBots();
  }

  onConnect(connection: Connection<SeatState>, ctx: ConnectionContext): void {
    const token = new URL(ctx.request.url).searchParams.get("token");
    const playerId = token ? this.tokens[token] : undefined;
    if (!this.game || !playerId) {
      // Expect a harmless "Network connection lost" in the wrangler log here:
      // partyserver echoes the client's close frame on a socket we already closed.
      connection.close(4001, "Invalid seat token");
      return;
    }
    connection.setState({ playerId });
    this.send(connection, { type: "view", view: viewFor(this.game, playerId), cheatsAllowed: this.cheatsAllowed });
  }

  async onMessage(connection: Connection<SeatState>, raw: WSMessage): Promise<void> {
    const playerId = connection.state?.playerId;
    if (!playerId || !this.game) return;
    if (!this.limiter.allow(connection.id)) {
      this.countRateLimited(playerId);
      this.send(connection, { type: "error", message: "Slow down" });
      return;
    }
    const msg = typeof raw === "string" ? parseGameMessage(raw) : null;
    if (!msg) {
      this.send(connection, { type: "error", message: "Malformed message" });
      return;
    }
    if ((msg.type === "cheat" || msg.type === "actopiCheat") && !this.cheatsAllowed) {
      this.send(connection, { type: "error", message: CHEATS_DISABLED });
      return;
    }
    const error = msg.type === "action" || msg.type === "cheat" || msg.type === "actopiCheat" ? await this.act({ ...msg, by: playerId }) : await this.social(playerId, msg);
    if (error) this.send(connection, { type: "error", message: error });
  }

  /** Chat and channel management. Untrusted text: rate limit, then moderate, then let the rules decide. */
  private async social(playerId: PlayerId, msg: Exclude<GameClientMessage, { type: "action" | "cheat" | "actopiCheat" }>): Promise<string | null> {
    if (!this.game) return "No game";
    if (!this.chatLimiter.allow(playerId)) {
      this.countRateLimited(playerId);
      return "You're sending messages too quickly";
    }
    if (msg.type !== "chat" && msg.type !== "createChannel") return this.act({ ...msg, by: playerId });
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

  onClose(connection: Connection): void {
    this.limiter.forget(connection.id);
  }

  /**
   * The only place the game changes. Applies the input, then records it with
   * the new snapshot. Returns an error message, or null on success.
   */
  private async act(input: Input, raw?: string): Promise<string | null> {
    if (!this.game) return "No game";
    const result = applyInput(this.game, input);
    if (!result.ok) return result.error;
    this.game = result.state;
    const recorded: RecordedInput = { at: Date.now(), input, ...(raw !== undefined && { raw }) };
    await this.persist({ [inputKey(this.inputs++)]: recorded });
    this.broadcastViews();
    this.scheduleBots();
    return null;
  }

  private broadcastViews(): void {
    if (!this.game) return;
    for (const conn of this.getConnections<SeatState>()) {
      const playerId = conn.state?.playerId;
      if (playerId) this.send(conn, { type: "view", view: viewFor(this.game, playerId), cheatsAllowed: this.cheatsAllowed });
    }
  }

  private initBots(): void {
    for (const p of this.game?.players ?? []) {
      if (!p.isBot || this.bots.has(p.id)) continue;
      this.bots.set(
        p.id,
        p.botKind === "logParrot" ? new LogParrotBot() : new WanderBot(crypto.getRandomValues(new Uint32Array(1))[0]!),
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
      const canAct = legalActions(this.game, playerId).length > 0;
      if (!canAct && !bot.chatLines) continue;
      this.pendingBots.add(playerId);
      setTimeout(async () => {
        this.pendingBots.delete(playerId);
        if (!this.game) return;
        await this.botChat(playerId, bot);
        if (!this.game || legalActions(this.game, playerId).length === 0) return;
        const action = await bot.decideAction(viewFor(this.game, playerId));
        const error = await this.act({ type: "action", action, by: playerId });
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
    };
    await this.ctx.storage.put({ ...entries, game: stored });
  }

  private send(connection: Connection, msg: GameServerMessage): void {
    connection.send(JSON.stringify(msg));
  }
}

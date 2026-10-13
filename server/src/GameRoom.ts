// One authoritative game. Wraps the pure rules from @mush2/shared and sends
// each connection only the PlayerView for its own seat.

import { Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import {
  applyAction,
  createGame,
  DEFAULT_CONFIG,
  moderateChat,
  parseGameMessage,
  sendChat,
  viewFor,
  type Action,
  type GameServerMessage,
  type GameState,
  type PlayerId,
  type Seat,
} from "@mush2/shared";
import { WanderBot, type Bot } from "./bots.ts";
import { RateLimiter } from "./rateLimit.ts";

/** Deliberate pacing so bots don't act instantly. */
const BOT_DELAY_MS = 1500;

/**
 * Bump when GameState's shape changes. Games stored under another version are
 * discarded on load (there is no migration; games are short-lived).
 */
const STATE_VERSION = 6;

interface Stored {
  version?: number;
  game: GameState;
  /** Seat token -> seat id. Tokens are secrets handed out by the matchmaker. */
  tokens: Record<string, PlayerId>;
}

interface SeatState {
  playerId: PlayerId;
}

export class GameRoom extends Server<Env> {
  private game: GameState | null = null;
  private tokens: Record<string, PlayerId> = {};
  private bots = new Map<PlayerId, Bot>();
  private pendingBots = new Set<PlayerId>();
  private limiter = new RateLimiter(10, 1000);
  /** Per seat, not per connection, so reconnecting doesn't reset it. */
  private chatLimiter = new RateLimiter(5, 10_000);

  async onStart(): Promise<void> {
    const stored = await this.ctx.storage.get<Stored>("game");
    if (!stored) return;
    if (stored.version !== STATE_VERSION) {
      await this.ctx.storage.deleteAll();
      return;
    }
    this.game = stored.game;
    this.tokens = stored.tokens;
    this.initBots();
    this.scheduleBots();
  }

  /** Called once by the matchmaker over RPC. */
  async setup(seats: Seat[], tokens: Record<string, PlayerId>): Promise<void> {
    if (this.game) throw new Error("Game already set up");
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]!;
    this.game = createGame(seats, DEFAULT_CONFIG, seed);
    this.tokens = tokens;
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
    this.send(connection, { type: "view", view: viewFor(this.game, playerId) });
  }

  async onMessage(connection: Connection<SeatState>, raw: WSMessage): Promise<void> {
    const playerId = connection.state?.playerId;
    if (!playerId || !this.game) return;
    if (!this.limiter.allow(connection.id)) {
      this.send(connection, { type: "error", message: "Slow down" });
      return;
    }
    const msg = typeof raw === "string" ? parseGameMessage(raw) : null;
    if (!msg) {
      this.send(connection, { type: "error", message: "Malformed message" });
      return;
    }
    const error = msg.type === "chat" ? await this.chat(playerId, msg.text) : await this.act(playerId, msg.action);
    if (error) this.send(connection, { type: "error", message: error });
  }

  /** Untrusted text: rate limit, then moderate, then let the rules decide. */
  private async chat(playerId: PlayerId, raw: string): Promise<string | null> {
    if (!this.game) return "No game";
    if (!this.chatLimiter.allow(playerId)) return "You're sending messages too quickly";
    const moderated = moderateChat(raw);
    if (!moderated.ok) return moderated.reason;
    const result = sendChat(this.game, playerId, "global", moderated.text);
    if (!result.ok) return result.error;
    this.game = result.state;
    await this.persist();
    this.broadcastViews();
    return null;
  }

  onClose(connection: Connection): void {
    this.limiter.forget(connection.id);
  }

  /** Returns an error message, or null on success. */
  private async act(playerId: PlayerId, action: Action): Promise<string | null> {
    if (!this.game) return "No game";
    const result = applyAction(this.game, playerId, action);
    if (!result.ok) return result.error;
    this.game = result.state;
    await this.persist();
    this.broadcastViews();
    this.scheduleBots();
    return null;
  }

  private broadcastViews(): void {
    if (!this.game) return;
    for (const conn of this.getConnections<SeatState>()) {
      const playerId = conn.state?.playerId;
      if (playerId) this.send(conn, { type: "view", view: viewFor(this.game, playerId) });
    }
  }

  private initBots(): void {
    for (const p of this.game?.players ?? []) {
      if (p.isBot && !this.bots.has(p.id)) {
        this.bots.set(p.id, new WanderBot(crypto.getRandomValues(new Uint32Array(1))[0]!));
      }
    }
  }

  /** Give every bot that can act a delayed turn. Bots see only their own view. */
  private scheduleBots(): void {
    for (const [playerId, bot] of this.bots) {
      if (this.pendingBots.has(playerId)) continue;
      if (!this.game || viewFor(this.game, playerId).legalActions.length === 0) continue;
      this.pendingBots.add(playerId);
      setTimeout(async () => {
        this.pendingBots.delete(playerId);
        if (!this.game) return;
        const action = await bot.decideAction(viewFor(this.game, playerId));
        const error = await this.act(playerId, action);
        if (error) console.warn(`Bot ${playerId} chose an illegal action: ${error}`);
      }, BOT_DELAY_MS);
    }
  }

  private async persist(): Promise<void> {
    if (this.game) await this.ctx.storage.put<Stored>("game", { version: STATE_VERSION, game: this.game, tokens: this.tokens });
  }

  private send(connection: Connection, msg: GameServerMessage): void {
    connection.send(JSON.stringify(msg));
  }
}

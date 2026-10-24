// Per-language coordinator (one instance per room name: "en", "fr", "es"). Holds the queue,
// runs the fill-with-bots timer, and creates game rooms. Game rooms never
// talk to each other or to the matchmaker after setup.

import { getServerByName, Server, type Connection, type WSMessage } from "partyserver";
import { CHARACTERS, LOBBY_LANGUAGES, parseMatchmakerMessage, SEAT_COUNT, type CharacterId, type MatchmakerServerMessage, type PlayerId, type Seat } from "@mush2/shared";
import { RateLimiter } from "./rateLimit.ts";

/** How long the first player waits before empty seats are filled with bots. */
const FILL_DELAY_MS = 5_000;

interface QueueState {
  name: string | null;
  character?: CharacterId;
  joinedAt: number;
}

export class Matchmaker extends Server<Env> {
  private limiter = new RateLimiter(5, 1000);

  override onConnect(connection: Connection): void {
    // Rooms are created on first connect, so refuse names that aren't a lobby language.
    if (!(LOBBY_LANGUAGES as readonly string[]).includes(this.name)) {
      connection.close(1008, "unknown_lobby");
      return;
    }
    this.send(connection, this.queueMessage());
  }

  override async onMessage(connection: Connection<QueueState>, raw: WSMessage): Promise<void> {
    if (!this.limiter.allow(connection.id)) return;
    const msg = typeof raw === "string" ? parseMatchmakerMessage(raw) : null;
    if (!msg) {
      this.send(connection, { type: "error", message: "malformed_message" });
      return;
    }
    if (connection.state?.name) return; // already queued
    // Leaving the queue releases a character, since only waiting players hold one.
    if (this.waiting().some((c) => c.state!.character === msg.character)) {
      this.send(connection, { type: "characterTaken" });
      return;
    }

    connection.setState({ name: msg.name, character: msg.character, joinedAt: Date.now() });
    const waiting = this.waiting();
    if (waiting.length >= SEAT_COUNT) {
      await this.startMatch(waiting.slice(0, SEAT_COUNT));
    } else if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + FILL_DELAY_MS);
    }
    this.broadcastQueue();
  }

  /** Fill timer fired: start with whoever is waiting and bots for the rest. */
  override async onAlarm(): Promise<void> {
    const waiting = this.waiting();
    if (waiting.length > 0) await this.startMatch(waiting.slice(0, SEAT_COUNT));
    if (this.waiting().length > 0) await this.ctx.storage.setAlarm(Date.now() + FILL_DELAY_MS);
    this.broadcastQueue();
  }

  override async onClose(connection: Connection): Promise<void> {
    this.limiter.forget(connection.id);
    if (this.waiting().length === 0) await this.ctx.storage.deleteAlarm();
    this.broadcastQueue();
  }

  private waiting(): Connection<QueueState>[] {
    return [...this.getConnections<QueueState>()]
      .filter((c) => c.state?.name)
      .sort((a, b) => a.state!.joinedAt - b.state!.joinedAt);
  }

  private async startMatch(humans: Connection<QueueState>[]): Promise<void> {
    const roomId = crypto.randomUUID();
    const seats: Seat[] = [];
    const tokens: Record<string, PlayerId> = {};
    const tokenByConnection = new Map<string, string>();
    // Bots get the characters nobody picked.
    const picked = new Set(humans.map((c) => c.state!.character!));
    const botCharacters = shuffled(CHARACTERS.map((c) => c.id).filter((id) => !picked.has(id)));

    humans.forEach((conn, i) => {
      const id = `p${i}`;
      const token = crypto.randomUUID();
      seats.push({ id, name: conn.state!.name!, isBot: false, character: conn.state!.character! });
      tokens[token] = id;
      tokenByConnection.set(conn.id, token);
    });
    // Dev servers (cheats allowed) seat every character, so the whole cast can be looked at. Not for production.
    const seatCount = this.env.ALLOW_CHEATS === "true" ? CHARACTERS.length : SEAT_COUNT;
    // Dev servers may seat model bots (MODEL_BOTS, with a key in server/.dev.vars); a deployment never does.
    const modelBots = this.env.ALLOW_CHEATS === "true" ? Math.max(0, Math.floor(Number(this.env.MODEL_BOTS)) || 0) : 0;
    for (let i = humans.length; i < seatCount; i++) {
      // Bots are always labeled as AI to players.
      // Other bots are log parrots; "wander" bots are still supported but not selected anywhere yet.
      const botKind = i - humans.length < modelBots ? "model" : "logParrot";
      // i18n-ignore: a player name; the client marks bots as AI from isBot
      seats.push({ id: `p${i}`, name: `Bot ${i - humans.length + 1} (AI)`, isBot: true, botKind, character: botCharacters[i - humans.length]! });
    }

    const room = await getServerByName(this.env.GameRoom, roomId);
    await room.setup(seats, tokens);

    for (const conn of humans) {
      conn.setState({ name: null, joinedAt: 0 });
      this.send(conn, { type: "matched", roomId, token: tokenByConnection.get(conn.id)! });
    }
  }

  private broadcastQueue(): void {
    const msg = this.queueMessage();
    for (const conn of this.getConnections()) this.send(conn, msg);
  }

  private queueMessage(): MatchmakerServerMessage {
    return { type: "queued", waiting: this.waiting().length, seats: SEAT_COUNT };
  }

  private send(connection: Connection, msg: MatchmakerServerMessage): void {
    connection.send(JSON.stringify(msg));
  }
}

/** Fisher-Yates. Characters are cosmetic, so Math.random is fine here. */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

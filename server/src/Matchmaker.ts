// Per-language coordinator (one instance per room name: "en", "fr", "es"). Joining puts a player into the language's
// open ship, which is in pre-selection (docs/rules-design.md, "Joining and Mush selection"); the first player to join
// launches a new one. Multiplayer has no bots. Game rooms never talk to each other or to the matchmaker: it asks the
// open ship to board each player (`GameRoom.join`) and learns from the answer how full it is and when it stops taking crew.
// It also launches single-player games (`GameRoom.setupSinglePlayer`), one new room per request, outside the queue.

import { getServerByName, Server, type Connection, type WSMessage } from "partyserver";
import { LOBBY_LANGUAGES, type CharacterId, parseMatchmakerMessage, PRESELECTION, type MatchmakerClientMessage, type MatchmakerServerMessage } from "@mush2/shared";
import { DEV_FILL_DELAY_MS, DEV_RATE_SCALE, type JoinResult } from "./GameRoom.ts";
import { RateLimiter } from "./rateLimit.ts";

/** The ship players join now. Gone once it is full or past its pre-selection deadline. */
interface OpenShip {
  roomId: string;
  aboard: number;
  /** Its seat count, from its own config. */
  seats: number;
  /** The characters already chosen aboard, for the picker to gray out. */
  taken: CharacterId[];
  /** Server ms when it stops taking crew (its deadline cycle begins). */
  closesAt: number;
}

interface JoinState {
  /** Set as soon as a join starts, so a second request on the same connection is ignored. */
  joined: boolean;
}

export class Matchmaker extends Server<Env> {
  private limiter = new RateLimiter(5, 1000);
  private open: OpenShip | null = null;
  /** Joins run one at a time: each waits for the open ship's answer before the next is sent. */
  private joins: Promise<void> = Promise.resolve();

  override async onStart(): Promise<void> {
    this.open = (await this.ctx.storage.get<OpenShip>("open")) ?? null;
    // A ship saved before `taken` or `seats` existed: ask it.
    if (this.open && (!this.open.taken || this.open.seats === undefined)) {
      const room = await getServerByName(this.env.GameRoom, this.open.roomId);
      const { seats, taken } = await room.status();
      this.open = { ...this.open, seats, taken };
      await this.ctx.storage.put("open", this.open);
    }
  }

  /** Asks the open ship how it is, and forgets it once it has closed (a dev server fills it with bots on its own). */
  private async refresh(): Promise<void> {
    if (!this.open) return;
    const room = await getServerByName(this.env.GameRoom, this.open.roomId);
    const status = await room.status();
    if (status.closesAt === null) await this.setOpen(null);
    else await this.setOpen({ ...this.open, aboard: status.aboard, seats: status.seats, taken: status.taken, closesAt: status.closesAt });
    this.broadcastQueue();
  }

  override async onConnect(connection: Connection): Promise<void> {
    // Rooms are created on first connect, so refuse names that aren't a lobby language.
    if (!(LOBBY_LANGUAGES as readonly string[]).includes(this.name)) {
      connection.close(1008, "unknown_lobby");
      return;
    }
    await this.refresh();
    this.send(connection, this.queueMessage());
  }

  override async onMessage(connection: Connection<JoinState>, raw: WSMessage): Promise<void> {
    if (!this.limiter.allow(connection.id, Date.now(), this.env.ALLOW_CHEATS === "true" ? DEV_RATE_SCALE : 1)) return;
    const msg = typeof raw === "string" ? parseMatchmakerMessage(raw) : null;
    if (!msg) {
      this.send(connection, { type: "error", message: "malformed_message" });
      return;
    }
    if (connection.state?.joined) return;
    connection.setState({ joined: true });
    if (msg.type === "singlePlayer") {
      await this.launchSinglePlayer(connection, msg);
      return;
    }
    const done = this.joins.then(() => this.board(connection, msg));
    this.joins = done.catch(() => {});
    await done;
  }

  /** Boards one player: on the open ship, or a newly launched one when there is none or it just closed. */
  private async board(connection: Connection<JoinState>, msg: MatchmakerClientMessage): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ship = this.openShip();
      const roomId = ship?.roomId ?? crypto.randomUUID();
      const room = await getServerByName(this.env.GameRoom, roomId);
      const result: JoinResult = await room.join(msg.name, msg.character);
      if (!result.ok && result.error === "character_taken") {
        connection.setState({ joined: false });
        this.send(connection, { type: "characterTaken" });
        return;
      }
      if (!result.ok) {
        // Closed since we last heard (its deadline passed): launch a new ship.
        await this.setOpen(null);
        continue;
      }
      await this.setOpen(result.closesAt === null ? null : { roomId, aboard: result.aboard, seats: result.seats, taken: result.taken, closesAt: result.closesAt });
      this.send(connection, { type: "matched", roomId, token: result.token });
      this.broadcastQueue();
      // A dev server seats bots shortly after the first join and closes the ship.
      if (this.env.ALLOW_CHEATS === "true") setTimeout(() => void this.refresh(), DEV_FILL_DELAY_MS + 1000);
      return;
    }
    connection.setState({ joined: false });
    this.send(connection, { type: "error", message: "join_failed" });
  }

  /** A new single-player game for this player alone. Nobody else can board it, so it never becomes the open ship. */
  private async launchSinglePlayer(connection: Connection<JoinState>, msg: MatchmakerClientMessage): Promise<void> {
    const roomId = crypto.randomUUID();
    try {
      const room = await getServerByName(this.env.GameRoom, roomId);
      const token = await room.setupSinglePlayer(msg.name, msg.character);
      this.send(connection, { type: "matched", roomId, token });
    } catch (e) {
      console.warn(`Single-player launch failed: ${e instanceof Error ? e.message : typeof e}`);
      connection.setState({ joined: false });
      this.send(connection, { type: "error", message: "join_failed" });
    }
  }

  /** The open ship's deadline passed: nobody can join it any more. */
  override async onAlarm(): Promise<void> {
    if (this.open && this.open.closesAt <= Date.now()) await this.setOpen(null);
    else if (this.open) await this.ctx.storage.setAlarm(this.open.closesAt);
    this.broadcastQueue();
  }

  override onClose(connection: Connection): void {
    this.limiter.forget(connection.id);
  }

  /** The open ship, unless its deadline has passed (the alarm may not have fired yet). */
  private openShip(): OpenShip | null {
    return this.open && this.open.closesAt > Date.now() ? this.open : null;
  }

  private async setOpen(ship: OpenShip | null): Promise<void> {
    this.open = ship;
    if (ship) {
      await this.ctx.storage.put("open", ship);
      await this.ctx.storage.setAlarm(ship.closesAt);
    } else {
      await this.ctx.storage.delete("open");
      await this.ctx.storage.deleteAlarm();
    }
  }

  private broadcastQueue(): void {
    const msg = this.queueMessage();
    for (const conn of this.getConnections()) this.send(conn, msg);
  }

  /**
   * How many are aboard the open ship and its seats; with none, 0 of the seats a new ship launches with. TODO(#236):
   * the next setup's seats once the vote picks it.
   */
  private queueMessage(): MatchmakerServerMessage {
    const ship = this.openShip();
    return { type: "queued", waiting: ship?.aboard ?? 0, seats: ship?.seats ?? PRESELECTION.seats, taken: ship?.taken ?? [] };
  }

  private send(connection: Connection, msg: MatchmakerServerMessage): void {
    connection.send(JSON.stringify(msg));
  }
}

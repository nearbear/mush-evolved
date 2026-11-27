// Per-language coordinator (one instance per room name: "en", "fr", "es"). Joining puts a player into the language's
// open ship, which is in pre-selection (docs/rules/rules-design.md, "Joining and Mush selection"); the first player to join
// launches a new one. Multiplayer has no bots. Game rooms never talk to each other or to the matchmaker: it asks the
// open ship to board each player (`GameRoom.join`) and learns from the answer how full it is and when it stops taking crew.
// Multiplayer needs an account (#285): the session cookie comes with the socket, the seat takes the account's display
// name, and D1's `account_ships` keeps every account on at most one ship across all languages' matchmakers.
// It also launches single-player games (`GameRoom.setupSinglePlayer`), one new room per request, outside the queue.
//
// Vote round (#236; setups.ts "Voting", protocol.ts for the messages). Signed-in players vote for the setup of the
// language's next ship, one vote per account. The round closes when the open ship leaves pre-selection (it fills,
// reaches its deadline, or refuses a join as closed): the winner, read from the setup store and never from a client,
// becomes `nextSetup`, which the next launch passes to `GameRoom.join`, and a new round opens at once. So the round
// open during ship N's pre-selection picks ship N+1's setup; with no ship open, the next ship's setup is already
// picked and the round under way picks the one after it.

import { getServerByName, Server, type Connection, type ConnectionContext, type WSMessage } from "partyserver";
import {
  countVotes,
  LOBBY_LANGUAGES,
  type CharacterId,
  type LobbyLanguage,
  parseMatchmakerMessage,
  type Setup,
  STANDARD_SETUP,
  STANDARD_SETUP_ID,
  tallyVotes,
  validateSetup,
  type MatchmakerClientMessage,
  type MatchmakerServerMessage,
  type VoteRefusal,
} from "@mush2/shared";
import { accountStoreFor, sha256Hex } from "./accountStore.ts";
import { sessionCookie } from "./auth.ts";
import { DEV_FILL_DELAY_MS, DEV_RATE_SCALE, type JoinResult, type SeatAccount } from "./GameRoom.ts";
import { RateLimiter } from "./rateLimit.ts";
import { setupStoreFor } from "./setupStore.ts";
import { failure, logWarn } from "./log.ts";

/** Storage keys: each account's vote is `vote:<accountId>` (one key each, so a round has no size cap). */
const VOTE_PREFIX = "vote:";
const NEXT_SETUP_KEY = "nextSetup";

/** A uniform draw in [0, 1) for a tie, from the platform's secure random source. */
const secureRandom = (): number => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;

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
  /** The setup it launched with, as the ship reports it (#236). */
  setupId: string;
}

interface JoinState {
  /** Set as soon as a join starts, so a second request on the same connection is ignored. */
  joined: boolean;
}

/** The signed-in player boarding. */
interface Boarder extends SeatAccount {
  displayName: string;
}

/** A join or single-player launch, which carries a name and a character (unlike `resume`). */
type QueueMessage = Extract<MatchmakerClientMessage, { character: CharacterId }>;

export class Matchmaker extends Server<Env> {
  private limiter = new RateLimiter(5, 1000);
  private open: OpenShip | null = null;
  /** Joins run one at a time: each waits for the open ship's answer before the next is sent. */
  private joins: Promise<void> = Promise.resolve();
  /**
   * Per connection, the hash of the session cookie it opened with (never the cookie), checked against D1 only when it
   * joins. A promise set at once on connect, so a join arriving before the hash is ready waits for it.
   */
  private sessionKeys = new Map<string, Promise<string | null>>();
  /** The round's votes: setup id by account ID. Only totals ever leave the server. */
  private votes = new Map<string, string>();
  /** The setup the next ship launched gets: the last round's winner, from the setup store. */
  private nextSetup: Setup = STANDARD_SETUP;
  /** The round being counted; a launch waits for it, so it gets the winner. Never rejects. */
  private closing: Promise<void> = Promise.resolve();
  /** Per connection, its signed-in account once known (on connect or a vote), to send `myVote` to. */
  private connAccounts = new Map<string, string>();
  /** Draws a tie's winner; tests replace it. */
  random: () => number = secureRandom;

  override async onStart(): Promise<void> {
    this.open = (await this.ctx.storage.get<OpenShip>("open")) ?? null;
    // A ship saved before `taken`, `seats` or `setupId` existed: ask it.
    if (this.open && (!this.open.taken || this.open.seats === undefined || this.open.setupId === undefined)) {
      const room = await getServerByName(this.env.GameRoom, this.open.roomId);
      const { seats, taken, setupId } = await room.status();
      this.open = { ...this.open, seats, taken, setupId };
      await this.ctx.storage.put("open", this.open);
    }
    const votes = await this.ctx.storage.list<string>({ prefix: VOTE_PREFIX });
    this.votes = new Map([...votes].map(([key, setupId]) => [key.slice(VOTE_PREFIX.length), setupId]));
    // Checked again: one stored before a rules change may no longer validate (GameRoom would fall back to the standard
    // setup anyway, but the lobby would show the wrong seat count).
    this.nextSetup = validateSetup(await this.ctx.storage.get(NEXT_SETUP_KEY)) ?? STANDARD_SETUP;
  }

  /** Asks the open ship how it is, and closes it once it has (a dev server fills it with bots on its own). */
  private async refresh(): Promise<void> {
    const ship = this.open;
    if (!ship) return;
    const room = await getServerByName(this.env.GameRoom, ship.roomId);
    const status = await room.status();
    // Closed (or replaced) while we asked: whoever did that has counted its round.
    if (this.open?.roomId !== ship.roomId) return;
    if (status.closesAt === null) await this.shipClosed();
    else {
      await this.setOpen({ ...ship, aboard: status.aboard, seats: status.seats, taken: status.taken, closesAt: status.closesAt, setupId: status.setupId });
      this.broadcastQueue();
    }
  }

  /** The open ship's room, so `npm run retire-ships` (adminRoutes.ts) retires it even if its running-ships row is missing. */
  openRoomId(): string | null {
    return this.open?.roomId ?? null;
  }

  /**
   * After `npm run retire-ships`: asks the open ship how it is, so a retired one (which reports itself closed) is
   * forgotten and its round counted now, and the lobby stops showing it. The next join launches a new ship.
   */
  async recheckOpen(): Promise<void> {
    await this.refresh();
  }

  override async onConnect(connection: Connection<JoinState>, ctx: ConnectionContext): Promise<void> {
    // Rooms are created on first connect, so refuse names that aren't a lobby language.
    if (!(LOBBY_LANGUAGES as readonly string[]).includes(this.name)) {
      connection.close(1008, "unknown_lobby");
      return;
    }
    this.send(connection, { type: "build", version: this.env.RULES_VERSION ?? "dev" });
    const cookie = sessionCookie(ctx.request, this.env);
    this.sessionKeys.set(connection.id, cookie ? sha256Hex(cookie) : Promise.resolve(null));
    await this.closeIfExpired();
    await this.refresh();
    this.send(connection, this.queueMessage());
    this.send(connection, this.votesMessage());
    if (cookie) await this.sendMyVoteOnConnect(connection);
  }

  /** The signed-in account's own vote, for a socket that just opened. A D1 failure only skips it. */
  private async sendMyVoteOnConnect(connection: Connection<JoinState>): Promise<void> {
    try {
      const voter = await this.boarder(connection);
      if (!voter) return;
      this.connAccounts.set(connection.id, voter.accountId);
      this.send(connection, { type: "myVote", setupId: this.votes.get(voter.accountId) ?? null });
    } catch (e) {
      logWarn("vote_read_failed", { language: this.name, ...failure(e) });
    }
  }

  override async onMessage(connection: Connection<JoinState>, raw: WSMessage): Promise<void> {
    if (!this.limiter.allow(connection.id, Date.now(), this.env.DEV_SERVER === "true" ? DEV_RATE_SCALE : 1)) return;
    const msg = typeof raw === "string" ? parseMatchmakerMessage(raw) : null;
    if (!msg) {
      this.send(connection, { type: "error", message: "malformed_message" });
      return;
    }
    // Before anything else, so a vote can't land in a round whose ship's deadline has passed.
    await this.closeIfExpired();
    // Voting works before and after joining: the join guard below is only for boarding.
    if (msg.type === "vote") {
      await this.vote(connection, msg.setupId);
      return;
    }
    if (connection.state?.joined) return;
    connection.setState({ joined: true });
    if (msg.type === "singlePlayer") {
      await this.launchSinglePlayer(connection, msg);
      return;
    }
    if (msg.type === "resume") {
      // Not queued behind joins: resuming never touches the open ship.
      await this.resumeOrFail(connection);
      return;
    }
    const done = this.joins.then(() => this.boardOrFail(connection, msg));
    this.joins = done.catch(() => {});
    await done;
  }

  /** `board`, but a throw (a D1 or room failure) frees the socket to try again instead of leaving it stuck joining. */
  private async boardOrFail(connection: Connection<JoinState>, msg: QueueMessage): Promise<void> {
    try {
      await this.board(connection, msg);
    } catch (e) {
      logWarn("boarding_failed", { language: this.name, ...failure(e) });
      connection.setState({ joined: false });
      this.send(connection, { type: "error", message: "join_failed" });
    }
  }

  /**
   * Back to the ship the account is aboard (#320), with no ship or character to pick: `matched`, or `not_aboard` when
   * it isn't on one (any more). A throw frees the socket to try again, as in `boardOrFail`.
   */
  private async resumeOrFail(connection: Connection<JoinState>): Promise<void> {
    try {
      const boarder = await this.boarder(connection);
      if (!boarder) {
        connection.setState({ joined: false });
        this.send(connection, { type: "error", message: "sign_in_required" });
        return;
      }
      const resumed = await this.resumeCurrent(boarder);
      if (resumed && resumed !== "unavailable") {
        this.send(connection, { type: "matched", ...resumed });
        return;
      }
      connection.setState({ joined: false });
      this.send(connection, { type: "error", message: resumed === "unavailable" ? "ship_unavailable" : "not_aboard" });
    } catch (e) {
      logWarn("resume_failed", { language: this.name, ...failure(e) });
      connection.setState({ joined: false });
      this.send(connection, { type: "error", message: "join_failed" });
    }
  }

  /**
   * The account's seat on the ship D1 says it is aboard, with a new token; null when it has no open row, or the ship
   * says it isn't aboard after all (the game ended, the ship was retired, it died, or a join half-failed), which closes
   * the row so the account is free to board another. `"unavailable"` when the ship's snapshot can't be read by this
   * build (#384): the row stays, so the account resumes once a build that reads it is deployed.
   */
  private async resumeCurrent(boarder: Boarder): Promise<{ roomId: string; token: string } | "unavailable" | null> {
    const store = accountStoreFor(this.env);
    const current = await store.currentShip(boarder.accountId);
    if (!current) return null;
    const resumed = await (await getServerByName(this.env.GameRoom, current)).resume(boarder.accountId, boarder.sessionKey);
    if (resumed.ok) return { roomId: current, token: resumed.token };
    if (resumed.unavailable) return "unavailable";
    await store.leaveShip(boarder.accountId, current, Date.now());
    return null;
  }

  /** The socket's signed-in account, or null. Looked up when joining, so a session ended since connecting is refused. */
  private async boarder(connection: Connection<JoinState>): Promise<Boarder | null> {
    const sessionKey = await this.sessionKeys.get(connection.id);
    if (!sessionKey) return null;
    const store = accountStoreFor(this.env);
    const session = await store.getSessionByKey(sessionKey, Date.now());
    const account = session && (await store.getAccount(session.accountId));
    return account && { accountId: account.id, displayName: account.displayName, sessionKey };
  }

  /**
   * Boards one signed-in player: back on the ship they're aboard (from any device), else on the open ship, or a newly
   * launched one when there is none or it just closed. `msg.name` is ignored: the seat takes the account's name.
   */
  private async board(connection: Connection<JoinState>, msg: QueueMessage): Promise<void> {
    const boarder = await this.boarder(connection);
    if (!boarder) {
      connection.setState({ joined: false });
      this.send(connection, { type: "error", message: "sign_in_required" });
      return;
    }
    const store = accountStoreFor(this.env);
    // The lobby sends `resume` for an account aboard (#320); this covers a lobby that didn't know yet.
    const resumed = await this.resumeCurrent(boarder);
    if (resumed === "unavailable") {
      connection.setState({ joined: false });
      this.send(connection, { type: "error", message: "ship_unavailable" });
      return;
    }
    if (resumed) {
      this.send(connection, { type: "matched", ...resumed });
      return;
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      // A ship past its deadline closes its round first, and a launch waits for any round being counted: the new ship
      // gets the winner.
      await this.closeIfExpired();
      await this.closing;
      const ship = this.open;
      const roomId = ship?.roomId ?? crypto.randomUUID();
      // D1 first, then the seat, undone if the seat fails: the other order could seat someone on two ships.
      if ((await store.boardShip(boarder.accountId, roomId, Date.now())) === "already_aboard") {
        // Boarded meanwhile from another tab (in any language).
        connection.setState({ joined: false });
        this.send(connection, { type: "error", message: "already_aboard" });
        return;
      }
      const room = await getServerByName(this.env.GameRoom, roomId);
      let result: JoinResult;
      try {
        // Only the launching join's setup counts; the ship reports the one it really took (`setupId`).
        result = await room.join(boarder.displayName, msg.character, this.nextSetup, boarder, this.name as LobbyLanguage);
      } catch (e) {
        await store.leaveShip(boarder.accountId, roomId, Date.now());
        throw e;
      }
      if (!result.ok) await store.unboardShip(boarder.accountId, roomId);
      if (!result.ok && result.error === "character_taken") {
        connection.setState({ joined: false });
        this.send(connection, { type: "characterTaken" });
        return;
      }
      if (!result.ok) {
        // Closed since we last heard (its deadline passed): launch a new ship. Unless an alarm or refresh closed it
        // meanwhile, its round closes now.
        if (this.open?.roomId === roomId) await this.shipClosed();
        continue;
      }
      const { aboard, seats, taken, closesAt, setupId } = result;
      // This join filled it: the open ship (or one just launched, never open) leaves pre-selection.
      if (closesAt === null) {
        if (!ship || this.open?.roomId === roomId) await this.shipClosed();
      } else await this.setOpen({ roomId, aboard, seats, taken, closesAt, setupId });
      this.send(connection, { type: "matched", roomId, token: result.token });
      this.broadcastQueue();
      // Its deadline is now the round's.
      if (!ship) this.broadcastVotes();
      // A dev server seats bots shortly after the first join and closes the ship.
      if (this.env.DEV_SERVER === "true") setTimeout(() => void this.refresh(), DEV_FILL_DELAY_MS + 1000);
      return;
    }
    connection.setState({ joined: false });
    this.send(connection, { type: "error", message: "join_failed" });
  }

  /** A new single-player game for this player alone. Nobody else can board it, so it never becomes the open ship. */
  private async launchSinglePlayer(connection: Connection<JoinState>, msg: QueueMessage): Promise<void> {
    const roomId = crypto.randomUUID();
    try {
      // Signed in or not: an account only means the finished game is recorded for its player (#155, #332), so a D1
      // failure here launches the game without one rather than refusing it.
      const boarder = await this.boarder(connection).catch(() => null);
      const room = await getServerByName(this.env.GameRoom, roomId);
      const token = await room.setupSinglePlayer(msg.name, msg.character, this.name as LobbyLanguage, boarder?.accountId);
      this.send(connection, { type: "matched", roomId, token });
    } catch (e) {
      logWarn("single_player_launch_failed", { language: this.name, ...failure(e) });
      connection.setState({ joined: false });
      this.send(connection, { type: "error", message: "join_failed" });
    }
  }

  /** The open ship's deadline passed: nobody can join it any more, and its round closes. */
  override async onAlarm(): Promise<void> {
    if (this.open && this.open.closesAt <= Date.now()) await this.shipClosed();
    else if (this.open) await this.ctx.storage.setAlarm(this.open.closesAt);
  }

  override onClose(connection: Connection): void {
    this.limiter.forget(connection.id);
    this.sessionKeys.delete(connection.id);
    this.connAccounts.delete(connection.id);
  }

  /**
   * Casts or changes the signed-in account's vote for a setup on the ballot. The account is looked up again, so a
   * session ended since connecting is refused, as for joining.
   */
  private async vote(connection: Connection<JoinState>, setupId: string): Promise<void> {
    let voter: Boarder | null;
    let onBallot: boolean;
    try {
      voter = await this.boarder(connection);
      onBallot = !voter || setupId === STANDARD_SETUP_ID || (await setupStoreFor(this.env).ballot([setupId])).length > 0;
    } catch (e) {
      logWarn("voting_failed", { language: this.name, ...failure(e) });
      this.refuseVote(connection, "vote_failed");
      return;
    }
    if (!voter) return this.refuseVote(connection, "sign_in_required");
    if (!onBallot) return this.refuseVote(connection, "unknown_setup");
    const { accountId } = voter;
    this.connAccounts.set(connection.id, accountId);
    if (this.votes.get(accountId) !== setupId) {
      // Set in memory before the write, with no await between them and a round closing (see `closeRound`).
      this.votes.set(accountId, setupId);
      await this.ctx.storage.put(VOTE_PREFIX + accountId, setupId);
      this.broadcastVotes();
    }
    this.sendMyVote(accountId);
  }

  private refuseVote(connection: Connection, reason: VoteRefusal): void {
    this.send(connection, { type: "voteRefused", reason });
  }

  /** Closes the open ship and its round if its deadline has passed, whether or not its alarm has fired yet. */
  private async closeIfExpired(): Promise<void> {
    if (this.open && this.open.closesAt <= Date.now()) await this.shipClosed();
  }

  /**
   * The open ship left pre-selection (it filled, reached its deadline, or refused a join as closed): it is forgotten
   * and its round counted. Callers check that the ship they saw close is still `open` (or was launched and never
   * opened), so a round is counted once per ship. The ship is dropped and the votes taken before anything is awaited,
   * so no other handler sees it open and a vote cast while counting goes to the new round.
   */
  private shipClosed(): Promise<void> {
    this.open = null;
    const counted = this.votes;
    this.votes = new Map();
    this.closing = this.closing
      .then(() => this.closeRound(counted))
      .catch((e: unknown) => logWarn("vote_close_failed", { language: this.name, ...failure(e) }));
    return this.closing;
  }

  /**
   * Counts a closed round: the winner, looked up in the setup store, becomes the next ship's setup. The stored
   * winner, the counted votes and the closed ship are written together with no await between them, so a restart
   * finds either the round still open (counted again) or all of it done. If the store can't be read, the next ship
   * gets the standard setup and the votes carry over to the new round, unless their account has voted again.
   */
  private async closeRound(counted: Map<string, string>): Promise<void> {
    let ballot: Setup[];
    try {
      const ids = [...new Set(counted.values())].filter((id) => id !== STANDARD_SETUP_ID);
      ballot = await setupStoreFor(this.env).ballot(ids);
    } catch (e) {
      // The next ship gets the standard setup.
      logWarn("vote_count_failed", { language: this.name, ...failure(e) });
      for (const [accountId, setupId] of counted) if (!this.votes.has(accountId)) this.votes.set(accountId, setupId);
      this.nextSetup = STANDARD_SETUP;
      await Promise.all([this.ctx.storage.put(NEXT_SETUP_KEY, STANDARD_SETUP), this.forgetOpen()]);
      this.afterRound();
      return;
    }
    const winner = tallyVotes(counted.values(), new Set(ballot.map((s) => s.id)), this.random);
    this.nextSetup = ballot.find((s) => s.id === winner) ?? STANDARD_SETUP;
    // Every counted vote's key, except an account that voted again while counting (its key holds the new vote).
    const spent = [...counted.keys()].filter((accountId) => !this.votes.has(accountId)).map((accountId) => VOTE_PREFIX + accountId);
    const writes: Promise<unknown>[] = [this.ctx.storage.put(NEXT_SETUP_KEY, this.nextSetup), this.forgetOpen()];
    // `delete` takes at most 128 keys at a time.
    for (let i = 0; i < spent.length; i += 128) writes.push(this.ctx.storage.delete(spent.slice(i, i + 128)));
    await Promise.all(writes);
    this.afterRound();
  }

  /** A new round is open: everyone hears the new counts and seat count, and each account its vote in it (if any). */
  private afterRound(): void {
    this.broadcastQueue();
    this.broadcastVotes();
    for (const conn of this.getConnections()) {
      const accountId = this.connAccounts.get(conn.id);
      if (accountId !== undefined) this.send(conn, { type: "myVote", setupId: this.votes.get(accountId) ?? null });
    }
  }

  /** The open ship, unless its deadline has passed (the alarm may not have fired yet). */
  private openShip(): OpenShip | null {
    return this.open && this.open.closesAt > Date.now() ? this.open : null;
  }

  private async setOpen(ship: OpenShip): Promise<void> {
    this.open = ship;
    await this.ctx.storage.put("open", ship);
    await this.ctx.storage.setAlarm(ship.closesAt);
  }

  /** The closed ship's storage (memory already forgot it, in `shipClosed`). Unless a new ship opened meanwhile. */
  private async forgetOpen(): Promise<void> {
    if (this.open) return;
    await Promise.all([this.ctx.storage.delete("open"), this.ctx.storage.deleteAlarm()]);
  }

  private broadcastQueue(): void {
    const msg = this.queueMessage();
    for (const conn of this.getConnections()) this.send(conn, msg);
  }

  /** How many are aboard the open ship, its seats and setup; with none, 0 of the seats the next ship launches with. */
  private queueMessage(): MatchmakerServerMessage {
    const ship = this.openShip();
    return {
      type: "queued",
      waiting: ship?.aboard ?? 0,
      seats: ship?.seats ?? this.nextSetup.knobs.seats,
      taken: ship?.taken ?? [],
      openSetupId: ship?.setupId ?? null,
    };
  }

  /** The round's totals, when it closes, and the next ship's setup once picked (no ship open). Never who voted what. */
  private votesMessage(): MatchmakerServerMessage {
    const ship = this.openShip();
    return { type: "votes", counts: countVotes(this.votes.values()), closesAt: ship?.closesAt ?? null, nextSetupId: ship ? null : this.nextSetup.id };
  }

  private broadcastVotes(): void {
    const msg = this.votesMessage();
    for (const conn of this.getConnections()) this.send(conn, msg);
  }

  /** The account's vote, to each of its connections. */
  private sendMyVote(accountId: string): void {
    const msg: MatchmakerServerMessage = { type: "myVote", setupId: this.votes.get(accountId) ?? null };
    for (const conn of this.getConnections()) if (this.connAccounts.get(conn.id) === accountId) this.send(conn, msg);
  }

  private send(connection: Connection, msg: MatchmakerServerMessage): void {
    connection.send(JSON.stringify(msg));
  }
}

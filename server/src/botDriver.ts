// Runs a game's bots for GameRoom: makes them, gives each a delayed turn, wakes them on chat, and posts what they
// decide back through the room. The room is reached only through `BotHost`, and a bot is only ever handed a view that
// `host.viewFor` built for the body its own seat plays (architecture rule 5). The driver reads the game for scheduling
// (who is idle, alive, which channels a body reads) and for the chat router's public input, never to pass to a bot.

import {
  legalActions,
  readChannels,
  MUSH_CHANNEL,
  type BotPause,
  type ChannelId,
  type ChatMessage,
  type GameState,
  type Input,
  type LobbyLanguage,
  type PlayerId,
  type PlayerView,
  type SocialMessage,
} from "@mush2/shared";
import { buildRouterPrompt, parseRouterReply, routerInput } from "./router.ts";
import { BOT_CHAT_CHAIN_DEPTH, LogParrotBot, ModelBot, WanderBot, type Bot } from "./bots.ts";
import { botMemoryKey } from "./bots/memoryStore.ts";
import type { BotMessage } from "./prompt.ts";
import { ModelGate, type ModelCredentials } from "./model.ts";
import { Backoff } from "./backoff.ts";
import { failureName, logWarn } from "./log.ts";

/** Deliberate pacing so bots don't act instantly. */
const BOT_DELAY_MS = 50;

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

/** What the driver may use of its room. Everything a bot sees comes from `viewFor`. */
export interface BotHost {
  /** For log lines. */
  roomId(): string;
  /** The game as it stands, or null. Read for scheduling and the chat router only; never handed to a bot. */
  game(): GameState | null;
  /** Inputs accepted so far, so a turn can tell whether anything changed while it ran. */
  inputs(): number;
  /** The lobby's language, for model bots' chat. */
  language(): LobbyLanguage | null;
  /** The credentials the game has with no player key: the dev key on a dev server, otherwise none. */
  defaultCredentials(): ModelCredentials | null;
  /** The body a seat plays now (a Transfer moves it). */
  body(seat: PlayerId): PlayerId | undefined;
  /** What that body's player sees: the only thing a bot is given. */
  viewFor(body: PlayerId): PlayerView;
  /** Applies and records an input, as for a player. Returns an error code, or null. */
  act(input: Input): Promise<string | null>;
  /** A social message from `seat` (body `by`), through the rate limit and moderation like a player's. */
  social(seat: PlayerId, by: PlayerId, msg: SocialMessage, depth?: number): Promise<string | null>;
  /** Sends every connection its view again. */
  broadcastViews(): void;
}

export class BotDriver {
  private bots = new Map<PlayerId, Bot>();
  private pendingBots = new Set<PlayerId>();
  /**
   * Per bot seat woken by chat, the depth of the newest message that woke it, so its reply is stamped one deeper. Memory
   * only: not in game state, a message, a view or the record; after a restart it starts again at 0, which is harmless.
   */
  private wakes = new Map<PlayerId, { depth: number }>();
  /** Chat router calls under way (#341): bots hold back `ready` until they say whom a message wakes. */
  private routing = 0;
  /** Made by `init` when the game has a model bot. */
  private modelGate: ModelGate | null = null;
  /** Restored from storage before `init` makes the gate. */
  private restoredCalls = 0;
  /** Asks paused bots again while model calls fail in passing (`afterTurn`). */
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private modelRetry = new Backoff(MODEL_RETRY_MS, MODEL_RETRY_MAX_MS);
  /** Counts key changes (`setCredentials`), so a bot whose turn spanned one is asked again with the new key. */
  private keyChanges = 0;
  /** The pause last sent to clients, so a change is sent once. */
  private sentPause: BotPause | null = null;

  constructor(private readonly host: BotHost) {}

  private get game(): GameState | null {
    return this.host.game();
  }

  /** Model calls made so far, for the snapshot, so a restart doesn't refill the budget. */
  get modelCalls(): number {
    return this.modelGate?.used ?? this.restoredCalls;
  }

  /** From the snapshot, before `init`. */
  restoreModelCalls(used: number): void {
    this.restoredCalls = used;
  }

  /** Each bot's memory to store with the game (#440), keyed `bot:<seat>`. */
  memories(): Record<string, unknown> {
    const memories: Record<string, unknown> = {};
    for (const [seat, bot] of this.bots) if (bot.snapshot) memories[botMemoryKey(seat)] = bot.snapshot();
    return memories;
  }

  /** The room is retired or reclaimed: drops every bot, wake and the gate, and stops retrying. */
  stop(): void {
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.bots.clear();
    this.pendingBots.clear();
    this.wakes.clear();
    this.modelGate = null;
  }

  /** Makes a bot for every bot seat without one; `memories` (keys `bot:<seat>`, after a restart) are given back to them (#440). */
  init(memories: ReadonlyMap<string, unknown> = new Map()): void {
    for (const p of this.game?.players ?? []) {
      if (!p.isBot || this.bots.has(p.mind)) continue;
      const seed = (): number => crypto.getRandomValues(new Uint32Array(1))[0]!;
      const bot: Bot =
        p.botKind === "wander"
          ? new WanderBot(seed())
          : p.botKind === "model"
            ? new ModelBot(this.gate(), seed(), undefined, undefined, this.host.language() ?? undefined)
            : new LogParrotBot();
      const stored = memories.get(botMemoryKey(p.mind));
      // Another version's snapshot is dropped (fresh memory); the next save overwrites it.
      if (stored !== undefined && bot.restore && !bot.restore(stored)) logWarn("bot_memory_dropped", { roomId: this.host.roomId(), seat: p.mind });
      this.bots.set(p.mind, bot);
    }
  }

  /** The game's one model gate. No credentials (a deployment has none of its own) and model bots play scripted. */
  private gate(): ModelGate {
    this.modelGate ??= new ModelGate(this.host.defaultCredentials(), {
      budget: MODEL_CALL_BUDGET,
      maxInFlight: MODEL_MAX_IN_FLIGHT,
      timeoutMs: MODEL_TIMEOUT_MS,
      used: this.restoredCalls,
    });
    return this.modelGate;
  }

  /**
   * The player's own key (BYOK, #216), or with null the default credentials again. Kept only in the gate's memory.
   * Bots paused on the old key (or playing scripted without one) try the new one.
   */
  setCredentials(credentials: ModelCredentials | null): void {
    this.gate().setCredentials(credentials ?? this.host.defaultCredentials());
    this.keyChanges++;
    this.schedule();
    this.afterTurn();
  }

  /** The player's key is gone (their last connection closed): back to the default credentials, if there is a gate. */
  dropCredentials(): void {
    if (this.modelGate) this.setCredentials(null);
  }

  /** Why the model bots are waiting (ModelGate.pause), or null. Only while the game is on. */
  paused(): BotPause | null {
    return this.game?.phase === "playing" ? (this.modelGate?.pause ?? null) : null;
  }

  /**
   * After a bot's turn: tells everyone when the pause changes, and while calls fail in passing, asks the paused bots
   * again after a backoff (owner, 2026-10-24, #114). A refused key or a spent budget waits for a new key or budget
   * (BYOK, #216 and #221), so it doesn't retry.
   */
  private afterTurn(): void {
    const pause = this.paused();
    if (pause !== this.sentPause) {
      this.sentPause = pause;
      this.host.broadcastViews();
    }
    if (pause !== "unavailable") {
      this.modelRetry.succeed();
      return;
    }
    if (this.retryTimer !== null) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.schedule();
    }, this.modelRetry.fail());
  }

  /**
   * A chat message was posted: the listening bots that read its channel, except its author, are candidates for a turn
   * to reply (bot-goals.md, "Waking"), unless the message is at the chain depth limit. A private channel wakes its
   * members outright; anywhere else the chat router (`router.ts`, #341) asks the model which of them, if any, it is
   * meant for. Only bots that listen (a model with a key) are candidates.
   */
  wakeBots(author: PlayerId, channel: ChannelId, depth: number): void {
    const game = this.game;
    if (!game || depth >= BOT_CHAT_CHAIN_DEPTH) return;
    /** Listening bots by what is public (alive, not ready): body to seat. */
    const listening = new Map<PlayerId, PlayerId>();
    /** The seats among them that really read the channel. */
    const readers = new Set<PlayerId>();
    for (const [seat, bot] of this.bots) {
      if (seat === author || !bot.listens) continue;
      const by = this.host.body(seat);
      const body = by === undefined ? undefined : game.players.find((p) => p.id === by);
      if (!body || !body.alive || body.ready) continue;
      listening.set(body.id, seat);
      if (readChannels(game, body).includes(channel)) readers.add(seat);
    }
    const message = game.chat.filter((m) => m.channel === channel && m.from === this.host.body(author)).at(-1);
    if (game.channels.some((c) => c.id === channel) || !message || !this.modelGate) {
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
    this.schedule();
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
      logWarn("chat_router_failed", { roomId: this.host.roomId(), ...failureName(e) });
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
    const roomId = this.host.roomId();
    let channel: ChannelId | undefined;
    if ("channel" in message) channel = message.channel;
    else {
      const pair = (c: { members: PlayerId[] }) => c.members.length === 2 && c.members.includes(by) && c.members.includes(message.to);
      channel = this.game.channels.find(pair)?.id;
      if (channel === undefined) {
        const error = await this.host.social(seat, by, { type: "createChannel", members: [message.to] });
        if (error) return logWarn("bot_channel_failed", { roomId, seat, code: error });
        const opened = this.game?.channels.filter((c) => c.createdBy === by).at(-1);
        if (!opened) return;
        // The invite was refused (they are in too many channels): leave the empty channel rather than talk to no one.
        if (!pair(opened)) {
          await this.host.social(seat, by, { type: "leaveChannel", channel: opened.id });
          return logWarn("bot_private_unreachable", { roomId, seat });
        }
        channel = opened.id;
      }
    }
    const error = await this.host.social(seat, by, { type: "chat", channel, text: message.text }, depth);
    if (error) logWarn("bot_chat_refused", { roomId, seat, code: error });
  }

  /** Post the lines a bot wants to say in global chat, as that bot. */
  private async botChat(playerId: PlayerId, bot: Bot): Promise<void> {
    const by = this.host.body(playerId);
    if (!this.game || !bot.chatLines || !by) return;
    for (const text of bot.chatLines(this.host.viewFor(by))) {
      const error = await this.host.act({ type: "chat", channel: "global", text, by });
      if (error) logWarn("bot_chat_refused", { roomId: this.host.roomId(), seat: playerId, code: error });
    }
  }

  /** A bot decides only once its last action is done, so it never fills a queue. Bots are keyed by seat, like connections. */
  private botIdle(playerId: PlayerId): boolean {
    const game = this.game;
    const p = game?.players.find((pl) => pl.mind === playerId);
    return !!game && !!p && p.current === null && p.queue.length === 0 && legalActions(game, p.id).length > 0;
  }

  /** Drops chat wakes for bots that are dead, have ended their cycle, lost their key, or have no legal actions left. */
  private pruneWakes(): void {
    const game = this.game;
    if (!game || game.phase !== "playing") {
      this.wakes.clear();
      return;
    }
    for (const seat of this.wakes.keys()) {
      const p = game.players.find((pl) => pl.mind === seat);
      const bot = this.bots.get(seat);
      if (!p || !p.alive || p.ready || !bot?.woken || (p.current === null && p.queue.length === 0 && legalActions(game, p.id).length === 0)) {
        this.wakes.delete(seat);
      }
    }
  }

  /** Give every bot that can act a delayed turn. Bots see only their own view. */
  schedule(): void {
    this.pruneWakes();
    for (const [playerId, bot] of this.bots) {
      if (this.pendingBots.has(playerId)) continue;
      if (!this.game) continue;
      if (!this.botIdle(playerId) && !bot.chatLines) continue;
      this.pendingBots.add(playerId);
      setTimeout(() => void this.turn(playerId, bot), BOT_DELAY_MS);
    }
  }

  /** One bot's turn: its chat lines, then its decision, posted as a player's would be. */
  private async turn(playerId: PlayerId, bot: Bot): Promise<void> {
    const roomId = this.host.roomId();
    // Still pending while it decides: a model call takes seconds, and the bot must not be asked twice meanwhile.
    const inputs = this.host.inputs();
    const keyChanges = this.keyChanges;
    const hadWake = this.wakes.has(playerId);
    try {
      if (!this.game) return;
      await this.botChat(playerId, bot);
      const by = this.host.body(playerId);
      if (!this.game || !by || !this.botIdle(playerId)) return;
      const wake = this.wakes.get(playerId);
      const action = await bot.decideAction(this.host.viewFor(by));
      // The wake was answered, unless another came in during the call (it replaced the entry and woke the bot again).
      if (this.wakes.get(playerId) === wake && !bot.woken) this.wakes.delete(playerId);
      // The game may have moved on during a slow decision; the rules reject a choice that is no longer legal. A
      // choice made for a body the bot no longer plays (a Transfer) is dropped, and so is what it wanted to say.
      const message = bot.takeMessage?.() ?? null;
      const social = bot.takeSocial?.() ?? null;
      if (this.host.body(playerId) !== by) return;
      // Said before it acts: "I'll heal you", then the walk.
      if (message) await this.botSay(playerId, by, message, wake ? wake.depth + 1 : 0);
      // A goal's message that isn't an action (sharing a planet, #417), sent like a player's; its turn has no action.
      if (social) {
        const error = await this.host.social(playerId, by, social);
        if (error) {
          logWarn("bot_social_refused", { roomId, seat: playerId, kind: social.type, code: error });
          bot.refused?.(social, error);
        }
      }
      if (!action || this.host.body(playerId) !== by) return;
      this.pruneWakes();
      // Waits for pending wakes, and for the router to say whether there are any.
      if (action.type === "ready" && (this.wakes.size > 0 || this.routing > 0)) return;
      const error = await this.host.act({ type: "action", action, by, at: Date.now() });
      if (error) {
        // The code only: the action could describe what the bot knows.
        logWarn("bot_action_illegal", { roomId, seat: playerId, code: error });
        bot.refused?.(action, error);
      }
    } catch (e) {
      // A throwing bot must not take the room down (#114); it is asked again after the next change.
      logWarn("bot_failed", { roomId, seat: playerId, ...failureName(e) });
    } finally {
      this.pendingBots.delete(playerId);
      this.pruneWakes();
      // What it did (or anything else accepted meanwhile) rescheduled the others but skipped it, being pending.
      // So did a new key, if the old one's call left it waiting, or the last chat wake finishing so ready bots can close the cycle.
      if (this.host.inputs() !== inputs || this.keyChanges !== keyChanges || this.wakes.has(playerId) || (hadWake && this.wakes.size === 0)) this.schedule();
      this.afterTurn();
    }
  }
}

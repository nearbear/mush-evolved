/**
 * The server's only log lines (#430, docs/ops/observability.md). Each is one JSON object on one line, which Workers Logs
 * stores as searchable fields. `event` is a fixed name and `fields` takes only the keys below, so game state, chat,
 * names, account IDs or tokens can't be passed by mistake: a new key is a deliberate change here, checked for leaks.
 */

export type LogEvent =
  // Matchmaker
  | "vote_read_failed"
  | "boarding_failed"
  | "resume_failed"
  | "single_player_launch_failed"
  | "voting_failed"
  | "vote_close_failed"
  | "vote_count_failed"
  // GameRoom
  | "UNAVAILABLE"
  | "setup_invalid"
  | "leave_ship_failed"
  | "free_accounts_failed"
  | "list_finished_failed"
  | "record_ship_failed"
  | "replay_copy_failed"
  | "reclaim_failed"
  | "tick_failed"
  | "cycle_failed"
  | "chat_router_failed"
  | "chat_page_missing"
  | "bot_channel_failed"
  | "bot_private_unreachable"
  | "bot_chat_refused"
  | "bot_social_refused"
  | "bot_action_illegal"
  | "bot_failed"
  | "bot_memory_dropped"
  // Other modules
  | "model_call_failed"
  | "seat_revoke_failed"
  | "sweep_ask_failed"
  | "retire_failed";

/** The keys a line may carry. Never add one that could hold game state, chat, a name, an account ID or a secret. */
export type LogFields = {
  /** The room's name (a ship's random id, or a matchmaker's language). */
  roomId?: string;
  language?: string;
  /** A seat's id: the seat itself, never what it is or plays. */
  seat?: string;
  /** An HTTP status (a model call's). */
  status?: number;
  attempt?: number;
  page?: number;
  stateVersion?: number;
  storedVersion?: number;
  /** A rule error's code (`"illegal_action"`), from `error` below only when it is a bare code. */
  code?: string;
  /** What kind of input or message (`"chat"`, `"createChannel"`), never its content. */
  kind?: string;
  /** A caught error's name. */
  errorName?: string;
  /** A caught infrastructure error's message (D1, R2, an RPC, a model call's own message). Never a rules error's. */
  message?: string;
};

type Level = "warn" | "error";

/** A rule error is a snake_case code; anything else is replaced, so free text can't reach the log through `code`. */
const CODE = /^[a-z][a-z0-9_]*$/;

function line(level: Level, event: LogEvent, fields: LogFields): string {
  const safe: LogFields = fields.code !== undefined && !CODE.test(fields.code) ? { ...fields, code: "not_a_code" } : fields;
  return JSON.stringify({ level, event, ...safe });
}

export function logWarn(event: LogEvent, fields: LogFields = {}): void {
  console.warn(line("warn", event, fields));
}

export function logError(event: LogEvent, fields: LogFields = {}): void {
  console.error(line("error", event, fields));
}

/** The name and message of an infrastructure failure (D1, R2, an RPC). Not for errors that could quote game state. */
export function failure(e: unknown): Pick<LogFields, "errorName" | "message"> {
  return e instanceof Error ? { errorName: e.name, message: e.message } : { errorName: typeof e };
}

/** Only the name: for errors whose message could carry a request or a player's text (a model call's). */
export function failureName(e: unknown): Pick<LogFields, "errorName"> {
  return { errorName: e instanceof Error ? e.name : typeof e };
}

/**
 * A snapshot that doesn't load: the message up to its first ": ". A normalizer's "Player.role unknown: …" names the
 * stored value after it, which is game state; the path before it is what the operator needs.
 */
export function snapshotFailure(e: unknown): Pick<LogFields, "errorName" | "message"> {
  return e instanceof Error ? { errorName: e.name, message: e.message.split(": ")[0] } : { errorName: typeof e };
}

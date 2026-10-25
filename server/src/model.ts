// Calls to a hosted model for model-backed bots (ModelBot in bots.ts). OpenAI-compatible chat completions, so the
// same client reaches OpenRouter, OpenAI, Gemini's compatible endpoint, or a self-hosted Triton later.
// There is no hosted default (owner, 2026-10-23): the only credentials are a development key in server/.dev.vars,
// and later the player's own key (bring your own key, single player).

import type { BotPause } from "@mush2/shared";

declare global {
  interface Env {
    /** Development only (server/.dev.vars, with ALLOW_CHEATS): an OpenAI-compatible base URL, e.g. https://openrouter.ai/api/v1. */
    MODEL_BASE_URL?: string;
    /** Development only: the model name the provider expects. */
    MODEL_NAME?: string;
    /** Development only: the API key. Never committed. */
    MODEL_API_KEY?: string;
    /** Development only: how many of a new game's bots are model bots (the rest are log parrots). Unset is none. */
    MODEL_BOTS?: string;
  }
}

export interface ModelCredentials {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface ChatTurn {
  role: "system" | "user";
  content: string;
}

/** Sends one chat completion and returns the reply's text. Throws `ModelError` on failure. */
export type Complete = (credentials: ModelCredentials, turns: ChatTurn[], signal: AbortSignal) => Promise<string>;

/** A failed call. `status` is the HTTP status, or null when there was no response (timeout, network). */
export class ModelError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
  ) {
    super(message);
  }
}

/** Replies longer than this are refused unread: a bot's answer is one line. */
const MAX_RESPONSE_BYTES = 64 * 1024;
/** Room for a short reasoning preamble before the answer line. */
const MAX_TOKENS = 400;

export const completeOpenAi: Complete = async (credentials, turns, signal) => {
  let res: Response;
  try {
    res = await fetch(`${credentials.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${credentials.apiKey}` },
      body: JSON.stringify({ model: credentials.model, messages: turns, max_tokens: MAX_TOKENS }),
      signal,
    });
  } catch {
    // The error may describe the request; keep it (and the key) out of the message.
    throw new ModelError(null, signal.aborted ? "timeout" : "network");
  }
  // Only the status: a provider's error body can echo part of the key.
  if (!res.ok) throw new ModelError(res.status, `http ${res.status}`);
  const text = await res.text();
  if (text.length > MAX_RESPONSE_BYTES) throw new ModelError(res.status, "response too large");
  let content: unknown;
  try {
    content = (JSON.parse(text) as { choices?: { message?: { content?: unknown } }[] }).choices?.[0]?.message?.content;
  } catch {
    throw new ModelError(res.status, "not json");
  }
  if (typeof content !== "string") throw new ModelError(res.status, "no content");
  return content;
};

/** The development key, only where cheats are allowed. A deployment has no model credentials of its own. */
export function devModelCredentials(env: Pick<Env, "ALLOW_CHEATS" | "MODEL_BASE_URL" | "MODEL_NAME" | "MODEL_API_KEY">): ModelCredentials | null {
  if (env.ALLOW_CHEATS !== "true" || !env.MODEL_BASE_URL || !env.MODEL_NAME || !env.MODEL_API_KEY) return null;
  return { baseUrl: env.MODEL_BASE_URL, model: env.MODEL_NAME, apiKey: env.MODEL_API_KEY };
}

export interface ModelGateOptions {
  /** Most calls one game may make, counting failed ones. A backstop against a runaway bug, not pacing. */
  budget: number;
  /** Calls under way at once in one game, so the provider doesn't rate-limit the key. Others wait their turn. */
  maxInFlight: number;
  timeoutMs: number;
  /** Calls already made (restored from storage). */
  used?: number;
  complete?: Complete;
}

/** Statuses that mean the key itself is no good (bad key, no credit, forbidden): no point calling again this game. */
const KEY_FAILURES = new Set([401, 402, 403]);

/**
 * Every model call in one game goes through its gate: the credentials, the call budget, the in-flight limit and the
 * timeout. `ask` never throws; null means no reply (no key, over budget, or the call failed), and `pause` says
 * whether that pauses the bots.
 */
export class ModelGate {
  used: number;
  /** Why the key stopped being used this game (the HTTP status), or null. For telling the player, later. */
  keyFailure: number | null = null;
  /** The last call failed in passing (timeout, network, 429, 5xx): calls are retried until one works. */
  private failing = false;
  private inFlight = 0;
  private waiting: (() => void)[] = [];
  private complete: Complete;

  constructor(
    public credentials: ModelCredentials | null,
    private options: ModelGateOptions,
  ) {
    this.used = options.used ?? 0;
    this.complete = options.complete ?? completeOpenAi;
  }

  /** Whether a call could be made now (before waiting for a slot). */
  get usable(): boolean {
    return this.credentials !== null && this.keyFailure === null && this.used < this.options.budget;
  }

  /**
   * Why bots with this gate are waiting instead of playing (owner, 2026-10-24, #114), or null. Without credentials
   * there is no pause: those bots play scripted.
   */
  get pause(): BotPause | null {
    if (this.credentials === null) return null;
    if (this.keyFailure !== null) return "key";
    if (this.used >= this.options.budget) return "budget";
    return this.failing ? "unavailable" : null;
  }

  async ask(turns: ChatTurn[]): Promise<string | null> {
    if (!this.usable) return null;
    await this.acquire();
    try {
      // Checked again: the budget or the key may have run out while this call waited.
      if (!this.usable) return null;
      this.used++;
      const reply = await this.complete(this.credentials!, turns, AbortSignal.timeout(this.options.timeoutMs));
      this.failing = false;
      return reply;
    } catch (e) {
      const status = e instanceof ModelError ? e.status : null;
      if (status !== null && KEY_FAILURES.has(status)) this.keyFailure = status;
      else this.failing = true;
      // Only our own messages, or the error's name: anything else could carry the request.
      console.warn(`Model call failed: ${e instanceof ModelError ? e.message : e instanceof Error ? e.name : typeof e}`);
      return null;
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.inFlight < this.options.maxInFlight) {
      this.inFlight++;
      return;
    }
    // release() hands its slot straight to the next waiter, so inFlight stays counted.
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.inFlight--;
  }
}

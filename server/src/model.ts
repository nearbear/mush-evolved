// Calls to a hosted model for model-backed bots (ModelBot in bots.ts). OpenAI-compatible chat completions, so the
// same client reaches OpenRouter, OpenAI, Gemini's compatible endpoint, or a self-hosted Triton later.
// There is no hosted default (owner, 2026-10-23): the only credentials are a development key in server/.dev.vars,
// and the player's own key in single player (bring your own key, #216).

import type { BotPause, ModelProvider } from "@mush2/shared";
import { failureName, logWarn } from "./log.ts";

declare global {
  interface Env {
    /** Development only (server/.dev.vars, used with DEV_SERVER): an OpenAI-compatible base URL, e.g. https://openrouter.ai/api/v1. */
    MODEL_BASE_URL?: string;
    /** Development only: the model name the provider expects. */
    MODEL_NAME?: string;
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
  let json: { choices?: { message?: { content?: unknown } }[]; error?: { code?: unknown } };
  try {
    json = JSON.parse(text);
  } catch {
    throw new ModelError(res.status, "not json");
  }
  // OpenRouter reports a provider failing mid-request as a 200 with an error body. Its code, when an HTTP status, says
  // what kind; the message stays unread.
  if (json.error) throw new ModelError(typeof json.error.code === "number" ? json.error.code : null, "provider error");
  if (!json.choices?.length) throw new ModelError(res.status, "no choices");
  // An empty reply is an answer, just a useless one (a reasoning model spent max_tokens thinking, #224): the bot falls
  // back. Treating it as a failure would pause the bots and pay for the same empty reply again and again.
  const content = json.choices[0]!.message?.content;
  return typeof content === "string" ? content : "";
};

/** Where each allowed provider's API lives (MODEL_PROVIDERS). Fixed here so a client can't point the server elsewhere. */
const PROVIDER_BASE_URLS: Record<ModelProvider, string> = {
  openrouter: "https://openrouter.ai/api/v1",
};

/** A player's own key (BYOK). Only ever held in memory: never stored, logged, or put in a view. */
export function playerModelCredentials(provider: ModelProvider, model: string, apiKey: string): ModelCredentials {
  return { baseUrl: PROVIDER_BASE_URLS[provider], model, apiKey };
}

/** The development key, only on a local dev server (`DEV_SERVER`). A deployment has no model credentials of its own. */
/** MODEL_API_KEY (development only, never committed) is not declared on Env: `wrangler types` generates it from .dev.vars when present. */
export function devModelCredentials(env: Pick<Env, "DEV_SERVER" | "MODEL_BASE_URL" | "MODEL_NAME"> & { MODEL_API_KEY?: string }): ModelCredentials | null {
  if (env.DEV_SERVER !== "true" || !env.MODEL_BASE_URL || !env.MODEL_NAME || !env.MODEL_API_KEY) return null;
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

/**
 * Statuses that won't get better by asking again: the key is no good (bad key, no credit, forbidden), or the request
 * is (400: a parameter the model refuses, like turning off reasoning a model requires; 404: no such model). Only a new
 * key or model settings help (#224).
 */
const KEY_FAILURES = new Set([400, 401, 402, 403, 404]);

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

  /**
   * Swaps the key (the player set or cleared theirs). A new key gets a fresh start: whatever the old one failed
   * with doesn't count against it. The call budget stays spent.
   */
  setCredentials(credentials: ModelCredentials | null): void {
    this.credentials = credentials;
    this.keyFailure = null;
    this.failing = false;
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
    let credentials: ModelCredentials | null = null;
    await this.acquire();
    try {
      // Checked again: the budget or the key may have run out while this call waited.
      if (!this.usable) return null;
      this.used++;
      credentials = this.credentials!;
      const reply = await this.complete(credentials, turns, AbortSignal.timeout(this.options.timeoutMs));
      if (credentials === this.credentials) this.failing = false;
      return reply;
    } catch (e) {
      const status = e instanceof ModelError ? e.status : null;
      // A call made with a key since replaced says nothing about the new one.
      if (credentials === this.credentials) {
        if (status !== null && KEY_FAILURES.has(status)) this.keyFailure = status;
        else this.failing = true;
      }
      // Only our own messages, or the error's name: anything else could carry the request.
      logWarn("model_call_failed", e instanceof ModelError ? { ...(e.status !== null && { status: e.status }), errorName: "ModelError", message: e.message } : failureName(e));
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

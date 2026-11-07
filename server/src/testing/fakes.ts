// Stand-ins for the Cloudflare runtime so the Durable Object classes can run
// under plain Vitest. `FakeServer` replaces partyserver's `Server` (via vi.mock
// in each test file); the rest model storage and sockets.

import type { Seat } from "@mush2/shared";
import { CHARACTERS } from "@mush2/shared";

export class FakeStorage {
  data = new Map<string, unknown>();
  alarm: number | null = null;

  // Copies in and out, as Durable Object storage does (structured clone), so a stored value never shares objects with the room.
  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.data.get(key)) as T | undefined;
  }
  async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
    if (typeof keyOrEntries === "string") this.data.set(keyOrEntries, structuredClone(value));
    else for (const [k, v] of Object.entries(keyOrEntries)) this.data.set(k, structuredClone(v));
  }
  async list(opts: { prefix?: string; startAfter?: string; limit?: number } = {}): Promise<Map<string, unknown>> {
    const out = new Map<string, unknown>();
    for (const [k, v] of [...this.data].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
      if (opts.limit !== undefined && out.size >= opts.limit) break;
      if (opts.prefix && !k.startsWith(opts.prefix)) continue;
      if (opts.startAfter !== undefined && k <= opts.startAfter) continue;
      out.set(k, structuredClone(v));
    }
    return out;
  }
  async delete(key: string): Promise<boolean>;
  async delete(keys: string[]): Promise<number>;
  async delete(keys: string | string[]): Promise<boolean | number> {
    if (typeof keys === "string") return this.data.delete(keys);
    return keys.filter((k) => this.data.delete(k)).length;
  }
  async deleteAll(): Promise<void> {
    this.data.clear();
  }
  async getAlarm(): Promise<number | null> {
    return this.alarm;
  }
  async setAlarm(at: number): Promise<void> {
    this.alarm = at;
  }
  async deleteAlarm(): Promise<void> {
    this.alarm = null;
  }
}

/** An R2 bucket in memory (the parts the replay copy and routes use). Set `failAfter` to make every put past that many fail. */
export class FakeR2Bucket {
  objects = new Map<string, { body: Uint8Array; httpMetadata?: { contentType?: string; contentEncoding?: string } }>();
  puts = 0;
  failAfter: number | null = null;

  async put(key: string, value: ArrayBuffer | string, options?: { httpMetadata?: { contentType?: string; contentEncoding?: string } }): Promise<object> {
    if (this.failAfter !== null && this.puts >= this.failAfter) throw new Error("R2 is down");
    this.puts++;
    const body = typeof value === "string" ? new TextEncoder().encode(value) : new Uint8Array(value.slice(0));
    this.objects.set(key, { body, ...(options?.httpMetadata && { httpMetadata: options.httpMetadata }) });
    return {};
  }

  /** An object as `R2Bucket.get` returns it (the parts the replay routes read): its stored bytes, or null. */
  async get(key: string): Promise<{ body: ReadableStream; json<T>(): Promise<T> } | null> {
    const object = this.objects.get(key);
    if (!object) return null;
    return {
      body: new Blob([object.body]).stream(),
      json: async <T>() => JSON.parse(new TextDecoder().decode(object.body)) as T,
    };
  }

  /** An object's JSON, gunzipped when it was stored gzipped. */
  async json<T>(key: string): Promise<T> {
    const object = this.objects.get(key);
    if (!object) throw new Error(`No object ${key}`);
    const stream = new Blob([object.body]).stream();
    const text = await new Response(object.httpMetadata?.contentEncoding === "gzip" ? stream.pipeThrough(new DecompressionStream("gzip")) : stream).text();
    return JSON.parse(text) as T;
  }
}

export class FakeConnection<S = unknown> {
  state: S | null = null;
  sent: string[] = [];
  closed: { code?: number; reason?: string } | null = null;
  constructor(public id: string) {}
  setState(s: S): void {
    this.state = s;
  }
  send(msg: string): void {
    this.sent.push(msg);
  }
  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
  }
  /** Every message sent so far, parsed. */
  messages<T = { type: string; [k: string]: unknown }>(): T[] {
    return this.sent.map((s) => JSON.parse(s) as T);
  }
}

/** Mimics the parts of partyserver's `Server` that our rooms use. */
export class FakeServer {
  connections = new Set<FakeConnection<never>>();
  /** The room's name (its id), which partyserver sets from the URL or `getServerByName`. */
  name = "test-room";
  ctx: { storage: FakeStorage };
  constructor(
    ctx: { storage: FakeStorage },
    public env: unknown,
  ) {
    this.ctx = ctx;
  }
  getConnections(): Iterable<FakeConnection<never>> {
    return this.connections;
  }
}

/** Seats in a test game set up all at once (`GameRoom.setup`). Not tied to a multiplayer ship's seat count (`config.preselection.seats`). */
const TEST_SEATS = 8;

export function seats(humans: number): Seat[] {
  return Array.from({ length: TEST_SEATS }, (_, i) => ({
    id: `p${i}`,
    name: i < humans ? `Human ${i}` : `Bot ${i} (AI)`,
    isBot: i >= humans,
    character: CHARACTERS[i]!.id,
  }));
}

export function tokensFor(humans: number): Record<string, string> {
  return Object.fromEntries(Array.from({ length: humans }, (_, i) => [`tok${i}`, `p${i}`]));
}

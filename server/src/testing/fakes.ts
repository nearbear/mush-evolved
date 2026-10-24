// Stand-ins for the Cloudflare runtime so the Durable Object classes can run
// under plain Vitest. `FakeServer` replaces partyserver's `Server` (via vi.mock
// in each test file); the rest model storage and sockets.

import type { Seat } from "@mush2/shared";
import { CHARACTERS } from "@mush2/shared";

export class FakeStorage {
  data = new Map<string, unknown>();
  alarm: number | null = null;

  async get<T>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }
  async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
    if (typeof keyOrEntries === "string") this.data.set(keyOrEntries, value);
    else for (const [k, v] of Object.entries(keyOrEntries)) this.data.set(k, v);
  }
  async list(opts: { prefix?: string } = {}): Promise<Map<string, unknown>> {
    const out = new Map<string, unknown>();
    for (const [k, v] of [...this.data].sort(([a], [b]) => a.localeCompare(b))) {
      if (!opts.prefix || k.startsWith(opts.prefix)) out.set(k, v);
    }
    return out;
  }
  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
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

/** Seats in a test game set up all at once (`GameRoom.setup`). Not tied to the multiplayer ship's `SEAT_COUNT`. */
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

// Fixed-window, per-connection message limiter. In-memory only, which is fine:
// a Durable Object instance owns all of its connections.

export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();

  constructor(
    private maxPerWindow: number,
    private windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      this.windows.set(key, { start: now, count: 1 });
      return true;
    }
    w.count += 1;
    return w.count <= this.maxPerWindow;
  }

  forget(key: string): void {
    this.windows.delete(key);
  }
}

// Exponential backoff for a retried job: each failure waits twice as long as the last, up to a cap.

export class Backoff {
  /** When to try next (server ms), or null when nothing is due. */
  dueAt: number | null = null;
  private wait: number;

  constructor(
    private readonly first: number,
    private readonly max: number,
  ) {
    this.wait = first;
  }

  /** A try failed: the next one is due after the current wait, which then doubles. Returns that wait. */
  fail(now = Date.now()): number {
    const wait = this.wait;
    this.dueAt = now + wait;
    this.wait = Math.min(wait * 2, this.max);
    return wait;
  }

  /** It worked (or no longer needs doing): nothing is due, and the next failure waits the first wait again. */
  succeed(): void {
    this.dueAt = null;
    this.wait = this.first;
  }

  /** A try is due by `now`. */
  due(now = Date.now()): boolean {
    return this.dueAt !== null && this.dueAt <= now;
  }
}

// The cycle clock (#24, owner 2026-10-19). Cycles change on the UTC clock, at 00:00, 03:00, … 21:00 GMT, so a day
// begins at midnight GMT, as in eMush. The rules count cycles and never read a clock; the room turns the clock
// into `cycle` inputs. Clock cycles are numbered from the Unix epoch, which is a midnight GMT.

declare global {
  interface Env {
    /** Development only (server/.dev.vars): cycle length in seconds, so a day passes in minutes. Unset is 3 hours. */
    CYCLE_SECONDS?: string;
  }
}

const REAL_CYCLE_MS = 3 * 60 * 60 * 1000;

/** Cycle length in ms: 3 hours, or `CYCLE_SECONDS` when it is a positive number. */
export function cycleMs(env: Pick<Env, "CYCLE_SECONDS">): number {
  const seconds = Number(env.CYCLE_SECONDS);
  return env.CYCLE_SECONDS && Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : REAL_CYCLE_MS;
}

/** The clock cycle `at` (ms) falls in. */
export const clockCycle = (at: number, lengthMs: number): number => Math.floor(at / lengthMs);

/** When clock cycle `n` begins (ms). */
export const clockCycleStart = (n: number, lengthMs: number): number => n * lengthMs;

/** Which cycle of its day (1-based) clock cycle `n` is: 5 for one that begins at 12:00 GMT. */
export const cycleOfDay = (n: number, cyclesPerDay: number): number => (n % cyclesPerDay) + 1;

/**
 * Compile-time checks for log.ts (#430): `npm run typecheck` fails if an unknown event or an unsafe field becomes
 * accepted. Never called; server tests aren't typechecked, so these live in src.
 */
import { logWarn } from "./log.ts";

export function logTypeChecks(): void {
  // @ts-expect-error: not a known event.
  logWarn("anything");
  // @ts-expect-error: chat and names are not loggable fields.
  logWarn("tick_failed", { text: "x" });
  // @ts-expect-error: no account IDs.
  logWarn("seat_revoke_failed", { accountId: "acc" });
  // @ts-expect-error: no tokens.
  logWarn("boarding_failed", { token: "t" });
}

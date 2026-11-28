// Which crew member's gender a log line agrees with (#505), passed to i18next as
// `context` so `logEvent.<key>_female` / `_male` are tried before the plain key.
// The plain key holds gender-free wording, so a missing variant never misgenders.

import { SOMEONE, characterGender } from "@mush2/shared";

/**
 * Log keys whose wording agrees with the target ("poignardé") rather than the actor.
 * A line that would agree with both is rewritten to avoid agreement, so it isn't here.
 */
export const TARGET_AGREEMENT_KEYS: ReadonlySet<string> = new Set<string>([]);

/**
 * The i18next context for a log line: the actor's (`name`) gender, or the target's for a key in
 * TARGET_AGREEMENT_KEYS. Undefined (the plain, neutral key) for a neutral character, a masked
 * actor ("someone" must not give away a gender), or a line with no such person.
 */
export function logGenderContext(key: string, params: Readonly<Record<string, unknown>>): "male" | "female" | undefined {
  const who = params[TARGET_AGREEMENT_KEYS.has(key) ? "target" : "name"];
  if (typeof who !== "string" || who === SOMEONE) return undefined;
  const gender = characterGender(who);
  return gender === "neutral" ? undefined : gender;
}

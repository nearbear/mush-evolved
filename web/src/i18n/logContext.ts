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
 * Log keys whose wording agrees with the pair `name` and `target` together (French "ils"/"elles").
 * Only an all-female pair gets a context (`_female`); any other pair takes the plain key.
 */
export const PAIR_AGREEMENT_KEYS: ReadonlySet<string> = new Set<string>(["dttDone"]);

/**
 * The i18next context for a log line: the actor's (`name`) gender, the target's for a key in
 * TARGET_AGREEMENT_KEYS, or "female" for a key in PAIR_AGREEMENT_KEYS when both are women.
 * Undefined (the plain, neutral key) for a neutral character, a masked actor ("someone" must not
 * give away a gender), or a line with no such person.
 */
export function logGenderContext(key: string, params: Readonly<Record<string, unknown>>): "male" | "female" | undefined {
  if (PAIR_AGREEMENT_KEYS.has(key)) {
    const pair = [params.name, params.target];
    return pair.every((who) => typeof who === "string" && who !== SOMEONE && characterGender(who) === "female") ? "female" : undefined;
  }
  const who = params[TARGET_AGREEMENT_KEYS.has(key) ? "target" : "name"];
  if (typeof who !== "string" || who === SOMEONE) return undefined;
  const gender = characterGender(who);
  return gender === "neutral" ? undefined : gender;
}

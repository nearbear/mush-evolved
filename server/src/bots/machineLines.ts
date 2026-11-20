import { parseExpeditionLine } from "./expeditionShare.ts";
import { parseFireLine } from "./fireShare.ts";
import { parseItemLine } from "./itemShare.ts";
import { parseMoraleLine } from "./moraleShare.ts";
import { parseJumpHold } from "./planetShare.ts";
import { parseTankLine } from "./tankShare.ts";

/**
 * Whether a chat line is one of the bots' fixed formats, for code to parse rather than a message to answer: an item
 * line (`itemShare.ts`), a fire line (`fireShare.ts`), a tank line (`tankShare.ts`), a morale request (`moraleShare.ts`), an expedition line (`expeditionShare.ts`) or a jump-hold line
 * (`planetShare.ts`). `GameRoom` wakes no bot for one (no router call). A new bots' line format belongs here too.
 */
export function isMachineLine(text: string): boolean {
  return parseItemLine(text) !== null || parseFireLine(text) !== null || parseTankLine(text) !== null || parseMoraleLine(text) || parseExpeditionLine(text) !== null || parseJumpHold(text) !== null;
}

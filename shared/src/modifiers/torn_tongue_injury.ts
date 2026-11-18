import type { Modifier } from "../modifiers.ts";

// Torn Tongue (owner, 2026-11-17): you can't speak. No `talking`-tagged action (Fiery speech, Boring speech, Chitchat,
// Comfort; Action.check refuses them with `mute`), no chat post in any channel (`sendChat`) and no new private
// channel (`createChannel`). You still hear others, and others can still invite you.
export const torn_tongue_injury: Modifier = {
  mute: true,
};

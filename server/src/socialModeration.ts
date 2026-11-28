// Moderation of a social message's free text (chat, channel and thread names, shares, item names), before the rules
// see it. Pure: the room records what was blocked (`GameRoom.recordBlocked`) and applies the input.

import {
  moderateChat,
  MAX_ITEM_NAME_LENGTH,
  MAX_SHARED_PLANET_LENGTH,
  MAX_SHARED_PLANET_LINES,
  MAX_SHARED_PLANT_EFFECTS_LENGTH,
  MAX_SHARED_PLANT_EFFECTS_LINES,
  MAX_SHARED_PLANT_TEXT_LENGTH,
  MAX_SHARED_PLANT_TEXT_LINES,
  MAX_SHARED_PILGRED_TEXT_LENGTH,
  MAX_SHARED_PILGRED_TEXT_LINES,
  type BlockedText,
  type Input,
  type PlayerId,
  type SocialMessage,
} from "@mush2/shared";

export type ModeratedSocial =
  /** The input for the rules (text after moderation), and the text as sent when moderation changed it, for the record. */
  | { ok: true; input: Input; raw?: string }
  /** Refused: the error code for the sender, and what moderators see. */
  | { ok: false; error: string; blocked: Pick<BlockedText, "type" | "raw" | "reason"> };

/** `msg` from the seat playing body `by`, moderated. A message with no free text passes through unchanged. */
export function moderateSocial(msg: SocialMessage, by: PlayerId): ModeratedSocial {
  if (msg.type === "sharePlants") {
    // Moderate both the optional note and each row's editable effects string.
    let text = "";
    let changed = false;
    if (msg.text.trim()) {
      const mod = moderateChat(msg.text, undefined, { length: MAX_SHARED_PLANT_TEXT_LENGTH, lines: MAX_SHARED_PLANT_TEXT_LINES });
      if (!mod.ok) return { ok: false, error: "share_text_invalid", blocked: { type: msg.type, raw: msg.text, reason: mod.reason } };
      text = mod.text;
      if (mod.text !== msg.text) changed = true;
    }
    const plants = [];
    for (const row of msg.plants) {
      if (!row.effects.trim()) {
        plants.push({ ...row, effects: "" });
        continue;
      }
      const mod = moderateChat(row.effects, undefined, { length: MAX_SHARED_PLANT_EFFECTS_LENGTH, lines: MAX_SHARED_PLANT_EFFECTS_LINES });
      if (!mod.ok) return { ok: false, error: "share_text_invalid", blocked: { type: msg.type, raw: row.effects, reason: mod.reason } };
      if (mod.text !== row.effects) changed = true;
      plants.push({ ...row, effects: mod.text });
    }
    const raw = changed ? [msg.text, ...msg.plants.map((r) => r.effects)].filter(Boolean).join("\n---\n") : undefined;
    return { ok: true, input: { type: "sharePlants", by, plants, text }, raw };
  }
  if (msg.type === "renameItem") {
    if (!msg.name.trim()) return { ok: true, input: { type: "renameItem", by, item: msg.item, name: "" } };
    const mod = moderateChat(msg.name.replace(/\s+/g, " "), undefined, { length: MAX_ITEM_NAME_LENGTH, lines: 1 });
    if (!mod.ok) return { ok: false, error: "item_name_invalid", blocked: { type: msg.type, raw: msg.name, reason: mod.reason } };
    return { ok: true, input: { type: "renameItem", by, item: msg.item, name: mod.text }, raw: mod.text === msg.name ? undefined : msg.name };
  }
  if (msg.type === "sharePilgred") {
    if (!msg.text.trim()) return { ok: true, input: { type: "sharePilgred", by, percent: msg.percent, text: "" } };
    const mod = moderateChat(msg.text, undefined, { length: MAX_SHARED_PILGRED_TEXT_LENGTH, lines: MAX_SHARED_PILGRED_TEXT_LINES });
    if (!mod.ok) return { ok: false, error: "share_text_invalid", blocked: { type: msg.type, raw: msg.text, reason: mod.reason } };
    return { ok: true, input: { type: "sharePilgred", by, percent: msg.percent, text: mod.text }, raw: mod.text === msg.text ? undefined : msg.text };
  }
  if (msg.type !== "chat" && msg.type !== "createChannel" && msg.type !== "createThread" && msg.type !== "sharePlanet" && msg.type !== "shareReport") {
    return { ok: true, input: { ...msg, by } };
  }
  const raw = msg.type === "chat" || msg.type === "sharePlanet" || msg.type === "shareReport" ? msg.text : (msg.name ?? "");
  // A private channel may be created without a name (it shows its day and cycle instead).
  if (msg.type === "createChannel" && !raw.trim()) return { ok: true, input: { ...msg, by, name: "" } };
  // A shared planet's text is longer than a chat message (owner, 2026-10-31); a shared report's takes the same limits.
  const sharing = msg.type === "sharePlanet" || msg.type === "shareReport";
  const mod = sharing ? moderateChat(raw, undefined, { length: MAX_SHARED_PLANET_LENGTH, lines: MAX_SHARED_PLANET_LINES }) : moderateChat(raw);
  // The size errors name chat's limits; a shared planet has its own.
  if (!mod.ok) return { ok: false, error: sharing ? "share_text_invalid" : mod.reason, blocked: { type: msg.type, raw, reason: mod.reason } };
  const input: Input = msg.type === "createChannel" || msg.type === "createThread" ? { ...msg, by, name: mod.text } : { ...msg, by, text: mod.text };
  return { ok: true, input, raw: mod.text === raw ? undefined : raw };
}

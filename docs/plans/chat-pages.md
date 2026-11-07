# Chat pages (#355)

Status: planned 2026-11-06; phase 1 built 2026-11-06 (leak-checked), phases 2–4 not built. The decisions in the issue (page size 50, no history limit, editable checkboxes on sealed pages, threads from any global message, views carry `seq` not `id`) are the owner's, 2026-11-04 and 2026-11-05. The two choices below under "Design" are proposals; the tail in the view was taken as the default when the owner said to start (2026-11-06).

Replaces the 200-messages-per-channel trim (`CHAT_HISTORY`) with fixed pages of 50 messages for every channel and thread. Page n of a channel holds `seq` n·50 to n·50+49 and never changes once sealed, apart from checkbox edits.

## Design

- **Seal on overflow, not on fill.** A page seals when message 51 arrives, not when message 50 does. `stampEntries` (`replay.ts`), the report `chatId` lookup (`GameRoom.act`) and the bot wake router all look for the message an input just posted in `state.chat`; sealing on fill would move it out first.
- **A tail page.** `state.chat` holds, per channel, the open page plus the last sealed page (the tail). The view sends both, so up to 100 messages per channel. Bots and the router keep recent context right after a seal, a checkbox edit on the previous page needs no storage read, and the client never shows a near-empty page after a seal. Only pages two or more back are read from storage.
- **Outbox.** The rules stay pure: sealing puts the page in `state.chatOutbox`, and `GameRoom.persist` writes it as `chat:<channel>:<page>` in the same atomic `put` as the snapshot. A private channel deleted by its last member goes in the outbox too, and its keys are deleted in the same write.
- **`seq` in views, `id` in the state.** `id` is game-wide, so a gap in it tells a reader that someone posted where they can't read. A message is named `(channel, seq)` everywhere a client sees or sends it; `id` stays in the state, the full view, the record (`chatId`) and the replay helpers.

## Phase 1: data model, `seq` and storage

- `shared`: `ChatMessage.seq`; `state.chatSeq` (per-channel counter); `pushChat` seals on overflow into the tail and the outbox; `chatPageKey(channel, page)`, generic enough for the log's backscroll (#338, #281). `CHAT_HISTORY` goes.
- `viewFor`: `messageView` sends `seq`, never `id` (a view message type without `id`); `chatCounts` for readable channels.
- Threads: `Thread.from` is a global `seq`; `createThread` checks `seq < chatSeq.global` (global messages are never deleted, so this is pure and works for sealed messages).
- `removeFromChannel` puts the channel in `chatOutbox.dropped`.
- `server`: `persist()` drains the outbox into the snapshot's `put`; `STATE_VERSION` bump.
- `web`: `(channel, seq)` for keys, thread links, new-message detection (`announce.ts`, `useSpeechBubbles`, `ITrackie.tsx`), Threads, the checkbox. Protocol `toggleCheckbox` and `createThread` take `channel` + `seq`.
- Replay: the `viewDiff.ts` comment; check `replayView.ts` merging; replay format version bump.
- Tests: sealing at 51, `seq` per channel, the outbox, private-channel deletion, a thread from a sealed message, no `id` gap around a Mush-channel system message in a human's view.

## Phase 2: old messages and replays

- Checkbox on a sealed page: `applyInput(state, input, ctx?)` with an optional `sealedMessage` the server preloads from storage; `toggleCheckbox` puts the edited message in `chatOutbox.edits`; `persist` writes the page back; a `chatEdit` message goes to connections that can read the channel.
- `replayGame` and `rebuildGame` keep their own sealed-page map from the outbox and pass it the same way, so the record still replays headless.
- `HistoryStep` carries edits to messages outside the full view.
- Reports (#292): message lookup works for sealed pages; test it.

## Phase 3: protocol and leak tests

- `chatPage {channel, page}` → `{channel, page, messages}`: `readChannels` checked at request time, projected by `messageView`, one error for every refusal, rate-limited like chat.
- Refused the same way: a private channel you left, after dropping your iTrackie, the dead outside `readChannels`, a human for the Mush channel, a page past the end. Run `leak-check`.

## Phase 4: client UI

- Page bar in `Thread.tsx`: `‹ 1 2 … 6 7 ›` on desktop, `‹ 6 / 7 ›` below 1024px; opens on the last page; "Latest (N new)" chip on an older page; new messages never move the reader.
- Sealed pages cached for the game, updated by `chatEdit`. Thread "N messages" from `chatCounts`. Strings via `i18n` (en/fr/es). Screenshots on phone and desktop.

## Wrap-up

Decisions into `docs/rules/rules-design.md` and the code map; a headless sim showing the view's size stays flat as chat grows (#281/#338); one `ai-workflow.md` entry.

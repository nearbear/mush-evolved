# Chat pages (#355)

Status: planned 2026-11-06; phase 1 built 2026-11-06 (leak-checked); phase 2 redesigned and built 2026-11-06 (checkbox marks, below); phase 3 built 2026-11-06 (`chatPageSource`/`chatPageView` in `rules.ts`, `GameRoom.sendChatPage`); phase 4 built 2026-11-06 (`web/src/chatPages.tsx`, the page bar in `Thread.tsx`; screenshots not taken yet); the wrap-up is not done. The decisions in the issue (page size 50, no history limit, editable checkboxes on sealed pages, threads from any global message, views carry `seq` not `id`) are the owner's, 2026-11-04 and 2026-11-05. The two choices below under "Design" are proposals; the tail in the view was taken as the default when the owner said to start (2026-11-06).

Replaces the 200-messages-per-channel trim (`CHAT_HISTORY`) with fixed pages of 50 messages for every channel and thread. Page n of a channel holds `seq` n·50 to n·50+49 and never changes once sealed: what can change about a message (its checkboxes) is kept beside it in the state, not in its page.

## Design

- **Seal on overflow, not on fill.** A page seals when message 51 arrives, not when message 50 does. `stampEntries` (`replay.ts`), the report `chatId` lookup (`GameRoom.act`) and the bot wake router all look for the message an input just posted in `state.chat`; sealing on fill would move it out first.
- **A tail page.** `state.chat` holds, per channel, the open page plus the last sealed page (the tail). The view sends both, so up to 100 messages per channel. Bots and the router keep recent context right after a seal, and the client never shows a near-empty page after a seal. Only pages two or more back are read from storage.
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

## Phase 2: checkbox marks, old messages and replays

**Decision (owner, 2026-11-06), reversing an earlier one.** A ticked checkbox no longer changes the message's text. That was done "so replays and late joiners agree"; marks kept in the state do that too. The text stays as written. Whether each task line is ticked is kept in the state, beside the chat (`chatMarks`), and every message is sent with its marks applied to the text. Sealed pages are never written again, so nothing reads or rewrites a stored page, and the rules never need storage.

A first version that edited sealed pages in place (an outbox of edits, the server reading the page before the rules and writing it back, an in-memory page store for replays, edits in the replay history) was built and dropped for this one.

- **State.** `GameState.chatMarks: Record<string, ChatMark>`, keyed `"<channel>:<seq>"`. `ChatMark = { from: PlayerId; tasks: number[]; checked: number[] }`: the author, the 0-based lines that are task items (`taskLines`, outside code fences), and the lines ticked now. `pushChat` adds an entry only for a message with at least one task line, with `checked` taken from the `[x]` items as typed. System messages (`from` null) get none. No cap for now: an entry is small and only checklist messages have one; flag it if a sim shows otherwise.
- **`toggleCheckbox`** needs only the state: the entry exists, the sender is `from`, the sender may still post to the channel (`chatChannels`, as now), and `line` is in `tasks`. Errors unchanged (`message_not_found` for a missing entry, a message without tasks or a channel you can't use; `message_not_yours`; `checkbox_not_found`). It flips `line` in `checked` and touches neither `state.chat` nor the outbox. Works the same on the open page, the tail and any older page.
- **Applying marks.** One pure helper in `chat.ts` (e.g. `markedText(text, mark)`) rewrites each task line's box to `x` or space from `checked`. Every place that sends or shows a message uses it: `messageView` (live views, so bots and the wake router see ticks too), the phase 3 `chatPage` response, and the replay (`revealFor`). Stored pages and `state.chat` keep the text as typed.
- **Private channels.** `removeFromChannel` deletes the channel's entries when the last member leaves, as it deletes its pages.
- **Hidden information.** `chatMarks` never goes into a `PlayerView` as is (it covers the Mush channel and private channels). Add it to `leakFields.ts` as `never`. It stays in the full view (replay only), where the history diff records each toggle like any other state change. No `HistoryStep` change and no history format bump.
- **Old pages a client holds (phase 4).** A toggle on a message the view no longer carries (two or more pages back) sends `chatEdit {channel, seq, mark: {tasks, checked}}` to connections whose body can read the channel (`readChannels`); the client redraws its fetched copy with `markedText`. No storage involved: as built, it carries the ticks rather than the whole message (a `ChatLine` would need the text, which only the stored page holds). The view does not carry marks for old pages, so its size stays flat.
- **Replays.** `replayGame` and `rebuildGame` stay as phase 1 left them: marks are in the state, so they replay by themselves. `mergeStreams` keeps the text as typed; `revealFor` applies the marks of the frame shown.
- **Reports (#292).** The report message lookup (`chatId`) works for a message on a sealed page (the stored page holds it); add a server test.
- **Version bumps.** `STATE_VERSION` and `server/tests/state-shape.json`.
- **Tests.** A toggle on the open page, the tail and a page two back, all without storage; author only; refused once you can no longer post to the channel (dropped iTrackie, dead); a message typed with `[x]` starts ticked; ticks applied in `viewFor`, invisible to non-readers, and absent from the raw view; entries gone with a deleted private channel; `chatEdit` only to readers and only for messages outside the view, with no `id`; a replay of a toggle on an old page. Run `leak-check`.

## Phase 3: protocol and leak tests

Built as planned. The rate limit is chat's numbers (5 per 10 s per seat) in a limiter of its own, so paging back never stops you posting. The open page and the tail can be asked for too (answered from the state); only older pages read storage, and only after the access check passes, which runs again after the read.

- `chatPage {channel, page}` → `{channel, page, messages}`: `readChannels` checked at request time, projected by `messageView`, one error for every refusal, rate-limited like chat.
- Refused the same way: a private channel you left, after dropping your iTrackie, the dead outside `readChannels`, a human for the Mush channel, a page past the end. Run `leak-check`.

## Phase 4: client UI

- Page bar in `Thread.tsx`: `‹ 1 2 … 6 7 ›` on desktop, `‹ 6 / 7 ›` below 1024px; opens on the last page; "Latest (N new)" chip on an older page; new messages never move the reader.
- Sealed pages cached for the game; `chatEdit` updates a cached message's ticks. Thread "N messages" from `chatCounts`. Strings via `i18n` (en/fr/es). Screenshots on phone and desktop.

As built: the cache is a context (`web/src/chatPages.tsx`) owned by `GameScreen`, which has the socket; a view without one (a replay) gets no cache and pages only through what its view carries. The bar is `« ‹ 1 2 … 6 7 › »` (`« ‹ 6 / 7 › »` on the phone), « for the earliest page and » for the latest, whose screen-reader name carries the "N new" count. The latest page (the default) is the newest page alone, nearly empty right after a seal (owner, 2026-11-06), and follows new messages; any other page is fixed until the reader moves, including the tail, which is fetched once a later seal pushes it out of the view. A thread's starter on an older page is fetched for it (`Threads.tsx`); the "starter gone" text is gone, since global messages are never deleted. An open thread is titled by its own name in the iTrackie title row, with a `←` back button at its right (owner).

## Wrap-up

Decisions into `docs/rules/rules-design.md` and the code map; a headless sim showing the view's size stays flat as chat grows (#281/#338); one `ai-workflow.md` entry.

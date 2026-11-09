# Chat read state (#400): implementation plan

Handoff for [#400](https://github.com/nearbear/mush2/issues/400). The owner's decisions are in the issue comment of
2026-11-08 ("Plan (owner decisions)"); this file turns them into code steps. Read the issue first.

The open points at the end were answered by the owner on 2026-11-08 (see "Answered"). Commit 1 is `ad9f7e0`.

## Shape

Two ideas, one client module:

- **Read**: one high-water count per channel, held in localStorage and on the server. Drives the tab badges, the Mush
  tab, the page bar, the "new messages" divider and the announcer's "N unread in …".
- **Arrived**: what's new since this client connected, in memory. Drives speech bubbles and full live announcements, so
  a reload doesn't replay hours-old bubbles or speech.

On the server, read state lives in Durable Object storage under `chatRead:<seat>`, **not** in `GameState`. It is not an
input (never recorded or replayed), and no view changes. It is keyed by seat (the mind), so it follows a Transfer with
no extra code, and is leak-safe for the same reason `logSeen` restarts in `swapMinds`.

Unread in a channel = `chatCounts[c] − read[c]`, which stays right past the ~100 messages a view carries.

## 1. Shared, pure: `shared/src/chatRead.ts`

```ts
export type ChatRead = Partial<Record<ChannelId, number>>;

/** Raises `stored` by `incoming` for channels `body` reads now. `raised` holds the entries that went up. */
mergeChatRead(state, body, stored, incoming): { read: ChatRead; raised: ChatRead }
/** What the seat is sent: filtered to readChannels(state, body), clamped to chatSeq. */
chatReadFor(state, body, read): ChatRead
/** Drops channels no longer in state.chatSeq (a deleted private channel; removeFromChannel deletes its entry). */
pruneChatRead(state, read): ChatRead
/** max(0, counts[c] − (read[c] ?? 0)). */
unreadCount(counts, read, channel): number
```

- Merge only raises, clamps each count to `chatSeq[c] ?? 0`, ignores channels the body can't read, drops zeros.
- **A channel that is merely unreadable now keeps its stored count.** Only channels gone from `chatSeq` are pruned.
  Otherwise dropping your iTrackie for a moment would make all of global chat unread again.
- `protocol.ts`: `{ type: "chatRead"; read: ChatRead }` in both `GameClientMessage` and `GameServerMessage`. The parser
  takes a plain object, keys through `channelId()`, values `Number.isSafeInteger` and `>= 0`, at most 256 entries, and
  uses `Object.hasOwn` (no `__proto__`).
- Tests: `shared/tests/chatRead.test.ts`:
  - raise-only
  - clamping
  - unreadable channels refused
  - deleted private channel pruned
  - Transfer: the same seat's counts, filtered by the new body
  - a dead reader's graveyard
  - an ended game returns nothing
- Parser cases go in `shared/tests/protocol.test.ts`.

## 2. Server: `server/src/GameRoom.ts`

- **Cache.** `private chatRead = new Map<PlayerId, ChatRead>()`, loaded lazily from `chatRead:<seat>` through
  `pruneChatRead`. After the `await`, check the map again in case another message loaded it first. Merge into memory
  synchronously, then `ctx.storage.put` directly (not `persist()`: it isn't part of the snapshot).
- **`onMessage` "chatRead"** (handled like `chatPage`, before `social`):
  - `readLimiter = new RateLimiter(6, 10_000)`.
  - Bot seats are skipped.
  - Then `mergeChatRead`.
  - If anything rose: save it, and push `chatReadFor` to the seat's *other* connections.
  - **Never reply** to the sender. Refused, rate-limited and nothing-new then look identical.
- **Body after await** (leak check of commit 1). Resolve the seat's body (`this.body(playerId)`) after every `await`,
  as `sendChatPage` does: a Transfer can move the seat during the storage read. Run `chatReadFor` on the state as it
  is when sending.
- **`onConnect`.** After `sendView`, send `{ type: "chatRead", read: chatReadFor(...) }`.
- **Posting.** In `social()`, after a successful `chat` from a human seat, raise that seat's count for the channel to
  `game.chatSeq[channel]` and push to all of the seat's connections. This replaces the client's
  `from === view.you.id` check: your own messages are never unread because posting reads them.
- **`leaveShip()`.** Delete `chatRead:<seat>` and the cache entry.
- **Ended game.** `readChannels` is empty, so nothing is sent or merged; no extra code.
- **Tests** (`server/tests/GameRoom.test.ts`, `FakeServer`):
  - connecting gets chatRead after the view
  - an update persists and reaches the seat's second connection
  - **no other seat ever receives a chatRead** (leak)
  - unreadable channel, over-count and rate-limited updates produce no reply and the same storage
  - posting raises the poster's count to `seq + 1`
  - a bot posting stores nothing
  - Transfer: counts follow the mind, sent filtered by the new body
  - leaveShip deletes the key
  - a deleted private channel is pruned on load

## 3. Client store: `web/src/chatRead.ts` (replaces `web/src/chatSeen.ts`)

- **Moved from `chatSeen.ts`.** `messageKey` moves here, and `chatSeenIn`/`isNewer` become `arrivedIn`/`isArrived`,
  used by `announce.ts` (`freshIn`). `scene/useSpeechBubbles.ts` keeps its own arrived mark; leave it.
- **The store.** `createChatReadStore({ key, send })`:
  - `read(c)`
  - `subscribe(c | "*", fn)`: listeners per channel, so marking one channel redraws only what shows it
  - `mark(c, count)`: raise-only; writes localStorage at once; marks the entry dirty
  - `markAll(counts)`
  - `fromServer(read)`: takes the max of each pair; any local count higher than the server's is marked dirty, so
    after a reload the server catches up
  - `dispose()`
- **Sending.** Dirty entries go at most every 5 s, and also on `visibilitychange` (hidden), `pagehide` and socket
  reconnect.
- **localStorage.**
  - Key: `mush2.chatRead.<roomId>.<hash(token)>`, value `{ at, read }`.
  - Use a synchronous FNV-1a hash: it exists only so the token isn't copied into storage.
  - On create, drop entries older than 14 days.
  - Wrap every access in try/catch; the store works with no storage.
- **React.**
  - `ChatReadProvider` in `GameScreen.tsx` next to `ChatPagesProvider`; GameScreen routes `chatRead` server messages
    to it, as it does for `useChatPageCache`.
  - Hooks:
    - `useReadCount(channel)`: `useSyncExternalStore` on one channel
    - `useReadSnapshot()`: the whole map, for ITrackie's tab sums and the announcer
  - No provider (replay, design kit) means no badges: the hooks return "everything read".
- **Render cost** (`web/CLAUDE.md`). Chat rows never subscribe. Badges and chips subscribe per channel.
- Tests: `web/tests/chatRead.test.ts`:
  - raise-only
  - localStorage written at once
  - throttled send
  - max-merge with the server, and higher locals sent back
  - old games pruned
  - throwing storage
  - tab sums

## 4. Marking read

- **Focus.** `ChatRow`'s `FeedEntry` (`web/src/hud/Thread.tsx`) gets `tabIndex={-1}` and `data-seq={m.seq}`. These
  are plain values, so the row memo keeps skipping. One `onFocus` on the feed `<ol>` (React's bubbles like `focusin`)
  finds `closest("[data-seq]")` and calls `mark(channel, seq + 1)`. A click or tap focuses the row, or a button inside
  it, and the event bubbles to the same listener. Hover and being on screen don't count (owner).
- **Arriving in view** (owner, 2026-11-08, answer 5). A message that arrives while its channel is the active one
  (`active`), on its latest page, with the document visible (`visibilityState`) and focused (`document.hasFocus()`),
  counts as read: mark `(channel, count)` when such a message arrives. Being on screen still doesn't mark history:
  older messages, scrolling and hover never count. The divider keeps its snapshot from when the channel opened.
- **Keyboard** (open point 2). The `<ol>` is the one tab stop. ArrowUp/Down, Home and End move focus between rows by
  DOM query, with no React state. Focusing the `<ol>` itself moves focus to the first unread row on the page, else the
  last row.
- **Mark all read.** A button in `.itrackie-title-row` (`web/src/hud/ITrackie.tsx`), shown only while the active tab
  has unread. Short visible text (fits 360px), with a full `aria-label` ("Mark all read in Global chat"). On a grouped
  tab it marks every channel in the group: all threads, all features with their shared planets and reports, all
  private channels. Nothing on the Room tab.

## 5. Rewiring the trackers

- **`ITrackie.tsx`.**
  - Delete `useUnread` and `mushSeen`.
  - Tab counts are `unreadCount` summed over `view.readChannels` by `tabOf`.
  - The Mush tab gets `unread` while `unread.mush > 0`.
  - The active tab now shows its own badge (open point 3).
- **`usePaging` (`Thread.tsx`).**
  - Drop `seen` from `picked`.
  - `newCount = total − read(channel)`.
  - » shows the count visibly in an `aria-hidden` span; the number stays in the existing `itrackie.pages.latestNew`
    aria-label, so it isn't spoken twice.
- **`hud/useAnnouncements.ts`.** "Arrived" (`freshIn`) still decides *when* to speak. The number in
  `announce.unreadIn` comes from the store (read through the existing `latest` ref). Own messages still say
  `announce.sent`.
- **Per-channel chips.** A small `UnreadChip` (count via `useReadCount` and the channel's `chatCounts`) goes in:
  - `Threads.tsx` thread links
  - `FeatureSelect.tsx`: the trigger and each item; a feature's count includes its shared planets and reports
  - `SharedPlanets.tsx` and `SharedReports.tsx` lists
  - `PrivateChannels.tsx` slots (`channel-slot-pick`)

  The number also goes in each control's accessible name.

## 6. Divider and jump

- **Divider.** `Thread` gets an `active: boolean` prop: true when it is the channel on screen (ITrackie knows the
  active tab, the open thread, the picked feature or shared entry). Add it to `sameThread`. When `active` turns true,
  snapshot `read(channel)` as `dividerAt`. Render a "New messages" divider before the row whose `seq === dividerAt`.
  It doesn't move as you read. Posting or Mark all read clears it (open point 4).
- **Jump.** If `chatPageOf(dividerAt)` is before the page shown, a line above the feed says how many are new and
  offers to jump: `paging.go(chatPageOf(dividerAt))`. Opening a channel still lands on the latest page.

## 7. Wrap-up

- en/fr/es strings, using the `i18n` skill:
  - Mark all read
  - New messages
  - the jump line
  - the chip labels
- Screenshots at 360px and desktop only when the owner asks (`play` skill).
- `leak-check` skill.
- Record the decisions as a "Read state (#400)" section in `docs/plans/chat-pages.md` (no rule is involved).
- Update `docs/code-map/` for the new modules and `docs/process/testing.md`.
- `npm run verify` and `npm run build` once at the end; one `docs/process/ai-workflow.md` entry (append with `cat >>`).

## Commits, in order

1. shared module and protocol, with tests
2. server, with tests
3. client store and provider, with badges, Mush tab and page bar rewired
4. focus marking and Mark all read
5. per-channel chips
6. divider and jump
7. announcer
8. wrap-up

## Behaviour changes players will notice (all follow from owner decisions)

- Opening a tab no longer clears its badge; focusing or clicking a message, Mark all read, or posting does.
- The first connect after this lands shows everything already posted as unread (no counts exist yet). Mark all read
  covers it, and the databases are empty anyway.
- History that becomes readable counts as unread: an iTrackie picked up, an invite to a private channel, becoming Mush,
  dying, or arriving in a body by Transfer.

## Room chat later ([#401](https://github.com/nearbear/mush2/issues/401))

The owner chose one channel per room, with history. It fits this model unchanged:

- The merge accepts only channels readable now.
- Counts are kept for a room you walk out of.
- 27 rooms fit the 256-entry cap.

Keep everything keyed off `view.readChannels` and `tabOf`, and don't assume a fixed set of channels or groups.

One adjustment will likely come with #401: a room channel with no count should start at its current count when it
first becomes readable, or walking into a busy room shows its whole history as unread. That's a rule decision on #401;
don't build it here.

## Answered (owner, 2026-11-08)

1. **localStorage key:** accepted as planned (a token-hash key, which survives a reload in the same tab; the server
   copy covers the rest; up to ~5 s of reading may be lost when a tab closes).
2. **Keyboard:** one tab stop per feed, with arrow keys (section 4).
3. **The active tab's own badge:** shown.
4. **Clearing the divider:** posting and Mark all read clear it.
5. **Messages arriving while you watch** count as read (Discord's behaviour): see "Arriving in view" in section 4.
   Without it, the open tab's badge (answer 3) would grow as people talk.

## Notes for the final ai-workflow.md entry

One entry for all of #400, written at the end (CLAUDE.md). Gathered so far:

- **Commit 1 (`ad9f7e0`, 2026-11-08).**
  - Adding `chatRead` to `GameClientMessage` silently made it an `Input` (`replay.ts` derives `Input` by excluding the
    read-only messages) and routed it to `GameRoom.social()`. Typecheck caught the non-exhaustive switch. The plan had
    missed this; fixed by adding `chatRead` to both exclusions, with the server ignoring it until commit 2.
  - Another session was editing the same checkout (expeditions, #357), and its half-finished `config.ts` broke the
    server tests. Verified in a detached temporary worktree holding only this commit's files, and committed only those.
    One of three runs there failed on an uncaptured test (most likely a timeout under the other session's load).
- **Open points answered by the owner (2026-11-08).** Answers 1–4 took the assistant's recommendations. Answer 5
  ("arriving in view") was a question the assistant raised after the plan: showing the active tab's badge (answer 3)
  would make the open chat's badge grow as people talk. The assistant recommended Discord's behaviour; the owner chose it.

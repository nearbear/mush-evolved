# Signals: the Com center's conversation tab (plan)

Status: **plan, 2026-11-16, not built; no open questions.** The answers under "Decided" and "Defaults confirmed" are the owner's (2026-11-16). "Proposed" is Claude's design, reviewed with the owner. Related: [#143](https://github.com/nearbear/mush2/issues/143) (merchants), `docs/plans/merchants.md`, `docs/plans/comms.md` (rebel bases).

## Goal

Replace the Com center terminal's **Merchants** and **Rebel bases** tabs with one **Signals** tab. Every ship or base that reaches the Daedalus is one entry in a scrollable list. Clicking an entry opens that signal's conversation in the same terminal: a header, an audio wave, a feed of the dialogue so far, and the options for the next reply. Merchants and rebel bases are the first two kinds. The model leaves room for branching dialogue and new kinds later (below).

## Decided (owner, 2026-11-16)

### Tab and list

- The tab is called **Signals** (replacing both Merchants and Rebel bases; the owner first asked for "Short Range" and "Rebels", then chose to merge).
- Each attempt to contact the Daedalus is its own entry in a scrollable list, grouped into **Active** and **Inactive**.
- **Active**: can still be talked to. **Inactive**: history. A conversation that closed (deal made or refused), and a signal lost without ever being contacted (it left or expired), both go to Inactive.
- Rebel bases are signals too. Each decode is one exchange. The feed shows the base's message **garbled**, getting clearer as the decode percentage rises; at 100% the real message comes through and the call is reached.

### Conversation view

- Top row: the signal's name and time remaining, with a **back button in the upper right**.
- Under it, an **audio wave**, drawn in code (no image asset). It fluctuates while the other side is "speaking".
- Under that, the **feed**: the dialogue between that signal and the Comms Officer of the time.
- Under the feed, the **options** for how to proceed.
- **Cosmetic delay (client only):** after the officer replies, the other side answers after 3 seconds. Then the wave moves and the feed slowly types out the transcription. No audio plays. Once the transcription ends, the next options appear, unless the message closed the conversation. The server records the answer at once; the delay and typing are presentation only.

### Options and rules

- The first option is a single **Contact**. It starts the dialogue, costs no AP, and writes a **room log** line that **names the officer** and says only that they reached out to someone (not who or what).
- Everything after Contact is hidden from anyone without access to the Comms Officer title (`hasTitleAccess`: the holder, a hacker with a working hack on the terminal, or a player who took the title).
- **Non-officers see nothing at all in the Signals tab** (owner, 2026-11-16). This replaces two earlier rules: "anyone on the bridge sees the offers by looking at the comms terminal" (merchants, 2026-11-15) and anyone at the terminal seeing the rebel calls' progress (comms, 2026-10-21). NERON's crew-chat announcement of a new rebel call stays.
- **A new officer reads the old conversations** of previous officers, active and inactive.
- **Trades:** one button per offer, then a **No thank you** that closes the conversation. A deal the ship can't pay for is a **disabled button** with the reason (as decided 2026-11-15).
- **AP:** only closing a deal costs AP (2, unchanged). Contact and No thank you are free, for now.
- **Closing a deal is private** (as built). No thank you is private too.
- **Dialogue depth for now:** hail, then deals, then closure. The design must allow **branching dialogue** later.

### Later kinds (not in this plan's build, but the model must fit them)

- **Distress call:** a fleeing ship asks for help against hunters. Agree, and a group of pirates (hunters) appears. The next option is a button that stays **disabled until every one of those pirates is dead**; then the officer can claim the reward. Disagree closes the conversation.
- **Information ships:** plain messages, no trade at all.

## Proposed (Claude, 2026-11-16)

### State: one list of signals

A new `state.signals: { list: Signal[]; nextId: number }` holds every signal of the game, active and inactive. Nothing is removed when it ends; it changes status. This fits the history requirement, and one list is what the Signals tab and `viewFor` read.

```ts
type SignalKind = "merchant" | "rebel"; // later: "distress", "info", ...
type SignalStatus = "active" | "deal" | "refused" | "reached" | "lost";

interface Signal {
  id: string;            // "signal-3"
  kind: SignalKind;
  arrivedAt: number;     // cycle
  endsAt: number;        // cycle it stops being reachable (merchant: leavesAt; rebel: expiresAt)
  status: SignalStatus;
  contacted: boolean;    // merchants: Contact done. Rebels: always true (see Defaults confirmed 1).
  step: string;          // the current dialogue step, in that kind's script
  feed: FeedEntry[];     // the conversation, oldest first
  merchant?: MerchantData; // kind data: today's Merchant fields (merchant kind, event, deals)
  rebel?: { base: RebelBaseId; progress: number };
}

/** One message. Stored as keys and parameters, never as text, so every viewer reads it in their own language. */
interface FeedEntry {
  from: "officer" | "signal" | "system";
  at: number;              // cycle
  officer?: CharacterId;   // who spoke, for officer lines (the title changes hands)
  key: string;             // i18n key, e.g. "signals.merchant.transport.hail.HUMAN_VS_FUEL"
  params?: LogParams;
  closes?: true;           // this message ended the conversation
}
```

**Migration.** `state.merchants` and `state.comms.rebels` move into `state.signals`. Today's helpers (`rebelContacted`, `isOpen`, `merchantsLeave`, `endRebelCalls`, `closeDeal`, ...) keep their names and read the new list, so the effects code (rations' AP bonus, Cygni's damage) doesn't change. The databases are empty, so this bumps the game version instead of writing a state migration; `normalizeState.ts` gets `normalizeSignals`.

The **alternative** is to keep `state.merchants` and `state.comms.rebels` and add a side table of feeds keyed by signal id. That's a smaller change, but every new kind would need its own list, its own history handling and its own view code, which is what the owner's later kinds would multiply. One list is recommended.

### Dialogue as a small script per kind

Each kind has a script: a map of steps, each with the line the signal says when you reach it and the options offered there. It's plain data in `shared`, so branching later is new steps, not new code.

```ts
type SignalOption =
  | { kind: "contact"; next: string }
  | { kind: "deal" }                       // one button per deal (close_deal)
  | { kind: "refuse" }                     // No thank you
  | { kind: "decode" }                     // rebels (decode_rebel)
  | { kind: "reply"; id: string; next: string }       // later: branching
  | { kind: "claim"; when: SignalCondition; next: string }; // later: disabled until e.g. "pirates dead"
```

The merchant script for this build is three steps: `hail` (option: contact) → `offers` (options: each deal, refuse) → closed. The rebel script is one repeating step: `decoding` (option: decode) until 100%.

### Actions

Visibility is fixed per action type (`actions/action.ts`), and Contact is public while the rest are private, so they are separate actions:

| Action | Who | Cost | Log | Effect |
|---|---|---|---|---|
| `contact_signal` (new) | title access, at a Com center terminal, a merchant signal at `hail` | 0 AP | public room line naming the officer, "reached out to someone" | officer greeting and the hail go into the feed; step → `offers` |
| `close_deal` (exists) | as today, now only at `offers` | 2 AP | private | officer's choice and the merchant's acceptance go into the feed; status → `deal` |
| `refuse_signal` (new) | title access, at `offers` | 0 AP | private | "No thank you" and a farewell go into the feed; status → `refused` |
| `decode_rebel` (exists) | unchanged rules (link, title, clean, 2 AP or a Computer point) | unchanged | private | an officer line and the base's message at the new progress go into the feed; at 100%, status → `reached` |
| (later) `reply_signal` | title access | per option | private | moves to that option's `next` step |

The public room line is the only trace a non-officer sees. It must not say which signal was contacted or what kind it is (`leak-check`).

### Losing a signal

- A merchant whose stay ends, or every merchant when the Daedalus travels or leaves orbit, becomes `lost`, contacted or not. A `system` entry ("Signal lost") ends its feed.
- A rebel call that expires, or is ended by travel, becomes `lost` the same way.
- Nothing is deleted, so Inactive keeps the full history.

### View

`comms.terminal.signals` is sent **only to a viewer with `hasTitleAccess(state, viewer, "comms_officer")`** standing at a Com center terminal. Everyone else gets no `signals` field at all: no list, no count, no next-rebel schedule. `viewFor` is the only place that strips it, as always.

```ts
interface SignalView {
  id: string;
  kind: SignalKind;
  name: { key: string; params?: LogParams }; // "Transport", "Black Mages of Sirius"
  status: SignalStatus;
  endsAt: number;
  feed: FeedEntry[];          // rebel entries carry the progress at that moment, for garbling
  merchant?: { deals: (MerchantDeal & { blocked: DealBlock | null })[] };
  rebel?: { base: RebelBaseId; progress: number };
}
```

The officer's buttons still come only from `view.actions` (`contact_signal`, `close_deal`, `refuse_signal`, `decode_rebel`). The client never decides which options exist.

`CommsTerminalView.rebels`, `nextRebel` and `merchants` go away; the next-rebel line moves into the Signals list (officer only).

### Garbled rebel messages

Each base gets a full message in en/fr/es locale files. The client garbles it from the progress recorded with that feed entry: a deterministic mask (seeded by base and progress) hides a share of the characters equal to the missing percentage, as noise like `—`, `…` and `●`. At 100% the message is shown whole. This isn't a leak: locale text ships in the client bundle anyway, and a base's name and bonus are already public.

### Client

- `web/src/hud/Signals.tsx` (replaces `Merchants.tsx`): a Base UI scroll area with **Active** and **Inactive** groups. An entry shows the kind's icon (rebels keep `REBEL_BASE_ICONS`; merchants have no art yet, so a text badge), the name, and the time left or how it ended.
- `web/src/hud/SignalConversation.tsx`: the header row with the back button at the top right, then `AudioWave`, the feed, and the options.
- `web/src/hud/AudioWave.tsx`: a row of bars drawn with CSS (or a small canvas), flat at rest, animated while a message is typing. Under `prefers-reduced-motion` the bars stay still and only change height when the speaker changes.
- **Typing out:** the component remembers which feed entries it has already shown (per signal, in component state). A new `signal` entry that arrives while the conversation is open waits 3 s (an "incoming…" line), then types out at a steady rate with the wave moving; then the options appear. An entry already in the feed when the conversation opens is shown whole: a reload or a new officer sees the history at once.
- `CommsCenter.tsx`: tabs Overview, Xyloph, Signals. The Signals tab label carries the active count only when `signals` is present. Without access, the panel shows nothing beyond its title (see Defaults confirmed 2).
- **Mobile:** the list and the conversation each fill the tab; the back button stays top right; the feed scrolls and the options stay pinned under it.

### Text (i18n, en/fr/es)

New keys under `signals.*`: tab and group names, statuses, officer lines (greeting, "No thank you", choosing a deal), each merchant hail (moved from `comms.merchants.hails`), acceptance and farewell lines per kind, "Signal lost", "incoming…", one full message per rebel base, and the room log line. The transport hails' French comes from the original's `trade_events` (CC BY-NC-SA, attribution as for the other adapted text). Claude drafts the new lines; the owner reviews them.

### Bots

The single-player Comms Officer bot (`server/src/bots/goals/commsOfficer.ts`) decodes rebels and keeps working, since `decode_rebel` is unchanged. Bots don't trade yet; when they do, they need `contact_signal` before `close_deal`.

### Tests (shared)

- Contact: free, needs title access, adds the hail, writes one public room line naming the officer and nothing about the signal.
- `close_deal` and `refuse_signal` are refused before Contact. Refuse is free and closes the conversation as `refused`. A deal closes it as `deal`.
- Expiry, travel and leaving orbit make active signals `lost`, contacted or not. Uncontacted ones are kept in the list.
- Rebel decode appends to the feed with the progress; 100% → `reached`; the existing bonus tests still pass.
- **Hidden information:** a non-officer at the terminal gets no `signals` field (no list, no count); a hacker with a working hack gets it; after a title change the new officer sees the old feeds and the old officer no longer does. A `leak-check` pass on the whole change.

### Build order (commits)

1. `shared`: `state.signals`, scripts, migrating merchants into it, `contact_signal` and `refuse_signal`, the officer-only view, tests.
2. `web`: Signals list, conversation view, audio wave, typing out, with merchants. Tab renamed; the Merchants tab removed.
3. Rebels into `state.signals`; the Rebel bases tab removed; garbled messages; the next-rebel line in the list.
4. Translations (fr, es), docs (`implemented-rules.md`, `merchants.md`, `comms.md`, code map), screenshots at phone and desktop width.

## Defaults confirmed (owner, 2026-11-16)

Claude's defaults, all accepted by the owner. No questions are open.

1. **Rebel calls skip Contact.** Their first option stays Decode, private, as decided 2026-10-21. Contact and its room log line are for merchants (and later kinds that hail).
2. **A non-officer's Signals tab** still exists (so the terminal's tab row doesn't change with access), and its panel shows one line, "Comms Officer access only", with no count. Hiding the tab would tell a hacker their hack worked by the tab appearing.
3. **Merchant names:** the kind's name ("Transport"); if two of the same kind are active, a number after it ("Transport 2"). Interim: the owner will probably change this later.
4. **Skipping the typing:** tapping the feed shows the current message whole and brings up the options at once. The 3-second wait can't be skipped.
5. **A conversation lost mid-dialogue** (the merchant leaves after Contact, or the ship travels) becomes `lost`, with the "Signal lost" line, like an uncontacted one.
6. **Officer names in the feed:** each officer line shows the character who said it, so a new officer can see who made which deal. Only those with title access see the feed, so this reveals nothing to anyone else.

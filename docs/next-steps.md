# Next steps (written 2026-10-01)

> **Superseded 2026-10-05:** the rule questions below were answered; see `docs/plan.md` for the plan and the remaining open questions.

## First: commit the skeleton

Nothing from last night's session is committed yet. Quick sanity check, then commit:

```bash
npm install && npm test && npm run dev   # open http://localhost:5173, play a cycle
git add -A && git commit
```

## Main blocker: decide the slice rules

Build order step 2 is stuck on rule decisions, and every later step depends on them. Answer these, even roughly:

1. **Players and Mush.** Is 8 players with 2 Mush right? (Placeholders in `shared/src/config.ts`.)
2. **Turn structure.** Keep "everyone clicks ready → next cycle", or use timed cycles like the original (AP refills every few hours)? This determines whether games are real-time or async.
3. **Infection.** How does a Mush infect someone? Action cost, conditions, whether the target notices.
4. **Voting.** When can players vote, what does a vote do (eject/kill/quarantine), and what are the thresholds?
5. **Win conditions** for each side, and when the game ends. Right now it never ends.
6. **Visibility.** Do Mush know each other? Who sees movement in the log? (Marked `TODO(rules)` in `shared/src/rules.ts`.)

Reference: `Mush/data/DataAction.ods` and `Data.ods` (in French) have the original values. Pick a subset rather than copying everything.

Once these are answered, the next session implements them in `shared` with tests.

## After that, in rough order

- **Chat:** per-room or global, with a rate limit and basic moderation from day one. It's also the main prompt-injection surface for future model-backed bots.
- **Assets:** create the assets folder with `LICENSE.txt` and an attribution file, then show the room art in the DOM client (see `docs/mush-assets.md`).
- **Small open decisions:** code license (MIT?), which hosted model API to use for bots, and hosting.

## Known gaps in the skeleton

- A human who disconnects keeps their seat, but nothing handles them going idle. A cycle can stall forever waiting for their "ready".
- The matchmaker has no queue size cap or per-IP limits yet.
- `npm run deploy -w server` has never been run.
- No linter is configured.

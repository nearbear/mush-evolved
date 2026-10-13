# MVP plan (DRAFT, not final)

Drafted 2026-10-13 from `docs/todo.md`. **Nothing here is decided.** This is a proposal to react to: move items between stages, cut them, or reject the whole shape. Items marked *(?)* are ones where I was unsure which stage they belong in.

> **Bots:** the author does not necessarily plan to run AI-controlled bots in live public games. They may be for testing only. This draft therefore treats bots as test tooling, and the MVP does not depend on bot-filled live games.

## Stages

- **MVP:** the vertical slice from `CLAUDE.md`: a complete game you can play start to finish with other people (or test bots), small and ugly is fine.
- **Private beta:** invited players. Needs enough safety and polish that strangers can be trusted with it, but not public-internet hardening.
- **Public beta:** open to anyone. Robust moderation, deployment, and documentation.
- **Release:** the full game, including the large optional projects.

## MVP

The aim is one complete loop: join, play cycles, infect, die, and win or lose.

**Rules** (all need decisions from you first; see "Open rule decisions" in `docs/todo.md` and `docs/plan.md`)
- Cycles and days (the minimum needed for the daily spore cap).
- Infection and Mush selection.
- Win conditions and death at 0 HP, so a game can actually end.
- The basic attack, and the aggressive flag it sets.

**Architecture**
- Action costs in the view.
- Log level set by the rules.

**UI**
- Stacked actions that show their cost.
- Log levels and timestamps.
- Bar backgrounds and the Mush vs. human indicator, since a player has to read their own status.
- Remove location and status from the inspect panel.
- An end-of-game screen *(?)*.

**Rendering**
- Fix equipment z values and the isometric pixelation, since both are visible bugs.

**Lobby**
- Matchmaking queue and rejoining after a disconnect. Bot fill exists for testing.

**Moderation (minimum)**
- Chat filtering as it stands, plus name moderation.
- Rate limits and abuse limits on every entry point.

**Testing**
- The leak tests (blunt serialization, per-seat views, seat tokens, errors that do not depend on hidden state).
- Wire parser table, legality tests, determinism, JSON round trip, and random-play invariants.
- Persistence, matchmaker, and bot-stall tests.

**DevOps**
- CI, working deployment configuration, secrets, and a staging environment.

**Internationalization (minimum)**
- Structured log events and errors, so later translation does not mean rewriting the rules. The translated catalogs can wait.

## Private beta

- Ship resources, status effects (dirty), lie down, and camera install/dismantle *(?)*.
- Private channel slots, the inventory container look, and the user settings button.
- Game logo, account placeholder, and wiki link button.
- Onboarding and tutorial, so invited players understand the game.
- Report a player, mute and block, and violations with sanctions.
- Site notifications and the architecture behind them.
- Translate the rest of the UI into French and Spanish, plus the language switcher in game.
- Observability, spend alerts, and rollback.
- End-to-end test in CI.

## Public beta

- Admin and moderator tools, ban evasion handling, griefing and AFK handling, and origin hardening.
- Terms, privacy, and a code of conduct (get legal review).
- Per-language moderation word lists.
- Native review of French and Spanish.
- Accessibility.
- Load test, backups and retention, and dependency upkeep.
- Analytics and balance, once privacy is decided.
- Skills *(?)* and secret/covert actions *(?)*. Both are large rule designs; they could slip to release.
- Wiki, first version.

## Release

- The full wiki.
- Audio, after a license check.
- Animated characters and the rendering decision.
- Walking around within a room and sittable equipment (cosmetic).
- Pseudo-locale and layout polish in all languages.
- README, demo GIF, and the write-up.

## Questions for you

1. Is the MVP meant to be public on the internet (as `CLAUDE.md` says) or just playable by you and testers? That changes how much moderation and deployment it needs.
2. If bots are testing-only, should the matchmaker's bot-fill be disabled in production, or removed from live games entirely?
3. Do skills and covert actions belong in the MVP? I left them out because they are big designs.
4. Is "private beta" before or after the write-up? I put the write-up at release.

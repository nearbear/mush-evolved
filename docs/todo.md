# To-do (UI)

Recorded 2026-10-13. Not started.

- [ ] **User settings button.** A button that opens a user settings (game options) panel.
- [ ] **Private channel slots in the iTracky tab.** Show private channels as slots at the top of the tab, plus the total number of private slots. Each slot shows a plus button until its channel is created; clicking the plus starts (creates) the channel.
- [ ] **Inventory looks like a container.** Redo the inventory UI so it reads as a physical container, not a plain list.
- [ ] **Backgrounds for the AP, MP, HP, and morale bars.**
- [ ] **Restyle the Mush vs. human indicator.**
- [ ] **Remove location and status from the inspect panel.**
- [ ] **Fix equipment z values.** Some equipment has incorrect z (draw order/height) values.
- [ ] **Fix isometric view pixelation at varying zooms.** Different zoom levels currently produce odd pixelated renders.
- [ ] **Ship resources and their UI.** Fuel, oxygen, shields, plasma shield, and alerts. This changes game rules, so the `rule` skill applies: the values, costs, and what drains or restores each resource need to be decided first.
- [ ] **Timestamps on logs.**
- [ ] **Status effects, starting with the dirty status.** A rule change: what causes and clears dirty, and its effects, need to be decided first.
- [ ] **Lie down action for beds.** A rule change: cost and effects (e.g. any rest or recovery) need to be decided first.
- [ ] **Camera installation, uninstallation, and dismantling.** Rule change: costs, requirements (tools, items), and visibility need to be decided first.
- [ ] **Basic attack (punch) action.** Costs 1 AP and deals 2 damage. Punching someone is an aggressive action. Other rules (targeting, who sees it in the log, what happens at 0 HP) still need to be decided.
- [ ] **"Aggressive" as an action-level concept.** Actions carry an aggressive flag, and the punch is the first one that sets it. What aggressive actions trigger (log visibility, consequences) needs to be decided.
- [ ] **Walk around within a room (cosmetic only).** Players can move around inside a room, and other players see it on their end. It has no effect on the rules.
- [ ] **Sittable equipment.** Equipment gets a "can sit here" concept so players can sit at terminals and tables. Also cosmetic. Open question: how cosmetic position is sent to other clients without becoming rule state (and without leaking anything hidden).
- [ ] **Game logo.** Add the game logo to the site chrome.
- [ ] **Account button.** A button for the player's account. A placeholder for now: it does nothing yet.
- [ ] **Site notification button.** A button for site notifications, which are separate from in-game logs. They concern the player's standing on the site, e.g. a violation received for their behavior in a game. Still to decide: how notifications are stored and delivered, and how moderation feeds them.
- [ ] **Wiki link button.** A button that links to the wiki.
- [ ] **The wiki.** A large project in its own right: scope, hosting, and content need planning before starting. Likely draws on `docs/mush-assets.md` for art, so the asset licensing (CC BY-NC-SA 4.0) and attribution rules apply.
- [ ] **Vertically stacked actions that show their cost.** Redo the action UI so actions stack vertically and each one indicates its cost (e.g. AP). The client must keep using `view.legalActions` and not compute costs or legality itself, so the cost needs to come from the view. Must work in the phone layout.
- [ ] **Days.** Introduce the concept of days to the game. A rule change, so the `rule` skill applies: what a day is, how it relates to the existing cycle, and what changes at day boundaries need to be decided first.
- [ ] **Log levels.** Each log entry gets a level (info, warn, danger) with distinct styling. The level should be set by the rules when the entry is created, not guessed by the client, and must not leak anything hidden.
- [ ] **Multi-line chat input with basic markdown.** Chat input becomes multi-line and renders basic markdown only (e.g. bold, italic, code, lists). Chat is untrusted input: render safely (no raw HTML), keep moderation and length limits working on the raw text, and keep it usable on phones.

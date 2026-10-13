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

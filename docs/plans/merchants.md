# Merchant ships (plan)

Status: **design in progress, 2026-11-15.** The answers under "Decided" are the owner's (2026-11-15, recorded in `docs/rules/rules-design.md`, "Trading crew to merchant ships"). Everything under "Proposed" and "Open questions" is Claude's draft and not a rule until the owner answers. Issue: [#143](https://github.com/nearbear/mush2/issues/143). Related: [#144](https://github.com/nearbear/mush2/issues/144) (titles), [#145](https://github.com/nearbear/mush2/issues/145) (inactive), [#45](https://github.com/nearbear/mush2/issues/45) (spectators), [#410](https://github.com/nearbear/mush2/issues/410) (drones), [#357](https://github.com/nearbear/mush2/issues/357) (artifacts).

## Sources (reference, not decided)

- **The original Mush.** The `TRANSPORT` ship (`Mush/derived/data/Data/ships.json`: 16 hp, hit 80, dodge 50, no attack, not aggro) sits in the space battle, and `Protocol.HunterState.LockTransport` lets hunters shoot at it. Its deals are the 7 events in `Mush/derived/data/DataEvents/trade_events.json` (`FOREST_DEAL`, `PILGREDISSIM`, `GOOD_PROJECTIONS`, `TECHNO_REWRITE`, `HUMAN_VS_FUEL`, `HUMAN_VS_OXY`, `HUMAN_VS_TREE`). Each is a hail with answers of the form `deal_in` / `deal_out` (`4-10x[RATION]`, `1x{RD_PLAYERS}`, `1x{RD_PROJECT}`, `1x{REPAIR_PILGRED}`), some gated by `need_skills` (`DIPLOMACY`, `BOTANIC`), and the last is always "Jamais" (refuse). The French flavour text is CC BY-NC-SA and can be adapted with attribution.
- **eMush** (`npm run emush`, clean-room). A trade is generated when a transport arrives: one template uniformly from those still eligible (PILGREDISSIM drops once PILGRED is done; the project deals drop once no NERON project is left), each asset's quantity rolled uniformly in its range, a roll of 0 removing that asset from the deal. eMush adds a Treasure Hunt deal (rations or a crew member for a tablet). Its accept action and expiry could not be extracted.

## Decided (owner, 2026-11-15)

### Every merchant

- **Arrival:** random, about 2 a day on average (more or fewer on a given day), with no cap per game. Several merchants can be in orbit at once.
- **Stay:** 4 cycles. A merchant can no longer be contacted once the Daedalus travels.
- **Answering:** only the comms officer, at the Com center terminal, with a deal action costing 2 AP.
- **Who sees the offers:** anyone on the bridge, by looking at the comms terminal, the way the Xyloph entries are seen today.
- **Paying with items:** from any storage (read: the floors of the five storage rooms, `STORAGE_FRONT`, `STORAGE_A_0`, `STORAGE_A_1`, `STORAGE_B_0`, `STORAGE_B_1`; oxygen and fuel from the ship's tanks).
- **Paying with crew:** inactive players only, from anywhere on the ship. This replaces the 2026-10-31 note "inactive crew from Storage, super inactive crew from any room".
- **Delivery:** whatever the crew buys appears on the Front Storage floor.
- **Not enough to pay:** a deal the ship can't pay for (for example, too few inactive players) is still shown, disabled, with the reason.
- **A traded player** counts as a death, but with no corpse and no morale loss. Their items drop where they stood.
- **The officer decides alone:** no vote and no delay.
- **Shooting a merchant:** a merchant that is shot flees at the end of the cycle, with a ship-wide NERON announcement. The mercenaries are the exception (below).

### Mercenaries (decided)

- They sell an escort: the ship stays and shoots hunters for a number of cycles.
- They want fuel, rations, weapons or grenades.
- Only a **hit** angers them, not a miss. Angry mercenaries become hostile, attack the Daedalus, and follow it on travel like a Trax. NERON announces ship-wide that the mercenaries have been angered.

### Other kinds

- **Tech ship:** trades drones and blueprints. It is the only kind that sells blueprints.
- **Archeologists:** three deals: 1 artifact for 1 random artifact; 2 artifacts for 1 specific artifact from their own stock; 3 artifacts for a starmap fragment.
- **Scrappers:** each cycle in orbit they collect the wreckage floating in space (`state.space`, already dropped by dead hunters) and sell it to the crew.
- **Librarians:** trade skill books.
- **Transport:** the original's deals (which ones is still open, below).
- **Deferred:** androids that replace inactive players, sold by the tech ship.

## Proposed (Claude, not decided)

### Arrival roll

At each cycle change after pre-selection, one roll at `config.merchants.arrivalChance` = 0.25 (8 cycles a day × 0.25 = 2 a day), the kind drawn by `config.merchants.kinds[kind].weight`. Several in orbit at once means each merchant has its own id, offer and expiry; the terminal lists them one after another.

### Merchant kinds

| Kind | Offers | Wants | Skill deals |
|---|---|---|---|
| Transport | the original's resource deals: oxygen, fuel, tree pots, PILGRED repair | inactive crew, rations, tree pots, fuel | Diplomat, Botanist (as the original) |
| Mercenaries | an escort contract | fuel, rations, weapons, grenades | Diplomat: a longer contract for the same price |
| Tech ship | `support_drone`, gear blueprints | scraps, artifacts, inactive crew | Robotics Expert: a cheaper drone |
| Archeologists | the three deals above | artifacts | none |
| Scrappers | what they have collected (scraps, space capsules) | rations, fuel, oxygen | none |
| Librarians | skill books (random skills), and possibly the original's project deals (`GOOD_PROJECTIONS`, `TECHNO_REWRITE`) | inactive crew, rations, fuel | Diplomat |

### Mercenaries

- **Contracts:** short (3 cycles) or long (6 cycles), priced in config; both listed as deals.
- **While hired:** at each cycle change, after the hunters act, the mercenary shoots a random hunter with the Trax's numbers (2–3 damage, 50% hit). Hunters can target it (the original's `LockTransport`), and if it dies the contract ends. The contract ends early if the Daedalus travels (open question 2).
- **Once angered:** it becomes a hostile hunter with its current hp and the Trax's attack, follows every jump (`follows: "all"`), and stays until destroyed. Nothing paid is refunded.
- **Confirm prompt:** every player gets a confirm dialog before firing at any merchant, and no automatic hunter targeting ever selects one.
- **What the crew learns:** the NERON line says the mercenaries were angered, not who fired or from where. Turret shots are seen by whoever is in that turret room, so the crew deduces it from who was in which turret.

### State and code

- `shared/src/merchants.ts`: `MERCHANT_KINDS` (weight, hp, reaction to being shot, deal templates written as in the original, with min–max ranges and an optional skill), `merchantCycle` (arrival, expiry, scrapper collection, mercenary shots, fleeing), and an action `close_deal` (`merchant`, `deal`).
- **Where a merchant lives:** recommended as an entry in `state.hunters.list` with a `merchant` field (kind, offer, expiry, contract, angered). Shooting, hp, display and hunter targeting then come for free, and angering is a flag flip. The cost: everything that counts hunters (waves, `arackAround`, `shootingHunters`, the victory and bot checks, travel following) must skip non-hostile merchants. The alternative, a separate `state.merchants`, is cleaner but rebuilds targeting and display.
- **View:** each merchant's kind and hp in the space view as for hunters; the offers in `PlayerView.comms.terminal` only for the living on the bridge; the officer's `close_deal` options through `view.actions`.
- **Traded crew:** `killPlayer` with a `traded` cause: no body, no morale loss, inventory dropped in their room, titles passed on, spectator view ([#45](https://github.com/nearbear/mush2/issues/45)). Run `leak-check`: the trade must not reveal the traded player's role.
- **Single player:** a comms officer bot goal to answer deals ([#316](https://github.com/nearbear/mush2/issues/316) style), or merchants do nothing there.

### Phases

1. The shared system (arrival, stay, terminal, `close_deal`, payment from storage, delivery, traded crew, fleeing when shot) with the Transport's deals. This closes [#143](https://github.com/nearbear/mush2/issues/143).
2. Mercenaries: escort contract, friendly shots, angering, following.
3. Tech ship, archeologists, scrappers, librarians: mostly data once item deals work. Scrappers' collection is the one new cycle step.

Phases 2 and 3 would be new issues under an epic rather than more of [#143](https://github.com/nearbear/mush2/issues/143), which is Public beta work.

## Open questions (owner)

1. **Transport deals:** port all 7 of the original's events (with `RD_PLAYERS` meaning inactive crew), or move the two project deals to the librarians?
2. **Hired mercenaries and travel:** does a hired escort come along when the Daedalus travels, or does the contract end?
3. **Mercenary numbers:** contract lengths and prices, how many shots a cycle, hp, and its attack once angered.
4. **Fleeing when shot:** for the other kinds, does a miss also make them flee, or only a hit, as for the mercenaries? Can a merchant be destroyed, and does it drop wreckage?
5. **Hail announcement:** does NERON announce each arrival ship-wide (kind only), or does the crew learn of it only from the space panel and the terminal?
6. **Accepted deals:** announced ship-wide, or seen only at the terminal? A traded crew member is a death; is it announced like one?
7. **Scrappers:** how much wreckage they collect a cycle (all of it?), and what they charge.
8. **Archeologists:** how many artifacts are in their stock, and can the "random artifact" be the same type as the one given?
9. **Tech ship and librarians:** prices, which blueprints, and whether skill books are random skills or chosen from a list.
10. **Kind weights:** equal, or some kinds rarer?

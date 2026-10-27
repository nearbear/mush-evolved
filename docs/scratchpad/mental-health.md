# Mental Health Disorders and their Treatments

Characters have anywhere from 0 to 14 morale. Morale is not stored; it is derived: `morale = max(0, 14 - 4 × traumas - sum of stressor values)`.

## Decisions (owner, 2026-10-26, after a Gemini review)

- **Trauma uses the "shrinking ceiling" model** (see Trauma below). Trauma is repeatable, cumulative, and hitting zero is meant to have heavy consequences.
- **One shared suicide timer** for all of a character's traumas. It is 4 cycles (12 real hours), and that is intended.
- **The fourth zero kills instantly**, not at the next cycle tick.
- **No remission.** The "???" is gone.
- **Everyone starts with two Despair major stressors**, so they start at 8 morale (14 - 6).
- **Suicide costs the crew morale** (it differs from the original, where a suicide costs nobody anything).
- **Morale restoration is meant to be hard**: major stressors need a therapist (Comfort), a funeral, or a comms event. Minor-stressor removers (speech, banana, lying near a shrink) do not touch majors. Gaining MP when nothing could be removed is kept, because restoring morale is never free.
- **Stressor chips show type, cycle number and public cause only.** No wall-clock timestamps, and no actor name on covert stressors. Corpse Sadness (and Nausea) comes only from corpses on the room floor, at most once per cycle, never from a corpse in an inventory. Confide gives identical feedback whether or not the confidant shared a stressor (only the confider privately sees their own chip go).
- **First pass is a subset.** Not everything below needs to ship at once. The stressors in the first pass are Weariness, Hopelessness, Grief, Sadness and Panic/Despair. Anything needing an unbuilt subsystem (cryo pods and rotting, fire, sabotage, pills, planet expeditions, the Psy role, Demoralize, character-specific traits) stays in this document for later.

## Open

- Which maladaptive coping patterns make the first pass (only ones buildable on existing mechanics; the rest wait for their subsystems).
- Whether a new trauma restarts a running timer, and whether all of a character's patterns must be satisfied to reset it, or any one.
- What the daily loss becomes with no Chun in the game (today it is 2 from the start).
- Whether coping is satisfied by existing actions only, or by bespoke buttons (Crab, Ruminate, Start Fire).

## Stressors

Characters with no **stressors** have the maximum morale available to them. Characters can have quantities of each kind of stressor, which reduce their morale accordingly.

Stressors in the UI are represented as chips that display the type and quantity of the stressor. Each chip can be hovered over (tapped, on a phone) to reveal the cycle and the public cause of the stressor.

Every character starts the game with two **Despair** major stressors.

### Kinds of Minor Stressors

For each minor stressor that a crew member has accrued, their morale is reduced by 1.

- **Weariness**: Accrued at the end of each day. Ignored for characters with the **Optimistic** skill.
- **Hopelessness**: Accrued at the end of each day if Chun is dead.
- **Grief**: Accrued by all other crew members when a crew member dies, including by suicide.
- **Sadness**: Accrued by all crew members who enter a room containing a corpse that is not placed inside of a cryo pod. At most once per cycle. Only corpses on the room floor count, not corpses in an inventory.
- **Nausea**: Same as above except if the corpse is rotting.
- **Panic**: Accrued by crew members randomly via incident points. A panic attack cannot affect the same crew member more than once per cycle.
- **Disgust**: Accrued by crew members when they consume raw food.
- **Obsession**: Accrued by Finola at the end of each cycle that she is dirty.
- **Anxiety**: Accrued when the Prescient action is used.
- **Dread**: Accrued at the end of each cycle spent lost on a planet.
- **Resentment**: Accrued by an asocial crew member for every cycle that they spend in the presence of another crew member.

### Kinds of Major Stressors

For each major stressor that a crew member has accrued, their morale is reduced by 3. Minor stressors will combine into a single major stressor of the same kind if they reach a quantity of 3 - for example it's possible to accrue a major dread stressor if a crew member is lost on a planet for three cycles.

- **Depression**: Accrued when a crew member is the target of a **Demoralize** action.
- **Despair**: Accrued by:
  - Every character at the start of the game (two of them).
  - All crew members who witness the death of another crew member in the same room as them.
  - Raluca when Schrödinger dies.

## Corpses

Corpses are items representing the remains of a crew member who has died. They can be frozen inside cryo pods for 0 AP, jettisoned at a bay for 0 AP, or carried in the inventory of crew members. After 8 cycles of not being frozen, the corpse will begin to rot and can no longer be frozen. After 16 cycles of not being frozen, the corpse will be completely decomposed into a skeleton.

## Actions that remove minor stressors

Actions that remove major stressors will remove a minor stressor if no major stressors are present. If no stressor could be removed, the crew member will gain 1 MP if a minor stressor was expected to be removed, and 3 MP if a major stressor was expected to be removed.

Actions that remove minor stressors never remove a major stressor.

- **Give a speech**: Removes two minor stressors from each crew member in the same room as the speech giver.
- **Confide**: Removes a minor stressor from the confider. If the confidant had a stressor of the same kind, it is also removed.
- **Lie Down**: Removes a minor stressor from the crew member if they are lying down in the same room as a shrink.
- **Eat**: Bananas and certain other foods remove a minor stressor from the crew member who consumes them.

## Actions that remove major stressors

- **Comfort**: Removes a major stressor from the targeted crew member. Also resets the trauma countdown to its maximum value.
- **Caress**: Removes a major stressor from a crew member that caresses Schrödinger.
- **Comms**: Contacting Kaladaan removes two major stressors, and contacting Cygni removes one major stressor.
- **Do it.**: Removes all stressors for Derek's first time.
- **Host Funeral**: Removes a major stressor from all crew members in the same room as the corpse when it is frozen for the first time.

## Trauma

A character has between 0 and 3 traumas. Each trauma is permanent and cannot be healed, and lowers the character's maximum morale by 4: `maxMorale = 14 - 4 × traumas`.

When a crew member's morale reaches zero:

- If they already have 3 traumas, they die at once (suicide).
- Otherwise they lose all their stressors, gain one trauma, and rebound to their new maximum: 10/10 after the first, 6/6 after the second, 2/2 after the third. They are then shown three random maladaptive coping patterns and must choose one.

All of a character's traumas share one suicide timer of 4 cycles (12 real hours). It starts when the first trauma is gained. If the crew member does not cope by the time the countdown reaches 0, they commit suicide. The countdown timer can be reset to its maximum value either by satisfying their maladaptive coping pattern(s), or by being the target of the **Comfort** action.

Mush will never commit suicide due to trauma, but stressors, morale amount, trauma, and trauma countdowns are all still visible to them. They can select maladaptive coping patterns, but do not need to satisfy them to avoid suicide.

A suicide costs the rest of the crew morale (it applies **Grief** to every other crew member).

### UI sketch

The 14-pip morale bar fills from the left with stressors. Each trauma locks 4 pips on the right, drawn dark. A compact trauma pill next to the bar shows the count and the countdown (for example "Trauma ×2, 3 cycles"), and opens a checklist of the chosen coping patterns.

## Maladaptive Coping Patterns

Maladaptive coping patterns are designed to give plausible deniability to Mush room for their nefarious actions.

Players must select one of three randomly presented maladaptive coping patterns that, if not satisfied when the countdown reaches zero, will cause the crew member to commit suicide. A crew member can survive at zero morale for as long as they satisfy their chosen maladaptive coping pattern.

The first pass includes only the patterns that can be built on existing mechanics; the rest wait for their subsystems.

- **Rage**: Satisfied by dealing damage to another crew member.
- **Gluttony**: Satisfied by eating when already full. Food eaten when full will not yield any AP.
- **Pyromania**: Satisfied by starting a fire. Gives access to the **Start Fire** action which costs 0 AP and starts a fire in the current room the next cycle. This option is never available to Mush.
- **Rumination**: Satisfied by using the **Ruminate** action, which costs 3 AP and does nothing.
- **Misery**: Satisfied by using the **Demoralize** action.
- **Mischief**: Satisfied by successfully sabotaging a randomly selected piece of equipment. Temporarily makes the sabotage action available to the crew member. The equipment is reselected each time this coping pattern is satisfied.
- **Crabism**: Satisfied by using the **Crab** action, which costs 1 AP and causes the crew member to lose 2 MP and 1 HP.
- **Wanderlust**: Satisfied by visiting 13 unique rooms.
- **Substance Abuse**: Satisfied by using a pill.
- **Morbidness**: Satisfied by holding a corpse in inventory for a cycle. Immune to the negative effects of entering rooms with corpses.

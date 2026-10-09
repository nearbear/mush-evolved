# Mental Health Disorders and their Treatments

Characters with mental health needs have anywhere from 0 to 14 morale.

## Stressors

Characters with no **stressors** have the maximum morale available to them. Characters can have quantities of each kind of stressor, which reduce their morale accordingly.

Stressors in the UI are represented as chips that display the type and quantity of the stressor. Each chip can be hovered over to reveal information about the exact time and source of the stressor.

### Kinds of Minor Stressors

For each minor stressor that a crew member has accrued, their morale is reduced by 1.

- **Weariness**: Accrued at the end of each day. Ignored for characters with the **Optimistic** skill.
- **Hopelessness**: Accrued at the end of each day if Chun is dead.
- **Grief**: Accrued by all other crew members when a crew member dies.
- **Sadness**: Accrued by all crew members that enter a room containing a corpse that is not placed inside of a cryo pod. Includes corpses in the inventory of crew members.
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
  - All crew members that witness the death of another crew member in the same room as them.
  - Raluca when Schrödinger dies.

## Corpses

Corpses are items representing the remains of a crew member who has died. They can be frozen inside cryo pods for 0 AP, jettisoned at a bay for 0 AP, or carried in the inventory of crew members. After 8 cycles of not being frozen, the corpse will begin to rot and can no longer be frozen. After 16 cycles of not being frozen, the corpse will be completely decomposed into a skeleton.

## Actions that remove minor stressors

Actions that remove major stressors will remove a minor stressor if no major stressors are present. If no stressor could be removed, the crew member will gain 1 MP if a minor stressor was expected to be removed, and 3 MP if a major stressor was expected to be removed.

- **Give a speech**: Removes two minor stressors from each crew member in the same room as the speech giver.
- **Confide**: Removes a minor stressor from the confider. If the confidant had a stressor of the same kind, it is also removed.
- **Lie Down**: Removes a minor stressor from the crew member if they are lying down in the same room as a shrink.
- **Eat**: Bananas and other certain foods remove a minor stressor from the crew member who consumes them.
- **Comms**: Bananas and other certain foods remove a minor stressor from the crew member who consumes them.

## Actions that remove major stressors

- **Comfort**: Removes a major stressor from the targeted crew member. Also resets the mental break countdown to its maximum value.
- **Caress**: Removes a major stressor from a crew member that caresses Schrödinger.
- **Do it.**: Removes all stressors for Derek's first time.
- **Host Funeral**: Removes a major stressor from all crew members in the same room as the corpse when it is frozen for the first time.

## Trauma

When a crew member's morale reaches zero, they permanently gain trauma. Each trauma increases the crew member's morale by 7, but starts a countdown of 4 cycles. If the crew member does not cope by the time the countdown reaches 0, they will commit suicide. The countdown timer can be reset to its maximum value either by satisfying a maladaptive coping pattern, or by being the target of the **Comfort** action.

Mush will never commit suicide due to trauma, but stressors, morale amount, trauma, and trauma countdowns are all still visible to them. They can select maladaptive coping patterns, but do not need to satisfy them to avoid suicide.

## Maladaptive Coping Patterns

Maladaptive coping patterns are designed to give Mush room to have plausible deniability for their nefarious actions.

Players must select one of three randomly presented maladaptive coping patterns that, if not satisfied when the countdown reaches zero, will cause the crew member to commit suicide. A crew member can survive at zero morale for as long as they satisfy their chosen maladaptive coping pattern.

### Nefarious
- **Rage**: Satisfied by dealing damage to another crew member.
- **Gluttony**: Satisfied by eating when already full. Food eaten when full will not yield any AP.
- **Mischief**: Satisfied by successfully sabotaging a randomly selected piece of equipment. Temporarily makes the sabotage action available to the crew member. The equipment is reselected each time this coping pattern is satisfied.
- **Pyromania**: Satisfied by starting a fire. Gives access to the **Start Fire** action.

### Wasteful
- **Rumination**: Satisfied by using the **Ruminate** action, which costs 3 AP and does nothing.
- **Misery**: Satisfied by using the **Demoralize** action.
- **Crabism**: Satisfied by using the **Crab** action, which costs 1 AP and causes the crew member to lose 2 MP and 1 HP.
- **Wanderlust**: Satisfied by visiting 13 unique rooms.
- **Substance Abuse**: Satisfied by using a pill.
- **Morbidness**: Satisfied by holding a corpse in inventory for a cycle. Immune to the negative effects of entering rooms with corpses.

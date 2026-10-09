# Nearbear Mush Ideas

## Gameplay

### Time Slots
A day is divided into 48 time slots, equaling 30 minutes each. Each time slot represents a discrete unit of time in which actions can be scheduled and executed against.

### Cycles
A game's days are broken into cycles according to the game's current cycle frequency (default: 8). Time slots are decoupled from cycles because a cycle's time slot **density** can be used to speed up or slow down the passage of in-game time.

A higher time slot **density** results in faster passage of in-game time, which is useful for speeding up gameplay during less eventful periods. 

A lower time slot **density** slows it down, which can be useful for emphasizing important events such as combat, giving players more time to react.

### **Adrenaline** levels
Each character has a level of **Adrenaline** that indicates their current perceived threat level and influences gameplay. Characters that enter or perceive combat are automatically elevated to the **High** level.

Levels:
- **Low**: Minimal perceived threat, time cycle density = 36. Used by default.
- **Medium**: Elevated perceived threat, time cycle density = 18. Occurs during high risk situations such as damaged oxygen reservoirs and fires.
- **High**: Maximal perceived threat, time cycle density = 6. Occurs during combat, piloting, and other high-stakes situations such as when a character is lost on a planet.

### Turn based action execution
Actions are declared by the player, scheduled for execution based on game rules, and then executed on the start of the time slot that they were declared against.

### Types of Actions
- **Instant** actions: affect game state immediately
- **Moment** actions: affect game state at the start of the currently advanced time slot
- **Extended** actions: affect game state at the end of a number of time slots
- **Continuous** actions: affect game state continuously over a number of time slots

### Action Declaration
Characters can declare actions at any time to enqueue them for execution. All actions have a duration of zero time slots unless otherwise specified. Declaring an action with a non-zero duration will advance the character's action queue by the specified number of time slots.

### Action Scheduling
Action scheduling determines when an action will be executed based on its type and duration.

- **Instant** actions happen immediately and are not part of the scheduling process
- **Moment** actions are executed at the start of the next advanced time slot
- **Extended** actions advance a player's action queue by the specified number of time slots and are executed at the end of that period
- **Continuous** actions are executed passively until interrupted

### Examples of Actions

### **Instant** actions
- Sending a chat message
- Examining an actor

### **Moment** actions
- Accessing terminals or control panels

### **Extended** actions
Time costs are in (parentheses)

#### Spatial
- Moving from one room to another (1)

#### Inventory
- Picking up an item (1)
- Dropping an item (1)
- Crafting an item (3)
- Eating an item (3)

#### Character Combat
- Attacking an enemy (2)
- Pursuing a target* (0)
- Fleeing perceived threats* (0)
- Defending against perceived threats to self* (0)

* Actions marked with an asterisk (*) are considered reactive and are automatically triggered under specific conditions. These actions do not actually perform the action themselves; instead, they automatically generate appropriate reactions based on the character's configured posture.

#### Astronomy
- Discovering a new planet (3)
- Scanning for planet sectors (2)

#### Botany
- Seeding plants (3)
- Watering plants (2)
- Treating plants (2)
- Grafting plants (3)

#### Comms
- Upgrading NERON (2)
- Researching Xyloph (2)
- Acquiring Sol signal (2)
- Establishing communication with rebel base (2)

#### Piloting
- Takeoff (2)
- Landing (2)
- Firing at an enemy (1)
- Collecting scrap (1)

#### Projects
- Participating in a collaborative project (2)

### **Continuous** actions
- Standing: This is the default idle action
- Guarding: Prevents characters from leaving the room in any direction except thru the door that they entered
- Resting: Recovers the character's energy and requires a bed or sofa
- Awaiting: Characters can await various conditions before taking further actions. Further enqueued actions will be executed once the awaited condition is met.

### Examples of Awaiting Conditions
- Awaiting command (can only be triggered by a mission from the commander)
- Awaiting collaboration for projects (e.g., research, PILGRED, NERON enhancements)
- Awaiting presence of equipped crew for expedition launch
- Awaiting completion of expedition 

### Journey to Sol vs. Eden politics
Each game of Mush should result in players arguing over whether their final destination will be Sol or Eden. Some characters like Gioele are motivated to explore the Magellan cluster for selfish reasons, while Paola wishes to join the rebels in Sol and fight against the Mush invasion.

## UI

### Top Navigation Bar
- Leftmost section: Game logo and main menu
- Middle section: Current time slot, cycle, and countdown timer
- Rightmost section: Alerts, notifications, and settings icon buttons

### Bottom Navigation Bar
The bottom navigation bar provides quick access to switching between panels:
- Leftmost panel: Character status, inventory
- Middle panel: Isometric view of the game world
- Rightmost panel: Communication panel containing logs, inventory, and settings tabs

### Actions Declaration
Actions are declared by clicking on bubbles that appear above actors. Each bubble represents a possible action that the actor can take, and clicking on a bubble does one of the following:
- Schedules the action for execution in the appropriate time slot
- Cancels a previously scheduled action
- Opens a detailed view or options for the action

## Action Timeline
The action timeline is one of three toggleable views:

## Past view
What a player has done and perceived in previous time slots.
Should feel cinematic, capturing the flow of past events in a visually engaging manner.

## Current view
What a player is doing and perceiving in the current time slot.
Aids the player in understanding the current state of the game and making timely decisions.

## Future view
What a player is planning to do and might perceive in upcoming time slots.
Aids the player in strategizing and anticipating future events.

### Tabs
Tabs are a player's insight into different aspects of the game, such as the global chat, private channels, and various in-game panels.

### Logs
Logs can be one of TRACE, INFO, WARN, or DANGER.

#### TRACE
**Style**: as being inside of a collapsible section
**Indicates** detailed trace information for each action

- Useful for debugging developers and advanced players
- Collapsed by default

#### INFO
**Style**: always shown in a plain format with a grey badge notification count
**Indicates** general information about the game and actions

#### WARN
**Style**: shown in a yellow badge notification count
**Indicates** risk

#### DANGER
**Style**: shown in a red badge notification count
**Indicates** imminent danger

### Message Input

Hitting enter creates new line by default
Submitting a message requires pressing the button twice

## Ingame indicators

- All new UI elements should be reminiscent of the original mush game's aesthetic.
- Statuses should appear above people’s heads, not hidden away in a clickable panel.
- Indicators should be visually distinct and easy to read at a glance.

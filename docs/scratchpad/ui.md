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

# Mealtime

## Why

I think that the current implementation of food is boring. Rations are just rations, and all they do is one thing, which is give you AP. I think that Stephen (or any Chef) could be given a more defined role in the flow of the game by allowing them to declare *Mealtime* once per day. Chefs would be expected to own a Mealtime thread.

Pros:

- Introduces a daily routine  
- Gives the Chef skill more flavorful mechanical interactions  
- Allows for more interesting Mush gameplay with the Fungal Cuisine skill  
- Makes food more interesting than just an AP battery recharge  
- Enables Spending Time Together in a new formalized group STT mechanic

Cons:

- Complicated, needs to have a simple action workflow if it is to be implemented

## Flavored meals

- During Mealtime cycles, the ration *Cook* action is disabled  
- Instead, there is a set of Flavors:  
  - Each flavor has an associated effect on the ration when it gets added as an ingredient  
  - Flavors can be added to a ration through its *Cook: \<Flavor\>* private action  
  - Flavors have a 1/6 chance of failing to be added \- only the actor will be notified of this  
  - Flavors can be secret, meaning that they will have no effect on the ration’s final appearance. Only characters with the *Fungal Cuisine* skill can add secret flavors. Secret flavors can fail to be added as well.  
  - Chefs cannot fail to add flavors (VERY IMPORTANT because this means that, if a character observes that their chef-produced meal had the effects fewer than two flavors, then they know that a secret flavor was added)  
  - Each kind of flavored cook action is enabled for Chefs  
- Multi flavored rations have the combined effects of their flavors  
- (Optional, but flavorful) flavored rations have a distinct icon/name based on the first non-secret flavor that was added  
- (Optional, but *very* flavorful) flavored rations have a distinct icon/name based on the combination of flavors that were added  
- Flavors:  
  - None: Styled as an MRE. No effects because all flavors either failed or were secret  
  - Sweet: Styled as a Crème Brûlée. Restore 1 morale to the meal consumer  
  - Sour: Styled as a Ceviche. Restore ??? to the meal consumer  
  - Salty: Styled as Poutine. Restore 1 MP to the meal consumer  
  - Bitter: Styled as Pinapaitan. Remove a point of HP from a mental disorder, prioritizing lower HP mental disorders first (cures Crabism immediately, meaning that Janice now has a way to get rid of it\!)  
  - Spicy: Styled as a chicken leg on fire (it’s coated in Carolina Reaper sauce). Remove 2 HP from the meal consumer and grant them 5 Glory  
  - Umami: Styled as a Korean BBQ bowl. Restore 1 HP to the meal consumer  
  - Fungus (secret ingredient, available to Mush only): Increase the meal consumer’s contamination level by 1  
  - Poison (secret ingredient, available to Mush only): One cycle after Mealtime completes, remove 4 HP from the meal consumer

# 

## Mealtime-exclusive Spend Time Together action

Refectory isn't a room that is desirable to idle in, making it awkward to STT because it requires both participants to be online at the exact same moment. What's even more sad is that someone made a beautiful sprite for the dining table, but it never gets paid any attention to. I propose that you can Sit Down at this table just as you can Lie Down in a bed, because of Flavor:

- While in the Refectory, the character targeted version of the “STT” action is no longer enabled  
- During Mealtime, all characters can use their personal STT action to contribute to the group conversation  
- At the end of the cycle, "Mealtime" completes and all table sitters are recorded in a log to the room  
- The largest group of table sitters that have mutually bonded form the list of Morale recipients  
- All players amongst the Morale recipients that have used the STT action are considered STT participants  
- Morale received by an individual cannot exceed 2  
- A pool of (2 \* STT participants) Morale is distributed between all recipients as evenly as possible  
- STT participants are favored if the Morale could not be distributed evenly  
- Characters may now get up and leave at their own pace

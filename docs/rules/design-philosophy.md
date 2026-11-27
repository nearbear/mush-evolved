# Why Mush: Evolved

## FAQ

Here are some questions I assume most will have, let's get them out of the way first:

### Does this game use AI generated art?

No, we have a strict policy against AI generated art. I do not believe generative AI art has a place in video games.

### Where is the source code?

[Mush Evolved source code on Github](https://github.com/nearbear/mush-evolved)

### TODO

I plan to add more to this section.

## How it started

When I first noticed my friends playing eMush, I wanted to join them because I love social deduction games of all forms, but I was hesitant about the effort required. My exact words were "i want to try this game out but i don't think i can if it's a big time commitment." On my first game I played Frieda and I had no idea what was going on at all - I just scanned planets and roleplayed as a grumpy grandma. It was a pretty confusing experience, which is just how it goes for most people's first time it seems? It wasn't until my next game that I was truly hooked: a friend of mine who used to play the game was listening to me explain why I thought the Eleesha was Mush (she was not) when I suddenly noticed my iTrackie mentioned that a participant of my private chat had permanently left this world. I refreshed the page and suddenly, I was no longer playing Roland, but Jin Su! The following minutes were something of a blur, though I remember guarding Rear Corridor from the Mush who controlled my former body as we taunted each other in character. In the end, we prevailed with a return to Sol, with much thanks to the Raluca who answered my endless amount of questions on how to fill the shoes of a Commander.

As I became more connected to the community, I was motivated to help make Mush into the best game it could be because I was in love. Inevitably, I gravitated towards the source code and planned to make some small changes which would prepare me for the big changes that I wanted to make: real-time gameplay with no refreshes, a mobile friendly UI with no scrolling past isometric game views, and historical replays. The codebase was actually really well organized, more so than mine is now even, but I grew anxious about the feasibility of my desired big changes due to the technologies utilized by eMush. It was also around this time that I was being forced to face the reality of the software industry's current direction: everyone needed to learn how to use AI assisted development to find a job, yet it didn't appear anywhere on my resume. This perfect storm of motivations resulted in the beginning of Mush: Evolved (although at the time I was just giving it the very creative name of "mush2").

I started with an NPM project, a copy of the original Motion Twin Mush source code, and a 20$ Claude pro subscription. I had previous experience with React, and it seemed well suited for this kind of project due to its compatibility with ThreeJS (even though I ended up going with PixiJS for the rendering engine) so I selected that as my frontend framework without much hesitation. The backend was something that I didn't have an immediate answer to; I spent some time researching various solutions before I finally arrived at Cloudflare's edge computing solution plainly called "Workers." I went down that route because "rooms" are hosted in datacenters across the world, and a player only needs to connect to a server close to them to receive the game's authoritative state. Cloudflare workers made it so that I didn't need to host a central server of any kind and had the nice aspect of not costing money when no one was connected to them. Anyhow, I'm getting way too technical for an introductory section so I'm going to try to keep things moving.

## Thanks

An obvious thank you goes out to Motion Twin for making the original game and allowing it to continue on by open sourcing all of their art.

The next thank you goes to eMush and its staff team over the years for taking on the work to revive the game and maintain it. You all clearly care about the experience of each individual ship and I admire that you care about keeping the game open to newcomers - an insular community that shuns new blood is bound to stagnate, which you have not. I totally borrowed a ton of your good ideas like the botany changes, free fertile skill, and Chao rework.

Thank you to the eMush community for commenting on my suggestion threads and (I'm being sincere when I say this) telling me why my ideas are overengineered, how they require too many buttons, or how it would upset game balance. Without your feedback, I may have ended up making some pretty atrocious decicions (or at least, more atrocious than the ones I've made so far)!

Thank you to the eMush wiki editors and translators for all the work you've done to keep information up to date - every edit helped to keep my changes aligned with eMush. With the blessing of the community, I hope to pull in all translations.

Thank you to SawJester for being an awesome contributor as usual - your injury, disease, and alien fruit changes all promise to bring more meaning to these mechanics. I greatly appreciate the feedback you and our fellow friends gave during the game's development. I allllmost went with your game name suggestion of "Mush: Respored Respored," but I was worried that people would get confused so I went with your "Mush: Evolved" suggestion instead.

## Mush: Evolved, eMush, and Mush: Respored

I do not know how the future of our three games will interact - that hinges on the collective decisions of each community member, and it's not possible for me to foresee the choices that will be made. I do not desire to be anyone's enemy, as that would be at complete odds with my goal to bring a polished version of Mush that to everyone that enjoys it. One thing that I hope can unite us all is a mutual desire to bring kind and passionate players into the Mush community.

## Part 1: Foundations

- Leak-proof hidden information: You can't have a social deduction game without secrets. Any potential for a secret to get leaked is bad news, so the server sends all view information through a single chokepoint, which is easier to lock down than if it could be sent from many places.
- Historical replays: This was essential to write the foundations for before I started any substantial work on game rule code. I had to revise the snapshot, game state accessors, and game versioning that I initially wrote to make replays work for all of time, regardless of whether one would destructively change the game state's shape or not.
- Real-time gameplay: Websockets enable actions, messages, and everything else to be sent to the user without the need for them to refresh a page.
- Fully rendered ship: Glueing the rooms of the Daedalus required a lot of derived assets from the original game. This was one of the most painful parts (and continues to be), but it was worth it.
- Mobile first: Mush Evolved follows the philosophy that you should always prioritize the look of a UI component on mobile before desktop, as mobile is more difficult to get right.
- Internationalization: I incorporated a string substitution for i18n of various languages very early on. Even if many strings are lackluster, they will be easy to replace later with simple JSON modification.
- Licensing: I had never heard of AGPL before I saw eMush's source code, and I agree with the philosophy of keeping online games open sourced to prevent their deaths should their maintainers stop maintaining it.

### Real-time play

In eMush, the need for your action's webserver HTTP request to complete before executing a second action provided a dampener on how fast you could act. My choice to use websockets instead meant that actions could be performed many times in the blink of an eye, so I added a flat duration of 1.5 seconds to most actions to prevent players with good ping from punching someone 12 times in less than half a second. This acts as an equalizer for players that don't have as good of an internet connection as others. I promise that this will be a minor adjustment, and you will find it acceptable once you can act smoothly. An action queue allows you to press buttons multiple times to chain multiple punches together so that you can easily punch four times in exactly six seconds.

### 2D view changes

- Viewing more than one room at a time is a much more immersive experience.
- Seeing others move around the room at the same time as you makes the game feel alive.
- Make sure to be online when the commander turns the Daedalus!

### Replays and history

- Learn from past mistakes
- Revisit old memories
- Simpler moderation

### Interface, chat, and mobile

Chat is slightly restructured to give players a global chat that is fully sequential like a private channel, but with the ability to spawn threads off of single messages. Threads can still be created by themselves in the threads tab of the iTrackie. There is a dedicated tab for sharing informational reports similar to how sharing astrophysics reports works today. Markdown is utilized, and some extra goodies like checkboxes are implemented as well. Private channels take up a single tab and are navigated similarly to how you might navigate the text messaging app on your phone.

## Part 2: Design changes

Here is a list of changes from eMush: [Changes from eMush](changes-from-emush.md)

The justifications and rationale are below.

### Principle: No mechanical proofs except where specifically designed for it

In my very first alpha mush game, I was quite shocked to learn that the disease I had randomly caught from an expedition as Ian *while I was offline* was actually something that was going to expose me. Thanks to being Ian, and a stroke of blind luck from converting a Raluca that was apparently a professional PILGRED rusher, no one attempted to kill me and we won. Yet, that didn't change how I felt that I had gotten caught through no fault of my own. I was cured of my "disease" in Icarus Bay and from that moment forward, I was doomed. It wasn't clear to me at the time why anyone would think that this is a desirable mechanic to have in the game, but now that I understand people's fear of a never ending hunt for a mush that refuses to act, I understand.

In the current state of eMush, ailments continue to exist as a proof of humanity due to the need for a solution to passive mush players. If disease clearing didn't exist, then a mush player could do nothing and the investigation team would have no choice but to start culling the herd until a yellow corpse appeared in the crew bar. This is certainly an experience that I do not want to bring to Mush Evolved, and I hope to fully remove incidental proofs while still including a mechanism that forces mush to act before the late game arrives, even if said mechanism requires adjustment or even replacement.

Things that I consider to be incidental proofs:

#### Diseases and Mental disorders

In eMush, a public log line that mentions a character being cured of a disease or disorder proves them to be human. In Mush Evolved they will not be, as Mush will similarly be able to receive them but suffer no ill effects.

#### Medkit tests for the existence of shower damage

Thanks to the medkit's ability to detect whether a player is full HP or not, it "leaks" the original HP of the healing recipient within a margin of the per-action heal amount. If the total amount a medkit user heals a player for exceeds the amount of damage that the target could reasonably have taken since they were last known to have been full HP, then the healer can deduce that they took damage from another source. Barring an unlucky streak of three random injuries, the odds are that the source of said damage is from a mush shower.

#### Morale tracking and testing

I do not believe morale tracking to be a fun mechanic that makes the Mush faction experience interesting, so Mush Evolved will allow them to gain and lose morale in all of the same ways that humans can. Mush do not die from zero morale, so they will still have to ask for comfort to prevent suspicion as before.

#### Hunger testing

The only time Mush players get tripped up by this is if they are new. In Mush Evolved, the tooltip for satiety tells you how many cycles it will take for your character to become hungry, even if you are mush. Mush suffer no ill effects from hunger.

### Principle: No passive Mush

Every single day, the Mush ought to always have a reason to act. If they don't, then there is a lack of mutual tension and the game stops being about social deduction. Most asymmetric games have an answer to this kind of problem in the form of a "clock" of sorts that causes the aggressor to lose the game if they schmooze around:

- Counter Strike: The bad guys lose if they don't plant the device by the time that the clock runs out.
- Classic Mafia: The mafiosos lose if the town gathers enough information for process of elimination. Every day that a cop lives narrows down the "worlds" of possibilities.
- Dead by Daylight: The killer loses if the generators all get repaired and the survivors leave through a gate.

Imagine any of those games if they lost their clock. In CS, the bad guys could sit in their spawn, hoping that the good guys got impatient and left their fortified positions - there would be no consequence for such a play. If there is no cop/detective in mafia, then the mafiosos can just randomly point the finger at someone and hope it works out, because that's what everyone else is doing. A cop/detective forces mafiosos to craft a specific narrative (usually involving a counter claim) and try to win around it. If repairing a generator didn't accomplish anything in DBD, a killer could kill all but two players at their own pace, then optimize their win chances by herding the players to be closer together before killing one and allowing the trapdoor to appear. The current version of Mush is in the same caliber of unbalanced-ness as these imagined half-games, and adding *anything* to the lategame that causes passive Mush to lose will allow the previously mentioned incidental proofs to be removed.

In Mush Evolved, my initial vision is:

- Humans reaching "True" Eden is the condition that serves as the ultimate "time's up, you lose" for the Mush, no matter how many of them live. If this doesn't work out then I will keep trying other solutions.
- Eleesha's list and Xyloph's list continue to serve as informational focal points, but with information that will never be fully useless.
- Starmap Fragments serve as our version of DBD's generators.
- "False" Eden will be added to take the place of the old Mush Eden ending to give the Mush an option for a similarly rare late game victory. The more Mush that are alive at the end of the game, the easier that False Eden will be to achieve.

### Principle: No single player or pair of players can unilaterally end the game

<!--
TODO: talk about launch keys and PILGRED
-->
TODO

### Principle: Sabotage should be plausibly deniable

<!--
TODO: talk about research, "false" eden, etc.
-->
TODO

### Principle: Prefer removing busywork if it doesn't result in socialization

This is a minor one, but it's the reasoning behind:

- Moving of all spacesuits to Icarus Bay at the start of the game
- Desiring to add a sharable report to most "features" similar to how astrophysics and projects already work on eMush

<!--
TODO: 
-->
TODO

## What might be wrong

I by no means expect to keep everything that I've changed so far. I plan to move fast and change in response to player feedback while we are in a beta phase.

- Eden as a human win is just one of multiple ways for me to accomplish my goal of forcing the mush to act. If it proves impossible, then I will not go through with this change.

<!--
TODO: What's an expiriment and what's not
-->
TODO

## How decisions get made

<!--
TODO: the decision chain, how players give feedback, how disagreement is handled
-->
TODO

## Where this is going

<!--
TODO: What's next and long term goals
-->
TODO

## Closing words

<!--
TODO
-->
TODO

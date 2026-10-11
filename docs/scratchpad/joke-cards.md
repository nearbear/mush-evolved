# Joke Cards (Mush)

## Suites + Card Rank Effects

### Hearts
- X, Rib: the recipient gains X÷2 Morale.
- J, Self-deprecate: You donate 2 Morale to the recipient.
- Q, Banter: The recipient's disorders are cured.
- K, Gallows-Humor: The recipient's morale is fully restored.

### Diamonds
- X, Jabber: the recipient restores X÷2 MP.
- J, Goof: You donate 2 MP to the recipient.
- Q, Exaggerate: The recipient privately messages their 3 most recent actions to the teller.
- K, Pun: The recipient restores all MP.

### Spades
- X, Insult: the recipient loses X÷2 Morale.
- J, Harass: You leech 2 Morale from the recipient.
- Q, Boast: The recipient gets a migraine.
- K, Bully: The recipient loses half of their Morale rounded down.

### Clubs
- X, Mock: the recipient loses X÷2 MP.
- J, Belittle: You leech 2 MP from the recipient.
- Q, Disparage: The recipient privately messages their inventory to the teller.
- K, Roast: The recipient loses all MP.

## Decks

All decks initially consist of 141 cards:
- Major color: 74 cards (37 each, skewed towards higher ranks)
- Minor color: 66 cards (33 each, skewed towards lower ranks)
- Joker: 1 card. Inflicts the target with the Berserk disease for one cycle.
  - Characters with the Paranoia disease are uncontrollable and will attack each player that enters the same room as them, spending AP to do so.

### Major colored suites
A major colored suite consists of the 37 following cards:
-  2 of suite: 13
-  4 of suite: 8
-  6 of suite: 5
-  8 of suite: 3
-  10 of suite: 2
-  J of suite: 2
-  Q of suite: 2
-  K of suite: 2

### Minor colored suites
A minor colored suite consists of the 33 following cards:
-  2 of suite: 8
-  4 of suite: 5
-  6 of suite: 5
-  8 of suite: 3
-  10 of suite: 3
-  J of suite: 3
-  Q of suite: 3
-  K of suite: 3

## Skills
An optimistic or pessimistic character can do a TELL JOKE action twice a day for 0 AP:
  - The teller will secretly draw from a Joke deck's draw pile.
  - The recipient will experience the effect described by the drawn card.
  - The Joke card will be discarded after being used, unless it is a joker, in which case it is gone forever.
  - At the start of each day, the discard pile is added back into the draw pile and the draw pile is reshuffled.

### Optimist
Available to all as a human skill:
- Optimistic characters lose 1 less Morale each day.
- Gives the character a TELL JOKE (OPTIMISTIC) action that will draw a card from a globally shared optimistic Joke deck.
- Cards in the optimistic Joke deck are disproportionately favorable towards the target of the joke:
  - Hearts and Diamonds cards are major colored suites.
  - Clubs and Spades cards are minor colored suites.

### Pessimist
Available only as a Mush skill:
- Gives the character a TELL JOKE (PESSIMISTIC) action that will draw a card from the globally shared pessimistic Joke deck.
- One joker is permanently added to the deck at the start of the game. This means that a player that draws two jokers is confirmed to be infected.
- Cards are disproportionately unfavorable towards the target of the joke:
  - Hearts and Diamonds cards are minor colored suites.
  - Clubs and Spades cards are major colored suites.

## Log format

A fully generic log line could be something like:
`4 of :hearts: - :roland: makes a funny joke about airplane food to :raluca:, who gained 2 :morale: as a result.`

Parameters:
- Card rank
- Card suite
- Joke teller
- Joke type's canned line
- Joke recipient
- Joke type effect

Only the two participants of the joke would see these lines. 

## Character lines

This would be optional but a cute addition in my opinion. If you didn't do this, you would just have a single joke line for each joke type (And then translated into each of the 3 languages? So, per language, that requires 288 lines for the individualized jokes, but only 16 for genericized jokes).

Each character could have its own unique "dictionary" of lines for each type of joke card, allowing for personalized messages. Some example jokes i thought of:
- Roland (Absurd): "Why did the chicken cross the road? To get to the other side!"
- Raluca (Pun): "When I told NERON that I needed a break, I didn't mean that I wanted to get trapped by a jammed door in the refectory _twice_."

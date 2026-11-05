// Dev-only design kit for mush2's own components (/design-kit-mush2), next to the Mush art kit (design-kit.html).
// Each section renders a real component from web/src with sample props, so it can be checked in isolation.
// Sample text is English only: this page never ships.

import { bustIcon, ENDING_ART, SHIP_CARD_ICONS } from "../art/assets.ts";
import { ShipCard, type ShipCardHighlight } from "../games/ShipCard.tsx";
import "./mush2Kit.css";

const icon = (name: string) => SHIP_CARD_ICONS[name]!;

// The design's highlights. Two of its eight icons aren't in Mush/, so they're left out; labels are placeholders
// until the highlights themselves are decided.
const highlights: ShipCardHighlight[] = [
  { icon: icon("mush"), label: "Highlight 1", count: 2 },
  { icon: icon("projects_done"), label: "Highlight 2", count: 17 },
  { icon: icon("research_done"), label: "Highlight 3", count: 16 },
  { icon: icon("survival"), label: "Highlight 4", count: 11 },
  { icon: icon("plasma"), label: "Highlight 5" },
  { icon: icon("pa_pilgred"), label: "Highlight 6" },
];

export default function Mush2Kit() {
  return (
    <div className="m2k">
      <header className="m2k-header">
        <h1>Design kit (mush2)</h1>
        <nav aria-label="Sections">
          <a href="#ship-card">Ship card</a>
          <a href="/design-kit.html">Mush art kit</a>
        </nav>
      </header>
      <main>
        <section id="ship-card">
          <h2>Ship card</h2>
          <p>
            <code>games/ShipCard.tsx</code>: one character's finished ship. Every image and sentence is a prop. With{" "}
            <code>to</code> the card is a link with hover and focus states; without it, a plain box.
          </p>
          <div className="m2k-row">
            <figure>
              <ShipCard
                to="#ship-card"
                name="Jin Su"
                portrait={bustIcon("jinsu")}
                score={289}
                background={{ src: ENDING_ART.eden, x: 66, y: 45 }}
                events={[
                  { icon: icon("calendar"), caption: "Day 12 Cycle 1", text: "Survived to the end" },
                  { icon: icon("eden1"), caption: "Day 12 Cycle 1", text: "The Daedalus has settled on Eden!" },
                ]}
                highlights={highlights}
              />
              <figcaption>The design, as a link</figcaption>
            </figure>
            <figure>
              <ShipCard
                name="Jin Su"
                portrait={bustIcon("jinsu")}
                score={112}
                mush
                background={{ src: ENDING_ART.eden, x: 20, y: 50 }}
                events={[{ icon: icon("eden1"), caption: "Day 12 Cycle 1", text: "The Daedalus has settled on Eden!" }]}
                highlights={highlights.slice(0, 3)}
              />
              <figcaption>
                <code>mush</code>, no <code>to</code>, one event
              </figcaption>
            </figure>
          </div>
        </section>
      </main>
    </div>
  );
}

// The kit's primitives section (#435): styles/primitives.css's field label, pickable tile, muted note and list row, each on the
// dark panel and on the light card, so a dark-on-dark (or light-on-light) token bug shows here first.

import { characterGivenName, type CharacterId } from "@mush2/shared";
import { useState } from "react";
import { standingSprite } from "../art/assets.ts";
import { TerminalFrame } from "../hud/TerminalFrame.tsx";
import { noop, Section } from "./KitSection.tsx";

const PICKS: CharacterId[] = ["jinsu", "chun", "terrence", "hua"];

/** The same markup on either surface: what the private channel dialog (hud/PrivateChannels.tsx) builds. */
function Primitives() {
  const [picked, setPicked] = useState<CharacterId[]>(["chun"]);
  return (
    <div className="m2k-primitives">
      <label className="field">
        <span className="field-label">Field label</span>
        <input placeholder="Placeholder" />
      </label>
      <fieldset className="field">
        <legend className="field-label">Pickable tiles (one pressed)</legend>
        <div className="m2k-picks">
          {PICKS.map((c) => {
            const on = picked.includes(c);
            return (
              <button
                key={c}
                type="button"
                className="pick-tile m2k-pick"
                aria-pressed={on}
                onClick={() => setPicked((ps) => (on ? ps.filter((p) => p !== c) : [...ps, c]))}
              >
                <span style={standingSprite(c, 1)} aria-hidden="true" />
                <span>{characterGivenName(c)}</span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <p className="sub">A muted note: a hint, an empty state or a caption.</p>
      <button type="button" className="list-row" onClick={noop}>
        <span style={{ flex: 1 }}>List row: a signal or a thread</span>
        <span>3</span>
      </button>
    </div>
  );
}

export function PrimitivesSection() {
  return (
    <Section
      id="primitives"
      heading="Primitives on both surfaces"
      about={
        <>
          <code>styles/primitives.css</code>: <code>.field</code> with <code>.field-label</code> (a bold label above
          its control, on a <code>label</code> or a <code>fieldset</code>), <code>.pick-tile</code> (a portrait over a
          name, toggled with <code>aria-pressed</code>), <code>.sub</code> (a muted note) and <code>.list-row</code> (a
          signal or thread row: a fixed light band with a faint divider edge, the same on both surfaces). Each reads surface tokens
          (<code>--text</code>, <code>--muted</code>, <code>--field-*</code>, <code>--pick-*</code>) that{" "}
          <code>tokens.css</code> sets for the dark panels and <code>cut-card.css</code> redefines for the light card.
        </>
      }
    >
      <figure>
        <div className="m2k-dark-surface">
          <Primitives />
        </div>
        <figcaption>Dark panel (tokens.css)</figcaption>
      </figure>
      <figure>
        <div className="terminal-popup kit-panel m2k-terminal m2k-terminal-tall">
          <TerminalFrame name="Light card" type="COM_CENTER" login={{ user: "jkim", access: "granted" }} onClose={noop}>
            <Primitives />
          </TerminalFrame>
        </div>
        <figcaption>Light card (cut-card.css), as in a FramedDialog or terminal</figcaption>
      </figure>
    </Section>
  );
}

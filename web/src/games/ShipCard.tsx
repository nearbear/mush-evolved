// A 200x255 card summing up one character's finished ship: who they played, their triumph score, how they and the
// ship ended, and the highlights they collected. A pure view: every image URL and every sentence comes in as props
// (from a finished game's record, never computed here), so it works for any character and any ending. With `to`
// the whole card is an in-app link (React Router); without it, a plain box. Shown on the dev design kit page (/design-kit-mush2).

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { SHIP_CARD_ICONS } from "../art/assets.ts";
import { Hint } from "../hud/IconButton.tsx";
import "./shipCard.css";

/** One line in the middle panel, e.g. the character's end, then the ship's. */
export interface ShipCardEvent {
  /** 16px icon URL. */
  icon: string;
  /** Alt text for the icon; leave it out when the caption and text already say it. */
  iconLabel?: string;
  /** The day and cycle it happened, already formatted ("Day 12 Cycle 1"). */
  caption: string;
  text: ReactNode;
}

/** A highlight icon along the bottom, with an optional count in its corner. */
export interface ShipCardHighlight {
  /** 16px icon URL. */
  icon: string;
  /** What the highlight is: the icon's alt text and its tooltip. */
  label: string;
  count?: number;
}

export interface ShipCardProps {
  name: string;
  /** 16px character bust (`bustIcon`), drawn at 3x. */
  portrait: string;
  /** Triumph total; leave it out to hide the score. */
  score?: number;
  /** Colours the score as a Mush's. */
  mush?: boolean;
  /** Faded art behind the card at its natural size (`ENDING_ART`); x and y are background-position percents. */
  background?: { src: string; x?: number; y?: number };
  events: readonly ShipCardEvent[];
  highlights: readonly ShipCardHighlight[];
  /** An in-app path: the whole card becomes a client-side link to it. */
  to?: string;
}

export function ShipCard({ name, portrait, score, mush = false, background, events, highlights, to }: ShipCardProps) {
  const { t } = useTranslation();
  const body = (
    <>
      {background && (
        <span
          className="ship-card-bg"
          aria-hidden="true"
          style={{ backgroundImage: `url("${background.src}")`, backgroundPosition: `${background.x ?? 50}% ${background.y ?? 50}%` }}
        />
      )}
      <div className="ship-card-row ship-card-padded">
        <img className="ship-card-portrait" src={portrait} alt="" width={48} height={48} />
        <div className="ship-card-col">
          <span className="ship-card-name">{name}</span>
          {score !== undefined && (
            <span className={mush ? "ship-card-score mush" : "ship-card-score"}>
              <span>{score}</span>
              <img src={SHIP_CARD_ICONS["triumph"]} alt={t("shipCard.triumph")} width={16} height={16} />
            </span>
          )}
        </div>
      </div>
      <div className="ship-card-middle">
        {events.length > 0 && (
          <div className="ship-card-infos">
            {events.map((event, i) => (
              <div key={i} className="ship-card-info">
                <div className="ship-card-row">
                  <img src={event.icon} alt={event.iconLabel ?? ""} width={16} height={16} />
                  <span className="ship-card-caption">{event.caption}</span>
                </div>
                <span>{event.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {highlights.length > 0 && (
        <div className="ship-card-highlights ship-card-padded">
          {highlights.map((h, i) => {
            const label = h.count === undefined ? h.label : t("shipCard.highlightCount", { label: h.label, n: h.count });
            return (
              <Hint key={i} label={label}>
                <span className="ship-card-highlight">
                  <img src={h.icon} alt={label} width={16} height={16} />
                  {h.count !== undefined && (
                    <span className="ship-card-count" aria-hidden="true">
                      {h.count}
                    </span>
                  )}
                </span>
              </Hint>
            );
          })}
        </div>
      )}
    </>
  );
  return to ? (
    <Link className="ship-card link" to={to}>
      {body}
    </Link>
  ) : (
    <div className="ship-card">{body}</div>
  );
}

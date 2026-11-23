// The end screen: once the game has ended, the ending's art, who won, and every seat with its player's name, character
// and role (`view.crew`, revealed by viewFor only then). It opens by itself, again after a reload or reconnect, and can
// be closed to look around; the top bar's Results button reopens it. Live, it links to the game's replay (`replayId`);
// a replay shows it at its last step without the link.

import { Dialog } from "@base-ui/react/dialog";
import type { CrewReveal, Ending, PlayerView, Winner } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { DEAD_ICON, ENDING_ART, bustIcon } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { DialogHeader } from "./DialogHeader.tsx";
import "./settings.css";
import "./endScreen.css";

export function EndScreen({
  view,
  open,
  onOpenChange,
  replayId,
}: {
  view: PlayerView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The game's room, for the "Watch the replay" link; the replay page passes none. */
  replayId?: string | undefined;
}) {
  const { t } = useTranslation();
  const { winner, ending, crew } = view;
  if (!winner || !ending || !crew) return null;
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="settings-backdrop" />
        <Dialog.Popup className="settings-popup end-screen">
          <DialogHeader heading={t("gameOver.title")} closeLabel={t("terminal.close")} />
          <img className="end-banner" src={ENDING_ART[ending]} alt="" />
          <Dialog.Description className={`end-verdict ${winner}`}>{t(verdictKey(ending, winner))}</Dialog.Description>
          <ul className="end-crew" aria-label={t("gameOver.crew")}>
            {crew.map((c) => (
              <CrewRow key={c.id} member={c} you={c.id === view.you.id} />
            ))}
          </ul>
          {replayId && (
            <p className="end-replay">
              {/* A copy not yet confirmed shows the replay page's "Preparing replay…" until it is. */}
              <Link to={`/replay/${encodeURIComponent(replayId)}`}>{t("gameOver.watchReplay")}</Link>
            </p>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** The sentence for how a game ended; also the finished games list's (games/GamesPage.tsx). */
export function verdictKey(ending: Ending, winner: Winner) {
  if (ending === "humans_dead") return "gameOver.humansDead";
  if (ending === "ship_destroyed") return "gameOver.shipDestroyed";
  if (ending === "eden") return "gameOver.eden"; // always a human win (owner, 2026-11-22)
  return winner === "mush" ? "gameOver.solMush" : "gameOver.solHumans";
}

function CrewRow({ member, you }: { member: CrewReveal; you: boolean }) {
  const { t } = useTranslation();
  const names = useNames();
  return (
    <li className={you ? "end-crew-row you" : "end-crew-row"} data-alive={member.alive}>
      <img className="end-crew-bust" src={bustIcon(member.character)} alt="" />
      <span className="end-crew-names">
        <span className="end-crew-character">{names.character(member.character)}</span>
        <span className="end-crew-player">
          {/* Player names are never translated. */}
          {member.name ?? t("gameOver.nameHidden")}
          {member.isBot && <span className="end-crew-ai"> · {t("common.ai")}</span>}
          {you && <span className="end-crew-you"> · {t("gameOver.you")}</span>}
        </span>
      </span>
      {!member.alive && <img className="end-crew-dead" src={DEAD_ICON} alt={t("gameOver.dead")} />}
      <span className={`end-crew-role ${member.role}`}>{member.role === "mush" ? t("gameOver.roleMush") : t("gameOver.roleHuman")}</span>
    </li>
  );
}

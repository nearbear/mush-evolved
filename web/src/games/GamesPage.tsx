// The public list of finished games (#155), at /games: newest first, a page at a time (`GET /api/games`). Each game
// shows when it ended, how long it ran, its lobby's language, how it ended, and its crew: the character each player
// ended in, their name at the time, alpha Mush, beta Mush or Human, and whether they survived. Single-player games
// are never here. Each entry links to its replay (#372).

import { crewRoleLabel, type FinishedCrewMember, type FinishedGame, type FinishedGamesResponse, type LobbyLanguage, MAX_GAMES_PAGE } from "@mush2/shared";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { api } from "../account/api.ts";
import { DEAD_ICON, bustIcon } from "../art/assets.ts";
import { verdictKey } from "../hud/EndScreen.tsx";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher.tsx";
import { useNames } from "../i18n/names.ts";
import "./games.css";

type Load = { status: "loading" } | { status: "error" } | { status: "ok"; page: FinishedGamesResponse };

async function fetchGames(before: string | undefined): Promise<FinishedGamesResponse> {
  const response = await api.api.games.$get({ query: { limit: String(MAX_GAMES_PAGE), ...(before !== undefined && { before }) } });
  if (!response.ok) throw new Error(String(response.status));
  return (await response.json()) as FinishedGamesResponse;
}

export default function GamesPage() {
  const { t } = useTranslation();
  // The cursor of each page shown so far: the first is the newest games (no cursor). Newer goes back one; a new array
  // (even a copy, for Try again) loads the last one's page.
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    let live = true;
    setLoad({ status: "loading" });
    fetchGames(cursors.at(-1)).then(
      (page) => live && setLoad({ status: "ok", page }),
      () => live && setLoad({ status: "error" }),
    );
    return () => {
      live = false;
    };
  }, [cursors]);

  const older = useCallback((next: string) => {
    setCursors((c) => [...c, next]);
    window.scrollTo({ top: 0 });
  }, []);
  const newer = useCallback(() => {
    setCursors((c) => (c.length > 1 ? c.slice(0, -1) : c));
    window.scrollTo({ top: 0 });
  }, []);

  const next = load.status === "ok" ? load.page.next : null;
  return (
    <main className="games-page">
      <header className="games-header">
        <h1>{t("games.title")}</h1>
        <nav className="games-nav">
          <Link to="/">{t("games.back")}</Link>
          <LanguageSwitcher inline />
        </nav>
      </header>
      {load.status === "loading" && <p className="games-status loading">{t("games.loading")}</p>}
      {load.status === "error" && (
        <p className="games-status" role="alert">
          {t("games.error")}{" "}
          <button type="button" onClick={() => setCursors((c) => [...c])}>
            {t("games.retry")}
          </button>
        </p>
      )}
      {load.status === "ok" && load.page.games.length === 0 && <p className="games-status">{t("games.empty")}</p>}
      {load.status === "ok" && load.page.games.length > 0 && (
        <ol className="games-list">
          {load.page.games.map((game) => (
            <GameCard key={game.id} game={game} replay />
          ))}
        </ol>
      )}
      {(cursors.length > 1 || next) && (
        <nav className="games-paging">
          <button type="button" disabled={cursors.length <= 1} onClick={newer}>
            {t("games.newer")}
          </button>
          <button type="button" disabled={!next} onClick={() => next && older(next)}>
            {t("games.older")}
          </button>
        </nav>
      )}
    </main>
  );
}

/** A language's name in that language (they are never translated). */
function languageName(language: LobbyLanguage): string {
  return new Intl.DisplayNames([language], { type: "language" }).of(language) ?? language;
}

/**
 * One finished game: its facts and crew, and with `replay` a link to watch it. Also the summary of a replay too old to
 * read (`replay/ReplayNotice.tsx`), without the link.
 */
export function GameCard({ game, replay = false }: { game: FinishedGame; replay?: boolean }) {
  const { t, i18n } = useTranslation();
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium", timeStyle: "short" }).format(game.endedAt);
  return (
    <li className="games-card">
      <article aria-label={t("games.game", { date })}>
        <div className="games-facts">
          <time dateTime={new Date(game.endedAt).toISOString()}>{date}</time>
          <span>{t("games.cycles", { count: game.cycles })}</span>
          {game.language && <span lang={game.language}>{languageName(game.language)}</span>}
          {replay && (
            <Link className="games-replay" to={`/replay/${encodeURIComponent(game.id)}`}>
              {t("games.watchReplay")}
            </Link>
          )}
          <span className={`games-verdict ${game.winner}`}>{t(verdictKey(game.ending, game.winner))}</span>
        </div>
        <ul className="games-crew">
          {game.crew.map((member) => (
            <CrewMember key={member.seat} member={member} />
          ))}
        </ul>
      </article>
    </li>
  );
}

const ROLE_KEYS = {
  alpha_mush: "faction.alphaMush.name",
  beta_mush: "faction.betaMush.name",
  human: "faction.human.name",
} as const;

function CrewMember({ member }: { member: FinishedCrewMember }) {
  const { t } = useTranslation();
  const names = useNames();
  const role = crewRoleLabel(member);
  return (
    <li className="games-member" data-alive={member.alive}>
      <img className="games-bust" src={bustIcon(member.endCharacter)} alt="" />
      <span className="games-names">
        <span className="games-character">{names.character(member.endCharacter)}</span>
        <span className="games-player">
          {/* Player names are never translated. */}
          {member.name ?? t("gameOver.nameHidden")}
          {member.isBot && <span className="games-ai"> · {t("common.ai")}</span>}
        </span>
      </span>
      {!member.alive && <img className="games-dead" src={DEAD_ICON} alt={t("gameOver.dead")} />}
      <span className={`games-role ${role === "human" ? "human" : "mush"}`}>{t(ROLE_KEYS[role])}</span>
    </li>
  );
}

import { ScrollArea } from "@base-ui/react/scroll-area";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CHARACTERS, type CharacterId, type LobbyLanguage, type MatchmakerServerMessage } from "@mush2/shared";
import { characterImage } from "../art/assets.ts";
import { Credits } from "../hud/Credits.tsx";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher.tsx";
import { matchmakerSocket, type SeatTicket } from "../net.ts";
import logoUrl from "../../../Mush/www/img/design/logo_welcome.png?url";
import "./lobby.css";
import { hasWebGL2 } from "./webgl.ts";

/** One row per language, each its own matchmaker queue. Ship names are the language's own name and are not translated. */
const SHIPS: readonly { name: string; language: LobbyLanguage }[] = [
  { name: "English", language: "en" }, // i18n-ignore
  { name: "Français", language: "fr" }, // i18n-ignore
  { name: "Español", language: "es" }, // i18n-ignore
];

type QueueCount = { waiting: number; seats: number };

/** Live waiting counts for every ship, from a watching socket on each language's queue. */
function useShipCounts(active: boolean): Partial<Record<LobbyLanguage, QueueCount>> {
  const [counts, setCounts] = useState<Partial<Record<LobbyLanguage, QueueCount>>>({});
  useEffect(() => {
    if (!active) return;
    const sockets = SHIPS.map(({ language }) => {
      const socket = matchmakerSocket(language);
      socket.addEventListener("message", (e: MessageEvent<string>) => {
        const msg = JSON.parse(e.data) as MatchmakerServerMessage;
        if (msg.type === "queued") setCounts((c) => ({ ...c, [language]: { waiting: msg.waiting, seats: msg.seats } }));
      });
      return socket;
    });
    return () => {
      for (const socket of sockets) socket.close();
    };
  }, [active]);
  return counts;
}

/** How long the pod takes to fade to dark before the game takes over; matches `pod-sleep` in lobby.css. */
const SLEEP_MS = 600;

/** The cryopod drawn behind the panel, with Pixi; loaded after the panel shows. */
const PodBackdrop = lazy(() => import("./pixi/PodBackdrop.tsx"));

/** The picker's row, alphabetical by full name. */
const ROSTER = [...CHARACTERS].sort((a, b) => a.name.localeCompare(b.name));

const GUEST_KEY = "mush2.guest";

/** Next "Guest N". Not random, just a counter kept per browser. */
function nextGuestName(): string {
  let n = 0;
  try {
    n = Number(localStorage.getItem(GUEST_KEY)) || 0;
    localStorage.setItem(GUEST_KEY, String(n + 1));
  } catch {
    n = Date.now() % 1000; // storage blocked: still give a distinct-ish name
  }
  return `Guest ${n + 1}`; // i18n-ignore: a player name, stored by the server
}

export function Lobby({ onMatched }: { onMatched: (ticket: SeatTicket) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState<string | null>(null);
  const [ship, setShip] = useState<(typeof SHIPS)[number] | null>(null);
  const [character, setCharacter] = useState<CharacterId | null>(null);
  // Kept as data, not text, so the status follows the language if it changes while waiting.
  const [queue, setQueue] = useState<QueueCount | null>(null);
  const [error, setError] = useState("");
  const [sleeping, setSleeping] = useState(false);
  const pod = useRef<HTMLDivElement>(null);
  // Without WebGL2 the game can't be drawn, so there is nothing to join.
  const [webgl] = useState(hasWebGL2);
  const roster = useRef<HTMLDivElement>(null);

  // The roster only scrolls sideways, so a mouse wheel scrolls it sideways too. Needs a
  // non-passive listener to stop the page scrolling as well.
  useEffect(() => {
    const el = roster.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  useEffect(() => {
    if (name === null || character === null || ship === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const socket = matchmakerSocket(ship.language);
    socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "queue", name, character })));
    socket.addEventListener("message", (e: MessageEvent<string>) => {
      const msg = JSON.parse(e.data) as MatchmakerServerMessage;
      if (msg.type === "queued") setQueue({ waiting: msg.waiting, seats: msg.seats });
      if (msg.type === "matched") {
        // Fade the pod out first, so the game's wake-up starts from dark.
        setSleeping(true);
        const ticket = { roomId: msg.roomId, token: msg.token };
        timer = setTimeout(() => onMatched(ticket), SLEEP_MS);
      }
      if (msg.type === "characterTaken") {
        // Back to the picker to choose again.
        setError(t("lobby.characterTaken"));
        setCharacter(null);
      }
      if (msg.type === "error") setError(t(`errors.${msg.message}` as never, { defaultValue: msg.message }));
    });
    return () => {
      clearTimeout(timer);
      socket.close();
    };
  }, [name, character, ship, onMatched, t]);

  const shipCounts = useShipCounts(webgl && name === null);
  const step = !webgl ? "noWebgl" : name === null ? "ship" : character === null ? "character" : "waiting";

  return (
    <main className={sleeping ? "pod pod-sleeping" : "pod"}>
      {import.meta.env.DEV && (
        <nav className="pod-devlinks">
          <a href="/editor">Ship Editor</a> {/* i18n-ignore: dev servers only */}
          <a href="/design-kit.html">Design kit</a> {/* i18n-ignore: dev servers only */}
        </nav>
      )}
      <div className="pod-toolbar">
        <LanguageSwitcher inline />
      </div>
      {webgl && (
        <Suspense fallback={null}>
          <PodBackdrop pod={pod} />
        </Suspense>
      )}
      <div className="pod-window" ref={pod}>
        <section className="kit-box pod-panel">
        <h1 className="pod-title">
          <img className="pod-logo" src={logoUrl} alt="mush2" /> {/* i18n-ignore: product name */}
        </h1>
        {/*
          All steps stay rendered in one grid cell and only the current one is visible,
          so the panel is always sized to the largest and never resizes on join.
        */}
        <div className="pod-states">
          <div className="pod-state" inert={step !== "noWebgl"}>
            <p className="pod-status">{t("lobby.noWebgl")}</p>
          </div>
          <div className="pod-state" inert={step !== "waiting"}>
            <p className="pod-subtitle">{`${name ?? ""} · ${ship?.name ?? ""}`}</p>
            <p className="loading pod-status">{error || (queue ? t("lobby.waiting", queue) : t("common.connecting"))}</p>
          </div>
          <div className="pod-state" inert={step !== "character"}>
            <p className="pod-subtitle">{t("lobby.pickCharacter")}</p>
            <ScrollArea.Root className="pod-roster">
              <ScrollArea.Viewport ref={roster} className="pod-roster-viewport">
                <ul className="pod-characters">
                  {ROSTER.map((c) => (
                    <li key={c.id}>
                      <button type="button"
                        className="pod-character"
                        onClick={() => {
                          setError("");
                          setCharacter(c.id);
                        }}
                      >
                        <img src={characterImage(c.id)} alt="" />
                        <span className="pod-character-name">{c.name}</span>
                        <span className="pod-character-profession">{t(`characters.profession.${c.id}`)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar className="pod-roster-bar" orientation="horizontal">
                <ScrollArea.Thumb className="pod-roster-thumb" />
              </ScrollArea.Scrollbar>
            </ScrollArea.Root>
            {error && <p className="pod-status">{error}</p>}
          </div>
          <div className="pod-state" inert={step !== "ship"}>
            <p className="pod-subtitle">{t("lobby.tagline")}</p>
            <ul className="pod-ships">
              {SHIPS.map((s) => {
                const count = shipCounts[s.language];
                return (
                <li key={s.name}>
                  <button type="button"
                    className="big pod-ship"
                    onClick={() => {
                      setShip(s);
                      setName(nextGuestName());
                    }}
                  >
                    <span className="pod-ship-name">{s.name}</span>
                    <span className="pod-ship-note">{count && count.waiting >= count.seats - 1 ? t("lobby.nearlyFull") : t("lobby.awaitingCrew")}</span>
                    <span className="pod-ship-crew">{count ? `${count.waiting}/${count.seats}` : "–"}</span>
                  </button>
                </li>
                );
              })}
            </ul>
          </div>
        </div>
        </section>
      </div>
      <Credits className="pod-credits" />
    </main>
  );
}

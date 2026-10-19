import { ScrollArea } from "@base-ui/react/scroll-area";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CHARACTERS, type CharacterId, type MatchmakerServerMessage } from "@mush2/shared";
import { characterImage } from "../art/assets.ts";
import { LanguageSwitcher } from "../i18n/LanguageSwitcher.tsx";
import { matchmakerSocket, type SeatTicket } from "../net.ts";
import logoUrl from "../../../Mush/www/img/design/logo_welcome.png?url";
import "./lobby.css";
import { hasWebGL2 } from "./webgl.ts";

/**
 * Placeholder rows: there is no lobby backend yet, every row joins the same global queue.
 * Ship names are the language's own name and are not translated.
 */
const SHIPS = [
  { name: "English", crew: 5, seats: 8, note: "lobby.awaitingCrew" }, // i18n-ignore
  { name: "Français", crew: 7, seats: 8, note: "lobby.nearlyFull" }, // i18n-ignore
  { name: "Español", crew: 2, seats: 8, note: "lobby.awaitingCrew" }, // i18n-ignore
] as const;

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
  return `Guest ${n + 1}`;
}

export function Lobby({ onMatched }: { onMatched: (ticket: SeatTicket) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState<string | null>(null);
  const [ship, setShip] = useState("");
  const [character, setCharacter] = useState<CharacterId | null>(null);
  // Kept as data, not text, so the status follows the language if it changes while waiting.
  const [queue, setQueue] = useState<{ waiting: number; seats: number } | null>(null);
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
    if (name === null || character === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const socket = matchmakerSocket();
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
      if (msg.type === "error") setError(msg.message);
    });
    return () => {
      clearTimeout(timer);
      socket.close();
    };
  }, [name, character, onMatched, t]);

  const step = !webgl ? "noWebgl" : name === null ? "ship" : character === null ? "character" : "waiting";

  return (
    <main className={sleeping ? "pod pod-sleeping" : "pod"}>
      <div className="pod-toolbar">
        <LanguageSwitcher inline />
      </div>
      {webgl && (
        <Suspense fallback={null}>
          <PodBackdrop pod={pod} />
        </Suspense>
      )}
      <div className="pod-window" ref={pod}>
        <section className="panel pod-panel">
        <h1 className="pod-title">
          <img className="pod-logo" src={logoUrl} alt="mush2" />
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
            <p className="pod-subtitle">{`${name ?? ""} · ${ship}`}</p>
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
              {SHIPS.map((s) => (
                <li key={s.name}>
                  <button type="button"
                    className="big pod-ship"
                    onClick={() => {
                      setShip(s.name);
                      setName(nextGuestName());
                    }}
                  >
                    <span className="pod-ship-name">{s.name}</span>
                    <span className="pod-ship-note">{t(s.note)}</span>
                    <span className="pod-ship-crew">
                      {s.crew}/{s.seats}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
        </section>
      </div>
    </main>
  );
}

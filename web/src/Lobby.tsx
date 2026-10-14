import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MatchmakerServerMessage } from "@mush2/shared";
import { LanguageSwitcher } from "./i18n/LanguageSwitcher.tsx";
import { matchmakerSocket, type SeatTicket } from "./net.ts";
import "./lobby.css";

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
  // Kept as data, not text, so the status follows the language if it changes while waiting.
  const [queue, setQueue] = useState<{ waiting: number; seats: number } | null>(null);
  const [error, setError] = useState("");
  const [sleeping, setSleeping] = useState(false);

  useEffect(() => {
    if (name === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const socket = matchmakerSocket();
    socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "queue", name })));
    socket.addEventListener("message", (e: MessageEvent<string>) => {
      const msg = JSON.parse(e.data) as MatchmakerServerMessage;
      if (msg.type === "queued") setQueue({ waiting: msg.waiting, seats: msg.seats });
      if (msg.type === "matched") {
        // Fade the pod out first, so the game's wake-up starts from dark.
        setSleeping(true);
        const ticket = { roomId: msg.roomId, token: msg.token };
        timer = setTimeout(() => onMatched(ticket), SLEEP_MS);
      }
      if (msg.type === "error") setError(msg.message);
    });
    return () => {
      clearTimeout(timer);
      socket.close();
    };
  }, [name, onMatched]);

  const joining = name !== null;

  return (
    <main className={sleeping ? "pod pod-sleeping" : "pod"}>
      <LanguageSwitcher />
      <div className="pod-frame">
      <div className="pod-glass">
        <div className="pod-ceiling" aria-hidden="true">
          <div className="pod-vent">
            <div className="pod-fan" />
          </div>
        </div>
        <section className="panel pod-panel">
        <h1 className="pod-title">mush2</h1>
        {/*
          Both states stay rendered in one grid cell and only the current one is visible,
          so the panel is always sized to the larger and never resizes on join.
        */}
        <div className="pod-states">
          <div className="pod-state" inert={!joining}>
            <p className="pod-subtitle">{`${name ?? ""} · ${ship}`}</p>
            <p className="loading pod-status">{error || (queue ? t("lobby.waiting", queue) : t("common.connecting"))}</p>
          </div>
          <div className="pod-state" inert={joining}>
            <p className="pod-subtitle">{t("lobby.tagline")}</p>
            <ul className="pod-ships">
              {SHIPS.map((s) => (
                <li key={s.name}>
                  <button
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
      </div>
    </main>
  );
}

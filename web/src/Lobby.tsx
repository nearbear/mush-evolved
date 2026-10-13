import { useEffect, useState } from "react";
import type { MatchmakerServerMessage } from "@mush2/shared";
import { matchmakerSocket, type SeatTicket } from "./net.ts";
import "./lobby.css";

/** Placeholder rows: there is no lobby backend yet, every row joins the same global queue. */
const SHIPS = [
  { name: "English", crew: 5, seats: 8, note: "Awaiting crew" },
  { name: "Français", crew: 7, seats: 8, note: "Nearly full" },
  { name: "Español", crew: 2, seats: 8, note: "Awaiting crew" },
];

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
  const [name, setName] = useState<string | null>(null);
  const [ship, setShip] = useState("");
  const [status, setStatus] = useState("");
  const [sleeping, setSleeping] = useState(false);

  useEffect(() => {
    if (name === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const socket = matchmakerSocket();
    socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "queue", name })));
    socket.addEventListener("message", (e: MessageEvent<string>) => {
      const msg = JSON.parse(e.data) as MatchmakerServerMessage;
      if (msg.type === "queued") setStatus(`Waiting: ${msg.waiting}/${msg.seats}. Empty seats fill with bots shortly.`);
      if (msg.type === "matched") {
        // Fade the pod out first, so the game's wake-up starts from dark.
        setSleeping(true);
        const ticket = { roomId: msg.roomId, token: msg.token };
        timer = setTimeout(() => onMatched(ticket), SLEEP_MS);
      }
      if (msg.type === "error") setStatus(msg.message);
    });
    return () => {
      clearTimeout(timer);
      socket.close();
    };
  }, [name, onMatched]);

  const joining = name !== null;

  return (
    <main className={sleeping ? "pod pod-sleeping" : "pod"}>
      <div className="pod-frame">
      <div className="pod-glass">
        <div className="pod-ceiling" aria-hidden="true">
          <div className="pod-vent">
            <div className="pod-fan" />
          </div>
        </div>
        <header className="pod-header">
          <h1>mush2</h1>
          <p>{joining ? `${name} · ${ship}` : "Cryo sleep. Pick a ship to wake aboard."}</p>
        </header>
        {joining ? (
          <p className="loading pod-status">{status || "Connecting…"}</p>
        ) : (
          <ul className="pod-ships">
            {SHIPS.map((s) => (
              <li key={s.name}>
                <button
                  className="pod-ship"
                  onClick={() => {
                    setShip(s.name);
                    setName(nextGuestName());
                  }}
                >
                  <span className="pod-ship-name">{s.name}</span>
                  <span className="pod-ship-note">{s.note}</span>
                  <span className="pod-ship-crew">
                    {s.crew}/{s.seats}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
    </main>
  );
}

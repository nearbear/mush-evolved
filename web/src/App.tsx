import { useCallback, useEffect, useState } from "react";
import type { MatchmakerServerMessage } from "@mush2/shared";
import { GameScreen } from "./GameScreen.tsx";
import { loadTicket, matchmakerSocket, saveTicket, type SeatTicket } from "./net.ts";

export function App() {
  const [ticket, setTicket] = useState<SeatTicket | null>(loadTicket);
  // Stable callbacks: they are effect dependencies that own sockets.
  const changeTicket = useCallback((t: SeatTicket | null) => {
    saveTicket(t);
    setTicket(t);
  }, []);
  const leave = useCallback(() => changeTicket(null), [changeTicket]);

  if (ticket) return <GameScreen ticket={ticket} onLeave={leave} />;
  return <Lobby onMatched={changeTicket} />;
}

function Lobby({ onMatched }: { onMatched: (ticket: SeatTicket) => void }) {
  const [name, setName] = useState("");
  const [queued, setQueued] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!queued) return;
    const socket = matchmakerSocket();
    socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "queue", name })));
    socket.addEventListener("message", (e: MessageEvent<string>) => {
      const msg = JSON.parse(e.data) as MatchmakerServerMessage;
      if (msg.type === "queued") setStatus(`Waiting: ${msg.waiting}/${msg.seats}. Empty seats fill with bots shortly.`);
      if (msg.type === "matched") onMatched({ roomId: msg.roomId, token: msg.token });
      if (msg.type === "error") setStatus(msg.message);
    });
    return () => socket.close();
  }, [queued, name, onMatched]);

  return (
    <main className="lobby">
      <h1>mush2</h1>
      {queued ? (
        <p className="loading">{status || "Connecting…"}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) setQueued(true);
          }}
        >
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={24} />
          <button className="big" type="submit">
            Find game
          </button>
        </form>
      )}
    </main>
  );
}

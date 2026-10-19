import { useCallback, useState } from "react";
import { GameScreen } from "./GameScreen.tsx";
import { Lobby } from "./lobby/Lobby.tsx";
import { WakeUp } from "./WakeUp.tsx";
import { loadTicket, saveTicket, type SeatTicket } from "./net.ts";

export function App() {
  const [ticket, setTicket] = useState<SeatTicket | null>(loadTicket);
  // Stable callbacks: they are effect dependencies that own sockets.
  const changeTicket = useCallback((t: SeatTicket | null) => {
    saveTicket(t);
    setTicket(t);
  }, []);
  const leave = useCallback(() => changeTicket(null), [changeTicket]);
  // Only a fresh join from the lobby plays the wake-up; a reload restores the ticket and skips it.
  const [waking, setWaking] = useState(false);
  const join = useCallback(
    (t: SeatTicket) => {
      changeTicket(t);
      setWaking(true);
    },
    [changeTicket],
  );
  const woke = useCallback(() => setWaking(false), []);

  if (ticket)
    return (
      <>
        <GameScreen ticket={ticket} onLeave={leave} />
        {waking && <WakeUp onDone={woke} />}
      </>
    );
  return <Lobby onMatched={join} />;
}

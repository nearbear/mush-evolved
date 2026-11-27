import { lazy, Suspense, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes, useNavigate } from "react-router";
import { Lobby } from "./lobby/Lobby.tsx";
import { type Intro, WakeUp } from "./WakeUp.tsx";
import { loadTicket, saveTicket, type SeatTicket } from "./net.ts";

// Loaded only for /play (or prefetched from the lobby on hover / queue join) so `/` doesn't pull in the game UI.
const loadGameScreen = () => import("./GameScreen.tsx");
const GameScreen = lazy(loadGameScreen);

let gamePrefetched = false;
/** Warm the GameScreen chunk before navigating to /play; safe to call repeatedly. */
function prefetchGameScreen(): void {
  if (gamePrefetched) return;
  gamePrefetched = true;
  void loadGameScreen().catch(() => {
    gamePrefetched = false;
  });
}

// The lobby at `/` and the game at `/play`. Both live under one component so the seat ticket (in sessionStorage, see
// net.ts) is shared state: Back from the game returns to the lobby with the seat kept, and Forward goes back aboard.
// `/play` without a ticket (a pasted address, a new tab, or after leaving) replaces itself with `/`.
export function App() {
  const { t } = useTranslation();
  const [ticket, setTicket] = useState<SeatTicket | null>(loadTicket);
  const navigate = useNavigate();
  // Stable callbacks: they are effect dependencies that own sockets.
  const changeTicket = useCallback((t: SeatTicket | null) => {
    saveTicket(t);
    setTicket(t);
  }, []);
  // Leaving drops the ticket; `/play` then redirects to `/` with a replace, so Back doesn't land on the left game.
  const leave = useCallback(() => changeTicket(null), [changeTicket]);
  // Boarding after picking a character plays the wake-up and Resume just fades in; a reload restores the ticket and skips both.
  const [intro, setIntro] = useState<Intro | null>(null);
  const join = useCallback(
    (t: SeatTicket, kind: Intro) => {
      changeTicket(t);
      setIntro(kind);
      void navigate("/play");
    },
    [changeTicket, navigate],
  );
  const woke = useCallback(() => setIntro(null), []);
  const waking = intro !== null;

  return (
    <Routes>
      <Route
        path="/play"
        element={
          ticket ? (
            <>
              <Suspense fallback={<main className="connecting loading">{t("common.connecting")}</main>}>
                <GameScreen ticket={ticket} onLeave={leave} waking={waking} />
              </Suspense>
              {intro && <WakeUp kind={intro} onDone={woke} />}
            </>
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
      <Route path="*" element={<Lobby onMatched={join} onPrefetch={prefetchGameScreen} />} />
    </Routes>
  );
}

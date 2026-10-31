import { ScrollArea } from "@base-ui/react/scroll-area";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AUTH_PROVIDERS, CHARACTERS, LOBBY_LANGUAGES, MAX_NAME_LENGTH, type CharacterId, type LobbyLanguage, type MatchmakerServerMessage } from "@mush2/shared";
import { AccountButton } from "../account/AccountButton.tsx";
import { PROVIDER_NAMES, signup, startSignIn, takeAuthOutcome, logout, useMe } from "../account/api.ts";
import { NameForm } from "../account/NameForm.tsx";
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

/** Single player (shared/src/singlePlayer.ts): a new ship for one player and 8 AI crew, launched by the matchmaker of the UI's language. */
const SINGLE_PLAYER = "single";
type Choice = (typeof SHIPS)[number] | typeof SINGLE_PLAYER;

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

/** Characters already chosen aboard the ship's open queue, live, while the picker is showing. */
function useTakenCharacters(language: LobbyLanguage | undefined, active: boolean): readonly CharacterId[] {
  const [taken, setTaken] = useState<readonly CharacterId[]>([]);
  useEffect(() => {
    if (!active || !language) return;
    const socket = matchmakerSocket(language);
    socket.addEventListener("message", (e: MessageEvent<string>) => {
      const msg = JSON.parse(e.data) as MatchmakerServerMessage;
      if (msg.type === "queued") setTaken(msg.taken);
    });
    return () => socket.close();
  }, [language, active]);
  return taken;
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
  const { t, i18n } = useTranslation();
  const [name, setName] = useState<string | null>(null);
  const [ship, setShip] = useState<Choice | null>(null);
  const [character, setCharacter] = useState<CharacterId | null>(null);
  // Kept as data, not text, so the status follows the language if it changes while waiting.
  const [queue, setQueue] = useState<QueueCount | null>(null);
  const [error, setError] = useState("");
  const [sleeping, setSleeping] = useState(false);
  const pod = useRef<HTMLDivElement>(null);
  // Without WebGL2 the game can't be drawn, so there is nothing to join.
  const [webgl] = useState(hasWebGL2);
  const roster = useRef<HTMLDivElement>(null);
  const { me, refresh } = useMe();
  const account = me?.status === "signed_in" ? me.account : null;
  // A message about signing in, kept as a key so it follows the language: back from a provider, or refused boarding.
  const [notice, setNotice] = useState<string | null>(() => {
    const outcome = takeAuthOutcome();
    return outcome && `account.outcome.${outcome}`;
  });

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

  // biome-ignore lint/correctness/useExhaustiveDependencies: the UI language only picks which matchmaker launches a single-player ship, read once at launch; changing it must not relaunch.
  useEffect(() => {
    if (name === null || character === null || ship === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const single = ship === SINGLE_PLAYER;
    const uiLanguage = LOBBY_LANGUAGES.find((l) => l === i18n.resolvedLanguage) ?? "en";
    const socket = matchmakerSocket(single ? uiLanguage : ship.language);
    socket.addEventListener("open", () => socket.send(JSON.stringify({ type: single ? "singlePlayer" : "queue", name, character })));
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
      if (msg.type === "error" && msg.message === "sign_in_required") {
        // The session ended since the page loaded: back to the ship list, which now offers signing in.
        setNotice("errors.sign_in_required");
        setShip(null);
        setName(null);
        setCharacter(null);
        void refresh();
      } else if (msg.type === "error") setError(t(`errors.${msg.message}` as never, { defaultValue: msg.message }));
    });
    return () => {
      clearTimeout(timer);
      socket.close();
    };
  }, [name, character, ship, onMatched, t, refresh]);

  const shipCounts = useShipCounts(webgl && name === null);
  // Single player: any character, nobody else aboard.
  const taken = useTakenCharacters(ship === SINGLE_PLAYER ? undefined : ship?.language, name !== null && character === null);
  const step = !webgl ? "noWebgl" : me?.status === "signup" ? "signup" : name === null ? "ship" : character === null ? "character" : "waiting";
  // Multiplayer seats take the account's name (the server's, whatever is sent); single player doesn't need an account.
  const singlePlayerName = () => account?.displayName ?? nextGuestName();

  return (
    <main className={sleeping ? "pod pod-sleeping" : "pod"}>
      {import.meta.env.DEV && (
        <nav className="pod-devlinks">
          <a href="/editor">Ship Editor</a> {/* i18n-ignore: dev servers only */}
          <a href="/design-kit.html">Design kit</a> {/* i18n-ignore: dev servers only */}
          {/* Dev sign-in (#287): a plain GET form to /auth/dev, which signs in as that name and redirects back here. */}
          <form className="pod-devsignin" method="get" action="/auth/dev">
            <input name="name" required maxLength={MAX_NAME_LENGTH} defaultValue={__DEV_SIGN_IN_NAME__.slice(0, MAX_NAME_LENGTH)} placeholder="Name" aria-label="Dev sign-in name" /> {/* i18n-ignore: dev servers only */}
            <button type="submit">Dev sign-in</button> {/* i18n-ignore: dev servers only */}
          </form>
        </nav>
      )}
      <div className="pod-toolbar">
        {account && step === "ship" && <AccountButton account={account} onChange={refresh} />}
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
            <p className="pod-subtitle">{`${name ?? ""} · ${ship === SINGLE_PLAYER ? t("lobby.singlePlayer") : (ship?.name ?? "")}`}</p>
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
                        disabled={taken.includes(c.id)}
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
          <div className="pod-state" inert={step !== "signup"}>
            <p className="pod-subtitle">{t("lobby.signup.intro")}</p>
            {me?.status === "signup" && (
              <NameForm
                initial={me.suggestedName ?? ""}
                label={t("lobby.signup.label")}
                submitLabel={t("lobby.signup.confirm")}
                autoFocus
                onSubmit={async (chosen) => {
                  const result = await signup(chosen);
                  if (!result.ok) return result.reason;
                  await refresh();
                  return null;
                }}
                secondary={
                  // Ends the pending sign-up: no account is made.
                  <button type="button" onClick={() => void logout().catch(() => undefined).then(refresh)}>
                    {t("account.cancel")}
                  </button>
                }
              />
            )}
          </div>
          <div className="pod-state" inert={step !== "ship"}>
            <p className="pod-subtitle">{t("lobby.tagline")}</p>
            {notice && (
              <p className="pod-status pod-notice" role="status">
                {t(notice as never)}
              </p>
            )}
            <ul className="pod-ships">
              {me?.status === "signed_out" ? (
                <li className="pod-signin">
                  <p className="pod-status">{t("lobby.signInPrompt")}</p>
                  {AUTH_PROVIDERS.map((provider) => (
                    <button key={provider} type="button" className="big pod-signin-button" onClick={() => startSignIn(provider)}>
                      {t("lobby.signInWith", { provider: PROVIDER_NAMES[provider] })}
                    </button>
                  ))}
                </li>
              ) : SHIPS.map((s) => {
                const count = shipCounts[s.language];
                return (
                <li key={s.name}>
                  <button type="button"
                    className="big pod-ship"
                    // Only until the account has loaded: signed out, sign-in buttons show instead.
                    disabled={!account}
                    onClick={() => {
                      if (!account) return;
                      setNotice(null);
                      setShip(s);
                      setName(account.displayName);
                    }}
                  >
                    <span className="pod-ship-name">{s.name}</span>
                    <span className="pod-ship-note">{count && count.waiting >= count.seats - 1 ? t("lobby.nearlyFull") : t("lobby.awaitingCrew")}</span>
                    <span className="pod-ship-crew">{count ? `${count.waiting}/${count.seats}` : "–"}</span>
                  </button>
                </li>
                );
              })}
              <li>
                <button type="button"
                  className="big pod-ship"
                  onClick={() => {
                    setNotice(null);
                    setShip(SINGLE_PLAYER);
                    setName(singlePlayerName());
                  }}
                >
                  <span className="pod-ship-name">{t("lobby.singlePlayer")}</span>
                  <span className="pod-ship-note">{t("lobby.singlePlayerNote")}</span>
                  <span className="pod-ship-crew" />
                </button>
              </li>
            </ul>
          </div>
        </div>
        </section>
      </div>
      <Credits className="pod-credits" />
    </main>
  );
}

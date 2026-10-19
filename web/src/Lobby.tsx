import { type CSSProperties, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CHARACTERS, type CharacterId, type MatchmakerServerMessage } from "@mush2/shared";
import { portrait } from "./art/assets.ts";
import { LanguageSwitcher } from "./i18n/LanguageSwitcher.tsx";
import { matchmakerSocket, type SeatTicket } from "./net.ts";
import logoUrl from "../../Mush/www/img/design/logo_welcome.png?url";
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

/**
 * The window is drawn this many times, as vertical strips each tilted a little further
 * than the last, so together they bend it into a half-cylinder (lobby.css, .pod-strip).
 * More strips make a smoother curve but cost more drawing.
 */
const POD_STRIPS = 24;

/**
 * The metal wall around the window is the same cylinder, so it is drawn the same way,
 * with this many extra strips on each side carrying on past the window's edges.
 */
const WALL_STRIPS = 16;

/** Wall strip indices: the window's 0..POD_STRIPS-1, plus WALL_STRIPS more each side. */
const WALL_INDICES = Array.from({ length: POD_STRIPS + 2 * WALL_STRIPS }, (_, k) => k - WALL_STRIPS);

/** The manufacturer's sticker on the pod wall. Placeholder copy until the gag is written. */
function PodSticker() {
  return (
    <div className="pod-sticker">
      {/* i18n-ignore: placeholder sticker copy */}
      <span className="pod-sticker-brand">ChangMei-Tech</span>
      {/* i18n-ignore: placeholder sticker copy */}
      <span className="pod-sticker-slogan">Placeholder slogan goes here</span>
      <span className="pod-sticker-barcode" />
      {/* i18n-ignore: placeholder sticker copy */}
      <span className="pod-sticker-serial">MODEL CP-00 · S/N 000-0000</span>
    </div>
  );
}

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

  const step = name === null ? "ship" : character === null ? "character" : "waiting";

  return (
    <main className={sleeping ? "pod pod-sleeping" : "pod"}>
      <div className="pod-toolbar">
        <LanguageSwitcher inline />
      </div>
      <div className="pod-window">
        <div
          className="pod-curve"
          style={{ "--strips": POD_STRIPS, "--wall-strips": WALL_STRIPS } as CSSProperties}
          aria-hidden="true"
        >
          <div className="pod-wall">
            {WALL_INDICES.map((i) => (
              <div key={i} className="pod-strip pod-wall-strip" style={{ "--i": i } as CSSProperties}>
                <div className="pod-wall-face">
                  <PodSticker />
                </div>
              </div>
            ))}
          </div>
          {Array.from({ length: POD_STRIPS }, (_, i) => (
            <div key={i} className="pod-strip" style={{ "--i": i } as CSSProperties}>
              <div className="pod-frame">
                <div className="pod-glass">
                  <div className="pod-ceiling">
                    <div className="pod-vent">
                      <div className="pod-fan" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <section className="panel pod-panel">
        <h1 className="pod-title">
          <img className="pod-logo" src={logoUrl} alt="mush2" />
        </h1>
        {/*
          All steps stay rendered in one grid cell and only the current one is visible,
          so the panel is always sized to the largest and never resizes on join.
        */}
        <div className="pod-states">
          <div className="pod-state" inert={step !== "waiting"}>
            <p className="pod-subtitle">{`${name ?? ""} · ${ship}`}</p>
            <p className="loading pod-status">{error || (queue ? t("lobby.waiting", queue) : t("common.connecting"))}</p>
          </div>
          <div className="pod-state" inert={step !== "character"}>
            <p className="pod-subtitle">{t("lobby.pickCharacter")}</p>
            <ul className="pod-characters">
              {CHARACTERS.map((c) => (
                <li key={c.id}>
                  <button
                    className="pod-character"
                    onClick={() => {
                      setError("");
                      setCharacter(c.id);
                    }}
                  >
                    <img src={portrait(c.id)} alt="" />
                    <span>{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
            {error && <p className="pod-status">{error}</p>}
          </div>
          <div className="pod-state" inert={step !== "ship"}>
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
    </main>
  );
}

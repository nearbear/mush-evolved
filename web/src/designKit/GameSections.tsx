// The kit's terminal, patrol, iTrackie and end-of-life sections, on sample views (samples.ts). Dev-only.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BodyTakenDialog } from "../hud/BodyTakenDialog.tsx";
import { DeathNotice } from "../hud/DeathNotice.tsx";
import { EndScreen } from "../hud/EndScreen.tsx";
import { ITrackie } from "../hud/ITrackie.tsx";
import { PatrolCockpit } from "../hud/PatrolCockpit.tsx";
import { signalStrength, solDb, Spectrogram } from "../hud/Spectrogram.tsx";
import { TerminalBody } from "../hud/TerminalDialog.tsx";
import { TerminalFrame } from "../hud/TerminalFrame.tsx";
import { terminalLogin } from "../hud/terminalUsername.ts";
import { useNames } from "../i18n/names.ts";
import { useShipLayout } from "../iso/shipLayout.ts";
import type { EquipmentView, PlayerView } from "@mush2/shared";
import { Figure, noop, Section } from "./KitSection.tsx";
import { bodyTakenView, chatView, deadMushView, deadView, edenView, mushChatView, mushWinView, patrolHuntersView, patrolView, terminalSamples, turretHuntersSample } from "./samples.ts";

function TerminalFigure({ view, terminal, note }: { view: PlayerView; terminal: EquipmentView; note?: string }) {
  const names = useNames();
  const name = names.equipment(terminal.type);
  return (
    <Figure caption={note ? `${name}, ${note}` : name}>
      <div className="terminal-popup kit-panel m2k-terminal m2k-terminal-tall">
        <TerminalFrame name={name} type={terminal.type} login={terminalLogin(terminal.type, view)} onClose={noop}>
          <TerminalBody terminal={terminal} view={view} onAction={noop} onSharePlanet={noop} />
        </TerminalFrame>
      </div>
    </Figure>
  );
}

export function TerminalBodiesSection() {
  return (
    <Section
      id="terminal-bodies"
      heading="Terminals"
      about={
        <>
          <code>hud/TerminalDialog.tsx</code>&apos;s <code>TerminalBody</code> in each terminal&apos;s{" "}
          <code>TerminalFrame</code>, seen by a Pilot commander at a fresh ship&apos;s terminals (with one planet found). Inside:
          the research and project lists, PILGRED, <code>PlanetList</code> (its Share button opens{" "}
          <code>SharePlanetDialog</code>), <code>CommandTerminal</code> (<code>ShipNavigation</code>,{" "}
          <code>UnavailableButton</code>), <code>CommsCenter</code>, <code>BiosTerminal</code> and <code>TurretPanel</code>{" "}
          (<code>HunterList</code>), the turret once more with hunters in sight.
        </>
      }
    >
      {terminalSamples.map((sample) => (
        <TerminalFigure key={sample.terminal.id} {...sample} />
      ))}
      <TerminalFigure {...turretHuntersSample} note="with hunters attacking" />
    </Section>
  );
}

/** The ship's chance of reaching Sol (percent) for each sample, from a fresh ship to a sure link. */
const SIGNAL_SAMPLES: { chance: number; linked: boolean; note: string }[] = [
  { chance: 4, linked: false, note: "fresh ship (4%)" },
  { chance: 40, linked: false, note: "after a few failed attempts (40%)" },
  { chance: 80, linked: false, note: "strong (80%)" },
  { chance: 100, linked: true, note: "linked, sure link (100%)" },
];

export function SignalSection() {
  const { t } = useTranslation();
  return (
    <Section
      id="sol-signal"
      heading="Sol signal"
      about={
        <>
          <code>hud/Spectrogram.tsx</code>: the Com center Overview&apos;s live spectrum. The carrier peaks at the
          ship&apos;s chance of reaching Sol minus 100 dB (<code>solDb</code>), so 0 dB is a sure link. The carrier is a
          wide modulated band with a fixed centre, a filter roll-off over a falling skirt, and sideband harmonics
          at -18 and -30 dB; unlinked it fades by up to 3 dB, linked it holds its level.
        </>
      }
    >
      {SIGNAL_SAMPLES.map(({ chance, linked, note }) => {
        const db = solDb(chance);
        return (
          <Figure key={note} caption={note}>
            <div className="m2k-signal">
              <Spectrogram db={db} linked={linked} status={t(linked ? "comms.linked" : "comms.unlinked")} />
              <span>{t("comms.solSignal", { db, strength: t(`comms.strength.${signalStrength(db)}`) })}</span>
            </div>
          </Figure>
        );
      })}
    </Section>
  );
}

export function PatrolSection() {
  const ship = patrolView.patrolShip;
  const huntedShip = patrolHuntersView.patrolShip;
  const layout = useShipLayout();
  return (
    <Section
      id="patrol"
      heading="Patrol cockpit"
      about={
        <>
          <code>hud/PatrolCockpit.tsx</code>: what the room view shows while you fly a patrol ship (the space scene: the ship,
          the hunters to aim at, one Shoot button, and the ship&apos;s other actions).
        </>
      }
    >
      {ship && (
        <Figure caption="Just took off from bay A, no hunters">
          <div className="room-view m2k-room m2k-room-auto">
            <PatrolCockpit view={patrolView} ship={ship} layout={layout} onAction={noop} />
          </div>
        </Figure>
      )}
      {huntedShip && (
        <Figure caption="Hunters in sight (aim at one, one Shoot button)">
          <div className="room-view m2k-room m2k-room-auto">
            <PatrolCockpit view={patrolHuntersView} ship={huntedShip} layout={layout} onAction={noop} />
          </div>
        </Figure>
      )}
    </Section>
  );
}

const CHANNELS = { onCreate: noop, onInvite: noop, onLeave: noop };

export function ITrackieSection() {
  return (
    <Section
      id="itrackie"
      heading="iTrackie"
      about={
        <>
          <code>hud/ITrackie.tsx</code>: the right panel. Room log (<code>FeedEntry</code> rows; the expedition line opens{" "}
          <code>ExpeditionReportDialog</code>), global chat (<code>Thread</code>: <code>MessageEntry</code>,{" "}
          <code>Markdown</code> checklists, <code>ChatInput</code>), <code>Threads</code>, the features (
          <code>SharedPlanets</code> under Astrophysics, <code>ResearchTracker</code>) and <code>PrivateChannels</code>. Hua
          shared a planet, flew the Icarus to it, and the crew talked a little. Kuan Ti, Mush, has the Mush tab with the
          other Mush and a private channel with two crewmates. Posting does nothing here.
        </>
      }
    >
      <Figure caption="After an expedition">
        <div className="m2k-itrackie">
          <ITrackie view={chatView} roomLogRequest={0} onChat={noop} onCreateThread={noop} onToggle={noop} channels={CHANNELS} />
        </div>
      </Figure>
      <Figure caption="Mush: the Mush channel and a private channel">
        <div className="m2k-itrackie">
          <ITrackie view={mushChatView} roomLogRequest={0} onChat={noop} onCreateThread={noop} onToggle={noop} channels={CHANNELS} />
        </div>
      </Figure>
    </Section>
  );
}

/** A button that shows a dialog component until it closes itself. */
function Opener({ label, children }: { label: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && children(() => setOpen(false))}
    </>
  );
}

function SampleEnd({ view, label }: { view: PlayerView; label: string }) {
  return <Opener label={label}>{(close) => <EndScreen view={view} open onOpenChange={(o) => !o && close()} />}</Opener>;
}

export function EndingsSection() {
  return (
    <Section
      id="endings"
      heading="Death, Transfer and the end"
      about={
        <>
          <code>hud/DeathNotice.tsx</code> replaces the room view once you die (the Mush version mentions the Mush channel).{" "}
          <code>hud/BodyTakenDialog.tsx</code> is the pop-up a Transfer victim must acknowledge; <code>hud/EndScreen.tsx</code>{" "}
          shows the ending and every seat&apos;s role. The dialogs open from the buttons.
        </>
      }
    >
      <Figure caption="Dead (human)">
        <div className="room-view m2k-room m2k-room-auto">
          <DeathNotice view={deadView} />
        </div>
      </Figure>
      <Figure caption="Dead (Mush)">
        <div className="room-view m2k-room m2k-room-auto">
          <DeathNotice view={deadMushView} />
        </div>
      </Figure>
      <Figure caption="Dialogs">
        <div className="m2k-buttons">
          <Opener label="Body taken">{(close) => <BodyTakenDialog view={bodyTakenView} onAcknowledge={close} />}</Opener>
          <SampleEnd view={edenView} label="End: Eden" />
          <SampleEnd view={mushWinView} label="End: humans dead" />
        </div>
      </Figure>
    </Section>
  );
}

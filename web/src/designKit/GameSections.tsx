// The kit's terminal, patrol, iTrackie and end-of-life sections, on sample views (samples.ts). Dev-only.

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { BodyTakenDialog } from "../hud/BodyTakenDialog.tsx";
import { CommsCenter } from "../hud/CommsCenter.tsx";
import { DeathNotice } from "../hud/DeathNotice.tsx";
import { EndScreen } from "../hud/EndScreen.tsx";
import { ExpeditionReportDialog } from "../hud/ExpeditionReportDialog.tsx";
import { IcarusPanel } from "../hud/IcarusPanel.tsx";
import { ITrackie } from "../hud/ITrackie.tsx";
import { LostPanel } from "../hud/LostPanel.tsx";
import { PatrolCockpit } from "../hud/PatrolCockpit.tsx";
import { signalStrength, solDb, Spectrogram } from "../hud/Spectrogram.tsx";
import { TerminalBody } from "../hud/TerminalDialog.tsx";
import { TerminalFrame } from "../hud/TerminalFrame.tsx";
import { terminalLogin } from "../hud/terminalUsername.ts";
import { useNames } from "../i18n/names.ts";
import { useShipLayout } from "../iso/shipLayout.ts";
import type { EquipmentView, PlayerView } from "@mush2/shared";
import { GameFrame } from "./GameFrame.tsx";
import { Figure, noop, Section } from "./KitSection.tsx";
import { bodyTakenView, chatView, expeditionSamples, deadMushView, deadView, edenView, mushChatView, mushWinView, patrolHuntersView, patrolView, signalsNoAccessSample, signalsSample, terminalSamples, turretHuntersSample } from "./samples.ts";

function TerminalFigure({ view, terminal, note }: { view: PlayerView; terminal: EquipmentView; note?: string }) {
  const names = useNames();
  const name = names.equipment(terminal.type);
  return (
    <Figure caption={note ? `${name}, ${note}` : name}>
      <div className="terminal-popup kit-panel m2k-terminal m2k-terminal-tall">
        <TerminalFrame name={name} type={terminal.type} login={terminalLogin(terminal.type, view, terminal.id)} onClose={noop}>
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
          the research and project lists, PILGRED, <code>PlanetList</code> (its Share button swaps the planet for{" "}
          <code>SharePlanetForm</code>), <code>CommandTerminal</code> (<code>ShipNavigation</code>,{" "}
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
              <Spectrogram
                db={db}
                linked={linked}
                status={t(linked ? "comms.linked" : "comms.unlinked")}
                signal={t("comms.solSignal", { db, strength: t(`comms.strength.${signalStrength(db)}`) })}
              />
            </div>
          </Figure>
        );
      })}
    </Section>
  );
}

function SignalsFigure({ view, terminal, note, signal }: { view: PlayerView; terminal: EquipmentView; note: string; signal?: string }) {
  const names = useNames();
  const name = names.equipment(terminal.type);
  return (
    <Figure caption={note}>
      <div className="terminal-popup kit-panel m2k-terminal m2k-terminal-tall">
        <TerminalFrame name={name} type={terminal.type} login={terminalLogin(terminal.type, view, terminal.id)} onClose={noop}>
          <CommsCenter terminal={terminal} view={view} onAction={noop} initialTab="signals" initialSignal={signal} />
        </TerminalFrame>
      </div>
    </Figure>
  );
}

export function SignalsTabSection() {
  const { view, terminal, merchant, rebel } = signalsSample;
  return (
    <Section
      id="signals-tab"
      heading="Signals"
      about={
        <>
          <code>hud/Signals.tsx</code> and <code>hud/SignalConversation.tsx</code> in <code>CommsCenter</code>: the
          Comms Officer&apos;s list (Active with the next rebel call, Inactive), a transport&apos;s conversation after
          Contact with its deals, and Wolf&apos;s call after two decodes (garbled by <code>garble.ts</code>). Last, the
          tab without Comms Officer access. Built through the rules (<code>signalsSample</code>).
        </>
      }
    >
      <SignalsFigure view={view} terminal={terminal} note="Comms Officer: the list" />
      <SignalsFigure view={view} terminal={terminal} signal={merchant} note="A transport's deals" />
      <SignalsFigure view={view} terminal={terminal} signal={rebel} note="A rebel call, partly decoded" />
      <SignalsFigure {...signalsNoAccessSample} note="Without Comms Officer access" />
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
          the hunters to aim at, one Shoot button, and the ship&apos;s other actions), in the game screen&apos;s room view.
        </>
      }
      row="m2k-stack"
    >
      {ship && (
        <Figure caption="Just took off from bay A, no hunters">
          <GameFrame panel="room" room={<PatrolCockpit view={patrolView} ship={ship} layout={layout} onAction={noop} />} />
        </Figure>
      )}
      {huntedShip && (
        <Figure caption="Hunters in sight (aim at one, one Shoot button)">
          <GameFrame panel="room" room={<PatrolCockpit view={patrolHuntersView} ship={huntedShip} layout={layout} onAction={noop} />} />
        </Figure>
      )}
    </Section>
  );
}

export function ExpeditionSection() {
  const { away, uTurn, lost } = expeditionSamples;
  return (
    <Section
      id="expedition"
      heading="Expedition screen"
      about={
        <>
          <code>hud/ExpeditionTimeline.tsx</code>: what <code>IcarusPanel</code> shows while away and{" "}
          <code>LostPanel</code> while lost (docs/plans/expedition-ui.md). Sectors in a row, oldest left, the current one in
          the middle; the arrows (or Left and Right) move one step. Hand-built report and view. Each fills the
          game screen&apos;s room view.
        </>
      }
      row="m2k-stack"
    >
      <Figure caption="Away, four steps in">
        <GameFrame panel="room" room={<IcarusPanel view={away} expedition={away.expedition} selected={{ kind: "player", id: "p0" }} onSelect={noop} onAction={noop} planet={null} />} />
      </Figure>
      <Figure caption="A U-turn holder sees the next sector">
        <GameFrame panel="room" room={<IcarusPanel view={uTurn} expedition={uTurn.expedition} selected={{ kind: "player", id: "p0" }} onSelect={noop} onAction={noop} planet={null} />} />
      </Figure>
      <Figure caption="Lost: the timeline stops where you got lost">
        <GameFrame panel="room" room={<LostPanel view={lost} />} />
      </Figure>
      <Figure caption="The report: one compact row per step (ExpeditionReportDialog)">
        <div className="m2k-buttons">
          <Opener label="Read the report">{(close) => <ExpeditionReportDialog report={away.expeditions[0]} onClose={close} canShare onShare={noop} />}</Opener>
        </div>
      </Figure>
    </Section>
  );
}

export const CHANNELS = { onCreate: noop, onInvite: noop, onLeave: noop };

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
          <code>SharedPlanets</code> under Astrophysics, <code>ResearchTracker</code>, <code>ProjectTracker</code>) and <code>PrivateChannels</code>. Hua
          shared a planet, flew the Icarus to it, and the crew talked a little. Kuan Ti, Mush, has the Mush tab with the
          other Mush and a private channel with two crewmates. Posting does nothing here. Each is the game screen&apos;s right
          column.
        </>
      }
      row="m2k-stack"
    >
      <Figure caption="After an expedition">
        <GameFrame panel="itrackie" itrackie={<ITrackie view={chatView} roomLogRequest={0} onChat={noop} onCreateThread={noop} onToggle={noop} channels={CHANNELS} />} />
      </Figure>
      <Figure caption="Mush: the Mush channel and a private channel">
        <GameFrame panel="itrackie" itrackie={<ITrackie view={mushChatView} roomLogRequest={0} onChat={noop} onCreateThread={noop} onToggle={noop} channels={CHANNELS} />} />
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
      row="m2k-stack"
    >
      <Figure caption="Dead (human)">
        <GameFrame panel="room" room={<DeathNotice view={deadView} />} />
      </Figure>
      <Figure caption="Dead (Mush)">
        <GameFrame panel="room" room={<DeathNotice view={deadMushView} />} />
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

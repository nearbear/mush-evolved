// The editor's live checks: the map is checked (checks.worker.ts) a moment after each edit, and every
// problem is listed with a button that takes you to it. Problems a test pins as left on purpose are
// folded away below the rest.

import { useEffect, useRef, useState } from "react";
import type { ShipArt, ShipMap } from "@mush2/shared";
import type { Problem, Severity } from "./checks.ts";
import type { CheckReply, CheckRequest } from "./checks.worker.ts";

/** How long the map has to stay unchanged before it is checked, in ms. */
const SETTLE = 250;

/** The map's problems, or null until the first check is back; `checking` while a newer map is waiting for its answer. */
export function useChecks(art: ShipArt, map: ShipMap): { problems: Problem[] | null; checking: boolean; failed?: string } {
  // The worker, once it has said it is ready, and whether it has the art yet.
  const [worker, setWorker] = useState<Worker | null>(null);
  const hasArt = useRef<Worker | null>(null);
  const sent = useRef(0);
  const [result, setResult] = useState<{ seq: number; problems: Problem[] } | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [failed, setFailed] = useState<string>();

  useEffect(() => {
    const w = new Worker(new URL("./checks.worker.ts", import.meta.url), { type: "module" });
    w.addEventListener("message", (e: MessageEvent<CheckReply>) => {
      if ("ready" in e.data) setWorker(w);
      else if (e.data.seq === sent.current) setResult(e.data);
    });
    w.addEventListener("error", (e) => setFailed(e.message || "the checks stopped with an error"));
    return () => {
      w.terminate();
      setWorker(null);
    };
  }, []);

  useEffect(() => {
    if (!worker) return;
    const seq = ++sent.current;
    setWaiting(seq);
    const t = setTimeout(() => {
      worker.postMessage({ seq, map, ...(hasArt.current !== worker && { art }) } satisfies CheckRequest);
      hasArt.current = worker;
    }, SETTLE);
    return () => clearTimeout(t);
  }, [worker, art, map]);

  return { problems: result?.problems ?? null, checking: result?.seq !== waiting, failed };
}

const LABEL: Record<Severity, string> = { error: "Errors", warning: "Warnings", info: "Notes" };

/** The open problems' counts, worst first, as the scene toolbar's badge shows them. */
export function checkCounts(problems: Problem[] | null): { severity: Severity; count: number }[] {
  const open = (problems ?? []).filter((p) => !p.known);
  return (["error", "warning", "info"] as const).map((severity) => ({ severity, count: open.filter((p) => p.severity === severity).length })).filter((c) => c.count);
}

export function Checks({
  problems,
  checking,
  failed,
  picked,
  onPick,
}: { problems: Problem[] | null; checking: boolean; failed?: string; picked: string | null; onPick: (p: Problem) => void }) {
  if (failed) return <section className="editor-checks"><h2>Checks</h2><p className="editor-note">Checks failed: {failed}</p></section>;
  if (!problems) return <section className="editor-checks"><h2>Checks</h2><p className="muted">Checking the map…</p></section>;
  const open = problems.filter((p) => !p.known);
  const known = problems.filter((p) => p.known);
  const row = (p: Problem) => (
    <li key={p.id}>
      <button type="button" className={`${p.severity}${p.id === picked ? " on" : ""}`} aria-pressed={p.id === picked} onClick={() => onPick(p)}>
        <span className="title">{p.title}</span>
        {(p.detail || p.known) && <span className="muted">{[p.detail, p.known].filter(Boolean).join(" · ")}</span>}
      </button>
    </li>
  );
  return (
    <section className="editor-checks">
      <h2>
        Checks{" "}
        <span className="muted">
          {open.length === 0 ? "all clear" : checkCounts(problems).map((c) => `${c.count} ${LABEL[c.severity].toLowerCase()}`).join(", ")}
          {checking && " (checking…)"}
        </span>
      </h2>
      {open.length > 0 && <ul>{open.map(row)}</ul>}
      {known.length > 0 && (
        <details>
          <summary>{known.length} left on purpose (pinned in tests)</summary>
          <ul>{known.map(row)}</ul>
        </details>
      )}
    </section>
  );
}

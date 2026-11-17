// Room-picker confirmation dialog for Throw Out (`throw_out`). Collapses the server's per-room
// `throw_out` options into a single button in InspectPanel / PeekBar, then asks which adjacent
// room with an unbroken door to throw the target into using ConfirmPanel.

import type { Action, ActionOption } from "@mush2/shared";
import { useTranslation } from "react-i18next";
import { useNames } from "../i18n/names.ts";
import { ConfirmPanel } from "./ConfirmPanel.tsx";

/** Keeps at most one `throw_out` option in `options` (for the action button) and returns all of them in `throwOut`. */
export function collapseThrowOut(options: ActionOption[]): { options: ActionOption[]; throwOut: ActionOption[] } {
  const throwOut: ActionOption[] = [];
  const collapsed: ActionOption[] = [];
  for (const o of options) {
    if (o.action.type === "throw_out") {
      if (throwOut.length === 0) collapsed.push(o);
      throwOut.push(o);
    } else {
      collapsed.push(o);
    }
  }
  return { options: collapsed, throwOut };
}

export function ThrowOutDialog({
  open,
  targetName,
  options,
  onClose,
  onAction,
}: {
  open: boolean;
  targetName: string;
  options: ActionOption[];
  onClose: () => void;
  onAction: (action: Action) => void;
}) {
  const { t } = useTranslation();
  const names = useNames();
  return (
    <ConfirmPanel
      open={open && options.length > 0}
      onOpenChange={(isOpen) => !isOpen && onClose()}
      message={t("throwOut.confirm", { name: targetName })}
      backLabel={t("throwOut.back")}
      actions={options.map((o) =>
        o.action.type === "throw_out" ? (
          <button
            key={o.action.to}
            type="button"
            onClick={() => {
              onAction(o.action);
              onClose();
            }}
          >
            {names.room(o.action.to)}
          </button>
        ) : null,
      )}
    />
  );
}

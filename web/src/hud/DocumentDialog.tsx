// A printed document's Read window (#394): the rows travel on the item in the view (`ItemView.document`), so reading
// is client-only, free and private. Finola's lost analysis lists characters, some marked negative (not Mush).

import { Dialog } from "@base-ui/react/dialog";
import type { DocumentState } from "@mush2/shared";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { bustIcon } from "../art/assets.ts";
import { useNames } from "../i18n/names.ts";
import { FramedDialog } from "./FramedDialog.tsx";

/**
 * The Read button (in the Inspect panel's action list, styled like the actions) and the window it opens, framed like a
 * terminal (terminal.css: the pale card under the deeper cyan title bar, the ID card's stock). Opening is single-click: it
 * spends nothing.
 */
export function DocumentReader({ document }: { document: DocumentState }) {
  const { t } = useTranslation();
  const names = useNames();
  const [open, setOpen] = useState(false);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>{t("document.read")}</Dialog.Trigger>
      <FramedDialog className="document-popup" heading={t("document.lostAnalysisTitle")} closeLabel={t("document.close")}>
        <Dialog.Description className="document-headline">{t("document.lostAnalysisHeadline")}</Dialog.Description>
        <ul className="document-rows">
          {document.rows.map((row) => (
            <li key={row.character} className="document-row">
              <img src={bustIcon(row.character)} alt="" />
              <span className="document-name">{names.character(row.character)}</span>
              {row.negative && <strong className="document-negative">{t("document.negative")}</strong>}
            </li>
          ))}
        </ul>
      </FramedDialog>
    </Dialog.Root>
  );
}

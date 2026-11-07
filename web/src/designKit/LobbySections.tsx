// The kit's lobby sections: the character picker and the account button. Plain props, no PlayerView. Dev-only.

import type { CharacterId } from "@mush2/shared";
import { AccountButton } from "../account/AccountButton.tsx";
import type { Account } from "../account/AccountDetails.tsx";
import { CharacterPicker } from "../lobby/CharacterPicker.tsx";
import "../lobby/lobby.css";
import { Figure, noop, Section } from "./KitSection.tsx";

const TAKEN: CharacterId[] = ["jinsu", "chun", "kuanti", "hua"];

/** A signed-in sample account: Google linked (so Discord is offered), renamed recently (so renaming waits). */
const ACCOUNT: Account = { id: "kit", displayName: "Sample player", providers: ["google"], renameAllowedAt: Date.now() + 6 * 3_600_000, aboard: false };
const FRESH_ACCOUNT: Account = { ...ACCOUNT, providers: ["google", "discord"], renameAllowedAt: null };

const reload = async () => {};

export function CharacterPickerSection() {
  return (
    <Section
      id="character-picker"
      heading="Character picker"
      about={
        <>
          <code>lobby/CharacterPicker.tsx</code>: boarding a ship. Tiers by difficulty, each character&apos;s text and skills (
          <code>SkillPopover</code>); taken characters can&apos;t be picked. Below 1024px it becomes the phone picker. Boarding
          does nothing here.
        </>
      }
      row="m2k-stack"
    >
      <Figure caption="Jin Su, Chun, Kuan Ti and Hua taken">
        <div className="m2k-picker">
          <CharacterPicker taken={TAKEN} onBoard={noop} />
        </div>
      </Figure>
    </Section>
  );
}

export function AccountSection() {
  return (
    <Section
      id="account"
      heading="Account"
      about={
        <>
          <code>account/AccountButton.tsx</code>: the lobby&apos;s button with your name, opening <code>AccountDetails</code>{" "}
          (renaming with <code>NameForm</code>, linking, logging out). Renaming, linking and logging out call the real API, so
          don&apos;t submit them here.
        </>
      }
    >
      <Figure caption="Google linked, rename waits">
        <AccountButton account={ACCOUNT} onChange={reload} />
      </Figure>
      <Figure caption="Both linked, rename allowed">
        <AccountButton account={FRESH_ACCOUNT} onChange={reload} />
      </Figure>
    </Section>
  );
}

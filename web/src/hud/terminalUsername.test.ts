import { CHARACTERS } from "@mush2/shared";
import { expect, test } from "vitest";
import { terminalUsername } from "./terminalUsername.ts";

test("first initial of the given name plus the surname, lowercase, no spaces", () => {
  expect(terminalUsername("chao")).toBe("cwang");
  expect(terminalUsername("ian")).toBe("isoulton");
  expect(terminalUsername("jinsu")).toBe("jkim");
  expect(terminalUsername("kuanti")).toBe("klai");
});

test("every character gets a plain lowercase name", () => {
  for (const { id } of CHARACTERS) expect(terminalUsername(id)).toMatch(/^[a-z]{3,}$/);
});

import { expect, test } from "bun:test"

test("quotation editor and original decision content use isolated dashboard runtime", () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      "test",
      "./src/components/general-assistant/quote-decision-editor.fixture.tsx",
    ],
    { cwd: new URL("../../..", import.meta.url).pathname, env: process.env },
  )
  if (result.exitCode !== 0)
    throw Error(new TextDecoder().decode(result.stderr))
  expect(result.exitCode).toBe(0)
})

import { expect, test } from "bun:test"

test("order preparation editor runs in an isolated Dashboard runtime", () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      "test",
      "./src/components/general-assistant/order-preparation-editor.fixture.tsx",
    ],
    { cwd: new URL("../../..", import.meta.url).pathname, env: process.env },
  )
  if (result.exitCode !== 0)
    throw Error(
      new TextDecoder().decode(result.stderr) +
        new TextDecoder().decode(result.stdout),
    )
  expect(result.exitCode).toBe(0)
})

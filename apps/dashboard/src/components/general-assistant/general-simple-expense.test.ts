import { expect, test } from "bun:test"

test("simple expense review and editor checks pass in an isolated dashboard runtime", () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      "test",
      "./src/components/general-assistant/general-simple-expense.fixture.tsx",
    ],
    { cwd: new URL("../../..", import.meta.url).pathname, env: process.env },
  )
  if (result.exitCode !== 0)
    throw Error(new TextDecoder().decode(result.stderr))
  expect(result.exitCode).toBe(0)
})

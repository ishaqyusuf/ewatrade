import { expect, test } from "bun:test"

// Keep fixture module mocks out of other tests in a shared Bun test process.
test("paused object cache source checks pass in an isolated dashboard runtime", () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      "test",
      "./src/components/sheets/assistant-object-paused-cache.fixture.tsx",
    ],
    { cwd: new URL("../../..", import.meta.url).pathname, env: process.env },
  )
  if (result.exitCode !== 0)
    throw new Error(new TextDecoder().decode(result.stderr))
  expect(result.exitCode).toBe(0)
})

import { expect, test } from "bun:test"

// Isolate module mocks from other dashboard regression tests.
test("production Job factory revocation regressions pass in an isolated runtime", () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      "test",
      "./src/components/sheets/assistant-draft-job-revocation.fixture.tsx",
    ],
    { cwd: new URL("../../..", import.meta.url).pathname, env: process.env },
  )
  if (result.exitCode !== 0)
    throw new Error(new TextDecoder().decode(result.stderr))
  expect(result.exitCode).toBe(0)
})

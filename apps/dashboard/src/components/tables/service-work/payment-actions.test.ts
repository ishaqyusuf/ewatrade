import { expect, test } from "bun:test"

test("completed-job payment action passes in an isolated Dashboard runtime", () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      "test",
      "./src/components/tables/service-work/payment-actions.fixture.tsx",
    ],
    {
      cwd: new URL("../../../..", import.meta.url).pathname,
      env: process.env,
    },
  )
  if (result.exitCode !== 0)
    throw Error(new TextDecoder().decode(result.stderr))
  expect(result.exitCode).toBe(0)
})

import { expect, test } from "bun:test"

test("Assistant and staff read interval owners pass in isolation", () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      "--env-file=/dev/null",
      "test",
      "./packages/assistant/evaluations/fixtures/dashboard-read-refusal-polls.fixture.tsx",
    ],
    {
      cwd: new URL("../../../../", import.meta.url).pathname,
      env: {
        ...process.env,
        EWATRADE_DATABASE_URL: "postgresql://inert:inert@127.0.0.1:1/inert",
        DATABASE_URL: undefined,
      },
      timeout: 15_000,
    },
  )
  if (result.exitCode !== 0)
    throw Error(
      new TextDecoder().decode(result.stderr) ||
        new TextDecoder().decode(result.stdout),
    )
  expect(result.exitCode).toBe(0)
}, 20_000)

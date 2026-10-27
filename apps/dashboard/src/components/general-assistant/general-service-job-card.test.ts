import { expect, test } from "bun:test"
test("service job card checks pass in an isolated dashboard runtime", () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      "test",
      "./src/components/general-assistant/general-service-job-card.fixture.tsx",
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

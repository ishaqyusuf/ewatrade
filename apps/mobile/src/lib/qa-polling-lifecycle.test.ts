import { expect, test } from "bun:test"

test("mounted QA provider bounds polling and retained refresh callbacks across app lifecycle", () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      "--env-file=/dev/null",
      "test",
      new URL("./fixtures/qa-polling-lifecycle.fixture.tsx", import.meta.url)
        .pathname,
    ],
    {
      cwd: new URL("../../../../", import.meta.url).pathname,
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 20_000,
    },
  )
  if (result.exitCode !== 0)
    throw new Error(new TextDecoder().decode(result.stderr))
  expect(result.exitCode).toBe(0)
})

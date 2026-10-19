import { expect, test } from "bun:test"

test("actual Items list returns to its saved place whatever order measurements arrive in", () => {
  const fixture = new URL("./items-scroll.fixture.tsx", import.meta.url)
    .pathname
  const result = Bun.spawnSync(
    [process.execPath, "--env-file=/dev/null", "test", fixture],
    {
      cwd: new URL("../../../../../../", import.meta.url).pathname,
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 25_000,
    },
  )
  if (result.exitCode !== 0)
    throw Error(
      new TextDecoder().decode(result.stderr) ||
        new TextDecoder().decode(result.stdout),
    )
  expect(result.exitCode).toBe(0)
}, 30_000)

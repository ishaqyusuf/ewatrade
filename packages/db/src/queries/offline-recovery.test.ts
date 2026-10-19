import { expect, test } from "bun:test"

test("actual suspended offline recovery stages safely and applies exact admin-approved commands", () => {
  const fixture = new URL(
    "./fixtures/offline-recovery.fixture.ts",
    import.meta.url,
  ).pathname
  const result = Bun.spawnSync(
    [process.execPath, "--env-file=/dev/null", "test", fixture],
    {
      cwd: new URL("../../../../", import.meta.url).pathname,
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

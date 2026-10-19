import { expect, test } from "bun:test"

test("actual offline blank Quick sale correction preserves identities and stages atomically", () => {
  const fixture = new URL(
    "./fixtures/offline-quick-sale-correction.fixture.ts",
    import.meta.url,
  ).pathname
  const result = Bun.spawnSync(
    [process.execPath, "--env-file=/dev/null", "test", fixture],
    {
      cwd: new URL("../../../../", import.meta.url).pathname,
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 25000,
    },
  )
  if (result.exitCode !== 0)
    throw Error(
      new TextDecoder().decode(result.stderr) ||
        new TextDecoder().decode(result.stdout),
    )
  expect(result.exitCode).toBe(0)
}, 30000)

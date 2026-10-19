import { expect, test } from "bun:test"

test("M06 actual assistant Quick sale readiness and historical receipt compatibility", () => {
  const fixture = new URL(
    "./fixtures/mobile-sale-description-readiness.fixture.ts",
    import.meta.url,
  ).pathname
  const result = Bun.spawnSync(
    [process.execPath, "--env-file=/dev/null", "test", fixture],
    {
      cwd: new URL("../../../../", import.meta.url).pathname,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "test",
        APP_ENV: "local",
        EWATRADE_DATABASE_URL:
          "postgresql://inert:inert@description-readiness.invalid:5432/inert",
      },
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

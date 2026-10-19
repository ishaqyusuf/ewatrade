import { expect, test } from "bun:test"

test("actual simple-sale adapter pins existing Book before inserting a new Customer", () => {
  const child = Bun.spawnSync(
    [
      process.execPath,
      "--env-file=/dev/null",
      "test",
      new URL(
        "./fixtures/mobile-simple-sale-lock-order.fixture.ts",
        import.meta.url,
      ).pathname,
    ],
    {
      cwd: new URL("../../../../", import.meta.url).pathname,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "test",
        EWATRADE_DATABASE_URL:
          "postgresql://inert:inert@reserved.invalid:5432/inert",
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 25_000,
    },
  )
  if (child.exitCode !== 0)
    throw Error(
      new TextDecoder().decode(child.stderr) ||
        new TextDecoder().decode(child.stdout),
    )
  expect(child.exitCode).toBe(0)
}, 30_000)

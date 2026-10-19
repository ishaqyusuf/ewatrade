import { expect, test } from "bun:test"

test("actual simple-sale chat routes description answers and explicit controls", () => {
  const child = Bun.spawnSync(
    [
      process.execPath,
      "--env-file=/dev/null",
      "test",
      new URL(
        "./fixtures/mobile-sale-description-chat.fixture.ts",
        import.meta.url,
      ).pathname,
    ],
    {
      cwd: new URL("../../../../", import.meta.url).pathname,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "test",
        APP_ENV: "local",
        EWATRADE_DATABASE_URL:
          "postgresql://inert:inert@description-chat.invalid:5432/inert",
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

import { expect, test } from "bun:test"

test("actual sale chat applies a bundled description-step correction to the same draft while plain quantity descriptions cannot edit money", () => {
  const fixture = new URL(
    "./fixtures/simple-sale-batched.fixture.ts",
    import.meta.url,
  )
  const child = Bun.spawnSync(
    [process.execPath, "--env-file=/dev/null", "test", fixture.pathname],
    {
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "test",
        EWATRADE_DATABASE_URL:
          "postgresql://inert:inert@reserved.invalid:5432/inert",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const stdout = new TextDecoder().decode(child.stdout)
  const stderr = new TextDecoder().decode(child.stderr)
  const code = child.exitCode
  if (code !== 0) throw Error(stderr || stdout)
  expect(code).toBe(0)
})

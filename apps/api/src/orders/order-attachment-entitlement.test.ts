import { expect, test } from "bun:test"

test("registered Order attachment HTTP routes enforce fresh entitlement before upload bytes", () => {
  const fixture = new URL(
    "./fixtures/order-attachment-entitlement.fixture.ts",
    import.meta.url,
  ).pathname
  const child = Bun.spawnSync(
    [process.execPath, "--env-file=/dev/null", "test", fixture],
    {
      cwd: new URL("../../../../", import.meta.url).pathname,
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
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

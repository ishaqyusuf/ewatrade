import { expect, test } from "bun:test"

test("actual commercial payment keeps idempotency and lock guards with one key read", () => {
  const fixture = new URL(
    "./fixtures/commercial-payment-roundtrips.fixture.ts",
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
        new TextDecoder().decode(result.stdout) ||
        "Payment child failed",
    )
  expect(result.exitCode).toBe(0)
}, 30000)

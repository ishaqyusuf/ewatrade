import { expect, test } from "bun:test"

test("disabled billing scope in an isolated native-module fixture", () => {
  const fixture = new URL(
    "./store-subscription-provider.fixture.tsx",
    import.meta.url,
  ).pathname
  const result = Bun.spawnSync(
    [process.execPath, "--env-file=/dev/null", "test", fixture],
    {
      cwd: new URL("../../../../../", import.meta.url).pathname,
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 25_000,
    },
  )
  if (result.exitCode !== 0)
    throw new Error(new TextDecoder().decode(result.stderr))
  expect(new TextDecoder().decode(result.stderr)).toContain("1 pass")
  expect(result.exitCode).toBe(0)
})

test("native billing session lifetime in an isolated controller fixture", () => {
  const fixture = new URL(
    "./store-subscription-lifetime.fixture.tsx",
    import.meta.url,
  ).pathname
  const result = Bun.spawnSync(
    [process.execPath, "--env-file=/dev/null", "test", fixture],
    {
      cwd: new URL("../../../../../", import.meta.url).pathname,
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 25_000,
    },
  )
  if (result.exitCode !== 0)
    throw new Error(new TextDecoder().decode(result.stderr))
  expect(new TextDecoder().decode(result.stderr)).toContain("19 pass")
  expect(result.exitCode).toBe(0)
})

test("owner coverage controls in an isolated render fixture", () => {
  const fixture = new URL("./store-owner-coverage.fixture.tsx", import.meta.url)
    .pathname
  const result = Bun.spawnSync(
    [process.execPath, "--env-file=/dev/null", "test", fixture],
    {
      cwd: new URL("../../../../../", import.meta.url).pathname,
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 25_000,
    },
  )
  if (result.exitCode !== 0)
    throw new Error(new TextDecoder().decode(result.stderr))
  expect(new TextDecoder().decode(result.stderr)).toContain("4 pass")
  expect(result.exitCode).toBe(0)
})

test("iOS platform entries expose the real native billing controller and plan controls", () => {
  const fixture = new URL(
    "./store-subscription-lifetime.fixture.tsx",
    import.meta.url,
  ).pathname
  const result = Bun.spawnSync(
    [process.execPath, "--env-file=/dev/null", "test", fixture],
    {
      cwd: new URL("../../../../../", import.meta.url).pathname,
      env: {
        PATH: process.env.PATH,
        NODE_ENV: "test",
        BILLING_TEST_ENTRYPOINT: "ios",
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 25_000,
    },
  )
  if (result.exitCode !== 0)
    throw new Error(new TextDecoder().decode(result.stderr))
  expect(new TextDecoder().decode(result.stderr)).toContain("20 pass")
  expect(result.exitCode).toBe(0)
})

test("owner ledger renders real mapped offers and preserves purchase and recovery gates", () => {
  const fixture = new URL(
    "./store-subscription-panel.fixture.tsx",
    import.meta.url,
  ).pathname
  const result = Bun.spawnSync(
    [process.execPath, "--env-file=/dev/null", "test", fixture],
    {
      cwd: new URL("../../../../../", import.meta.url).pathname,
      env: { PATH: process.env.PATH, NODE_ENV: "test" },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 25_000,
    },
  )
  if (result.exitCode !== 0)
    throw new Error(new TextDecoder().decode(result.stderr))
  expect(new TextDecoder().decode(result.stderr)).toContain("9 pass")
})

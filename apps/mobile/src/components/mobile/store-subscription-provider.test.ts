import { expect, test } from "bun:test"

test("free-launch provider in an isolated native-module fixture", () => {
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
  expect(new TextDecoder().decode(result.stderr)).toContain("14 pass")
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

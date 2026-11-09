import { expect, test } from "bun:test"

test("actual media worker refuses nonadult/changed accounts before vision or any audio fallback", () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      "--env-file=/dev/null",
      new URL("./fixtures/assistant-adult-ai-scenario.ts", import.meta.url)
        .pathname,
    ],
    {
      env: {
        NODE_ENV: "test",
        EWATRADE_DATABASE_URL: "postgresql://unit-only@127.0.0.1:1/unused",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  expect(new TextDecoder().decode(result.stderr)).toBe("")
  expect(result.exitCode).toBe(0)
  expect(new TextDecoder().decode(result.stdout)).toContain(
    "provider-free QA passed",
  )
})

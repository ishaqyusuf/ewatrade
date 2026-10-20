import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"

test("connection confirmation selects the consented scope in an isolated process", () => {
  const fixture = fileURLToPath(
    new URL("./link-selected-scope.fixture.ts", import.meta.url),
  )
  const result = Bun.spawnSync([process.execPath, "test", fixture], {
    stdout: "pipe",
    stderr: "pipe",
  })
  if (result.exitCode !== 0)
    throw new Error(Buffer.concat([result.stdout, result.stderr]).toString())
  expect(result.exitCode).toBe(0)
})

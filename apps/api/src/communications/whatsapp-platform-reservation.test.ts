import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"

test("webhook platform reservation and security checks pass in an isolated process", () => {
  const fixture = fileURLToPath(
    new URL("./whatsapp-platform-reservation.fixture.ts", import.meta.url),
  )
  const result = Bun.spawnSync([process.execPath, "test", fixture], {
    stdout: "pipe",
    stderr: "pipe",
  })
  if (result.exitCode !== 0) {
    throw new Error(Buffer.concat([result.stdout, result.stderr]).toString())
  }
  expect(result.exitCode).toBe(0)
})

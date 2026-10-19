import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"

test("full WhatsApp runtime isolates merchant state from platform processing", () => {
  const fixture = fileURLToPath(
    new URL("./whatsapp-runtime-state.fixture.ts", import.meta.url),
  )
  const result = Bun.spawnSync([process.execPath, "test", fixture], {
    stdout: "pipe",
    stderr: "pipe",
  })
  if (result.exitCode !== 0)
    throw new Error(Buffer.concat([result.stdout, result.stderr]).toString())
  expect(result.exitCode).toBe(0)
})

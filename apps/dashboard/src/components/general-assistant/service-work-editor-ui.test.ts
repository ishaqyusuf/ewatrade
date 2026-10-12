import { expect, test } from "bun:test"

test("Service work editor context visibility and controls pass in an isolated dashboard runtime", () => {
  const result = Bun.spawnSync(
    [
      process.execPath,
      "test",
      "./src/components/general-assistant/service-work-editor.fixture.tsx",
    ],
    { cwd: new URL("../../..", import.meta.url).pathname, env: process.env },
  )
  if (result.exitCode !== 0)
    throw Error(new TextDecoder().decode(result.stderr))
  expect(result.exitCode).toBe(0)
})

import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const updatesScreen = readFileSync(
  new URL("./src/screens/updates-screen.tsx", import.meta.url),
  "utf8",
)

describe("mobile runtime/app-config boundary", () => {
  test("keeps Node-backed Expo config plugins out of the runtime bundle", () => {
    expect(updatesScreen).not.toMatch(/(?:@root\/|\.\.\/)+app\.config/)
    expect(updatesScreen).toContain('from "expo-constants"')
    expect(updatesScreen).toContain(
      "Constants.expoConfig?.extra?.updateVersion",
    )
  })
})

import { describe, expect, test } from "bun:test"

describe("Better Auth runtime dependency compatibility", () => {
  test("loads the runtime and crypto entrypoints from the frozen lock", async () => {
    const [{ betterAuth }, crypto] = await Promise.all([
      import("better-auth"),
      import("better-auth/crypto"),
    ])

    expect(typeof betterAuth).toBe("function")
    expect(typeof crypto.symmetricEncrypt).toBe("function")
    expect(typeof crypto.symmetricDecrypt).toBe("function")
  })
})

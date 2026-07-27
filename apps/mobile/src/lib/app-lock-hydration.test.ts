import { describe, expect, test } from "bun:test"

import { loadAppLockConfig } from "./app-lock-hydration"

describe("app lock hydration", () => {
  test("settles with an error when secure storage rejects", async () => {
    const result = await loadAppLockConfig(async () => {
      throw new Error("Secure storage is unavailable")
    }, 50)

    expect(result).toEqual({ config: null, status: "error" })
  })

  test("settles with an error when secure storage stops responding", async () => {
    const result = await loadAppLockConfig(
      () => new Promise(() => undefined),
      10,
    )

    expect(result).toEqual({ config: null, status: "error" })
  })
})

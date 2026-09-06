import { describe, expect, test } from "bun:test"

import { resolveAppLockQuietSealPresentation } from "./app-lock-quiet-seal-presentation"

describe("App Lock Quiet Seal presentation", () => {
  test("keeps setup copy concise and specific to each PIN step", () => {
    expect(resolveAppLockQuietSealPresentation("create")).toEqual({
      eyebrow: "Device seal · 6 digits",
      subtitle:
        "A six digit PIN keeps your business private after you sign in.",
      title: "Seal this device.",
    })
    expect(resolveAppLockQuietSealPresentation("confirm").title).toBe(
      "Seal it once more.",
    )
  })

  test("distinguishes change and disable verification without changing behavior", () => {
    expect(
      resolveAppLockQuietSealPresentation("verify-change").subtitle,
    ).toContain("changing")
    expect(
      resolveAppLockQuietSealPresentation("verify-disable").subtitle,
    ).toContain("turning app lock off")
  })

  test("names unlock and manage states without inventing account security", () => {
    expect(
      resolveAppLockQuietSealPresentation("unlock", "Amina Stores"),
    ).toEqual({
      eyebrow: "ẸwáTrade · local lock",
      subtitle: "Enter your six digit PIN to continue into Amina Stores.",
      title: "Open your market.",
    })
    expect(resolveAppLockQuietSealPresentation("manage").title).toBe(
      "Your device seal.",
    )
  })
})

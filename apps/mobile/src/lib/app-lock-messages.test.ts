import { describe, expect, it } from "bun:test"
import {
  appLockBiometricName,
  appLockLockoutMessage,
  appLockOpenSubtitle,
  appLockSecondsUntil,
  appLockTriesLeft,
  appLockWelcomeTitle,
  appLockWrongPinMessage,
} from "./app-lock-messages"

describe("app lock gate copy", () => {
  it("greets by first name and names the business", () => {
    expect(appLockWelcomeTitle("Ishaq Yusuf")).toBe("Welcome back, Ishaq")
    expect(appLockWelcomeTitle("  ")).toBe("Welcome back")
    expect(appLockOpenSubtitle("Jawdah Farms")).toBe(
      "Enter your PIN to open Jawdah Farms",
    )
    expect(appLockOpenSubtitle(null)).toBe(
      "Enter your PIN to open your business",
    )
  })

  it("counts the tries left before the lockout", () => {
    expect(appLockTriesLeft(2, 5)).toBe(3)
    expect(appLockTriesLeft(undefined, 5)).toBe(5)
    expect(appLockTriesLeft(7, 5)).toBe(0)
    expect(appLockWrongPinMessage(3)).toBe(
      "That PIN didn’t match. 3 tries left.",
    )
    expect(appLockWrongPinMessage(1)).toBe("That PIN didn’t match. 1 try left.")
    expect(appLockWrongPinMessage(0)).toBe("That PIN didn’t match.")
  })

  it("rounds the lockout up to whole seconds", () => {
    const now = Date.parse("2026-10-10T12:00:00.000Z")
    expect(appLockSecondsUntil("2026-10-10T12:00:23.200Z", now)).toBe(24)
    expect(appLockSecondsUntil("2026-10-10T11:59:59.000Z", now)).toBe(0)
    expect(appLockSecondsUntil(null, now)).toBe(0)
    expect(appLockSecondsUntil("not a date", now)).toBe(0)
    expect(appLockLockoutMessage(24)).toBe("Too many tries. Try again in 24 s.")
    expect(appLockLockoutMessage(0)).toBe("Try again now.")
  })

  it("keeps Face ID and Touch ID as names in sentences", () => {
    expect(appLockBiometricName("Fingerprint")).toBe("fingerprint")
    expect(appLockBiometricName("Face recognition")).toBe("face recognition")
    expect(appLockBiometricName("Face ID")).toBe("Face ID")
  })
})

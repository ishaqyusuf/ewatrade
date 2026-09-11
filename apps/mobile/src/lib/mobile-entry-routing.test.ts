import { describe, expect, test } from "bun:test"

import { resolveMobileEntryDestination } from "./mobile-entry-routing"

describe("mobile entry routing", () => {
  test("routes the common login and explicit guest capability before any shell profile", () => {
    expect(
      resolveMobileEntryDestination({
        accessProfile: null,
        hasGuestCapability: false,
        hasSession: false,
        lastShell: null,
      }),
    ).toEqual({ kind: "login" })

    expect(
      resolveMobileEntryDestination({
        accessProfile: null,
        hasGuestCapability: true,
        hasSession: false,
        lastShell: "business",
      }),
    ).toEqual({ kind: "customer" })
  })

  test("routes refreshed Access Profiles without treating device preference as authority", () => {
    expect(
      resolveMobileEntryDestination({
        accessProfile: { hasBusinessAccess: true, hasCustomerHistory: false },
        hasGuestCapability: false,
        hasSession: true,
        lastShell: "customer",
      }),
    ).toEqual({ kind: "business" })

    expect(
      resolveMobileEntryDestination({
        accessProfile: { hasBusinessAccess: false, hasCustomerHistory: true },
        hasGuestCapability: false,
        hasSession: true,
        lastShell: "business",
      }),
    ).toEqual({ kind: "customer" })

    expect(
      resolveMobileEntryDestination({
        accessProfile: { hasBusinessAccess: true, hasCustomerHistory: true },
        hasGuestCapability: false,
        hasSession: true,
        lastShell: "customer",
      }),
    ).toEqual({ kind: "customer" })

    expect(
      resolveMobileEntryDestination({
        accessProfile: { hasBusinessAccess: true, hasCustomerHistory: true },
        hasGuestCapability: false,
        hasSession: true,
        lastShell: null,
      }),
    ).toEqual({ kind: "business" })

    expect(
      resolveMobileEntryDestination({
        accessProfile: { hasBusinessAccess: false, hasCustomerHistory: false },
        hasGuestCapability: false,
        hasSession: true,
        lastShell: "business",
      }),
    ).toEqual({ kind: "no-access" })
  })
})

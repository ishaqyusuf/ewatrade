import { describe, expect, test } from "bun:test"
import type { MobileWorkspaceFeatureAvailability } from "@/lib/workspace-feature-availability"
import type { StaffMember } from "../staff/staff-model"
import {
  getHomeJourney,
  getHomeJourneyScope,
  getHomeTeamState,
  parseHomeTeamDismissal,
} from "./home-journey-model"

const availability: MobileWorkspaceFeatureAvailability = {
  hasActiveSellableItems: false,
  hasCatalogItems: false,
  hasCustomers: false,
  hasInventoryActivity: false,
  hasOrders: false,
  hasPrescriptionCommerce: false,
  hasProductItems: false,
  hasReportableActivity: false,
  hasServiceItems: false,
  hasServiceJobs: false,
  hasStaff: false,
  storeId: "store-a",
}
const base = {
  availability,
  availabilityResolved: true,
  availabilityPending: false,
  isOffline: false,
  loadedOrderCount: 0,
  team: "none" as const,
  teamPreferenceResolved: true,
  teamPromptDismissed: false,
}
function member(status: string): StaffMember {
  return {
    acceptedAt: null,
    createdAt: new Date(),
    id: "membership",
    invitedAt: new Date(),
    invitedByUserId: "owner",
    role: "cashier",
    status,
    updatedAt: new Date(),
    user: {
      avatarUrl: null,
      displayName: "Alex",
      email: "alex@example.com",
      id: "alex",
      image: null,
      name: "Alex",
    },
  }
}

describe("Classic Home journey", () => {
  test("catalog presence does not make an unfinished item sellable", () => {
    expect(getHomeJourney(base).catalog).toBe("empty")
    expect(
      getHomeJourney({
        ...base,
        availability: { ...availability, hasCatalogItems: true },
      }).catalog,
    ).toBe("unfinished")
    expect(
      getHomeJourney({
        ...base,
        availability: {
          ...availability,
          hasCatalogItems: true,
          hasActiveSellableItems: true,
        },
      }).catalog,
    ).toBe("ready")
  })
  test("history survives an empty recent slice and an unsellable catalog", () => {
    const state = getHomeJourney({
      ...base,
      availability: { ...availability, hasOrders: true },
    })
    expect(state.hasOrderHistory).toBe(true)
    expect(state.catalog).toBe("empty")
    expect(state.showTeamPrompt).toBe(true)
  })
  test("loaded orders prevent stale availability from restarting setup", () => {
    expect(
      getHomeJourney({ ...base, loadedOrderCount: 1 }).hasOrderHistory,
    ).toBe(true)
  })
  test("active or pending staff do not manufacture order history", () => {
    for (const team of ["pending", "active"] as const) {
      const state = getHomeJourney({ ...base, team })
      expect(state.hasOrderHistory).toBe(false)
      expect(state.showTeamPrompt).toBe(false)
    }
  })
  test("solo owners dismiss guidance without changing business facts", () => {
    const state = getHomeJourney({
      ...base,
      teamPromptDismissed: true,
      availability: { ...availability, hasOrders: true },
    })
    expect(state.hasOrderHistory).toBe(true)
    expect(state.showTeamPrompt).toBe(false)
    expect(state.team).toBe("none")
  })
  test("unknown/loading/offline data cannot show an empty-business team prompt", () => {
    for (const [isOffline, availabilityPending, expected] of [
      [false, true, "loading"],
      [false, false, "unavailable"],
      [true, false, "offline-unknown"],
    ] as const) {
      const state = getHomeJourney({
        ...base,
        availabilityResolved: false,
        isOffline,
        availabilityPending,
        loadedOrderCount: 1,
      })
      expect(state.workspace).toBe(expected)
      expect(state.showTeamPrompt).toBe(false)
    }
    expect(getHomeJourney({ ...base, isOffline: true }).workspace).toBe(
      "cached",
    )
  })
  test("hydrate preference before showing the optional team nudge", () => {
    expect(
      getHomeJourney({
        ...base,
        loadedOrderCount: 1,
        teamPreferenceResolved: false,
      }).showTeamPrompt,
    ).toBe(false)
  })
  test("staff status comes from the directory; active takes precedence", () => {
    expect(
      getHomeTeamState({
        canManage: true,
        directory: [member("INVITED")],
        directoryUnavailable: false,
        hasStaff: true,
      }),
    ).toEqual({ state: "pending", pendingName: "Alex" })
    expect(
      getHomeTeamState({
        canManage: true,
        directory: [member("INVITED"), member("ACTIVE")],
        directoryUnavailable: false,
        hasStaff: true,
      }).state,
    ).toBe("active")
  })
  test("bounded cashier directory and membership presence are not proof of no staff", () => {
    expect(
      getHomeTeamState({
        canManage: true,
        directory: [],
        directoryUnavailable: false,
        hasStaff: true,
      }).state,
    ).toBe("existing")
    expect(
      getHomeTeamState({
        canManage: true,
        directory: [],
        directoryUnavailable: false,
        hasStaff: false,
      }).state,
    ).toBe("none")
    expect(
      getHomeTeamState({
        canManage: true,
        directoryUnavailable: false,
        hasStaff: false,
      }).state,
    ).toBe("unknown")
    expect(
      getHomeTeamState({
        canManage: true,
        directory: [],
        directoryUnavailable: true,
        hasStaff: false,
      }).state,
    ).toBe("unknown")
    expect(
      getHomeTeamState({
        canManage: false,
        directory: [member("INVITED")],
        directoryUnavailable: false,
        hasStaff: true,
      }).state,
    ).toBe("restricted")
  })
  test("dismissal is scoped to exact account, business and store", () => {
    const scope = getHomeJourneyScope({
      userId: "owner",
      businessId: "business",
      storeId: "store",
    })
    expect(scope).not.toBeNull()
    for (const input of [
      { userId: "other", businessId: "business", storeId: "store" },
      { userId: "owner", businessId: "other", storeId: "store" },
      { userId: "owner", businessId: "business", storeId: "other" },
    ])
      expect(getHomeJourneyScope(input)).not.toBe(scope)
    expect(
      getHomeJourneyScope({ userId: "owner", businessId: "business" }),
    ).toBeNull()
    expect(parseHomeTeamDismissal("dismissed")).toBe(true)
    expect(parseHomeTeamDismissal("true")).toBe(false)
    expect(parseHomeTeamDismissal(null)).toBe(false)
  })
})

import { describe, expect, test } from "bun:test"
import { getSalesRepShiftLedgerPresentation } from "./sales-rep-shift-ledger"

describe("Sales Rep Shift Ledger presentation", () => {
  test("makes the next sale dominant when the existing catalog gate is ready", () => {
    expect(
      getSalesRepShiftLedgerPresentation({
        hasSellableCatalogItem: true,
        isOffline: false,
        pendingCommandCount: 0,
        workspaceState: "available",
      }),
    ).toEqual({
      catalogFactDetail: "Orders can be created",
      catalogFactValue: "Ready",
      readinessLabel: "Ready to sell",
      saleActionDetail: "Choose an item, customer, and payment.",
      saleActionDisabled: false,
      saleActionLabel: "Start a new sale",
      heroCue: "Your counter is ready for the next customer.",
      syncLabel: "Synced now",
      syncTone: "ready",
    })
  })

  test("keeps setup and pending-sync state truthful", () => {
    expect(
      getSalesRepShiftLedgerPresentation({
        hasSellableCatalogItem: false,
        isOffline: true,
        pendingCommandCount: 2,
        workspaceState: "available",
      }),
    ).toMatchObject({
      catalogFactDetail: "A sellable item is required",
      catalogFactValue: "Needs item",
      readinessLabel: "Selling needs setup",
      saleActionDisabled: true,
      saleActionLabel: "Sale unavailable",
      syncLabel: "2 waiting to sync",
      syncTone: "attention",
    })
  })

  test("describes an offline workspace without inventing queued work", () => {
    expect(
      getSalesRepShiftLedgerPresentation({
        hasSellableCatalogItem: true,
        isOffline: true,
        pendingCommandCount: 0,
        workspaceState: "available",
      }),
    ).toMatchObject({
      syncLabel: "Offline",
      syncTone: "attention",
    })
  })

  test("keeps unresolved workspace cues truthful", () => {
    expect(
      getSalesRepShiftLedgerPresentation({
        hasSellableCatalogItem: false,
        isOffline: true,
        pendingCommandCount: 0,
        workspaceState: "offline-unknown",
      }).heroCue,
    ).toBe("Reconnect to confirm your sellable catalog.")

    expect(
      getSalesRepShiftLedgerPresentation({
        hasSellableCatalogItem: false,
        isOffline: false,
        pendingCommandCount: 0,
        workspaceState: "loading",
      }).heroCue,
    ).toBe("Loading the latest sales workspace.")

    expect(
      getSalesRepShiftLedgerPresentation({
        hasSellableCatalogItem: false,
        isOffline: false,
        pendingCommandCount: 0,
        workspaceState: "unavailable",
      }).heroCue,
    ).toBe("Refresh to confirm the counter is ready.")
  })
})

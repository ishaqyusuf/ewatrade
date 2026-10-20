import { describe, expect, test } from "bun:test"

import {
  type ActivityOpenContext,
  activityOriginalOpen,
  activityOriginalParams,
} from "./activity-original"

const owner: ActivityOpenContext = {
  activeStoreId: "main",
  access: {
    sales: true,
    catalog: true,
    staffDirectory: true,
    staffHistory: true,
    finance: true,
    serviceJobs: true,
  },
}
const cashier: ActivityOpenContext = {
  activeStoreId: "main",
  access: {
    sales: true,
    catalog: false,
    staffDirectory: false,
    staffHistory: false,
    finance: false,
    serviceJobs: false,
  },
}
const main = { id: "main", name: "Main Store" }
const lekki = { id: "lekki", name: "Lekki Store" }

describe("Activity original record", () => {
  test("payments open their order; finance needs the Book", () => {
    expect(
      activityOriginalParams({ kind: "payment", id: "p1", orderId: "o1" }),
    ).toEqual({ orderSheet: "details", orderId: "o1" })
    expect(
      activityOriginalParams({
        kind: "finance_movement",
        id: "m1",
        bookId: "b1",
      }),
    ).toEqual({ financeMovement: "m1", financeMovementBook: "b1" })
    expect(
      activityOriginalParams({ kind: "finance_entry", id: "e1", bookId: "b1" }),
    ).toBeNull()
    // Expense vs purchase bill is ambiguous; never guess the purchase sheet.
    expect(
      activityOriginalParams({ kind: "finance_bill", id: "x1", bookId: "b1" }),
    ).toBeNull()
    expect(
      activityOriginalOpen(
        {
          target: { kind: "finance_bill", id: "x1", bookId: "b1" },
          canOpen: true,
          store: null,
        },
        owner,
      ),
    ).toEqual({ unavailable: "Open it in Finance" })
  })

  test("opens only with a target, canOpen and registered access", () => {
    expect(
      activityOriginalOpen(
        { target: { kind: "order", id: "o1" }, canOpen: true, store: main },
        owner,
      ),
    ).toEqual({
      label: "Open order",
      params: { orderSheet: "details", orderId: "o1" },
    })
    expect(
      activityOriginalOpen(
        { target: { kind: "order", id: "o1" }, canOpen: false, store: main },
        owner,
      ),
    ).toEqual({ unavailable: "No original record to open" })
    expect(
      activityOriginalOpen(
        {
          target: { kind: "finance_movement", id: "m1", bookId: "b1" },
          canOpen: true,
          store: null,
        },
        cashier,
      ),
    ).toEqual({ unavailable: "You can’t open this" })
  })

  test("Store records open only in their own Store", () => {
    expect(
      activityOriginalOpen(
        { target: { kind: "order", id: "o7" }, canOpen: true, store: lekki },
        owner,
      ),
    ).toEqual({ unavailable: "Switch to Lekki Store to open" })
    // No active Store never bypasses the Store check.
    expect(
      activityOriginalOpen(
        { target: { kind: "order", id: "o7" }, canOpen: true, store: lekki },
        { ...owner, activeStoreId: null },
      ),
    ).toEqual({ unavailable: "Choose Lekki Store to open" })
    expect(
      activityOriginalOpen(
        {
          target: { kind: "catalog_item", id: "c1" },
          canOpen: true,
          store: lekki,
        },
        owner,
      ),
    ).toMatchObject({ label: "Open item" })
  })
})

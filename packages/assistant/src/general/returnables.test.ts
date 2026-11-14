import { describe, expect, test } from "bun:test"
import { generalActionSchema, generalActionSummary } from "./contracts"
import { orderPreparationRequestSchema } from "./order-preparation"
import {
  RETURNABLE_NOT_SET_UP_ISSUE,
  orderReturnableIssues,
  orderReturnableReviewLine,
  percentOfTotalMinor,
  resolveOrderReturnables,
  resolveReturnableName,
  returnableMovementSummary,
} from "./returnables"

const crate = { id: "item_crate", name: "Egg crate" }
const cylinder = { id: "item_cyl", name: "Gas cylinder 12.5kg" }
const tray = { id: "item_tray", name: "Egg tray" }

describe("resolveReturnableName", () => {
  test("matches what owners say to the one Returnable item", () => {
    for (const said of ["crates", "Egg crates", "egg crate", "crate"])
      expect(resolveReturnableName(said, [crate])).toEqual({
        status: "resolved",
        item: crate,
      })
    expect(resolveReturnableName("cylinders", [crate, cylinder])).toEqual({
      status: "resolved",
      item: cylinder,
    })
  })

  test("exact names win over shared words", () => {
    expect(resolveReturnableName("egg tray", [crate, tray])).toEqual({
      status: "resolved",
      item: tray,
    })
  })

  test("refuses to guess", () => {
    expect(resolveReturnableName("crates", [])).toEqual({
      status: "not_set_up",
    })
    expect(resolveReturnableName("eggs", [crate, tray]).status).toBe(
      "ambiguous",
    )
    expect(resolveReturnableName("bottles", [crate, cylinder]).status).toBe(
      "missing_item",
    )
  })
})

describe("resolveOrderReturnables", () => {
  test("binds 58 crates to Egg crate with no issues", () => {
    expect(
      resolveOrderReturnables([{ name: "crates", quantity: 58 }], [crate]),
    ).toEqual({
      returnables: [
        {
          name: "crates",
          quantity: 58,
          status: "resolved",
          catalogItemId: crate.id,
          itemName: crate.name,
        },
      ],
      issues: [],
    })
  })

  test("no Returnable item set up yet becomes an offer to add one", () => {
    const result = resolveOrderReturnables(
      [{ name: "crates", quantity: 58 }],
      [],
    )
    expect(result.returnables[0]?.status).toBe("not_set_up")
    expect(result.issues).toEqual([`58 crates: ${RETURNABLE_NOT_SET_UP_ISSUE}`])
  })

  test("the same item twice is refused", () => {
    expect(
      resolveOrderReturnables(
        [
          { name: "crates", quantity: 3 },
          { name: "egg crate", quantity: 2 },
        ],
        [crate],
      ).issues,
    ).toContain("Each Returnable item can be listed once per order.")
  })
})

describe("order_create returnables", () => {
  const order = {
    action: "order_create",
    customerId: "cus_musa",
    lines: [
      {
        custom: "quick_sale",
        amountMinor: 48_000_000,
        description: "80 crates eggs",
      },
    ],
    returnables: [{ name: "Egg crate", quantity: 58, catalogItemId: crate.id }],
  } as const

  test("the action accepts returnables and the summary names them", () => {
    const parsed = generalActionSchema.parse(order)
    expect(generalActionSummary(parsed, "NGN")).toContain(
      "To come back: 58 Egg crate",
    )
  })

  test("returnables are whole items", () => {
    expect(
      generalActionSchema.safeParse({
        ...order,
        returnables: [{ name: "Egg crate", quantity: 2.5 }],
      }).success,
    ).toBe(false)
  })

  test("walk-in and unbound returnables are refused at confirm", () => {
    expect(orderReturnableIssues({ ...order, customerId: undefined })).toEqual([
      "Returnables can't go out on a walk-in sale. Choose a saved customer, or sell without returnables.",
    ])
    expect(
      orderReturnableIssues({
        customerId: "cus_musa",
        returnables: [{ name: "bottles", quantity: 4 }],
      }),
    ).toEqual(["4 bottles: choose a Returnable item, or add one first."])
    expect(orderReturnableIssues({ customerId: "cus_musa" })).toEqual([])
  })

  test("prepared drafts already carry their returnable issues", () => {
    expect(
      orderReturnableIssues({
        returnables: [{ name: "crates", quantity: 58 }],
        prepared: { returnables: [] },
      }),
    ).toEqual([])
  })

  test("review line shows the balance before and after", () => {
    expect(
      orderReturnableReviewLine({
        name: "Egg crate",
        quantity: 58,
        customerName: "Musa Ibrahim",
        heldBefore: 12,
      }),
    ).toBe("To come back: 58 Egg crate · Musa Ibrahim holds 12 → 70")
  })
})

describe("prepareOrder request", () => {
  test("keeps 80 crates of eggs as a sale line and 58 crates as returnables", () => {
    const request = orderPreparationRequestSchema.parse({
      lines: [{ name: "Eggs Large", quantity: "80", unitName: "crate" }],
      customerName: "Musa Ibrahim",
      payment: { paid: true, percent: 70 },
      returnables: [{ name: "crates", quantity: 58 }],
    })
    expect(request.lines).toHaveLength(1)
    expect(request.returnables).toEqual([{ name: "crates", quantity: 58 }])
    expect(request.payment?.percent).toBe(70)
  })

  test("a paid percentage stays within 0–100", () => {
    for (const percent of [0, 120])
      expect(
        orderPreparationRequestSchema.safeParse({
          lines: [{ name: "Gas refill", quantity: "1" }],
          payment: { paid: true, percent },
        }).success,
      ).toBe(false)
  })
})

describe("percentOfTotalMinor", () => {
  test("70% of ₦480,000 is ₦336,000", () => {
    expect(percentOfTotalMinor(48_000_000, 70)).toBe(33_600_000)
  })
  test("never rounds up into money not received", () => {
    expect(percentOfTotalMinor(1_001, 50)).toBe(500)
    expect(percentOfTotalMinor(1_000, 33.5)).toBe(335)
  })
  test("refuses impossible shares", () => {
    expect(percentOfTotalMinor(1_000, 0)).toBeNull()
    expect(percentOfTotalMinor(1_000, 101)).toBeNull()
  })
})

describe("returnable_movement_record", () => {
  test("accepts a return by name with no ids yet", () => {
    const parsed = generalActionSchema.parse({
      action: "returnable_movement_record",
      kind: "RETURNED",
      quantity: 78,
      customerName: "Chidi",
    })
    expect(parsed.action).toBe("returnable_movement_record")
  })

  test("refuses non-whole and zero quantities and unknown kinds", () => {
    for (const change of [{ quantity: 0 }, { quantity: 1.5 }, { kind: "SOLD" }])
      expect(
        generalActionSchema.safeParse({
          action: "returnable_movement_record",
          kind: "RETURNED",
          quantity: 5,
          customerName: "Musa",
          ...change,
        }).success,
      ).toBe(false)
  })

  test("summary for clients without a card", () => {
    expect(
      returnableMovementSummary({
        action: "returnable_movement_record",
        kind: "WRITTEN_OFF",
        quantity: 5,
        customerName: "Musa Ibrahim",
        itemName: "Egg crate",
      }),
    ).toBe("5 Egg crate written off\nCustomer: Musa Ibrahim")
  })
})

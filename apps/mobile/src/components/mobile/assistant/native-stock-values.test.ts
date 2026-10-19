import { expect, test } from "bun:test"
import {
  type NativeStockAction,
  isNativeStockAction,
  nativeStockAdjust,
  nativeStockCloseoutCreate,
  nativeStockCorrect,
  nativeStockCostInput,
  nativeStockCountCreate,
  nativeStockCustody,
  nativeStockEffectiveAt,
  nativeStockQuantity,
  nativeStockReasonOnly,
  nativeStockReceive,
  nativeStockTransferQuantity,
  nativeStockTransform,
  nativeStockUnitCost,
} from "./native-stock-values"

type Of<N extends NativeStockAction["action"]> = Extract<
  NativeStockAction,
  { action: N }
>
const raw = /Too (small|big):|Invalid (input|string)|must match pattern|"code"/

const receive: Of<"stock_receive"> = {
  action: "stock_receive",
  balanceSourceId: "balance-1",
  enteredInventoryUnitId: "unit-bag",
  enteredQuantity: "10",
  reason: "Delivery",
  source: "Invoice 42",
  supplierName: "Mills Ltd",
  unitCostMinor: 450000,
  effectiveAt: "2026-10-15T09:00:00.123000Z",
}
const receiveEdits = {
  quantity: "12.5",
  source: " Invoice 43 ",
  supplier: " ",
  unitCost: "2,345.67",
  categories: [{ name: "Flour" }],
  pendingCategory: "Baking, flour",
  effectiveAt: "2026-10-15T09:00:00.123000Z",
  reason: " Second delivery ",
}

test("receive: identities fixed, exact cost, normalized categories, drafted instant kept, blank supplier dropped", () => {
  const result = nativeStockReceive(
    { ...receive, balanceSourceId: "balance-1" },
    receiveEdits,
    { scale: 3 },
  )
  expect(result).toEqual({
    ok: true,
    payload: {
      action: "stock_receive",
      balanceSourceId: "balance-1",
      enteredInventoryUnitId: "unit-bag",
      enteredQuantity: "12.5",
      source: "Invoice 43",
      unitCostMinor: 234567,
      categories: [{ name: "Flour" }, { name: "Baking" }],
      effectiveAt: "2026-10-15T09:00:00.123000Z",
      reason: "Second delivery",
    },
  })
  expect(nativeStockUnitCost("")).toBeUndefined()
  expect(nativeStockUnitCost("0")).toBe(0)
  expect(nativeStockCostInput(234567)).toBe("2345.67")
  for (const [edit, message] of [
    [{ quantity: "1.2345" }, "This unit allows up to 3 decimal places."],
    [{ quantity: "0" }, "Enter a quantity above zero."],
    [{ unitCost: "12.345" }, /at most two decimal places/],
    [{ effectiveAt: "2026-10-15 09:00" }, /valid UTC time/],
    [{ source: "" }, /source/i],
  ] as const) {
    const bad = nativeStockReceive(
      receive,
      { ...receiveEdits, ...edit },
      { scale: 3 },
    )
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.error).toMatch(message)
      expect(bad.error).not.toMatch(raw)
    }
  }
})

test("adjust: waste always decreases, categories are required, extra keys cannot reach the payload", () => {
  const initial: Of<"stock_adjust"> = {
    action: "stock_adjust",
    balanceSourceId: "balance-1",
    enteredInventoryUnitId: "unit-each",
    enteredQuantity: "3",
    direction: "increase",
    purpose: "adjustment",
    reason: "Found",
    categories: [{ name: "Shelf" }],
  }
  const edits = {
    quantity: "2",
    direction: "increase" as const,
    purpose: "waste" as const,
    categories: [{ name: "Damaged" }],
    pendingCategory: "",
    effectiveAt: "",
    reason: "Broken",
  }
  const result = nativeStockAdjust(initial, edits)
  expect(result.ok && result.payload).toMatchObject({
    direction: "decrease",
    purpose: "waste",
    balanceSourceId: "balance-1",
    enteredInventoryUnitId: "unit-each",
  })
  if (result.ok) expect(result.payload).not.toHaveProperty("effectiveAt")
  const none = nativeStockAdjust(initial, { ...edits, categories: [] })
  expect(none).toEqual({ ok: false, error: "Choose 1–10 categories." })
})

test("correct: one replacement per original movement at that movement's scale", () => {
  const initial: Of<"stock_correct"> = {
    action: "stock_correct",
    targetOperationId: "op-1",
    reason: "Typo",
    corrections: [
      { movementId: "m-1", correctedEnteredQuantity: "5" },
      { movementId: "m-2", correctedEnteredQuantity: "1.5" },
    ],
  }
  expect(
    nativeStockCorrect(
      initial,
      { quantities: ["4", "1.25"], reason: "Recount" },
      [0, 2],
    ),
  ).toEqual({
    ok: true,
    payload: {
      action: "stock_correct",
      targetOperationId: "op-1",
      corrections: [
        { movementId: "m-1", correctedEnteredQuantity: "4" },
        { movementId: "m-2", correctedEnteredQuantity: "1.25" },
      ],
      reason: "Recount",
    },
  })
  expect(
    nativeStockCorrect(initial, { quantities: ["4.5", "1"], reason: "x" }, [0]),
  ).toEqual({
    ok: false,
    error:
      "This unit counts whole numbers only. Enter a whole replacement quantity.",
  })
  expect(
    nativeStockCorrect(initial, { quantities: ["4"], reason: "x" }).ok,
  ).toBe(false)
})

test("count and closeout: zero is a real observation; sources, units and custody stay fixed", () => {
  const count: Of<"stock_count_create"> = {
    action: "stock_count_create",
    reason: "Weekly",
    lines: [
      {
        balanceSourceId: "b-1",
        entries: [
          { enteredInventoryUnitId: "u-carton", enteredQuantity: "2" },
          { enteredInventoryUnitId: "u-each", enteredQuantity: "5" },
        ],
      },
    ],
  }
  const counted = nativeStockCountCreate(count, {
    quantities: [["0", "7"]],
    reason: "Weekly count",
  })
  expect(counted.ok && counted.payload).toMatchObject({
    lines: [
      {
        balanceSourceId: "b-1",
        entries: [
          { enteredInventoryUnitId: "u-carton", enteredQuantity: "0" },
          { enteredInventoryUnitId: "u-each", enteredQuantity: "7" },
        ],
      },
    ],
  })
  expect(
    nativeStockCountCreate(count, { quantities: [["1"]], reason: "x" }),
  ).toEqual({
    ok: false,
    error: "Enter a counted quantity for every observation.",
  })
  const closeout: Of<"inventory_closeout_create"> = {
    action: "inventory_closeout_create",
    custodyType: "session",
    custodyReferenceId: "session-ref",
    reason: "End of shift",
    declarations: [{ balanceSourceId: "b-1", declaredQuantity: "3" }],
  }
  const declared = nativeStockCloseoutCreate(closeout, {
    quantities: ["0"],
    reason: "Nothing left",
  })
  expect(declared.ok && declared.payload).toMatchObject({
    custodyType: "session",
    custodyReferenceId: "session-ref",
    declarations: [{ balanceSourceId: "b-1", declaredQuantity: "0" }],
  })
})

test("reason-only finalize/cancel keep the saved record; a blank reason reads plainly", () => {
  for (const initial of [
    { action: "stock_count_finalize", stockCountId: "c-1", reason: "Done" },
    {
      action: "inventory_closeout_finalize",
      closeoutId: "k-1",
      reason: "Done",
    },
    { action: "stock_transfer_cancel", transferId: "t-1", reason: "Wrong" },
  ] as const) {
    const ok = nativeStockReasonOnly(initial, { reason: " Checked " })
    expect(ok).toEqual({
      ok: true,
      payload: { ...initial, reason: "Checked" },
    })
    expect(nativeStockReasonOnly(initial, { reason: " " })).toEqual({
      ok: false,
      error: "Enter a reason.",
    })
  }
})

test("transfer dispatch/receive edit only quantity and reason at the unit scale", () => {
  const dispatch: Of<"stock_transfer_dispatch"> = {
    action: "stock_transfer_dispatch",
    sourceBalanceSourceId: "b-1",
    targetStoreId: "store-2",
    quantity: "4",
    reason: "Restock",
  }
  expect(
    nativeStockTransferQuantity(
      dispatch,
      { quantity: "3.5", reason: "Half load" },
      { scale: 1 },
    ),
  ).toEqual({
    ok: true,
    payload: { ...dispatch, quantity: "3.5", reason: "Half load" },
  })
  const receiveTransfer: Of<"stock_transfer_receive"> = {
    action: "stock_transfer_receive",
    transferId: "t-1",
    quantity: "4",
    reason: "Arrived",
  }
  expect(
    nativeStockTransferQuantity(receiveTransfer, { quantity: "0", reason: "x" })
      .ok,
  ).toBe(false)
})

test("custody: assignment needs a current eligible identity; a return always goes to the Store", () => {
  const assign: Of<"stock_custody_move"> = {
    action: "stock_custody_move",
    sourceBalanceSourceId: "b-1",
    target: { type: "staff", userId: "user-a" },
    quantity: "2",
    reason: "Route",
  }
  expect(
    nativeStockCustody(
      assign,
      { userId: "user-b", quantity: "2", reason: "Route" },
      { eligibleUserIds: ["user-a", "user-b"] },
    ),
  ).toMatchObject({
    ok: true,
    payload: { target: { type: "staff", userId: "user-b" } },
  })
  expect(
    nativeStockCustody(
      assign,
      { quantity: "2", reason: "Route" },
      { eligibleUserIds: ["user-b"] },
    ),
  ).toEqual({
    ok: false,
    error:
      "Choose a staff member from the current eligible list for this Store.",
  })
  const back: Of<"stock_custody_move"> = {
    ...assign,
    target: { type: "store" },
  }
  expect(
    nativeStockCustody(back, {
      userId: "ignored",
      quantity: "1",
      reason: "Return",
    }),
  ).toMatchObject({ ok: true, payload: { target: { type: "store" } } })
})

test("transform edits only the source packs; no target quantity can be sent", () => {
  const initial: Of<"stock_package_transform"> = {
    action: "stock_package_transform",
    sourceBalanceSourceId: "b-crate",
    targetBalanceSourceId: "b-tray",
    sourceQuantity: "2",
    reason: "Repack",
  }
  const result = nativeStockTransform(initial, {
    sourceQuantity: "3",
    reason: "Repack for retail",
  })
  expect(result).toEqual({
    ok: true,
    payload: { ...initial, sourceQuantity: "3", reason: "Repack for retail" },
  })
  if (result.ok) expect(result.payload).not.toHaveProperty("targetQuantity")
})

test("the action set is exactly the 12 stock writes; quantities never use floats", () => {
  expect(isNativeStockAction({ ...receive } as NativeStockAction)).toBe(true)
  expect(isNativeStockAction({ action: "order_cancel" } as never)).toBe(false)
  expect(nativeStockQuantity("0.000001")).toBe("0.000001")
  expect(nativeStockQuantity("999999999999.999999")).toBe("999999999999.999999")
  expect(() => nativeStockQuantity("1e3")).toThrow()
  expect(() => nativeStockQuantity("-1")).toThrow()
})

test("effective time: clearing omits it; typed times stay exact and must be storable without rounding", () => {
  // A drafted instant that is cleared is dropped, so the new review sets it.
  const drafted = { ...receive, effectiveAt: "2026-10-10T01:00:00Z" }
  const cleared = nativeStockReceive(drafted, {
    ...receiveEdits,
    effectiveAt: "",
  })
  expect(cleared.ok).toBe(true)
  if (cleared.ok) expect(cleared.payload).not.toHaveProperty("effectiveAt")
  expect(nativeStockEffectiveAt("  ")).toBeUndefined()
  // Representable times are kept exactly as typed, never normalized.
  for (const raw of [
    "2026-10-15T09:00:00Z",
    "2026-10-15T09:00:00.123Z",
    "2026-10-15T09:00:00.123000000Z",
  ])
    expect(nativeStockEffectiveAt(raw)).toBe(raw)
  // Sub-millisecond digits would be rounded on commit: refused, even when
  // unchanged from the draft, and the typed value is left for correction.
  const precise = { ...receive, effectiveAt: "2026-10-15T09:00:00.123456Z" }
  const kept = nativeStockReceive(precise, {
    ...receiveEdits,
    effectiveAt: "2026-10-15T09:00:00.123456Z",
  })
  expect(kept).toEqual({
    ok: false,
    error:
      "Use a time with no more than millisecond precision. Keep any further fractional digits at zero.",
  })
  for (const raw of [
    "2026-02-30T09:00:00Z",
    "2026-10-15T09:00Z",
    "2026-10-15T09:00:00+01:00",
    " 2026-10-15T09:00:00Z",
  ])
    expect(() => nativeStockEffectiveAt(raw)).toThrow(
      "Enter a valid UTC time, including seconds and Z.",
    )
})

test("quantity messages: singular places, whole numbers, blank, negative and commas", () => {
  const says = (
    value: string,
    options: Parameters<typeof nativeStockQuantity>[1],
  ) => {
    try {
      nativeStockQuantity(value, options)
      return "accepted"
    } catch (error) {
      return (error as Error).message
    }
  }
  expect(says("1.25", { scale: 1 })).toBe(
    "This unit allows up to 1 decimal place.",
  )
  expect(says("1.2345", { scale: 3 })).toBe(
    "This unit allows up to 3 decimal places.",
  )
  expect(says("1.2345678", { scale: 1 })).toBe(
    "Enter the quantity as a number with up to 1 decimal place.",
  )
  for (const [value, message] of [
    ["", "Enter the quantity."],
    ["-3", "Enter a quantity above zero."],
    ["1,200", "Enter the quantity without commas."],
    ["abc", "Enter the quantity as a whole number."],
  ])
    expect(says(value, { scale: 0 })).toBe(message)
  expect(
    says("-1", { scale: 0, allowZero: true, label: "counted quantity" }),
  ).toBe("Enter a counted quantity of zero or more.")
})

test("custody field errors show before eligibility; receipts can't exceed what is in transit", () => {
  const assign: Of<"stock_custody_move"> = {
    action: "stock_custody_move",
    sourceBalanceSourceId: "b-1",
    target: { type: "staff", userId: "gone" },
    quantity: "2",
    reason: "Route",
  }
  expect(
    nativeStockCustody(
      assign,
      { quantity: "2", reason: " " },
      { eligibleUserIds: [] },
    ),
  ).toEqual({ ok: false, error: "Enter a reason." })
  expect(
    nativeStockCustody(
      assign,
      { quantity: "2", reason: "Route" },
      { eligibleUserIds: [] },
    ),
  ).toEqual({
    ok: false,
    error:
      "Choose a staff member from the current eligible list for this Store.",
  })
  const receipt: Of<"stock_transfer_receive"> = {
    action: "stock_transfer_receive",
    transferId: "t-1",
    quantity: "6",
    reason: "Arrived",
  }
  const max = { quantity: "6", unitName: "bag" }
  expect(
    nativeStockTransferQuantity(
      receipt,
      { quantity: "7", reason: "x" },
      { scale: 0, max },
    ),
  ).toEqual({
    ok: false,
    error: "Only 6 bag is in transit. Enter that much or less.",
  })
  expect(
    nativeStockTransferQuantity(
      receipt,
      { quantity: "6", reason: "x" },
      { scale: 0, max },
    ).ok,
  ).toBe(true)
})

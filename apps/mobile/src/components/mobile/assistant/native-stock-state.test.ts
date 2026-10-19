import { expect, test } from "bun:test"
import {
  type NativeStockBalance,
  nativeStockBalance,
  nativeStockCustodyChoices,
  nativeStockCustodyKind,
  nativeStockEnteredUnit,
  nativeStockOriginalParam,
  nativeStockOriginalRoute,
  nativeStockPackPreview,
  nativeStockReceiptOriginal,
  nativeStockScale,
  nativeStockScope,
  nativeStockTransferGate,
} from "./native-stock-state"

test("each stock receipt opens only its exact original; other kinds and bad ids do not", () => {
  expect(
    nativeStockReceiptOriginal({ kind: "inventory", recordId: "op-1" }),
  ).toEqual({
    kind: "stock_operation",
    operationId: "op-1",
  })
  expect(
    nativeStockReceiptOriginal({ kind: "stock_count", recordId: "c-1" }),
  ).toEqual({
    kind: "stock_count",
    stockCountId: "c-1",
  })
  expect(
    nativeStockReceiptOriginal({ kind: "stock_transfer", recordId: "t-1" }),
  ).toEqual({
    kind: "stock_transfer",
    transferId: "t-1",
  })
  expect(
    nativeStockReceiptOriginal({ kind: "inventory_closeout", recordId: "k-1" }),
  ).toEqual({ kind: "inventory_closeout", closeoutId: "k-1" })
  for (const receipt of [
    { kind: "product", recordId: "p-1" },
    { kind: "inventory", recordId: "" },
    { kind: "inventory", recordId: " op-1" },
    { kind: "inventory", recordId: "x".repeat(129) },
  ])
    expect(nativeStockReceiptOriginal(receipt)).toBeNull()
  expect(nativeStockOriginalParam("stock_count", "c-1")).toEqual({
    kind: "stock_count",
    stockCountId: "c-1",
  })
  for (const raw of [undefined, "", " c-1", ["c-1"], "x".repeat(129)])
    expect(nativeStockOriginalParam("stock_count", raw)).toBeNull()
  expect(
    nativeStockOriginalRoute({ kind: "stock_transfer", transferId: "t-1" }),
  ).toEqual({
    pathname: "/stock-transfer/[transferId]",
    params: { transferId: "t-1" },
  })
})

test("a balance row counts only for the exact source in the current Store", () => {
  const row = {
    balanceSourceId: "b-1",
    storeId: "store-1",
    inventoryUnitTransactionScale: 3,
  } as NativeStockBalance
  const expected = { storeId: "store-1", balanceSourceId: "b-1" }
  expect(nativeStockBalance(row, expected)).toBe(row)
  expect(nativeStockBalance(null, expected)).toBeNull()
  expect(
    nativeStockBalance({ ...row, storeId: "store-2" }, expected),
  ).toBeNull()
  expect(
    nativeStockBalance({ ...row, balanceSourceId: "b-2" }, expected),
  ).toBeNull()
  expect(nativeStockScale(row)).toBe(3)
  expect(
    nativeStockScale({
      inventoryUnitTransactionScale: 9,
    } as NativeStockBalance),
  ).toBeUndefined()
})

test("transfer receipt happens in the destination Store, cancellation in the source, only while in transit", () => {
  const review = {
    status: "IN_TRANSIT",
    sourceStore: { id: "store-a" },
    targetStore: { id: "store-b" },
  } as Parameters<typeof nativeStockTransferGate>[0]
  expect(
    nativeStockTransferGate(review, "stock_transfer_receive", "store-b"),
  ).toBe("ready")
  expect(
    nativeStockTransferGate(review, "stock_transfer_receive", "store-a"),
  ).toBe("wrong_store")
  expect(
    nativeStockTransferGate(review, "stock_transfer_cancel", "store-a"),
  ).toBe("ready")
  expect(
    nativeStockTransferGate(review, "stock_transfer_cancel", "store-b"),
  ).toBe("wrong_store")
  expect(
    nativeStockTransferGate(
      { ...review, status: "RECEIVED" } as typeof review,
      "stock_transfer_receive",
      "store-b",
    ),
  ).toBe("not_in_transit")
})

test("custody choices keep every identity: missing names read as unavailable, equal name+role are numbered", () => {
  const choices = nativeStockCustodyChoices(
    {
      storeId: "store-1",
      assignees: [
        { id: "u-1", name: "Ada", role: "CASHIER" },
        { id: "u-2", name: "Ada", role: "CASHIER" },
        { id: "u-3", name: "Ada", role: "MANAGER" },
        { id: "u-4", name: null, role: "CASHIER" },
      ],
    } as Parameters<typeof nativeStockCustodyChoices>[0],
    "store-1",
  )
  expect(choices).toEqual([
    { id: "u-1", label: "Ada · cashier · 1", role: "cashier" },
    { id: "u-2", label: "Ada · cashier · 2", role: "cashier" },
    { id: "u-3", label: "Ada · manager", role: "manager" },
    { id: "u-4", label: "Name unavailable · cashier", role: "cashier" },
  ])
  expect(
    nativeStockCustodyChoices(
      { storeId: "store-2", assignees: [] } as Parameters<
        typeof nativeStockCustodyChoices
      >[0],
      "store-1",
    ),
  ).toBeNull()
})

test("custody direction and pack math use the shared canonical functions and fail closed", () => {
  expect(
    nativeStockCustodyKind(
      { custodyType: "STORE", custodyReferenceId: "store-1" },
      { type: "staff", userId: "u-1" },
    ),
  ).toEqual({ kind: "assignment", staffUserId: "u-1" })
  expect(
    nativeStockCustodyKind(
      { custodyType: "SESSION", custodyReferenceId: "s-1" },
      { type: "store" },
    ),
  ).toHaveProperty("refused")
  const ok = nativeStockPackPreview({
    sourceQuantity: "2",
    sourceFactor: "24",
    sourceScale: 0,
    targetFactor: "6",
    targetScale: 0,
    sourceUnitName: "crate",
    targetUnitName: "tray",
  })
  expect(ok).toMatchObject({ ok: true, value: { targetQuantity: "8" } })
  const refused = nativeStockPackPreview({
    sourceQuantity: "1",
    sourceFactor: "5",
    sourceScale: 0,
    targetFactor: "2",
    targetScale: 0,
    sourceUnitName: "box",
    targetUnitName: "pair",
  })
  expect(refused.ok).toBe(false)
  const malformed = nativeStockPackPreview({
    sourceQuantity: "1",
    sourceFactor: "not-a-number",
    sourceScale: 0,
    targetFactor: "2",
    targetScale: 0,
    sourceUnitName: "box",
    targetUnitName: "pair",
  })
  expect(malformed.ok).toBe(false)
})

test("stock reads count only when the fresh server scope equals the signed-in profile", () => {
  const expected = {
    tenantId: "t-1",
    storeId: "store-1",
    actorUserId: "u-1",
    role: "MANAGER",
  }
  const current = {
    tenant: { id: "t-1" },
    activeStore: { id: "store-1", status: "ACTIVE" },
    actorUserId: "u-1",
    membership: { tenantId: "t-1", role: "MANAGER" },
    stores: [
      { id: "store-1", name: "Ikeja", extra: "dropped" },
      { id: "store-2", name: "Lekki" },
    ],
  }
  expect(nativeStockScope(current, expected)).toEqual({
    ...expected,
    stores: [
      { id: "store-1", name: "Ikeja" },
      { id: "store-2", name: "Lekki" },
    ],
  })
  for (const changed of [
    { ...current, activeStore: { id: "store-2", status: "ACTIVE" } },
    { ...current, activeStore: { id: "store-1", status: "ARCHIVED" } },
    { ...current, actorUserId: "u-2" },
    { ...current, tenant: { id: "t-2" } },
    { ...current, membership: { tenantId: "t-1", role: "CASHIER" } },
    { ...current, stores: undefined },
    null,
  ])
    expect(nativeStockScope(changed, expected)).toBeNull()
  expect(
    nativeStockScope(
      { ...current, membership: { tenantId: "t-1", role: "CASHIER" } },
      { ...expected, role: "CASHIER" },
    ),
  ).toBeNull()
})

test("the entered unit comes only from the balance's current configuration", () => {
  const balance = { productId: "p-1", configurationVersionId: "cfg-2" }
  const unit = (id: string, transactionScale: number) => ({
    id,
    name: id,
    factor: "50",
    transactionScale,
    key: id,
    stockBehavior: "packaged_stock" as const,
    symbol: null,
    unitDefinitionId: null,
  })
  const configurations = [
    {
      id: "cfg-1",
      productId: "p-1",
      status: "superseded" as const,
      units: [unit("bag-old", 0)],
    },
    {
      id: "cfg-2",
      productId: "p-1",
      status: "current" as const,
      units: [unit("bag", 0), unit("kg", 3)],
    },
  ] as unknown as Parameters<typeof nativeStockEnteredUnit>[0]
  expect(nativeStockEnteredUnit(configurations, balance, "kg")).toEqual({
    name: "kg",
    factor: "50",
    scale: 3,
  })
  expect(nativeStockEnteredUnit(configurations, balance, "bag-old")).toBeNull()
  expect(
    nativeStockEnteredUnit(
      configurations,
      { ...balance, configurationVersionId: "cfg-1" },
      "bag-old",
    ),
  ).toBeNull()
  expect(
    nativeStockEnteredUnit(
      configurations,
      { ...balance, productId: "p-2" },
      "kg",
    ),
  ).toBeNull()
  expect(nativeStockEnteredUnit(undefined, balance, "kg")).toBeNull()
})

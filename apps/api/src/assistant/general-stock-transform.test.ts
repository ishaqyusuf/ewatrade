import { afterAll, beforeAll, expect, mock, test } from "bun:test"
import type { GeneralAction } from "@ewatrade/assistant/general/contracts"
import type { GeneralTransactionContext } from "./general-actions"

// Only the canonical in-transaction command and its lock helper are stood in
// for; conversion, refusals, authority and the signing digest are real.
const commands: Array<Record<string, unknown>> = []
const locks: string[][] = []
const actual = await import("@ewatrade/db/queries")
mock.module("@ewatrade/db/queries", () => ({
  ...actual,
  lockInventorySourcesForReview: async (
    _tx: unknown,
    input: { balanceSourceIds: string[] },
  ) => {
    locks.push([...input.balanceSourceIds])
  },
  transformPackagedStockInTransaction: async (
    _tx: unknown,
    input: Record<string, unknown>,
  ) => {
    commands.push(input)
    return { id: `op-${commands.length}` }
  },
}))
const { assertTransformAccess, derivePackTarget, stockPackageTransform } =
  await import("./general-stock-transform")
const { assertGeneralAction, assertGeneralActionAuthority } = await import(
  "./general-context"
)

const savedKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeAll(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "c".repeat(32)
})
afterAll(() => {
  if (savedKey === undefined)
    Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
  else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = savedKey
})

type Transform = Extract<GeneralAction, { action: "stock_package_transform" }>
const decimal = (value: string) => ({ toFixed: () => value })
type Unit = {
  id: string
  name: string
  factor: string
  scale: number
  config?: string
}
function balance(
  id: string,
  unit: Unit,
  options: {
    onHand?: string
    reserved?: string
    revision?: number
    kind?: string
    variantId?: string
    storeId?: string
  } = {},
) {
  return {
    id,
    tenantId: "tenant-a",
    storeId: options.storeId ?? "store-a",
    productId: "product-eggs",
    variantId: options.variantId ?? "var-eggs",
    inventoryUnitId: unit.id,
    kind: options.kind ?? "PACKAGED_STOCK",
    revision: options.revision ?? 3,
    onHandQuantity: decimal(options.onHand ?? "10"),
    reservedQuantity: decimal(options.reserved ?? "1"),
    inventoryUnit: {
      id: unit.id,
      name: unit.name,
      factor: decimal(unit.factor),
      transactionScale: unit.scale,
      configurationVersionId: unit.config ?? "config-1",
    },
    product: {
      catalogItemId: "item-eggs",
      catalogItem: { name: "Eggs", tenantId: "tenant-a" },
    },
    variant: { name: "Large", catalogItemId: "item-eggs" },
  }
}
const crate: Unit = { id: "u-crate", name: "crate", factor: "30", scale: 0 }
const piece: Unit = { id: "u-piece", name: "piece", factor: "1", scale: 0 }
type Balance = ReturnType<typeof balance>
function context(
  balances: Balance[] = [
    balance("crates", crate),
    balance("pieces", piece, { onHand: "5", reserved: "0" }),
  ],
  options: { role?: string; staffAccess?: Record<string, unknown> } = {},
) {
  const db = {
    stockBalanceSource: {
      findFirst: async (args: {
        where: { id: string; tenantId: string; storeId: string }
      }) =>
        balances.find(
          (row) =>
            row.id === args.where.id &&
            row.tenantId === args.where.tenantId &&
            row.storeId === args.where.storeId,
        ) ?? null,
    },
  }
  return {
    session: { user: { id: "manager-u" }, session: { id: "session" } },
    requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    tenantContext: {
      tenant: { id: "tenant-a", dataClassification: "QA" },
      membership: { role: options.role ?? "MANAGER" },
      activeStore: { id: "store-a", name: "Wuse" },
      stores: [{ id: "store-a" }],
      staffAccess: options.staffAccess ?? {
        status: "ACTIVE",
        mode: "LEGACY",
        businessRole: options.role ?? "MANAGER",
        assignments: [],
      },
    },
    db,
  } as unknown as GeneralTransactionContext
}
const draft: Transform = {
  action: "stock_package_transform",
  sourceBalanceSourceId: "crates",
  targetBalanceSourceId: "pieces",
  sourceQuantity: "2",
  reason: "Open two crates",
}

test("the target quantity is derived exactly, never rounded", () => {
  const base = {
    sourceFactor: "30",
    sourceScale: 0,
    targetFactor: "1",
    targetScale: 0,
    sourceUnitName: "crate",
    targetUnitName: "piece",
  }
  expect(
    derivePackTarget({ ...base, sourceQuantity: "2" }) as Record<
      string,
      unknown
    >,
  ).toEqual({
    sourceQuantity: "2",
    targetQuantity: "60",
    canonical: "60",
  })
  // Pieces into crates: 45 pieces is not whole crates at scale 0.
  expect(() =>
    derivePackTarget({
      ...base,
      sourceQuantity: "45",
      sourceFactor: "1",
      targetFactor: "30",
      sourceUnitName: "piece",
      targetUnitName: "crate",
    }),
  ).toThrow("45 piece does not make whole crate.")
  // A fractional target is valid when its scale allows it exactly.
  expect(
    derivePackTarget({
      ...base,
      sourceQuantity: "1",
      sourceFactor: "1",
      targetFactor: "4",
      targetScale: 2,
      sourceUnitName: "piece",
      targetUnitName: "tray",
    }).targetQuantity,
  ).toBe("0.25")
  expect(() =>
    derivePackTarget({
      ...base,
      sourceQuantity: "1",
      sourceFactor: "1",
      targetFactor: "3",
      targetScale: 2,
      sourceUnitName: "piece",
      targetUnitName: "tray",
    }),
  ).toThrow("1 piece cannot be represented in tray.")
  expect(() => derivePackTarget({ ...base, sourceQuantity: "1.5" })).toThrow(
    "1.5 cannot be represented in crate.",
  )
})

test("review names the Store, both packs and conserved stock", async () => {
  const review = await stockPackageTransform.review?.(context(), draft)
  expect(review?.lines).toEqual([
    "Repack 2 crate into 60 piece at Wuse.",
    "Eggs · Large · crate ×30 → piece ×1 · 60 canonical units conserved.",
    "crate stock 10 → 8; reserved 1; available 9.",
    "piece stock 5 → 65; reserved 0.",
    "Repacking conserves stock exactly. Record any loss as a separate adjustment.",
    "Reason: Open two crates",
  ])
})

test("invalid endpoints and over-available quantities are refused", async () => {
  const refused = async (balances: Balance[], payload = draft) =>
    stockPackageTransform.validate(context(balances), payload, false)
  await expect(
    refused([balance("crates", crate)], {
      ...draft,
      targetBalanceSourceId: "crates",
    }),
  ).rejects.toThrow("Choose two different pack balances")
  await expect(
    refused([
      balance("crates", crate, { kind: "SHARED_POOL" }),
      balance("pieces", piece),
    ]),
  ).rejects.toThrow("Only packaged stock balances can be repacked.")
  await expect(
    refused([
      balance("crates", crate),
      balance("pieces", piece, { variantId: "var-other" }),
    ]),
  ).rejects.toThrow("same Product and variant")
  await expect(
    refused([
      balance("crates", crate),
      balance("pieces", { ...piece, config: "config-2" }),
    ]),
  ).rejects.toThrow("different unit configurations")
  await expect(
    refused([balance("crates", crate), balance("pieces", piece)], {
      ...draft,
      sourceQuantity: "10",
    }),
  ).rejects.toThrow("Only 9 crate can be repacked: on hand 10, reserved 1.")
  for (const balances of [
    [balance("crates", crate)],
    [
      balance("crates", crate),
      balance("pieces", piece, { storeId: "store-b" }),
    ],
  ])
    await expect(refused(balances)).rejects.toThrow(
      "This repack is unavailable.",
    )
})

test("local access mirrors assertCanManageInventory, scoped staff included", () => {
  const tenant = (role: string, staffAccess: Record<string, unknown>) =>
    ({
      membership: { role },
      activeStore: { id: "store-a" },
      stores: [{ id: "store-a" }],
      staffAccess,
    }) as never
  const scoped = (storeRole: string) => ({
    status: "ACTIVE",
    mode: "SCOPED",
    businessRole: "MANAGER",
    catalogEditor: false,
    assignments: [{ storeId: "store-a", status: "ACTIVE", role: storeRole }],
  })
  const legacy = { status: "ACTIVE", mode: "LEGACY", assignments: [] }
  for (const allowed of [
    tenant("MANAGER", { ...legacy, businessRole: "MANAGER" }),
    tenant("OWNER", { ...legacy, businessRole: "OWNER" }),
    // Scoped staff are judged by their Store `stock` action, as the
    // canonical procedure defers them to the Store guard.
    tenant("CASHIER", scoped("OPERATOR")),
    tenant("MANAGER", scoped("MANAGER")),
  ])
    expect(() => assertTransformAccess(allowed, "store-a")).not.toThrow()
  for (const refused of [
    tenant("CASHIER", { ...legacy, businessRole: "CASHIER" }),
    tenant("MANAGER", scoped("CASHIER")),
    tenant("MANAGER", { ...scoped("MANAGER"), assignments: [] }),
  ])
    expect(() => assertTransformAccess(refused, "store-a")).toThrow(
      "Repacking stock requires inventory access",
    )
  expect(() =>
    assertTransformAccess(
      tenant("MANAGER", { ...legacy, businessRole: "MANAGER" }),
      "store-b",
    ),
  ).toThrow()
})

test("central authority: managers and stock-scoped staff, dashboard only, still planned", () => {
  const scoped = (storeRole: string, status = "ACTIVE") => ({
    status: "ACTIVE",
    mode: "SCOPED",
    businessRole: "MANAGER",
    catalogEditor: false,
    assignments: [{ storeId: "store-a", status, role: storeRole }],
  })
  const legacy = (role: string) => ({
    status: "ACTIVE",
    mode: "LEGACY",
    businessRole: role,
    assignments: [],
  })
  const central = (
    role: string,
    staffAccess: Record<string, unknown>,
    client = "dashboard",
  ) => {
    const ctx = context(undefined, { role, staffAccess }) as unknown as {
      requestHeaders: Headers
    }
    ctx.requestHeaders = new Headers({ "x-assistant-client": client })
    return ctx as unknown as GeneralTransactionContext
  }
  for (const role of ["OWNER", "ADMIN", "MANAGER"])
    expect(() =>
      assertGeneralActionAuthority(
        central(role, legacy(role)),
        "stock_package_transform",
      ),
    ).not.toThrow()
  for (const storeRole of ["MANAGER", "OPERATOR"])
    expect(() =>
      assertGeneralActionAuthority(
        central("MANAGER", scoped(storeRole)),
        "stock_package_transform",
      ),
    ).not.toThrow()
  // Includes a completed proposal's replay after access is lost: the
  // replay branch runs this same fresh authority check first.
  for (const ctx of [
    central("CASHIER", legacy("CASHIER")),
    central("MANAGER", scoped("CASHIER")),
    central("MANAGER", scoped("MANAGER", "REVOKED")),
    central("MANAGER", { ...legacy("MANAGER"), status: "SUSPENDED" }),
    central("OWNER", legacy("OWNER"), "mobile"),
  ])
    expect(() =>
      assertGeneralActionAuthority(ctx, "stock_package_transform"),
    ).toThrow()
  expect(() =>
    assertGeneralAction(
      central("OWNER", legacy("OWNER")),
      "stock_package_transform",
    ),
  ).toThrow()
})

test("drift in either balance, configuration, factor or scale changes the signed review", async () => {
  const base = await stockPackageTransform.validate(context(), draft, false)
  for (const balances of [
    [
      balance("crates", crate, { revision: 4 }),
      balance("pieces", piece, { onHand: "5", reserved: "0" }),
    ],
    [
      balance("crates", crate),
      balance("pieces", piece, { onHand: "5", reserved: "0", revision: 9 }),
    ],
    [
      balance("crates", { ...crate, config: "config-2" }),
      balance(
        "pieces",
        { ...piece, config: "config-2" },
        {
          onHand: "5",
          reserved: "0",
        },
      ),
    ],
    [
      balance("crates", { ...crate, factor: "15" }),
      balance("pieces", piece, { onHand: "5", reserved: "0" }),
    ],
    [
      balance("crates", crate),
      balance("pieces", { ...piece, scale: 2 }, { onHand: "5", reserved: "0" }),
    ],
    [
      balance("crates", crate, { reserved: "2" }),
      balance("pieces", piece, { onHand: "5", reserved: "0" }),
    ],
  ]) {
    const next = await stockPackageTransform.validate(
      context(balances),
      draft,
      false,
    )
    expect(next?.id).toBe(base?.id)
    expect(next?.revision).not.toBe(base?.revision)
  }
})

test("confirmation locks both balances and sends the exact derived command", async () => {
  commands.length = 0
  locks.length = 0
  const prepared = await stockPackageTransform.prepareExecution?.(
    context(),
    draft,
    { clientOperationId: "proposal-key", expectedReviewDigest: "x" },
  )
  expect(locks.at(-1)?.sort()).toEqual(["crates", "pieces"])
  const receipt = await prepared?.execute("proposal-key-0001")
  expect(commands).toEqual([
    {
      clientOperationId: "proposal-key-0001",
      expectedConfigurationVersionId: "config-1",
      reason: "Open two crates",
      schemaVersion: 1,
      source: "assistant",
      sourceBalanceRevision: 3,
      sourceBalanceSourceId: "crates",
      sourceQuantity: "2",
      targetBalanceRevision: 3,
      targetBalanceSourceId: "pieces",
      targetQuantity: "60",
      storeId: "store-a",
      tenantId: "tenant-a",
      actorUserId: "manager-u",
    },
  ])
  expect(receipt).toMatchObject({
    kind: "inventory",
    recordId: "op-1",
    catalogItemId: "item-eggs",
    title: "Stock repacked",
    detail: "2 crate → 60 piece of Eggs at Wuse.",
  })
})

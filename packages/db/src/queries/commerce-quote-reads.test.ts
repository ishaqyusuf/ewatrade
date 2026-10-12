import { expect, test } from "bun:test"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  getCommerceQuoteApprovalDetail,
  getCommerceQuoteApprovalReadOnlyInTransaction,
  listPendingCommerceQuoteApprovalsReadOnlyInTransaction,
} from "./commerce-quotes"
import { allowedServiceCommercePolicyDecisionRows } from "./test-helpers/service-commerce-policy"

const scope = {
  actorUserId: "checker-user",
  storeId: "store-1",
  tenantId: "tenant-1",
}
function decision(id = "decision-01") {
  return {
    id,
    storeId: scope.storeId,
    tenantId: scope.tenantId,
    quoteId: `quote-${id}`,
    quoteVersionId: `version-${id}`,
    sourceId: `source-${id}`,
    sourceType: "SERVICE_REQUEST",
    status: "PENDING",
    requesterMembershipId: "maker",
    policyRevision: 4,
    requestedAt: new Date("2026-01-01T00:00:00Z"),
    quote: { currentVersionId: `version-${id}` },
    quoteVersion: {
      status: "DRAFT",
      currencyCode: "NGN",
      totalMinor: 1000,
      version: 1,
      expiresAt: new Date("2030-01-01T00:00:00Z"),
      options: [
        {
          id: `option-${id}`,
          label: "Original service",
          availabilityOutcome: "FULL",
          discountMinor: 0,
          fulfilmentFeeMinor: 0,
          taxMinor: 0,
          subtotalMinor: 1000,
          totalMinor: 1000,
          lines: [
            {
              catalogItemName: "Repair",
              offeringName: "Inspection",
              variantName: null,
              outcome: "INCLUDED",
              quantity: new Prisma.Decimal(1),
              totalMinor: 1000,
              unitPriceMinor: 1000,
              availabilityAttestationId: null,
              configurationVersionId: null as string | null,
              balanceRevision: null as number | null,
              offeringId: "service-offering",
            },
          ],
        },
      ],
    },
  }
}

/** Delegate guard: the real query may only use these reads; no global mocks. */
function fixture(rows = [decision()], allowNativeWrites = false) {
  const state = {
    active: true,
    assigned: true,
    role: "OPERATOR",
    storeActive: true,
    scoped: false,
    storeGranted: true,
    policyAllowed: true,
    product: false,
  }
  const reads: Array<{ table: string; input: any }> = []
  const writes: string[] = []
  function delegate(
    table: string,
    handlers: Record<string, (input: any) => unknown>,
  ) {
    return new Proxy(handlers, {
      get(target, method: string) {
        if (method in target)
          return async (input: any) => {
            reads.push({ table, input })
            return target[method]!(input)
          }
        return async () => {
          writes.push(`${table}.${method}`)
          if (!allowNativeWrites)
            throw new Error(`Unexpected write: ${table}.${method}`)
          return { count: 1 }
        }
      },
    })
  }
  const client = {
    membership: delegate("membership", {
      findFirst: ({ where }) =>
        state.active &&
        where.tenantId === scope.tenantId &&
        (!where.userId || where.userId === scope.actorUserId) &&
        (!where.id || where.id === "checker")
          ? {
              id: "checker",
              role: state.role,
              status: "ACTIVE",
              staffAccessMode: state.scoped ? "SCOPED" : "LEGACY",
              staffStoreAssignments: state.storeGranted
                ? [
                    {
                      storeId: scope.storeId,
                      status: "ACTIVE",
                      role: "OPERATOR",
                    },
                  ]
                : [],
            }
          : null,
    }),
    store: delegate("store", {
      findFirst: ({ where }) =>
        state.storeActive &&
        where.id === scope.storeId &&
        where.tenantId === scope.tenantId
          ? { id: scope.storeId, countryCode: "NG" }
          : null,
    }),
    serviceCommerceQuoteReleasePolicy: delegate("policy", {
      findFirst: ({ where }) =>
        where.storeId === scope.storeId && where.tenantId === scope.tenantId
          ? {
              mode: "APPROVAL_REQUIRED",
              revision: 4,
              selectedApproverMembershipIds: ["checker"],
            }
          : null,
    }),
    serviceCommerceStoreTeamAssignment: delegate("team", {
      findMany: () =>
        state.assigned
          ? [{ membershipId: "checker", capability: "QUOTE_APPROVER" }]
          : [],
    }),
    serviceCommercePolicyDecision: delegate("vertical-policy", {
      findMany: () =>
        state.policyAllowed ? allowedServiceCommercePolicyDecisionRows() : [],
    }),
    serviceCommercePolicyAuditEvent: delegate("policy-audit", {}),
    serviceCommerceQuoteApproval: delegate("approval", {
      findFirst: ({ where }) =>
        rows.find(
          (row) =>
            row.id === where.id &&
            row.storeId === where.storeId &&
            row.tenantId === where.tenantId &&
            (!where.quoteId || row.quoteId === where.quoteId) &&
            (!where.quoteVersionId ||
              row.quoteVersionId === where.quoteVersionId) &&
            (!where.status || row.status === where.status),
        ) ?? null,
      findMany: ({ where, take }) =>
        rows
          .filter(
            (row) =>
              row.storeId === where.storeId &&
              row.tenantId === where.tenantId &&
              row.status === where.status &&
              (!where.OR ||
                row.requestedAt > where.OR[0].requestedAt.gt ||
                (row.requestedAt.getTime() ===
                  where.OR[1].requestedAt.getTime() &&
                  row.id > where.OR[1].id.gt)),
          )
          .sort(
            (a, b) =>
              a.requestedAt.getTime() - b.requestedAt.getTime() ||
              a.id.localeCompare(b.id),
          )
          .slice(0, take),
    }),
    serviceRequest: delegate("service-source", {
      findFirst: ({ where }) =>
        rows.some(
          (row) =>
            row.sourceId === where.id &&
            row.storeId === where.storeId &&
            row.tenantId === where.tenantId,
        )
          ? { status: "SUBMITTED" }
          : null,
    }),
    sellableOffering: delegate("offering", {
      findFirst: () => {
        const unit = {
          id: "unit-1",
          stockBehavior: "CANONICAL_SHARED",
          factor: new Prisma.Decimal(1),
          transactionScale: 0,
        }
        return {
          kind: state.product ? "PRODUCT_UNIT" : "SERVICE",
          status: "ACTIVE",
          variantId: "variant-1",
          storeAvailability: [{ isAvailable: true }],
          productUnitOffering: state.product
            ? {
                inventoryUnit: {
                  ...unit,
                  configurationVersion: {
                    id: "config-1",
                    status: "CURRENT",
                    units: [unit],
                    product: {
                      id: "product-1",
                      currentUnitConfigurationVersionId: "config-1",
                    },
                  },
                },
              }
            : null,
        }
      },
    }),
    stockBalanceSource: delegate("stock-balance", {
      findUnique: () => ({
        id: "balance-1",
        tenantId: scope.tenantId,
        inventoryUnitId: "unit-1",
        onHandQuantity: new Prisma.Decimal(10),
        reservedQuantity: new Prisma.Decimal(0),
        revision: 2,
      }),
    }),
    commerceQuoteVersion: delegate("version", {}),
    serviceCommerceQuoteApprovalAuditEvent: delegate("approval-audit", {}),
  }
  return {
    state,
    reads,
    writes,
    tx: client as unknown as Prisma.TransactionClient,
    root: {
      $transaction: async (fn: (tx: Prisma.TransactionClient) => unknown) =>
        fn(client as unknown as Prisma.TransactionClient),
    } as unknown as PrismaClient,
  }
}

function target(row: ReturnType<typeof decision>) {
  return {
    ...scope,
    approvalId: row.id,
    quoteId: row.quoteId,
    quoteVersionId: row.quoteVersionId,
  }
}

test("current original detail uses the selected different approver with no writes", async () => {
  const row = decision()
  const f = fixture([row])
  const result = await getCommerceQuoteApprovalReadOnlyInTransaction(
    f.tx,
    target(row),
  )
  expect(result).toMatchObject({
    id: row.id,
    quoteId: row.quoteId,
    quoteVersionId: row.quoteVersionId,
    status: "pending",
    currentReview: { stale: false },
    actions: { canApprove: true, canReject: true },
  })
  expect(result.options[0]?.lines[0]?.offeringName).toBe("Inspection")
  row.requesterMembershipId = "checker"
  expect(
    (await getCommerceQuoteApprovalReadOnlyInTransaction(f.tx, target(row)))
      .actions.canApprove,
  ).toBe(false)
  expect(f.writes).toEqual([])
})

test("tracked quote availability reads an existing balance without upserting it", async () => {
  const row = decision()
  row.quoteVersion.options[0]!.lines[0]!.configurationVersionId = "config-1"
  row.quoteVersion.options[0]!.lines[0]!.balanceRevision = 2
  const f = fixture([row])
  f.state.product = true
  const result = await getCommerceQuoteApprovalReadOnlyInTransaction(
    f.tx,
    target(row),
  )
  expect(result.actions.canApprove).toBe(true)
  expect(f.reads.some((row) => row.table === "stock-balance")).toBe(true)
  expect(f.writes).toEqual([])
})

test("stale version keeps persisted pending status and cannot approve/reject/release", async () => {
  const row = decision()
  row.quote.currentVersionId = "later-version"
  const f = fixture([row])
  expect(
    await getCommerceQuoteApprovalReadOnlyInTransaction(f.tx, target(row)),
  ).toMatchObject({
    status: "pending",
    currentReview: {
      stale: true,
      reason:
        "Unavailable because the prepared Quote Version is no longer current.",
    },
    actions: { canApprove: false, canReject: false, canRelease: false },
  })
  expect(row.status).toBe("PENDING")
  expect(f.writes).toEqual([])
})

test("fresh actor/Store grants and exact original tuple refuse stale or foreign access", async () => {
  const row = decision()
  const f = fixture([row])
  for (const changed of [
    { quoteVersionId: "wrong-version" },
    { quoteId: "wrong-quote" },
    { storeId: "foreign-store" },
    { tenantId: "foreign-tenant" },
  ]) {
    await expect(
      getCommerceQuoteApprovalReadOnlyInTransaction(f.tx, {
        ...target(row),
        ...changed,
      }),
    ).rejects.toBeInstanceOf(Error)
  }
  f.state.assigned = false
  await expect(
    getCommerceQuoteApprovalReadOnlyInTransaction(f.tx, target(row)),
  ).rejects.toMatchObject({ code: "QUOTE_RELEASE_FORBIDDEN" })
  f.state.assigned = true
  f.state.scoped = true
  f.state.storeGranted = false
  await expect(
    getCommerceQuoteApprovalReadOnlyInTransaction(f.tx, target(row)),
  ).rejects.toMatchObject({ code: "QUOTE_RELEASE_FORBIDDEN" })
  f.state.storeGranted = true
  f.state.active = false
  await expect(
    getCommerceQuoteApprovalReadOnlyInTransaction(f.tx, target(row)),
  ).rejects.toMatchObject({ code: "FORBIDDEN" })
  expect(f.writes).toEqual([])
})

test("blocked policy and pharmacy do not expose commercial content or write audits", async () => {
  const row = decision()
  const f = fixture([row])
  f.state.policyAllowed = false
  await expect(
    getCommerceQuoteApprovalReadOnlyInTransaction(f.tx, target(row)),
  ).rejects.toMatchObject({ code: "POLICY_BLOCKED" })
  f.state.policyAllowed = true
  row.sourceType = "PRESCRIPTION_REQUEST"
  await expect(
    getCommerceQuoteApprovalReadOnlyInTransaction(f.tx, target(row)),
  ).rejects.toMatchObject({ code: "QUOTE_RELEASE_FORBIDDEN" })
  expect(f.writes).toEqual([])
})

test("bounded empty filtered page advances its scanned cursor without skipping the next service", async () => {
  const rows = Array.from({ length: 12 }, (_, i) =>
    decision(`decision-${String(i + 1).padStart(2, "0")}`),
  )
  for (const row of rows.slice(0, 10)) row.sourceType = "PRESCRIPTION_REQUEST"
  const f = fixture(rows)
  const first = await listPendingCommerceQuoteApprovalsReadOnlyInTransaction(
    f.tx,
    scope,
  )
  expect(first).toEqual({
    rows: [],
    scannedCount: 10,
    nextCursor: "decision-10",
  })
  const next = await listPendingCommerceQuoteApprovalsReadOnlyInTransaction(
    f.tx,
    { ...scope, cursor: first.nextCursor! },
  )
  expect(next.rows.map((row) => row.id)).toEqual(["decision-11", "decision-12"])
  expect(next.nextCursor).toBeNull()
  expect(
    f.reads
      .filter((row) => row.table === "approval" && "take" in row.input)
      .every((row) => row.input.take === 11),
  ).toBe(true)
  await expect(
    listPendingCommerceQuoteApprovalsReadOnlyInTransaction(f.tx, {
      ...scope,
      cursor: "foreign-cursor",
    }),
  ).rejects.toMatchObject({ code: "QUOTE_CONFLICT" })
  expect(f.writes).toEqual([])
})

test("native detail still audits and reconciles while retaining its original contract", async () => {
  const row = decision()
  row.quote.currentVersionId = "later-version"
  const f = fixture([row], true)
  const result = await getCommerceQuoteApprovalDetail(
    f.root,
    scopeWithApproval(row),
  )
  expect(result.status).toBe("superseded")
  expect(result).not.toHaveProperty("currentReview")
  expect(f.writes).toEqual([
    "policy-audit.createMany",
    "approval.updateMany",
    "version.updateMany",
    "approval-audit.create",
  ])
})

function scopeWithApproval(row: ReturnType<typeof decision>) {
  return { ...scope, approvalId: row.id }
}

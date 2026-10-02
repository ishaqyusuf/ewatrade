import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import { discoverReviewedCostSourcesInTransaction as discover } from "./reviewed-cost-discovery"
import { financePayloadHash } from "./rules"

const input = {
  tenantId: "tenant",
  actorUserId: "actor",
  bookId: "book",
  balanceSourceIds: ["balance"],
}
function fixture(
  references: Array<{ kind: string; id: string }>,
  priorValidity = true,
) {
  const queries: string[] = []
  const tx = {
    $queryRaw: async (strings: TemplateStringsArray) => {
      const sql = strings.join("")
      queries.push(sql)
      if (sql.includes('"FinanceBook"') || sql.includes('"Membership"'))
        return [{ id: "book" }]
      if (sql.includes("WITH RECURSIVE")) return references
      if (sql.includes('LEFT JOIN "FinanceInventoryCostReview"'))
        return references
          .filter((r) => r.kind === "REVIEW_HEADER" || r.kind === "REVIEW_POOL")
          .map((r) => ({ ...r, valid: priorValidity }))
      return references
        .filter(
          (r) => !["MOVEMENT", "REVIEW_HEADER", "REVIEW_POOL"].includes(r.kind),
        )
        .map((r) => ({ ...r, valid: true }))
    },
    membership: {
      findFirst: async () => ({
        tenant: {
          id: "tenant",
          currencyCode: "NGN",
          timezone: "Africa/Lagos",
          isActive: true,
        },
      }),
    },
    financeBook: {
      findUniqueOrThrow: async () => ({
        id: "book",
        tenantId: "tenant",
        currencyCode: "NGN",
        lastSequence: 5n,
      }),
    },
    stockBalanceSource: { findMany: async () => [{ id: "balance" }] },
  } as unknown as Prisma.TransactionClient
  return { tx, queries }
}
test("no-prior discovery retains original result shape/hash and adds no prior-only query", async () => {
  const { tx, queries } = fixture([{ kind: "BALANCE", id: "balance" }])
  const result = await discover(tx, input)
  const original = {
    tenantId: "tenant",
    bookId: "book",
    currencyCode: "NGN",
    bookSequence: 5n,
    rootBalanceSourceIds: ["balance"],
    balanceSourceIds: ["balance"],
    movementIds: [],
    operationIds: [],
    transferIds: [],
    orderLineIds: [],
    productReturnIds: [],
    reviewAllocationIds: [],
  }
  expect(result.sourceDiscoveryHash).toBe(financePayloadHash(original))
  expect(result).not.toHaveProperty("priorReviewIds")
  expect(result).not.toHaveProperty("priorReviewPoolSnapshotIds")
  expect(queries).toHaveLength(4)
  expect(
    queries.filter((q) => q.includes('LEFT JOIN "FinanceInventoryCostReview"')),
  ).toHaveLength(0)
})
test("pointer-only header/pool identities receive complete scope proof before physical locking", async () => {
  const { tx, queries } = fixture([
    { kind: "BALANCE", id: "balance" },
    { kind: "REVIEW_HEADER", id: "review" },
    { kind: "REVIEW_POOL", id: "snapshot" },
  ])
  const result = await discover(tx, input)
  expect(result.reviewAllocationIds).toEqual([])
  expect(result.priorReviewIds).toEqual(["review"])
  expect(result.priorReviewPoolSnapshotIds).toEqual(["snapshot"])
  expect(queries).toHaveLength(5)
  expect(
    queries.some(
      (q) => q.includes("FOR SHARE") && q.includes('"StockBalanceSource"'),
    ),
  ).toBe(false)
})
test("crossed header/pool scope cannot disappear behind scoped allocation joins", async () => {
  const { tx } = fixture(
    [
      { kind: "BALANCE", id: "balance" },
      { kind: "REVIEW_HEADER", id: "review" },
      { kind: "REVIEW_POOL", id: "snapshot" },
    ],
    false,
  )
  await expect(discover(tx, input)).rejects.toThrow("cross Tenant/Book")
})
test("allocation closure overflow is rejected before ownership hydration", async () => {
  const { tx, queries } = fixture([
    { kind: "BALANCE", id: "balance" },
    ...Array.from({ length: 4097 }, (_, i) => ({
      kind: "REVIEW_ALLOCATION",
      id: `a${i}`,
    })),
  ])
  await expect(discover(tx, input)).rejects.toThrow("bounds")
  expect(queries).toHaveLength(3)
})
test("header pool closure overflow is rejected before ownership hydration", async () => {
  const { tx, queries } = fixture([
    { kind: "BALANCE", id: "balance" },
    ...Array.from({ length: 4097 }, (_, i) => ({
      kind: "REVIEW_POOL",
      id: `p${i}`,
    })),
  ])
  await expect(discover(tx, input)).rejects.toThrow("bounds")
  expect(queries).toHaveLength(3)
})

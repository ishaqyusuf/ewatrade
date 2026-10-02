import { expect, test } from "bun:test"
import type { Prisma } from "../../../generated/prisma/client"
import {
  assertReviewedCostOriginalOwnersUnchanged,
  coordinateReviewedCostOriginalOwners,
} from "./reviewed-cost-owner-fence"

type Discovery = Parameters<typeof coordinateReviewedCostOriginalOwners>[1]
const discovery: Discovery = {
  tenantId: "tenant",
  bookId: "book",
  currencyCode: "NGN",
  bookSequence: 0n,
  rootBalanceSourceIds: ["balance"],
  balanceSourceIds: ["balance"],
  movementIds: ["movement"],
  operationIds: ["operation"],
  transferIds: [],
  orderLineIds: [],
  productReturnIds: [],
  reviewAllocationIds: [],
  sourceDiscoveryHash: "discovery",
  requiresOwningSourceProof: true,
  requiresMonetaryProof: true,
}
const original = () => [
  {
    id: "operation",
    facts: {
      id: "operation",
      tenantId: "tenant",
      reason: "original",
      payloadHash: "a".repeat(64),
    },
  },
]
function reader(rows: unknown[], count = { value: 0 }) {
  return {
    $queryRaw: async () => {
      count.value++
      return rows
    },
  } as unknown as Prisma.TransactionClient
}

test("complete original owner rows remain immutable across stock coordination", async () => {
  const before = await coordinateReviewedCostOriginalOwners(
    reader(original()),
    discovery,
  )
  await assertReviewedCostOriginalOwnersUnchanged(
    reader(original()),
    discovery,
    before,
  )
  expect(before).toEqual(original())
})
test("empty owner scope acquires no appended locks", async () => {
  const count = { value: 0 }
  const empty = { ...discovery, operationIds: [] }
  expect(
    await coordinateReviewedCostOriginalOwners(reader([], count), empty),
  ).toEqual([])
  await assertReviewedCostOriginalOwnersUnchanged(reader([], count), empty, [])
  expect(count.value).toBe(0)
})
test("rejects missing original rows before stock coordination", async () => {
  await expect(
    coordinateReviewedCostOriginalOwners(reader([]), discovery),
  ).rejects.toThrow("scope changed")
})
test("rejects duplicate operation scope before any query", async () => {
  const count = { value: 0 }
  await expect(
    coordinateReviewedCostOriginalOwners(reader([], count), {
      ...discovery,
      operationIds: ["operation", "operation"],
    }),
  ).rejects.toThrow("supported scope")
  expect(count.value).toBe(0)
})
test("rejects complete operation scope overflow before any query", async () => {
  const count = { value: 0 }
  await expect(
    coordinateReviewedCostOriginalOwners(reader([], count), {
      ...discovery,
      operationIds: Array.from({ length: 4097 }, (_, n) => `op-${n}`),
    }),
  ).rejects.toThrow("supported scope")
  expect(count.value).toBe(0)
})
test("rejects owning metadata drift despite unchanged physical quantities", async () => {
  const changed = original()
  const row = changed[0]
  if (!row) throw new Error("Missing fixture")
  row.facts.reason = "changed"
  await expect(
    assertReviewedCostOriginalOwnersUnchanged(
      reader(changed),
      discovery,
      original(),
    ),
  ).rejects.toThrow("facts changed")
})
test("rejects vanished or expanded original rows during revalidation", async () => {
  await expect(
    assertReviewedCostOriginalOwnersUnchanged(
      reader([]),
      discovery,
      original(),
    ),
  ).rejects.toThrow("facts changed")
  await expect(
    assertReviewedCostOriginalOwnersUnchanged(
      reader([...original(), { id: "other", facts: { id: "other" } }]),
      discovery,
      original(),
    ),
  ).rejects.toThrow("facts changed")
})

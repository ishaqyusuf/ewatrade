import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import {
  type CreateCommercialOrderInput,
  createCommercialOrderGraphInTransaction,
} from "./commercial-orders"

const legacyInput: CreateCommercialOrderInput = {
  actorUserId: "legacy-actor",
  clientOrderId: "legacy-blank-sale",
  lines: [{ custom: "quick_sale", amountMinor: 500 }],
  schemaVersion: 1,
  storeId: "legacy-store",
  tenantId: "legacy-tenant",
}

// Golden digest observed from the actual canonical command's crypto output.
// Its hashing code is unchanged by description validation. Keeping the literal
// here checks compatibility without copying the private hash implementation.
const legacyHash =
  "1f731939c6b0e40e0fef8f5376bd0c94abec96370277f11ddff20a8f0401d68d"

function storedLegacyOrder() {
  // Only the graph fields inspected by this test are needed: replay returns
  // the stored graph unchanged, before further resolution or provisioning.
  const order = {
    id: "legacy-order",
    clientOrderId: legacyInput.clientOrderId,
    payloadHash: legacyHash,
    lines: [{ snapshot: { customLineRole: "QUICK_SALE", note: null } }],
  }
  const reads: unknown[] = []
  const tx = new Proxy(
    {
      commercialOrder: {
        findUnique: async (query: unknown) => {
          reads.push(query)
          return order
        },
      },
    },
    {
      get(target, key, receiver) {
        if (key !== "commercialOrder")
          throw Error(`Legacy replay unexpectedly accessed ${String(key)}`)
        return Reflect.get(target, key, receiver)
      },
    },
  ) as unknown as Prisma.TransactionClient
  return { tx, order, reads }
}

test("canonical replay returns an existing blank Quick sale before new-write validation", async () => {
  const fixture = storedLegacyOrder()
  const before = JSON.stringify(legacyInput)
  const result = await createCommercialOrderGraphInTransaction(
    fixture.tx,
    legacyInput,
  )
  expect(result).toBe(fixture.order)
  expect(result.id).toBe("legacy-order")
  expect(result.payloadHash).toBe(legacyHash)
  expect(result.lines[0]?.snapshot?.note).toBeNull()
  expect(fixture.reads).toHaveLength(1)
  expect(fixture.reads[0]).toMatchObject({
    where: {
      tenantId_clientOrderId: {
        tenantId: "legacy-tenant",
        clientOrderId: "legacy-blank-sale",
      },
    },
  })
  expect(JSON.stringify(legacyInput)).toBe(before)
})

test("adding words to an existing blank-sale identity conflicts instead of rewriting the order", async () => {
  const fixture = storedLegacyOrder()
  const before = JSON.stringify(fixture.order)
  await expect(
    createCommercialOrderGraphInTransaction(fixture.tx, {
      ...legacyInput,
      lines: [{ custom: "quick_sale", amountMinor: 500, description: "Rice" }],
    }),
  ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" })
  expect(fixture.reads).toHaveLength(1)
  expect(JSON.stringify(fixture.order)).toBe(before)
})

import { expect, test } from "bun:test"
import type { Prisma } from "../../generated/prisma/client"
import { readCommercialServiceEvidence } from "./commercial-service-evidence"

const scope = { tenantId: "tenant", storeId: "store", orderLineId: "line" }
test("joined policy read preserves exact quantities and interprets database timestamps as UTC", async () => {
  const quantity = "9007199254740993.123456"
  const db = { $queryRaw: async (_parts: TemplateStringsArray, ...values: unknown[]) => {
    expect(values).toEqual(["line", "tenant", "store", "tenant"])
    return [{ evidence: { quantity,
      order: { completedAt: null, deliveryDueAt: "2026-10-11T12:30:00" },
      serviceAuthorization: { quantity, authorizedAt: "2026-10-11T11:30:00" },
    } }]
  } } as unknown as Prisma.TransactionClient
  const line = await readCommercialServiceEvidence(db, scope)
  expect(line?.quantity.toString()).toBe(quantity)
  expect(line?.serviceAuthorization?.quantity.toString()).toBe(quantity)
  expect(line?.order.deliveryDueAt?.toISOString()).toBe("2026-10-11T12:30:00.000Z")
  expect(line?.serviceAuthorization?.authorizedAt.toISOString()).toBe("2026-10-11T11:30:00.000Z")
})
test("missing scoped service evidence remains unavailable", async () => {
  const db = { $queryRaw: async () => [] } as unknown as Prisma.TransactionClient
  expect(await readCommercialServiceEvidence(db, scope)).toBeNull()
})

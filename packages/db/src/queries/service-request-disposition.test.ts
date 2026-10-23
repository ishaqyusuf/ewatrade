import { expect, test } from "bun:test"
import type { PrismaClient } from "../../generated/prisma/client"
import { updateServiceRequestDisposition } from "./service-public"

test("request disposition uses Store/revision/status compare-and-set", async () => {
  let write: unknown
  const db = {
    serviceRequest: {
      findFirst: async ({ where }: { where: unknown }) => {
        expect(where).toMatchObject({ storeId: "store", tenantId: "tenant" })
        return { id: "request", revision: 5, status: "SUBMITTED" }
      },
      updateMany: async (input: unknown) => {
        write = input
        return { count: 1 }
      },
    },
  } as unknown as PrismaClient
  await updateServiceRequestDisposition(db, {
    requestId: "request",
    storeId: "store",
    tenantId: "tenant",
    expectedRevision: 5,
    status: "needs_information",
    response: "Confirm the rooms.",
  })
  expect(write).toMatchObject({
    where: {
      id: "request",
      revision: 5,
      tenantId: "tenant",
      storeId: "store",
      status: { in: ["SUBMITTED", "NEEDS_INFORMATION"] },
    },
    data: { status: "NEEDS_INFORMATION", staffResponse: "Confirm the rooms." },
  })
})
test("stale or accepted requests cannot be overwritten by a batch", async () => {
  let status = "SUBMITTED"
  let writes = 0
  const db = {
    serviceRequest: {
      findFirst: async () => ({ id: "request", revision: 6, status }),
      updateMany: async () => {
        writes++
        return { count: 0 }
      },
    },
  } as unknown as PrismaClient
  const input = {
    requestId: "request",
    storeId: "store",
    tenantId: "tenant",
    expectedRevision: 5,
    status: "declined" as const,
    response: "Unavailable.",
  }
  await expect(updateServiceRequestDisposition(db, input)).rejects.toThrow(
    "changed",
  )
  status = "CONVERTED"
  await expect(updateServiceRequestDisposition(db, input)).rejects.toThrow(
    "no longer",
  )
  expect(writes).toBe(1)
})

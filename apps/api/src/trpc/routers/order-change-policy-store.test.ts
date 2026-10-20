import { describe, expect, test } from "bun:test"
import { type TRPCContext, createCallerFactory } from "../init"
import { ordersRouter } from "./orders"

function fixture() {
  const reads: string[] = []
  const policies: Record<string, { returnsMode: string; refundsMode: string }> =
    {
      "store-a": { returnsMode: "OPEN", refundsMode: "APPROVAL" },
      "store-b": { returnsMode: "OFF", refundsMode: "OFF" },
    }
  const db = {
    commercialOrderChangePolicy: {
      findUnique: async ({ where }: { where: { storeId: string } }) => {
        reads.push(where.storeId)
        const policy = policies[where.storeId]
        return policy
          ? {
              ...policy,
              tenantId: "tenant-a",
              updatedAt: null,
              updatedByUserId: null,
            }
          : null
      },
    },
  }
  const ctx = {
    db,
    requestId: "change-policy-store-test",
    session: {
      session: { id: "session", token: "test" },
      user: { id: "owner-a" },
    },
    tenantContext: {
      tenant: {
        id: "tenant-a",
        currencyCode: "NGN",
        retailOpsPlanId: "growth",
        qaPurgeStartedAt: null,
      },
      membership: { id: "membership", role: "OWNER" },
      activeStore: { id: "store-a", name: "Ikeja" },
      stores: [
        { id: "store-a", name: "Ikeja" },
        { id: "store-b", name: "Lekki" },
      ],
    },
  }
  return {
    caller: createCallerFactory(ordersRouter)(ctx as unknown as TRPCContext),
    reads,
  }
}

describe("returns and refunds policy per store", () => {
  test("reads the active store when no store is chosen", async () => {
    const f = fixture()
    const policy = await f.caller.changePolicy()
    expect(f.reads).toEqual(["store-a"])
    expect(policy).toMatchObject({
      storeId: "store-a",
      storeName: "Ikeja",
      returnsMode: "OPEN",
    })
  })

  test("reads another store of the same business", async () => {
    const f = fixture()
    const policy = await f.caller.changePolicy({ storeId: "store-b" })
    expect(f.reads).toEqual(["store-b"])
    expect(policy).toMatchObject({
      storeId: "store-b",
      storeName: "Lekki",
      returnsMode: "OFF",
    })
  })

  test("refuses a store outside the business", async () => {
    const f = fixture()
    await expect(
      f.caller.changePolicy({ storeId: "store-elsewhere" }),
    ).rejects.toThrow("Store not found for this business.")
    await expect(
      f.caller.updateChangePolicy({
        returnsMode: "OPEN",
        refundsMode: "OPEN",
        storeId: "store-elsewhere",
      }),
    ).rejects.toThrow("Store not found for this business.")
    expect(f.reads).toEqual([])
  })
})

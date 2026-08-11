import { describe, expect, test } from "bun:test"

import { createCallerFactory } from "../../init"
import { serviceCommerceChannelsRouter } from "./channels"

const createCaller = createCallerFactory(serviceCommerceChannelsRouter)

describe("Service Commerce channels router", () => {
  test("resolves quotation-release settings inside the authenticated Tenant and Store", async () => {
    const db = {
      membership: {
        findFirst: async () => ({ id: "membership_owner" }),
        findMany: async () => [],
      },
      serviceCommerceQuoteReleasePolicy: {
        findFirst: async () => null,
      },
      serviceCommerceStoreTeamAssignment: {
        findMany: async () => [],
      },
      store: {
        findFirst: async () => ({ id: "store_1" }),
      },
    }
    const caller = createCaller({
      db,
      session: { user: { id: "owner_1" } },
      tenantContext: {
        activeStore: { id: "store_1" },
        membership: { role: "OWNER" },
        stores: [{ id: "store_1" }],
        tenant: { id: "tenant_1" },
      },
    } as never)

    const result = await caller.quoteReleaseSettings({ storeId: "store_1" })

    expect(result).toMatchObject({
      approvers: [],
      policy: {
        mode: "attendant_can_release",
        persisted: false,
        revision: 0,
      },
      teamOptions: [],
    })
  })

  test("fails a stale direct approval lookup closed inside Store scope", async () => {
    const db = {
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(db),
      membership: {
        findFirst: async () => ({ id: "membership_approver" }),
      },
      serviceCommerceQuoteApproval: {
        findFirst: async () => null,
      },
      serviceCommerceQuoteReleasePolicy: {
        findFirst: async () => null,
      },
      serviceCommerceStoreTeamAssignment: {
        findMany: async () => [],
      },
    }
    const caller = createCaller({
      db,
      session: { user: { id: "approver_1" } },
      tenantContext: {
        activeStore: { id: "store_1" },
        membership: { role: "MANAGER" },
        stores: [{ id: "store_1" }],
        tenant: { id: "tenant_1" },
      },
    } as never)

    await expect(
      caller.quoteApprovalDetail({
        approvalId: "stale_approval",
        storeId: "store_1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" })
  })
})

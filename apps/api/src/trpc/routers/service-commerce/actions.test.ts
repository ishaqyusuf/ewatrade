import { describe, expect, test } from "bun:test"

import { createCallerFactory } from "../../init"
import { serviceCommerceActionsRouter } from "./actions"

const createCaller = createCallerFactory(serviceCommerceActionsRouter)

describe("Service Commerce customer actions router", () => {
  test("collapses an unknown public capability to safe recovery", async () => {
    const client = createCaller({
      db: {
        $transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            serviceCommerceCustomerActionCapability: {
              findFirst: async () => null,
            },
          }),
      },
      session: null,
      tenantContext: null,
    } as never)
    await expect(
      client.customerAction({ capabilityToken: "x".repeat(20) }),
    ).resolves.toEqual({
      available: false,
      recovery: "talk_to_staff",
      supportToken: null,
    })
  })
})

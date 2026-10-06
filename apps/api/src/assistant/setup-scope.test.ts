import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { TRPCError } from "@trpc/server"
import { assertSetupConversationCurrent } from "../trpc/routers/setup-assistant"
import { requireSetupAssistantScope } from "./setup-context"

const previousFlag = process.env.ASSISTANT_SETUP_ENABLED
beforeEach(() => {
  process.env.ASSISTANT_SETUP_ENABLED = "true"
})
afterEach(() => {
  process.env.ASSISTANT_SETUP_ENABLED = previousFlag
})

function ctx(role: string, store: { id: string } | null = { id: "store_a" }) {
  return {
    session: { user: { id: "user_1" } },
    tenantContext: {
      membership: { role },
      activeStore: store,
      tenant: { id: "tenant_1", dataClassification: "QA" },
    },
  } as never
}

function code(run: () => unknown) {
  try {
    run()
  } catch (error) {
    return error instanceof TRPCError ? error.code : "OTHER"
  }
  return "OK"
}

describe("setup scope is re-checked on every request", () => {
  test("only owners and admins of the active Store may write", () => {
    expect(code(() => requireSetupAssistantScope(ctx("OWNER")))).toBe("OK")
    expect(code(() => requireSetupAssistantScope(ctx("ADMIN")))).toBe("OK")
    // A role lowered between two add batches refuses the next batch.
    expect(code(() => requireSetupAssistantScope(ctx("STAFF")))).toBe(
      "FORBIDDEN",
    )
    expect(code(() => requireSetupAssistantScope(ctx("OWNER", null)))).toBe(
      "PRECONDITION_FAILED",
    )
  })

  test("the scope follows the active Store and the flag", () => {
    expect(requireSetupAssistantScope(ctx("OWNER"))).toMatchObject({
      tenantId: "tenant_1",
      storeId: "store_a",
      userId: "user_1",
    })
    process.env.ASSISTANT_SETUP_ENABLED = "false"
    expect(code(() => requireSetupAssistantScope(ctx("OWNER")))).toBe(
      "NOT_FOUND",
    )
  })

  test("a Store switch mid-add refuses instead of using the other Store's list", () => {
    // The add loop names the conversation it started with; after a switch the
    // active Store resolves to a different setup.
    expect(
      code(() =>
        assertSetupConversationCurrent({ id: "conv_store_b" }, "conv_store_a"),
      ),
    ).toBe("CONFLICT")
    expect(
      code(() =>
        assertSetupConversationCurrent({ id: "conv_store_a" }, "conv_store_a"),
      ),
    ).toBe("OK")
    // No setup in the new Store falls through to the usual "start first".
    expect(
      code(() => assertSetupConversationCurrent(null, "conv_store_a")),
    ).toBe("OK")
  })
})

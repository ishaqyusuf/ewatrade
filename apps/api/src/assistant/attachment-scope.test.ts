import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { TRPCError } from "@trpc/server"
import { requireAssistantAttachmentScope } from "./attachment-scope"

const previousKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
beforeEach(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "k".repeat(32)
})
afterEach(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previousKey
})

function ctx(role: string) {
  return {
    requestHeaders: new Headers(),
    session: { user: { id: "user_1", email: "user@example.com" } },
    tenantContext: {
      membership: { role },
      activeStore: { id: "store_a" },
      staffAccess: { status: "ACTIVE", mode: "ALL" },
      tenant: { id: "tenant_1", name: "Shop", dataClassification: "QA" },
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

describe("assistant voice and file uploads", () => {
  test("owners and admins may upload into setup, product and general chats", () => {
    expect(requireAssistantAttachmentScope(ctx("OWNER")).purposes).toEqual([
      "SETUP",
      "PRODUCT_CREATE",
      "GENERAL",
    ])
  })

  test("other assistant roles may only record voice in their general chats", () => {
    const scope = requireAssistantAttachmentScope(ctx("CASHIER"))
    expect(scope.purposes).toEqual(["GENERAL"])
    expect(scope).toMatchObject({
      tenantId: "tenant_1",
      storeId: "store_a",
      userId: "user_1",
    })
  })

  test("without the business chat the setup refusal is reported", () => {
    Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
    expect(code(() => requireAssistantAttachmentScope(ctx("CASHIER")))).toBe(
      "FORBIDDEN",
    )
  })
})

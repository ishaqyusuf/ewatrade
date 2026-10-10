import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { TRPCError } from "@trpc/server"
import { requireAssistantAttachmentScope } from "./attachment-scope"

const keys = [
  "ASSISTANT_SETUP_ENABLED",
  "ASSISTANT_GENERAL_ENABLED",
  "ASSISTANT_APPROVAL_SIGNING_KEY",
] as const
const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))
beforeEach(() => {
  process.env.ASSISTANT_SETUP_ENABLED = "true"
  process.env.ASSISTANT_GENERAL_ENABLED = "true"
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "k".repeat(32)
})
afterEach(() => {
  for (const key of keys) process.env[key] = previous[key]
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

  test("general-only roles fall back when the setup assistant is off", () => {
    process.env.ASSISTANT_SETUP_ENABLED = "false"
    expect(requireAssistantAttachmentScope(ctx("OWNER")).purposes).toEqual([
      "GENERAL",
    ])
  })

  test("without either assistant the setup refusal is reported", () => {
    process.env.ASSISTANT_GENERAL_ENABLED = "false"
    expect(code(() => requireAssistantAttachmentScope(ctx("CASHIER")))).toBe(
      "FORBIDDEN",
    )
  })
})

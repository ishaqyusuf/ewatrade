import { afterEach, beforeEach, expect, spyOn, test } from "bun:test"
import { TRPCError } from "@trpc/server"
import * as tenantContext from "../trpc/init"
import { readAssistantResponseLink } from "./response-link"

const previousKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
const restores: Array<{ mockRestore(): void }> = []
beforeEach(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = "k".repeat(32)
})
afterEach(() => {
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = previousKey
  for (const spy of restores.splice(0)) spy.mockRestore()
})
function context(storeId = "original-store") {
  return {
    session: { user: { id: "actor" }, session: { id: "session" } },
    tenantContext: {
      tenant: {
        id: "business",
        name: "Shop",
        slug: "shop",
        currencyCode: "NGN",
        dataClassification: "LIVE",
      },
      membership: { id: "member", role: "OWNER" },
      activeStore: { id: storeId, name: "Main", currencyCode: "NGN" },
      staffAccess: {
        businessRole: "OWNER",
        mode: "LEGACY",
        status: "ACTIVE",
        assignments: [],
        catalogEditor: false,
      },
    },
    db: {
      assistantMessage: {
        findFirst: async () => ({
          id: "message",
          conversation: {
            id: "chat",
            tenantId: "business",
            storeId: "original-store",
            tenant: { slug: "shop" },
          },
        }),
      },
    },
  } as unknown as Awaited<
    ReturnType<typeof tenantContext.resolveProtectedTenantContext>
  >
}
test("resolve original authorized scope afresh, return navigation metadata only and never change selection", async () => {
  const ctx = context()
  const read = spyOn(ctx.db.assistantMessage, "findFirst")
  const resolve = spyOn(
    tenantContext,
    "resolveProtectedTenantContext",
  ).mockResolvedValue(ctx)
  restores.push(read, resolve)
  const result = await readAssistantResponseLink(ctx, "message")
  expect(result).toMatchObject({
    status: "ready",
    messageId: "message",
    conversationId: "chat",
  })
  expect(resolve.mock.calls[0]?.[0]).toMatchObject({
    tenantContext: null,
    tenantId: null,
    activeStoreId: "original-store",
    tenantSlug: "shop",
  })
  expect(read.mock.calls[0]?.[0]).toMatchObject({
    where: {
      id: "message",
      role: "assistant",
      conversation: {
        ownerUserId: "actor",
        purpose: "GENERAL",
        status: "ACTIVE",
      },
    },
  })
  expect(JSON.stringify(read.mock.calls[0]?.[0]?.select)).not.toContain("parts")
  expect(result).not.toHaveProperty("parts")
  expect(ctx.tenantContext.activeStore?.id).toBe("original-store")
})
test("mismatched Store requires explicit selection; no source content is returned", async () => {
  const resolve = spyOn(
    tenantContext,
    "resolveProtectedTenantContext",
  ).mockResolvedValue(context())
  restores.push(resolve)
  const ctx = context("different-store")
  expect(await readAssistantResponseLink(ctx, "message")).toMatchObject({
    status: "scope_mismatch",
    storeId: "original-store",
  })
  expect(ctx.tenantContext.activeStore?.id).toBe("different-store")
})
test("changed access and source disappearance have the same private unavailable result", async () => {
  const resolve = spyOn(
    tenantContext,
    "resolveProtectedTenantContext",
  ).mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }))
  restores.push(resolve)
  expect(await readAssistantResponseLink(context(), "message")).toEqual({
    status: "unavailable",
  })
  resolve.mockResolvedValue(context())
  const revoked = context()
  if (revoked.tenantContext.staffAccess)
    revoked.tenantContext.staffAccess.status = "REMOVED" as never
  resolve.mockResolvedValue(revoked)
  expect(await readAssistantResponseLink(context(), "message")).toEqual({
    status: "unavailable",
  })
  const missing = context()
  restores.push(
    spyOn(missing.db.assistantMessage, "findFirst").mockResolvedValue(null),
  )
  expect(await readAssistantResponseLink(missing, "message")).toEqual({
    status: "unavailable",
  })
})
test("anonymous identity cannot read response metadata", async () => {
  const ctx = context()
  ctx.session = null as never
  await expect(readAssistantResponseLink(ctx, "message")).rejects.toThrow()
})

test("operational failures remain retryable rather than claiming access was removed", async () => {
  const resolve = spyOn(
    tenantContext,
    "resolveProtectedTenantContext",
  ).mockRejectedValue(new TRPCError({ code: "INTERNAL_SERVER_ERROR" }))
  restores.push(resolve)
  await expect(
    readAssistantResponseLink(context(), "message"),
  ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" })
})

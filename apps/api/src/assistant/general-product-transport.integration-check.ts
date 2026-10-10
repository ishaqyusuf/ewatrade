import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { startGeneralConversation } from "@ewatrade/db/assistant-general"
import { createSimpleCatalogItem } from "@ewatrade/db/queries"
import { OpenAPIHono } from "@hono/zod-openapi"
import { resolveModel } from "./chat-route"
import { registerGeneralAssistantChatRoutes } from "./general-chat-route"
import type { GeneralContext } from "./general-context"

/** Focused real HTTP+tool loop inside the isolated fixture; no browser or provider. */
export async function verifyGeneralProductTransport(
  ctx: GeneralContext,
  token: string,
) {
  const { db, tenantId, activeStoreId: storeId, tenantSlug } = ctx
  if (!tenantId || !storeId || !tenantSlug) throw Error("Fixture scope missing")
  if (!(await resolveModel(db, "QA", "GENERAL"))?.rehearsal)
    throw Error("Rehearsal required")
  const item = await createSimpleCatalogItem(db, {
    tenantId,
    storeId,
    actorUserId: ctx.session.user.id,
    clientOperationId: randomUUID(),
    kind: "product",
    name: "Transport product",
    canonicalUnitName: "Piece",
    priceMinor: 10000,
  })
  const offering = await db.sellableOffering.findFirstOrThrow({
    where: { catalogItemId: item.id },
  })
  const conversation = await startGeneralConversation(db, {
    tenantId,
    storeId,
    userId: ctx.session.user.id,
  })
  const app =
    process.env.RUN_GENERAL_PRODUCT_FULL_APP === "1"
      ? (await import("../index")).app
      : new OpenAPIHono()
  if (process.env.RUN_GENERAL_PRODUCT_FULL_APP !== "1")
    registerGeneralAssistantChatRoutes(app)
  const server =
    process.env.RUN_GENERAL_PRODUCT_HTTP_SERVER === "1"
      ? Bun.serve({
          hostname: "127.0.0.1",
          port: 0,
          fetch: app.fetch,
          idleTimeout: 60,
        })
      : null
  try {
    for (const text of [
      `update product ${item.id} name Transport edited`,
      `update offering ${offering.id} sku TRANSPORT-SKU`,
    ]) {
      const requestId = randomUUID()
      const request = new Request(
        server
          ? new URL("/api/assistant/general/chat", server.url)
          : "http://test.local/api/assistant/general/chat",
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${token}`,
            "x-tenant-slug": tenantSlug,
            "x-store-id": storeId,
            "x-assistant-client": "dashboard",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            conversationId: conversation.id,
            requestId,
            message: {
              id: randomUUID(),
              role: "user",
              parts: [{ type: "text", text }],
            },
          }),
        },
      )
      const response = server
        ? await fetch(request)
        : await app.request(request)
      expect(response.status).toBe(200)
      const stream = await response.text()
      expect(stream).toContain("data-general-proposal")
      expect(stream).toContain('"type":"text-delta"')
      expect(
        (
          await db.assistantRun.findUniqueOrThrow({
            where: {
              actorUserId_requestId: {
                actorUserId: ctx.session.user.id,
                requestId,
              },
            },
          })
        ).status,
      ).toBe("COMPLETED")
    }
    expect(
      await db.assistantActionProposal.count({
        where: { conversationId: conversation.id, status: "PENDING" },
      }),
    ).toBe(2)
    expect(
      (await db.catalogItem.findUniqueOrThrow({ where: { id: item.id } })).name,
    ).toBe("Transport product")
  } finally {
    server?.stop(true)
  }
}

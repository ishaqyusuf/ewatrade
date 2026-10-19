import { expect, test } from "bun:test"
import { workflowConversationAppLink } from "@ewatrade/assistant/channels/workflow"
import { createLoader } from "nuqs/server"
import { selectedWhatsAppChatRoute } from "../../../mobile/src/components/mobile/assistant-whatsapp/selected-chat-route"
import { catalogItemParamParsers } from "./use-catalog-item-params"

const scope = { tenantId: "business", storeId: "original-store" }
const selection = {
  purpose: "PRODUCT_CREATE" as const,
  conversationId: "exact-saved-product-chat",
  tenantId: scope.tenantId,
  storeId: scope.storeId,
}
const origin = "https://dashboard.example.test"
const loadActualCatalogSheetParams = createLoader(catalogItemParamParsers)

test("WhatsApp shared and native Product producers open the canonical catalog sheet with the exact saved conversation consumed by its form", () => {
  const shared = workflowConversationAppLink(
    { ...selection, origin: scope },
    { trustedAppOrigin: origin, currentScope: scope },
  )
  const native = selectedWhatsAppChatRoute(selection, scope, origin)
  if (!shared || native?.kind !== "web")
    throw Error("Expected both existing Product handoff producers")
  for (const href of [shared, native.href]) {
    const url = new URL(href)
    // /products is a redirect-only alias that discards query; /catalog owns the sheet.
    expect(url.pathname).toBe("/catalog")
    const actual = loadActualCatalogSheetParams(url)
    // These actual parsers feed CatalogItemSheet's open/kind and CatalogItemForm's
    // chat mode + productAssistant.state exact conversation input. No new chat identity.
    expect(actual.catalogItem).toBe("create")
    expect(actual.catalogCreateKind).toBe("product")
    expect(actual.catalogCreateMode).toBe("chat")
    expect(actual.catalogConversation).toBe(selection.conversationId)
    expect(actual.catalogCreateName).toBeNull()
    expect(actual.catalogCreatePrice).toBeNull()
    expect(url.searchParams.has("approvalToken")).toBe(false)
  }
})

test("wrong original scope never produces a substitute Product form or chat", () => {
  for (const currentScope of [
    { ...scope, tenantId: "other-business" },
    { ...scope, storeId: "other-store" },
  ]) {
    expect(
      workflowConversationAppLink(
        { ...selection, origin: scope },
        { trustedAppOrigin: origin, currentScope },
      ),
    ).toBeUndefined()
    expect(
      selectedWhatsAppChatRoute(selection, currentScope, origin),
    ).toBeNull()
  }
})

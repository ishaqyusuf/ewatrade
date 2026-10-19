import { workflowConversationAppLink } from "@ewatrade/assistant/channels/workflow"
import { assistantRouteConversation } from "../assistant/assistant-route-conversation"

type Selection = {
  conversationId: string
  tenantId: string
  storeId: string
  purpose: "GENERAL" | "SETUP" | "PRODUCT_CREATE"
}

/** Exact navigation only; it cannot select a scope or grant conversation authority. */
export function selectedWhatsAppChatRoute(
  selection: Selection,
  currentScope: { tenantId: string; storeId: string } | null,
  trustedDashboardOrigin?: string,
):
  | {
      kind: "native"
      pathname: "/ask-assistant" | "/setup-assistant"
      conversationId: string
    }
  | { kind: "web"; href: string }
  | null {
  const requested = assistantRouteConversation(selection.conversationId)
  if (
    requested.kind !== "saved" ||
    !currentScope ||
    selection.tenantId !== currentScope.tenantId ||
    selection.storeId !== currentScope.storeId
  )
    return null
  if (selection.purpose === "GENERAL" || selection.purpose === "SETUP")
    return {
      kind: "native",
      pathname:
        selection.purpose === "GENERAL" ? "/ask-assistant" : "/setup-assistant",
      conversationId: requested.conversationId,
    }
  if (selection.purpose !== "PRODUCT_CREATE" || !trustedDashboardOrigin)
    return null
  const href = workflowConversationAppLink(
    {
      conversationId: requested.conversationId,
      purpose: "PRODUCT_CREATE",
      origin: { tenantId: selection.tenantId, storeId: selection.storeId },
    },
    { currentScope, trustedAppOrigin: trustedDashboardOrigin },
  )
  return href ? { kind: "web", href } : null
}

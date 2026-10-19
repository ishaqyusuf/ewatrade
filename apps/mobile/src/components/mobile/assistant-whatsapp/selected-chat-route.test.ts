import { expect, test } from "bun:test"
import { selectedWhatsAppChatRoute } from "./selected-chat-route"

const selection = {
  conversationId: "original-chat",
  tenantId: "business",
  storeId: "store",
  purpose: "SETUP" as const,
}
const scope = { tenantId: "business", storeId: "store" }
test("selected Setup opens its exact native chat and Product uses its exact configured authenticated web route", () => {
  expect(selectedWhatsAppChatRoute(selection, scope)).toEqual({
    kind: "native",
    pathname: "/setup-assistant",
    conversationId: "original-chat",
  })
  const product = selectedWhatsAppChatRoute(
    { ...selection, purpose: "PRODUCT_CREATE" },
    scope,
    "https://preview.example.test",
  )
  expect(product?.kind).toBe("web")
  if (product?.kind !== "web")
    throw Error("Expected exact Product web continuation")
  const url = new URL(product.href)
  expect(url.origin).toBe("https://preview.example.test")
  expect(url.pathname).toBe("/catalog")
  expect(url.searchParams.get("catalogConversation")).toBe("original-chat")
  expect(url.searchParams.get("catalogCreateMode")).toBe("chat")
  expect(url.searchParams.get("catalogCreateKind")).toBe("product")
})
test("wrong scope, malformed identity and unsafe/missing Product configuration never open a substitute", () => {
  expect(
    selectedWhatsAppChatRoute(selection, { ...scope, storeId: "other" }),
  ).toBeNull()
  expect(
    selectedWhatsAppChatRoute(selection, { ...scope, tenantId: "other" }),
  ).toBeNull()
  expect(
    selectedWhatsAppChatRoute(
      { ...selection, conversationId: "../bad" },
      scope,
    ),
  ).toBeNull()
  for (const origin of [
    undefined,
    "http://local.example",
    "https://user:secret@example.test",
    "https://example.test/path",
    "https://example.test?token=secret",
  ]) {
    expect(
      selectedWhatsAppChatRoute(
        { ...selection, purpose: "PRODUCT_CREATE" },
        scope,
        origin,
      ),
    ).toBeNull()
  }
})

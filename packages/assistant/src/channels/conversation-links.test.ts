import { expect, test } from "bun:test"
import {
  type GeneralConversationTarget,
  conversationAppLink,
  generalConversationTargetSchema,
  trustedAssistantAppOrigin,
} from "./conversation-links"

const scope = { tenantId: "business-one", storeId: "store-one" }
const target = {
  conversationId: "wa-chat_saved-one",
  purpose: "GENERAL",
  origin: scope,
} satisfies GeneralConversationTarget
const options = {
  trustedAppOrigin: "https://dash.ewatrade.com",
  currentScope: scope,
}

test("saved GENERAL navigation uses the exact existing route without selecting scope", () => {
  expect(conversationAppLink(target, options)).toEqual({
    href: "https://dash.ewatrade.com/assistant/c/wa-chat_saved-one",
    label: "Open saved chat in EwaTrade",
  })
  expect(
    conversationAppLink(target, {
      ...options,
      trustedAppOrigin: "https://dash.ewatrade.com/",
    }),
  ).toEqual(conversationAppLink(target, options))
  const encoded = conversationAppLink(
    { ...target, conversationId: "chat/a?next=other#section%2e" },
    options,
  )
  expect(encoded?.href).toBe(
    "https://dash.ewatrade.com/assistant/c/chat%2Fa%3Fnext%3Dother%23section%252e",
  )
  expect(new URL(encoded?.href ?? "https://invalid.example").search).toBe("")
  expect(new URL(encoded?.href ?? "https://invalid.example").hash).toBe("")
  expect(options.currentScope).toEqual(scope)
})

test("foreign/missing current scope and unsupported workflow routes produce no link", () => {
  for (const currentScope of [
    { tenantId: "other", storeId: scope.storeId },
    { tenantId: scope.tenantId, storeId: "other" },
    { tenantId: scope.tenantId, storeId: "" },
  ])
    expect(
      conversationAppLink(target, { ...options, currentScope }),
    ).toBeUndefined()
  for (const purpose of ["SETUP", "PRODUCT_CREATE", "GENERAL?next=other"])
    expect(conversationAppLink({ ...target, purpose }, options)).toBeUndefined()
})

test("only an explicitly trusted canonical HTTPS origin can generate a link", () => {
  for (const trustedAppOrigin of [
    "",
    "http://dash.ewatrade.com",
    "//dash.ewatrade.com",
    "javascript:alert(1)",
    "https://user:password@dash.ewatrade.com",
    "https://dash.ewatrade.com/assistant",
    "https://dash.ewatrade.com?token=secret",
    "https://dash.ewatrade.com#secret",
    " https://dash.ewatrade.com",
    "https://dash.ewatrade.com\n",
    "https://dash.ewatrade.com\\@evil.example",
    "https://dash.ewatrade.com/%2e%2e/",
  ]) {
    expect(trustedAssistantAppOrigin(trustedAppOrigin)).toBeUndefined()
    expect(
      conversationAppLink(target, { ...options, trustedAppOrigin }),
    ).toBeUndefined()
  }
})

test("navigation metadata rejects authority, URLs, credentials and malformed identities", () => {
  for (const invalid of [
    { ...target, actorUserId: "someone" },
    { ...target, grantId: "grant" },
    { ...target, approvalToken: "secret" },
    { ...target, url: "https://evil.example" },
    { ...target, origin: { ...scope, userId: "someone" } },
    { ...target, conversationId: "" },
    { ...target, conversationId: "x".repeat(129) },
    { ...target, conversationId: "." },
    { ...target, conversationId: ".." },
    { ...target, conversationId: "chat\u0000id" },
    { ...target, conversationId: "chat\nid" },
  ]) {
    expect(generalConversationTargetSchema.safeParse(invalid).success).toBe(
      false,
    )
    expect(conversationAppLink(invalid, options)).toBeUndefined()
  }
})

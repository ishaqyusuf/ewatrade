import { expect, test } from "bun:test"
import {
  isWhatsAppVerificationCode,
  maskWhatsAppSender,
  parseWhatsAppLinkMessage,
  whatsAppChatPageSchema,
  whatsAppConnectUrl,
  whatsAppScopeSelectionSchema,
} from "./whatsapp"

test("link commands are purpose-bound and cannot be confused with OTP proof", () => {
  const code = `${"aB_9-".repeat(8)}abc`
  expect(parseWhatsAppLinkMessage(`Connect to EwaTrade: ${code}`)).toBe(code)
  for (const text of [
    "123456",
    code,
    `Connect to Midday: ${code}`,
    `Connect to EwaTrade: ${code} extra`,
  ])
    expect(parseWhatsAppLinkMessage(text)).toBeNull()
  expect(isWhatsAppVerificationCode(" 123456 ")).toBe(true)
  expect(isWhatsAppVerificationCode("Sold 123456 units")).toBe(false)
  expect(whatsAppConnectUrl("2348000000000", code)).toBe(
    `https://wa.me/2348000000000?text=${encodeURIComponent(`Connect to EwaTrade: ${code}`)}`,
  )
  expect(() => whatsAppConnectUrl("+2348000000000", code)).toThrow()
  expect(() => whatsAppConnectUrl("2348000000000", "123456")).toThrow()
  expect(maskWhatsAppSender("2348000000000")).toBe("+•••••••••0000")
})

test("personal scope inputs reject forged authority and unsupported new workflow creation", () => {
  const base = {
    identityId: "identity",
    grantId: "grant",
    storeId: "store",
    requestId: "cd9c3990-94b8-4bd9-af5f-75bb429e8f56",
    expectedIdentityGeneration: 1,
    expectedGrantGeneration: 1,
    expectedSelectionGeneration: 1,
    action: { kind: "new" },
  }
  expect(whatsAppScopeSelectionSchema.safeParse(base).success).toBe(true)
  for (const value of [
    { ...base, userId: "someone-else" },
    { ...base, phoneNumberId: "guessed" },
    { ...base, requestId: "not-a-uuid" },
    { ...base, expectedSelectionGeneration: 0 },
    { ...base, action: { kind: "new", purpose: "SETUP" } },
    { ...base, action: { kind: "resume", conversationId: "chat" } },
    {
      ...base,
      action: { kind: "resume", conversationId: "chat", purpose: "FINANCE" },
    },
  ])
    expect(whatsAppScopeSelectionSchema.safeParse(value).success).toBe(false)
  expect(
    whatsAppScopeSelectionSchema.safeParse({
      ...base,
      action: { kind: "resume", conversationId: "chat", purpose: "SETUP" },
    }).success,
  ).toBe(true)
  expect(
    whatsAppChatPageSchema.safeParse({
      identityId: "i",
      grantId: "g",
      storeId: "s",
      cursor: "x".repeat(129),
    }).success,
  ).toBe(false)
})

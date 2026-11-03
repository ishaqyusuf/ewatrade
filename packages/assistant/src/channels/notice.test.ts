import { expect, test } from "bun:test"
import { renderWhatsAppNotice, whatsAppMediaRefusalNotice } from "./notice"

test("transport notices link the exact original saved workflow and never infer a different scope", () => {
  const scope = {
    businessName: "Original business",
    storeName: "Main",
    tenantId: "tenant",
    storeId: "store",
    conversationId: "chat-original",
  }
  for (const purpose of ["GENERAL", "SETUP", "PRODUCT_CREATE"] as const) {
    const rendered = renderWhatsAppNotice(
      "WORKFLOW_NOT_READY",
      { ...scope, purpose },
      "https://dashboard.example.test",
    )
    expect(rendered).toContain("Original business · Main")
    expect(rendered).not.toContain("undefined")
    expect(rendered).toContain(
      purpose === "GENERAL"
        ? "/assistant/c/chat-original"
        : purpose === "SETUP"
          ? "setupConversation=chat-original"
          : "catalogConversation=chat-original",
    )
    expect(rendered).toContain("Select this original business and Store")
  }
  expect(
    renderWhatsAppNotice(
      "MEDIA_FAILED",
      { ...scope, purpose: "GENERAL" },
      "https://untrusted.example/path",
    ),
  ).not.toContain("https://")
})

test("unsupported media keeps explicit app/Import guidance and only fixed safe failure classifications", () => {
  expect(whatsAppMediaRefusalNotice("UNSUPPORTED_MEDIA")).toBe(
    "MEDIA_UNSUPPORTED",
  )
  expect(whatsAppMediaRefusalNotice("MEDIA_NOT_AVAILABLE")).toBe(
    "MEDIA_UNSUPPORTED",
  )
  expect(whatsAppMediaRefusalNotice("MEDIA_DISABLED")).toBe("MEDIA_DISABLED")
  expect(whatsAppMediaRefusalNotice("private-provider-url-and-error")).toBe(
    "MEDIA_FAILED",
  )
  const body = renderWhatsAppNotice(
    "MEDIA_UNSUPPORTED",
    {
      businessName: "Original business",
      storeName: "Main",
      tenantId: "tenant",
      storeId: "store",
      conversationId: "original",
      purpose: "GENERAL",
    },
    "https://dashboard.example.test",
  )
  expect(body).toContain("not supported in WhatsApp")
  expect(body).toContain("Import for a larger list")
  expect(body).toContain("/assistant/c/original")
  expect(body).not.toContain("private-provider")
})

test("quota and failed unsent media notices preserve exact chat guidance without promising a retained upload retry", () => {
  const scope = {
    businessName: "Business",
    storeName: "Store",
    tenantId: "tenant",
    storeId: "store",
    conversationId: "chat",
    purpose: "GENERAL" as const,
  }
  const failed = renderWhatsAppNotice(
    "MEDIA_FAILED",
    scope,
    "https://dashboard.example.test",
  )
  expect(failed).toContain("attach the original file again")
  expect(failed).not.toContain("review or retry it")
  const quota = renderWhatsAppNotice(
    "TRANSPORT_RATE_LIMITED",
    scope,
    "https://dashboard.example.test",
  )
  expect(quota).toContain("message limit")
  expect(quota).toContain("No new assistant request or action was started")
  expect(quota).toContain("/assistant/c/chat")
})

test("too-large files and failed or paused voice notes get their own notices", () => {
  expect(whatsAppMediaRefusalNotice("MEDIA_TOO_LARGE")).toBe("MEDIA_TOO_LARGE")
  expect(whatsAppMediaRefusalNotice("INVALID_AUDIO")).toBe("VOICE_FAILED")
  expect(whatsAppMediaRefusalNotice("TRANSCRIPTION_FAILED")).toBe(
    "VOICE_FAILED",
  )
  expect(whatsAppMediaRefusalNotice("VOICE_UNAVAILABLE")).toBe(
    "VOICE_UNAVAILABLE",
  )
  const scope = {
    businessName: "Original business",
    storeName: "Main",
    tenantId: "tenant",
    storeId: "store",
    conversationId: "original",
    purpose: "GENERAL" as const,
  }
  const large = renderWhatsAppNotice(
    "MEDIA_TOO_LARGE",
    scope,
    "https://dashboard.example.test",
  )
  expect(large).toContain("too large for WhatsApp")
  expect(large).toContain("Nothing was saved.")
  expect(large).toContain("/assistant/c/original")
  for (const code of ["VOICE_FAILED", "VOICE_UNAVAILABLE"] as const) {
    const voice = renderWhatsAppNotice(
      code,
      scope,
      "https://dashboard.example.test",
    )
    expect(voice).toContain("Nothing was done.")
    expect(voice).toContain("Type")
    expect(voice).not.toContain("https://")
  }
})

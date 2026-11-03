import { expect, test } from "bun:test"
import {
  renderWhatsAppImportHandoff,
  renderWhatsAppNotice,
  whatsAppMediaRefusalNotice,
  whatsAppNoticeCodeSchema,
  whatsAppTurnFailureNotice,
} from "./notice"

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

test("terminal assistant failures get one plain outage notice; other outcomes keep their own handling", () => {
  for (const code of [
    "ATTEMPTS_EXHAUSTED",
    "TURN_FAILED",
    "TURN_INTERRUPTED",
    "STREAM_FAILED",
    "FINALIZATION_FAILED",
  ])
    expect(whatsAppTurnFailureNotice(code)).toBe("ASSISTANT_UNAVAILABLE")
  for (const code of [
    undefined,
    null,
    "",
    "RETRY_PENDING",
    "AUTHORITY_CHANGED",
    "BUDGET_EXHAUSTED",
    "WORKFLOW_NOT_READY",
    "BAD_REQUEST",
    "NOT_FOUND",
    "private-provider-error",
  ])
    expect(whatsAppTurnFailureNotice(code)).toBeUndefined()
  const body = renderWhatsAppNotice(
    "ASSISTANT_UNAVAILABLE",
    {
      businessName: "Mama Ada Provisions",
      storeName: "Yaba Main",
      tenantId: "tenant",
      storeId: "store",
      conversationId: "chat",
      purpose: "GENERAL",
    },
    "https://dashboard.example.test",
  )
  expect(body).toBe(
    "Mama Ada Provisions · Yaba Main\n\n⚠️ I can't reach your business data right now. Nothing was changed.\nTry again in a minute.",
  )
  expect(body).not.toContain("https://")
})

test("a missed 24-hour reply gets a fixed welcome-back preface without scope label or link", () => {
  expect(whatsAppNoticeCodeSchema.parse("REPLY_WINDOW_MISSED")).toBe(
    "REPLY_WINDOW_MISSED",
  )
  for (const purpose of ["GENERAL", "SETUP", "PRODUCT_CREATE"] as const)
    expect(
      renderWhatsAppNotice(
        "REPLY_WINDOW_MISSED",
        {
          businessName: "Business",
          storeName: "Store",
          tenantId: "tenant",
          storeId: "store",
          conversationId: "chat",
          purpose,
        },
        "https://dashboard.example.test",
      ),
    ).toBe(
      "👋 Welcome back. My last reply couldn't be delivered because the chat was quiet for over 24 hours. Ask again and I'll answer.",
    )
})

test("photo choice notices are bare design copy with no app link", () => {
  const scope = {
    businessName: "Mama Ada Provisions",
    storeName: "Yaba Main",
    tenantId: "tenant",
    storeId: "store",
    conversationId: "chat",
    purpose: "GENERAL" as const,
  }
  expect(
    renderWhatsAppNotice("PHOTO_DISCARDED", scope, "https://dash.example.test"),
  ).toBe("❌ Photo discarded. It wasn't saved to EwaTrade.")
  expect(
    renderWhatsAppNotice(
      "PHOTO_CHOICE_EXPIRED",
      scope,
      "https://dash.example.test",
    ),
  ).toBe(
    "⏳ That choice expired. Nothing was changed.\n\nPhotos are removed if they aren't attached within 24 hours. Send it again to attach it.",
  )
})

test("spreadsheet handoff counts rows, never imports and links the exact saved chat", () => {
  const scope = {
    businessName: "Mama Ada Provisions",
    storeName: "Yaba Main",
    tenantId: "tenant",
    storeId: "store",
    conversationId: "chat-original",
    purpose: "GENERAL" as const,
  }
  const body = renderWhatsAppImportHandoff(
    { name: "products.xlsx", rows: 42 },
    scope,
    "https://dash.example.test",
  )
  expect(body).toBe(
    "📎 *products.xlsx* · 42 rows\nReview and import them in EwaTrade. You check every row before anything is added.\n\nMama Ada Provisions · Yaba Main\nOpen saved chat in EwaTrade: https://dash.example.test/assistant/c/chat-original",
  )
  expect(
    renderWhatsAppImportHandoff(
      { name: "one.csv", rows: 1 },
      scope,
      "https://dash.example.test",
    ),
  ).toContain("· 1 row\n")
  expect(
    renderWhatsAppImportHandoff(
      { name: "*bold*_x_.csv", rows: 3 },
      scope,
      "https://untrusted.example/path",
    ),
  ).toBe(
    "📎 *boldx.csv* · 3 rows\nReview and import them in EwaTrade. You check every row before anything is added.\n\nMama Ada Provisions · Yaba Main",
  )
  expect(
    renderWhatsAppImportHandoff(
      { name: "empty.csv", rows: 0 },
      scope,
      "https://dash.example.test",
    ),
  ).toBeNull()
})

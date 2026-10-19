import { expect, test } from "bun:test"
import { whatsAppActionButtonId } from "@ewatrade/assistant/channels/action-review"
import type { PrismaClient } from "../../../generated/prisma/client"
import { assistantWhatsAppActionDecisionDigest } from "./action-reviews"
import { assistantWhatsAppIngressActionContent } from "./inbox"
import {
  assertAssistantWhatsAppInboxLease,
  recoverAssistantWhatsAppInboxRun,
} from "./processing"

const code = "a".repeat(43)
const quote = "wamid.exact-original-review"

test("typed and interactive actions normalize to identical digest-only intent without source credentials", () => {
  for (const decision of ["confirm", "cancel"] as const) {
    const typed = assistantWhatsAppIngressActionContent({
      type: "text",
      text: `${decision} ${code}`,
      replyToMessageId: quote,
    })
    const button = assistantWhatsAppIngressActionContent({
      type: "interactive",
      quickActionId: whatsAppActionButtonId(code, decision),
      replyToMessageId: quote,
    })
    expect(typed).toEqual({
      type: "action",
      decision,
      decisionDigest: assistantWhatsAppActionDecisionDigest(code, decision),
      replyToMessageId: quote,
    })
    expect(button).toEqual(typed)
    expect(JSON.stringify(typed)).not.toContain(code)
    expect(Object.keys(typed ?? {}).sort()).toEqual([
      "decision",
      "decisionDigest",
      "replyToMessageId",
      "type",
    ])
  }
})

test("malformed or unquoted action-like input is reserved without raw text and never becomes a model turn", () => {
  for (const text of [
    "Confirm",
    "Cancel",
    "yes",
    "Proceed!",
    "save it",
    "Edit",
    `Confirm ${code}`,
    "Confirm guessed",
    "Confirm a secret credential",
  ]) {
    const content = assistantWhatsAppIngressActionContent({
      type: "text",
      text,
    })
    expect(content).toEqual({ type: "invalid_action" })
    expect(JSON.stringify(content)).not.toContain(text)
  }
  expect(
    assistantWhatsAppIngressActionContent({
      type: "interactive",
      quickActionId: `ewa-wa-action-v1:${code}:confirm`,
    }),
  ).toEqual({ type: "invalid_action" })
  expect(
    assistantWhatsAppIngressActionContent({
      type: "interactive",
      quickActionId: "ewa-wa-action-v9:malformed",
      replyToMessageId: quote,
    }),
  ).toEqual({ type: "invalid_action" })
  for (const text of [
    "3000",
    "₦3,000",
    "Business",
    "Store",
    "New chat",
    "Continue chat",
    "Choose 1",
    "Disconnect",
    "What did we sell?",
  ])
    expect(
      assistantWhatsAppIngressActionContent({ type: "text", text }),
    ).toBeNull()
})

test("ACTION owns a binding-fenced lease and cannot recover a model run", async () => {
  let modelReads = 0
  const row: {
    id: string
    kind: string
    bindingId: string
    identityId: string | null
  } = {
    id: "action-inbox",
    kind: "ACTION",
    bindingId: "binding",
    identityId: null,
  }
  const db = {
    assistantWhatsAppInbox: { findFirst: async () => row },
    assistantWhatsAppBinding: {
      findUniqueOrThrow: async () => {
        modelReads++
        throw Error("Action must not recover a model run")
      },
    },
    assistantRun: {
      findFirst: async () => {
        modelReads++
        throw Error("Action must not read a model run")
      },
    },
  } as unknown as PrismaClient
  const lease = {
    inboxId: row.id,
    bindingId: "binding",
    owner: "lease-owner",
    generation: 1,
  }
  expect(await assertAssistantWhatsAppInboxLease(db, lease)).toBe(row)
  expect(await recoverAssistantWhatsAppInboxRun(db, lease)).toBeNull()
  expect(modelReads).toBe(0)
  row.identityId = "mixed-owner"
  await expect(
    assertAssistantWhatsAppInboxLease(db, lease),
  ).rejects.toMatchObject({ code: "UNAUTHORIZED" })
})

import { expect, test } from "bun:test"
import { renderWhatsAppWebReview } from "@ewatrade/assistant/channels/review-links"
import { assistantWhatsAppActionPayloadDigest } from "./action-reviews"
import { resolveAssistantWhatsAppWebReviewDispatch } from "./web-review-dispatch"
import {
  assistantReviewShortOutboxId,
  createAssistantReviewLinkToken,
  createAssistantReviewShortLocator,
} from "./web-review-token"

const now = new Date("2026-10-21T16:00:00Z")
const payload = { action: "product_create", name: "Egg" }
const source = {
  version: 1 as const,
  proposalId: "proposal-egg",
  revision: 1,
  payloadHash: assistantWhatsAppActionPayloadDigest(payload),
  bindingId: "binding-one",
  inboxId: "inbox-one",
  expiresAt: now.getTime() + 15 * 60_000,
}
const signingKey = "review-dispatch-test-key-with-enough-length"
const options = {
  inboxId: source.inboxId,
  bindingId: source.bindingId,
  conversationId: "conversation-one",
  actorUserId: "actor-one",
  tenantId: "business-one",
  storeId: "store-one",
  scopeLabel: "Zeroes & One · Main",
  messageId: "message-one",
  trustedAppOrigin: "https://dash.ewatrade.com",
  now,
}
const token = createAssistantReviewLinkToken(source, signingKey)
const content = renderWhatsAppWebReview({ ...options, token })
if (!content) throw Error("Expected review link fixture")
const reference = {
  type: "data-general-proposal-reference",
  data: {
    proposalId: source.proposalId,
    revision: source.revision,
    payloadHash: source.payloadHash,
  },
}
function database(overrides?: {
  parts?: unknown[]
  missing?: boolean
  payload?: unknown
}) {
  return {
    assistantMessage: {
      findFirst: async () => ({ parts: overrides?.parts ?? [reference] }),
    },
    assistantActionProposal: {
      findFirst: async (input: {
        where: typeof source & {
          actorUserId: string
          tenantId: string
          storeId: string
          conversationId: string
          status: string
        }
      }) => {
        expect(input.where).toMatchObject({
          id: source.proposalId,
          actorUserId: options.actorUserId,
          tenantId: options.tenantId,
          storeId: options.storeId,
          conversationId: options.conversationId,
          status: "PENDING",
          revision: source.revision,
          payloadHash: source.payloadHash,
        })
        return overrides?.missing
          ? null
          : {
              payload: overrides?.payload ?? payload,
              expiresAt: new Date(source.expiresAt + 1000),
            }
      },
    },
  } as unknown as Parameters<
    typeof resolveAssistantWhatsAppWebReviewDispatch
  >[0]
}
test("focused review dispatch has exact committed source and no native approval buttons", async () => {
  const old = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = signingKey
  try {
    expect(
      await resolveAssistantWhatsAppWebReviewDispatch(database(), {
        ...options,
        content,
      }),
    ).toEqual({ body: content, expiresAt: source.expiresAt })
    const href = content.match(/^Review draft: (\S+)$/m)?.[1]
    if (!href) throw Error("Expected review href")
    expect(new URL(href).pathname).toBe("/assistant-review")
    expect(content).not.toContain("/assistant/c/")
    expect(content).not.toContain("approvalToken")
    expect(content).toContain("Nothing is saved until you approve")
  } finally {
    if (old === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
    else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = old
  }
})

test("new durable short handles send only the compact branded URL", async () => {
  const old = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = signingKey
  try {
    const locator = createAssistantReviewShortLocator(token, signingKey)
    const outboxId = assistantReviewShortOutboxId(locator)
    const sent = await resolveAssistantWhatsAppWebReviewDispatch(database(), {
      ...options,
      content,
      outboxId,
    })
    expect(sent?.body).toContain(
      `https://dash.ewatrade.com/r/${locator.slice(2)}`,
    )
    expect(sent?.body).not.toContain(token)
    expect(sent?.body).not.toContain("?token=")
    expect(sent?.expiresAt).toBe(source.expiresAt)
    expect(
      await resolveAssistantWhatsAppWebReviewDispatch(database(), {
        ...options,
        content,
        outboxId: "wa-review_wrong",
      }),
    ).toBeUndefined()
  } finally {
    if (old === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
    else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = old
  }
})

test("dispatch refuses stale, tampered, foreign and replaced proposal reviews", async () => {
  const old = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
  process.env.ASSISTANT_APPROVAL_SIGNING_KEY = signingKey
  try {
    for (const changed of [
      { bindingId: "other-binding" },
      { inboxId: "other-inbox" },
      { now: new Date(source.expiresAt) },
      { content: content.replace("Zeroes & One", "Foreign business") },
      {
        content: content.replace(
          "https://dash.ewatrade.com",
          "https://other.example",
        ),
      },
    ])
      expect(
        await resolveAssistantWhatsAppWebReviewDispatch(database(), {
          ...options,
          content,
          ...changed,
        }),
      ).toBeUndefined()
    expect(
      await resolveAssistantWhatsAppWebReviewDispatch(
        database({ parts: [reference, reference] }),
        { ...options, content },
      ),
    ).toBeUndefined()
    expect(
      await resolveAssistantWhatsAppWebReviewDispatch(
        database({ missing: true }),
        { ...options, content },
      ),
    ).toBeUndefined()
    expect(
      await resolveAssistantWhatsAppWebReviewDispatch(
        database({ payload: { ...payload, name: "Edited Egg" } }),
        { ...options, content },
      ),
    ).toBeUndefined()
  } finally {
    if (old === undefined)
      Reflect.deleteProperty(process.env, "ASSISTANT_APPROVAL_SIGNING_KEY")
    else process.env.ASSISTANT_APPROVAL_SIGNING_KEY = old
  }
})

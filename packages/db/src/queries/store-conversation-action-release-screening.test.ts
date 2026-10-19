import { expect, test } from "bun:test"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import type { Prisma } from "../../generated/prisma/client"
import { StoreConversationRequestKind } from "../../generated/prisma/enums"
import {
  issuePreparedCommerceQuoteInTransaction,
  prepareCommerceQuoteIssue,
} from "./commerce-quotes"
import { appendReleasedQuoteActionMessagesInTransaction } from "./store-conversation-action-release"
import { prepareStoreConversationTextScreening } from "./store-conversation-text-safety"

// Actual issuance + linked-release + invitation/unread helpers. Persistence is a
// synthetic transaction; no database, live provider or network is exercised.
const publication = {
  version: "screening-source-terms",
  documentHash: "a".repeat(64),
  effectiveDate: "2026-10-01",
}
const linkedPublication = currentEffectiveLegalPublication()
const input = {
  actorUserId: "actor",
  tenantId: "tenant",
  storeId: "store",
  sourceId: "request",
  sourceType: "service_request" as const,
  clientQuoteId: "quote-command",
  clientVersionId: "version-command",
  availabilityOutcome: "unavailable" as const,
  lines: [
    {
      outcome: "unavailable" as const,
      customerNote: "Previously screened line note",
    },
  ],
}
const linkedInput = {
  actorUserId: "actor",
  tenantId: "tenant",
  storeId: "store",
  quoteVersionId: "version",
  source: { id: "request", kind: StoreConversationRequestKind.SERVICE_REQUEST },
}
async function configured<T>(run: (production: () => void) => Promise<T>) {
  const keys = [
    "APP_ENV",
    "DEV_PROFILE",
    "STORE_CONVERSATION_TEXT_SAFETY_PROVIDER",
  ] as const
  const previous = keys.map((key) => [key, process.env[key]] as const)
  try {
    process.env.APP_ENV = "local"
    process.env.DEV_PROFILE = "local"
    process.env.STORE_CONVERSATION_TEXT_SAFETY_PROVIDER = "qa-fixture"
    return await run(() => {
      process.env.APP_ENV = "production"
      process.env.DEV_PROFILE = "production"
      // This exact provider selection is refused in production; no live key
      // or configured network provider can be used by the fixture.
    })
  } finally {
    for (const [key, value] of previous)
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
  }
}
function world() {
  const state = {
    version: null as Record<string, unknown> | null,
    option: null as Record<string, unknown> | null,
    currentVersionId: null as string | null,
    sourceStatus: "SUBMITTED",
    sequence: 0,
    action: null as Record<string, unknown> | null,
    invitation: null as { id: string; messageId: string } | null,
    linked: true,
  }
  const messages: Array<Record<string, unknown>> = []
  const links: Array<Record<string, unknown>> = []
  const notifications: Array<Record<string, unknown>> = []
  let conversationWrites = 0
  let nested = 0
  const tx = {
    $transaction: () => {
      nested++
      throw Error("No nested transaction")
    },
    $queryRaw: async () => [{ id: "conversation" }],
    membership: {
      findFirst: async () => ({
        id: "member",
        role: "OWNER",
        status: "ACTIVE",
      }),
    },
    serviceCommerceQuoteReleasePolicy: { findFirst: async () => null },
    serviceCommerceStoreTeamAssignment: { findMany: async () => [] },
    store: { findFirst: async () => ({ id: "store", currencyCode: "NGN" }) },
    legalAcceptance: {
      findUnique: async ({
        where,
      }: { where: { userId_version: { version: string } } }) => ({
        documentHash:
          where.userId_version.version === publication.version
            ? publication.documentHash
            : linkedPublication?.documentHash,
      }),
    },
    serviceRequest: {
      findFirst: async () => ({ status: state.sourceStatus, revision: 1 }),
      updateMany: async () => {
        state.sourceStatus = "QUOTED"
        return { count: 1 }
      },
    },
    serviceRequestLine: { findMany: async () => [] },
    sellableOffering: { findMany: async () => [] },
    commerceQuote: {
      upsert: async () => ({
        id: "quote",
        sourceId: "request",
        sourceType: "SERVICE_REQUEST",
        storeId: "store",
        currentVersionId: state.currentVersionId,
      }),
      updateMany: async ({ data }: { data: { currentVersionId: string } }) => {
        state.currentVersionId = data.currentVersionId
        return { count: 1 }
      },
    },
    commerceQuoteVersion: {
      findUnique: async () => state.version,
      aggregate: async () => ({ _max: { version: 0 } }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.version = { ...data, id: "version" }
        return state.version
      },
      updateMany: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state.version ?? {}, data)
        return { count: 1 }
      },
      findFirst: async () =>
        state.version
          ? {
              ...state.version,
              options: state.option ? [state.option] : [],
              quote: { currentVersionId: state.currentVersionId },
            }
          : null,
    },
    commerceQuoteOption: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.option = { ...data, id: "option" }
        return state.option
      },
    },
    commerceQuoteLine: { createMany: async () => ({ count: 1 }) },
    storeConversationRequestLink: {
      findMany: async () =>
        state.linked ? [{ conversationId: "conversation" }] : [],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        links.push(data)
        return data
      },
    },
    storeConversation: {
      findFirst: async () => ({
        id: "conversation",
        lastMessageSequence: state.sequence,
        customerBlockedAt: null,
        accountAccess: null,
        guestIdentityId: "guest",
        store: { storeConversationAvailabilityConfiguration: null },
      }),
      updateMany: async ({
        data,
      }: { data: { lastMessageSequence: number } }) => {
        state.sequence = data.lastMessageSequence
        conversationWrites++
        return { count: 1 }
      },
    },
    storeConversationActionMessage: {
      findUnique: async () => state.action,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.action = { ...data }
        return data
      },
    },
    storeConversationMessage: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const message = { ...data, id: `message-${messages.length}` }
        messages.push(message)
        return message
      },
    },
    storeConversationAccountInvitation: {
      findUnique: async () => state.invitation,
      create: async ({ data }: { data: { messageId: string } }) => {
        state.invitation = { id: "invitation", messageId: data.messageId }
        return state.invitation
      },
    },
    storeConversationNotificationIntent: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        notifications.push(data)
        return { id: "notification", ...data }
      },
    },
    storeConversationNotificationAuditEvent: {
      create: async () => ({ id: "notification-audit" }),
    },
  }
  return {
    tx: tx as unknown as Prisma.TransactionClient,
    state,
    messages,
    links,
    notifications,
    writes: () => conversationWrites,
    nested: () => nested,
  }
}
test("actual prepared issuer creates and replays linked presentations in unavailable-provider production after configured QA screening", async () => {
  await configured(async (production) => {
    const w = world()
    const prepared = await prepareCommerceQuoteIssue(input, publication)
    production()
    const result = await issuePreparedCommerceQuoteInTransaction(w.tx, prepared)
    expect(result).toMatchObject({
      quoteId: "quote",
      versionId: "version",
      releaseState: "released",
    })
    expect(typeof result.token).toBe("string")
    expect(w.messages.map((row) => row.kind)).toEqual([
      "ACTION_MESSAGE",
      "ACCOUNT_INVITATION",
    ])
    expect(w.links).toHaveLength(1)
    expect(w.notifications).toHaveLength(1)
    expect(w.nested()).toBe(0)
    const before = JSON.stringify([w.messages, w.links, w.notifications])
    const replay = await issuePreparedCommerceQuoteInTransaction(w.tx, prepared)
    expect(replay).toMatchObject({
      quoteId: "quote",
      versionId: "version",
      releaseState: "released",
      token: null,
    })
    expect(JSON.stringify([w.messages, w.links, w.notifications])).toBe(before)
    expect(w.nested()).toBe(0)
  })
})
test("actual persisted normalized labels must match the issuer proof on replay; mismatch cannot screen or mutate linked messages", async () => {
  await configured(async (production) => {
    const w = world()
    const prepared = await prepareCommerceQuoteIssue(input, publication)
    production()
    await issuePreparedCommerceQuoteInTransaction(w.tx, prepared)
    if (!w.state.option) throw Error("Missing persisted option")
    w.state.option.label = "Changed persisted label"
    const before = JSON.stringify([
      w.messages,
      w.links,
      w.notifications,
      w.writes(),
    ])
    await expect(
      issuePreparedCommerceQuoteInTransaction(w.tx, prepared),
    ).rejects.toMatchObject({
      code: "NOT_READY",
      message:
        "This quotation presentation requires fresh exact-text safety screening.",
    })
    expect(
      JSON.stringify([w.messages, w.links, w.notifications, w.writes()]),
    ).toBe(before)
    expect(w.nested()).toBe(0)
  })
})
test("new linked presentation refuses an unscreened persisted label before any conversation mutation", async () => {
  await configured(async (production) => {
    const w = world()
    w.state.linked = false
    const prepared = await prepareCommerceQuoteIssue(input, publication)
    await issuePreparedCommerceQuoteInTransaction(w.tx, prepared)
    const proof = await prepareStoreConversationTextScreening(["Quote"])
    w.state.linked = true
    if (!w.state.option) throw Error("Missing persisted option")
    w.state.option.label = "Unscreened persisted label"
    production()
    await expect(
      appendReleasedQuoteActionMessagesInTransaction(
        w.tx,
        { ...linkedInput, screenedTexts: proof },
        publication,
      ),
    ).rejects.toMatchObject({
      code: "NOT_READY",
      message:
        "This quotation presentation requires fresh exact-text safety screening.",
    })
    expect(w.messages).toEqual([])
    expect(w.links).toEqual([])
    expect(w.notifications).toEqual([])
    expect(w.writes()).toBe(0)
    expect(w.state.action).toBeNull()
    expect(w.state.invitation).toBeNull()
  })
})
test("linked release accepts only genuine opaque proof and actual saved normalized labels, with no provider fallback on supplied mismatch", async () => {
  await configured(async (production) => {
    const w = world()
    const prepared = await prepareCommerceQuoteIssue(input, publication)
    await issuePreparedCommerceQuoteInTransaction(w.tx, prepared)
    const proof = await prepareStoreConversationTextScreening(["Quote"])
    const wrong = await prepareStoreConversationTextScreening(["Other label"])
    production()
    if (!w.state.option) throw Error("Missing persisted option")
    w.state.option.label = "  Quote  "
    expect(
      await appendReleasedQuoteActionMessagesInTransaction(
        w.tx,
        { ...linkedInput, screenedTexts: proof },
        publication,
      ),
    ).toMatchObject([{ replayed: true }])
    const before = JSON.stringify([
      w.messages,
      w.links,
      w.notifications,
      w.writes(),
    ])
    for (const evidence of [
      null,
      {},
      true,
      JSON.parse(JSON.stringify(proof)),
      wrong,
    ])
      await expect(
        Reflect.apply(
          appendReleasedQuoteActionMessagesInTransaction,
          undefined,
          [w.tx, { ...linkedInput, screenedTexts: evidence }, publication],
        ),
      ).rejects.toMatchObject({
        code: "NOT_READY",
        message:
          "This quotation presentation requires fresh exact-text safety screening.",
      })
    expect(
      JSON.stringify([w.messages, w.links, w.notifications, w.writes()]),
    ).toBe(before)
    expect(w.nested()).toBe(0)
  })
})
test("omitted proof preserves mandatory configured screening for legacy/default callers even on replay", async () => {
  await configured(async (production) => {
    const w = world()
    const prepared = await prepareCommerceQuoteIssue(input, publication)
    await issuePreparedCommerceQuoteInTransaction(w.tx, prepared)
    if (!w.state.option) throw Error("Missing persisted option")
    w.state.option.label = "[[qa-reject]]"
    const before = JSON.stringify([
      w.messages,
      w.links,
      w.notifications,
      w.writes(),
    ])
    await expect(
      appendReleasedQuoteActionMessagesInTransaction(
        w.tx,
        linkedInput,
        publication,
      ),
    ).rejects.toMatchObject({ code: "NOT_READY" })
    w.state.option.label = "Quote"
    production()
    for (const extra of [{}, { screenedTexts: undefined }])
      await expect(
        appendReleasedQuoteActionMessagesInTransaction(
          w.tx,
          { ...linkedInput, ...extra },
          publication,
        ),
      ).rejects.toMatchObject({
        code: "NOT_READY",
        message: "Messages are paused while safety screening is unavailable.",
      })
    expect(
      JSON.stringify([w.messages, w.links, w.notifications, w.writes()]),
    ).toBe(before)
  })
})

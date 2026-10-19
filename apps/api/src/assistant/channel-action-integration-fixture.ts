import { expect } from "bun:test"
import { createHmac, randomUUID } from "node:crypto"
import type {
  GeneralAction,
  GeneralProposalReference,
} from "@ewatrade/assistant/general/contracts"
import { PrismaClient } from "@ewatrade/db"
import {
  type WhatsAppConversationPrincipal,
  type WhatsAppInboxLease,
  acceptAssistantWhatsAppIngress,
  acceptAssistantWhatsAppStatus,
  beginAssistantWhatsAppDelivery,
  claimAssistantWhatsAppInbox,
  claimAssistantWhatsAppLink,
  confirmAssistantWhatsAppLink,
  createAssistantWhatsAppLink,
  deriveAssistantWhatsAppActionReviewCode,
  disconnectAssistantWhatsApp,
  finishAssistantWhatsAppDelivery,
  resolveAssistantWhatsAppConversation,
  selectAssistantWhatsAppConversation,
  settleAssistantWhatsAppInbox,
  stampAssistantWhatsAppExecution,
} from "@ewatrade/db/assistant-whatsapp"
import { PrismaPg } from "@prisma/adapter-pg"
import { assertQaAccessAcceptanceDatabase } from "../../../../packages/db/src/queries/acceptance/qa-access/database"
import { processPlatformWhatsAppEvent } from "../communications/whatsapp-platform-runtime"
import { handleWhatsAppWebhookRequest } from "../communications/whatsapp-runtime"
import {
  WHATSAPP_ACTION_INVALID_REPLY,
  processAssistantWhatsAppAction,
} from "./channel-action-turn"
import { createLinkedAssistantContext } from "./channel-principal"
import { prepareAssistantWhatsAppReview } from "./channel-review-staging"
import type { GeneralContext } from "./general-context"
import { draftGeneralProposal, editGeneralProposal } from "./general-proposals"
import { proposalDigest } from "./proposal-security"

/** Shared guarded synthetic fixture. Importing this module never connects or registers tests. */
export function createAssistantWhatsAppActionFixture(label: string) {
  const enabled = process.env.RUN_DATABASE_INTEGRATION_TESTS === "1"
  const marker = `${label}-${randomUUID()}`
  const userId = `${marker}-user`
  const tenantId = `${marker}-tenant`
  const storeId = `${marker}-store`
  const membershipId = `${marker}-member`
  const sessionId = `${marker}-session`
  let conversationId = `${marker}-chat`
  const phoneNumberId = "90000000000010"
  const senderId = `239${Date.now().toString().slice(-10)}`
  const sourceDomain = "assistant-action-confirmation.test"
  const signingKey = "synthetic-action-signing-key-000000000000000"
  const appSecret = "synthetic-action-webhook-secret"
  const environment = {
    APP_ENV: "local",
    NODE_ENV: "test",
    ASSISTANT_WHATSAPP_ENABLED: "true",
    ASSISTANT_WHATSAPP_READS_ENABLED: "true",
    ASSISTANT_WHATSAPP_WRITES_ENABLED: "true",
    ASSISTANT_WHATSAPP_DISPLAY_NUMBER: "2348000000000",
    ASSISTANT_WHATSAPP_PILOT_USER_IDS: userId,
    ASSISTANT_WHATSAPP_PILOT_TENANT_IDS: tenantId,
    WHATSAPP_OTP_PHONE_NUMBER_ID: phoneNumberId,
    WHATSAPP_OTP_ACCESS_TOKEN: "synthetic-no-provider-use",
    ASSISTANT_APPROVAL_SIGNING_KEY: signingKey,
    ASSISTANT_APPROVAL_SIGNING_KEY_VERSION: "v1",
    META_APP_SECRET: appSecret,
  }
  const previous = new Map(
    Object.keys(environment).map((key) => [key, process.env[key]]),
  )
  let db: PrismaClient
  let principal: WhatsAppConversationPrincipal
  let savedSequence = 0
  const rawDecisionCodes: string[] = []

  async function setup() {
    if (!enabled) return
    assertQaAccessAcceptanceDatabase()
    if (
      new URL(process.env.EWATRADE_DATABASE_URL ?? "").pathname !==
      "/ewatrade_qa_v1"
    )
      throw Error("Explicit ewatrade_qa_v1 local QA target required.")
    Object.assign(process.env, environment)
    db = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.EWATRADE_DATABASE_URL,
        max: 2,
      }),
      transactionOptions: { maxWait: 10_000, timeout: 30_000 },
    })
    await db.$transaction(async (tx) => {
      await tx.user.create({
        data: { id: userId, email: `${marker}@example.test`, ageBand: "ADULT" },
      })
      await tx.tenant.create({
        data: {
          id: tenantId,
          slug: tenantId,
          name: "Synthetic confirmation business",
          type: "MERCHANT",
          enabledModes: ["MERCHANT"],
          currencyCode: "NGN",
          metadata: { retailOps: { subscription: { planId: "pro" } } },
          dataClassification: "QA",
          qaMarkedAt: new Date(),
          qaSourceDomain: sourceDomain,
        },
      })
      await tx.membership.create({
        data: {
          id: membershipId,
          userId,
          tenantId,
          role: "OWNER",
          status: "ACTIVE",
        },
      })
      await tx.store.create({
        data: {
          id: storeId,
          tenantId,
          slug: storeId,
          name: "Synthetic confirmation Store",
          status: "ACTIVE",
        },
      })
      await tx.session.create({
        data: {
          id: sessionId,
          userId,
          token: randomUUID(),
          expiresAt: new Date(Date.now() + 60 * 60_000),
        },
      })
      await tx.assistantConversation.create({
        data: {
          id: conversationId,
          tenantId,
          storeId,
          ownerUserId: userId,
          purpose: "GENERAL",
          status: "ACTIVE",
        },
      })
    })
    const actor = { userId, tenantId, storeId, membershipId, sessionId }
    const link = await createAssistantWhatsAppLink(db, actor, phoneNumberId)
    expect(
      await claimAssistantWhatsAppLink(db, {
        code: link.code,
        phoneNumberId,
        senderId,
        messageId: `${marker}-claim`,
      }),
    ).toBe(true)
    const grant = await confirmAssistantWhatsAppLink(db, actor, {
      linkId: link.id,
      expectedRevision: 2,
      phoneNumberId,
    })
    principal = await selectAssistantWhatsAppConversation(
      db,
      {
        kind: "linked_whatsapp",
        grantId: grant.id,
        grantGeneration: grant.generation,
        identityGeneration: 1,
        phoneNumberId,
        senderId,
      },
      conversationId,
    )
  }

  async function cleanup() {
    try {
      if (db) {
        await db.stockMovement.deleteMany({
          where: {
            operation: { tenantId, tenant: { qaSourceDomain: sourceDomain } },
          },
        })
        await db.stockOperation.deleteMany({
          where: { tenantId, tenant: { qaSourceDomain: sourceDomain } },
        })
        await db.stockBalanceSource.deleteMany({ where: { tenantId } })
        await db.catalogPriceChange.deleteMany({ where: { tenantId } })
        await db.catalogCommandReceipt.deleteMany({ where: { tenantId } })
        await db.tenant.deleteMany({
          where: { id: tenantId, qaSourceDomain: sourceDomain },
        })
        await db.user.deleteMany({
          where: { id: userId, email: `${marker}@example.test` },
        })
        expect(await db.tenant.count({ where: { id: tenantId } })).toBe(0)
        expect(await db.user.count({ where: { id: userId } })).toBe(0)
        expect(
          await db.assistantWhatsAppIdentity.count({ where: { userId } }),
        ).toBe(0)
        expect(
          await db.assistantActionProposal.count({ where: { tenantId } }),
        ).toBe(0)
      }
    } finally {
      if (db) await db.$disconnect()
      for (const [key, value] of previous) {
        if (value === undefined) Reflect.deleteProperty(process.env, key)
        else process.env[key] = value
      }
    }
  }

  /** Actual signed platform normalization/admission; enqueue is captured as an ID only. */
  async function webhook(value: unknown) {
    const queued: string[] = []
    const body = JSON.stringify({ entry: [{ changes: [{ value }] }] })
    const response = await handleWhatsAppWebhookRequest(
      new Request("https://api.example.test/api/webhooks/whatsapp", {
        method: "POST",
        body,
        headers: {
          "x-hub-signature-256": `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`,
        },
      }),
      marker,
      {
        processPlatformEvent: (event) =>
          processPlatformWhatsAppEvent(event, {
            env: environment,
            receipt: (event) => acceptAssistantWhatsAppStatus(db, event),
            accept: (input, permitted) =>
              acceptAssistantWhatsAppIngress(db, input, permitted),
            enqueue: async (id) => {
              queued.push(id)
            },
            claim: (input) => claimAssistantWhatsAppLink(db, input),
            disconnect: (input) => disconnectAssistantWhatsApp(db, input),
          }),
      },
    )
    expect(response.status).toBe(200)
    return queued
  }

  async function incoming(text: string, replyToMessageId?: string) {
    const providerMessageId = `${marker}-incoming-${randomUUID()}`
    const queued = await webhook({
      metadata: { phone_number_id: phoneNumberId },
      messages: [
        {
          id: providerMessageId,
          from: senderId,
          timestamp: String(Math.floor(Date.now() / 1000)),
          type: "text",
          text: { body: text },
          ...(replyToMessageId ? { context: { id: replyToMessageId } } : {}),
        },
      ],
    })
    expect(queued).toHaveLength(1)
    const id = queued[0]
    if (!id) throw Error("Expected exactly one ID-only inbox admission")
    return db.assistantWhatsAppInbox.findUniqueOrThrow({ where: { id } })
  }

  async function claim(id: string) {
    const result = await claimAssistantWhatsAppInbox(db, id, [userId])
    expect(result.kind).toBe("claimed")
    if (result.kind !== "claimed")
      throw Error("Expected eligible claimed inbox")
    return result
  }

  async function context(requestId: string, lease?: WhatsAppInboxLease) {
    return (await createLinkedAssistantContext(
      db,
      principal,
      requestId,
      lease,
    )) as GeneralContext
  }

  /** Durable HTTP-effect intent + accepted outcome and signed receipt; no provider is called. */
  async function fakeAcceptedDelivery(outboxId: string) {
    const started = await beginAssistantWhatsAppDelivery(db, outboxId, {
      phoneNumberId,
      permittedUserIds: [userId],
      providerMode: "test",
    })
    expect(started.kind).toBe("started")
    if (started.kind !== "started")
      throw Error("Expected current durable dispatch")
    const providerMessageId = `wamid.${marker}.${randomUUID()}`
    await finishAssistantWhatsAppDelivery(db, started.proof, {
      kind: "accepted",
      providerMessageId,
    })
    expect(
      await webhook({
        metadata: { phone_number_id: phoneNumberId },
        statuses: [
          {
            id: providerMessageId,
            recipient_id: senderId,
            timestamp: String(Math.floor(Date.now() / 1000)),
            status: "delivered",
            biz_opaque_callback_data: started.callbackData,
          },
        ],
      }),
    ).toEqual([])
    expect(
      (
        await db.assistantWhatsAppOutbox.findUniqueOrThrow({
          where: { id: outboxId },
        })
      ).state,
    ).toBe("DELIVERED")
    return { providerMessageId, body: started.body }
  }

  async function stagedCustomer(name: string) {
    return stagedProposal({
      text: `Add saved customer ${name}`,
      payload: { action: "customer_create", name },
      reply: "Review this saved customer draft.",
      expectedReviewText: name,
    })
  }

  async function stagedProposal(input: {
    text: string
    payload: GeneralAction
    reply: string
    expectedReviewText: string
  }) {
    const inbox = await incoming(input.text)
    expect(inbox.kind).toBe("TURN")
    const claimed = await claim(inbox.id)
    const ctx = await context(inbox.requestId, claimed.lease)
    const draft = await draftGeneralProposal(ctx, conversationId, input.payload)
    const source: GeneralProposalReference = {
      proposalId: draft.proposalId,
      revision: draft.revision,
      payloadHash: proposalDigest(draft.payload),
    }
    // This is the sole synthetic server step: stand in for the completed model turn,
    // preserving the exact actual draft result rather than selecting a newer draft.
    await db.$transaction(async (tx) => {
      const resolved = await resolveAssistantWhatsAppConversation(tx, principal)
      await stampAssistantWhatsAppExecution(tx, claimed.lease, resolved)
      const sequence = ++savedSequence
      const message = await tx.assistantMessage.create({
        data: {
          id: randomUUID(),
          conversationId,
          sequence,
          role: "assistant",
          parts: [
            { type: "text", text: input.reply },
            { type: "data-general-proposal-reference", data: source },
          ],
        },
      })
      const run = await tx.assistantRun.create({
        data: {
          conversationId,
          actorUserId: userId,
          requestId: inbox.requestId,
          provider: "ewatrade-rehearsal",
          model: "synthetic-no-model",
          promptVersion: "synthetic-exact-proposal-source",
          status: "COMPLETED",
          completedAt: new Date(),
          assistantMessageId: message.id,
        },
      })
      await tx.assistantWhatsAppInbox.update({
        where: { id: inbox.id },
        data: { runId: run.id },
      })
      await tx.assistantConversation.update({
        where: { id: conversationId },
        data: { lastSequence: sequence },
      })
    })
    const review = await prepareAssistantWhatsAppReview(db, claimed.lease)
    expect(review?.source).toEqual(source)
    if (!review)
      throw Error("Expected complete exact canonical proposal review")
    expect(review.body).toContain(input.expectedReviewText)
    expect(
      await settleAssistantWhatsAppInbox(db, claimed.lease, {
        permittedUserIds: [userId],
        review,
      }),
    ).toEqual({ state: "COMPLETED" })
    const outbox = await db.assistantWhatsAppOutbox.findFirstOrThrow({
      where: { inboxId: inbox.id, renderKind: "action_review" },
    })
    const proof = await db.assistantWhatsAppActionReview.findUniqueOrThrow({
      where: { reviewOutboxId: outbox.id },
    })
    expect(proof).toMatchObject({
      proposalId: source.proposalId,
      proposalRevision: source.revision,
      payloadHash: source.payloadHash,
      state: "PENDING",
    })
    expect(proof.confirmDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(proof.cancelDigest).toMatch(/^[a-f0-9]{64}$/)
    const material = {
      bindingId: proof.bindingId,
      proposalId: proof.proposalId,
      proposalRevision: proof.proposalRevision,
      payloadHash: proof.payloadHash,
      targetRevision: proof.targetRevision,
      reviewDigest: proof.reviewDigest,
      authorityDigest: proof.authorityDigest,
      identityGeneration: proof.identityGeneration,
      grantGeneration: proof.grantGeneration,
      selectionGeneration: proof.selectionGeneration,
      reviewOutboxId: proof.reviewOutboxId,
      nonce: proof.nonce,
      keyVersion: proof.keyVersion,
      expiresAt: proof.expiresAt,
    }
    const confirmCode = deriveAssistantWhatsAppActionReviewCode(
      material,
      "confirm",
      signingKey,
    )
    const cancelCode = deriveAssistantWhatsAppActionReviewCode(
      material,
      "cancel",
      signingKey,
    )
    rawDecisionCodes.push(confirmCode, cancelCode)
    for (const code of [confirmCode, cancelCode]) {
      expect(outbox.content?.includes(code)).toBe(false)
      expect(JSON.stringify(proof).includes(code)).toBe(false)
    }
    const delivery = await fakeAcceptedDelivery(outbox.id)
    expect(delivery.body).toContain(`Confirm ${confirmCode}`)
    expect(delivery.body).toContain(`Cancel ${cancelCode}`)
    return { source, proof, outbox, confirmCode, cancelCode, ...delivery }
  }

  async function action(text: string, quoted: string) {
    const inbox = await incoming(text, quoted)
    expect(inbox.kind).toBe("ACTION")
    expect(inbox.runId).toBeNull()
    expect(JSON.stringify(inbox.content)).not.toContain(text)
    const claimed = await claim(inbox.id)
    const result = await processAssistantWhatsAppAction(
      await context(inbox.requestId, claimed.lease),
      claimed.lease,
    )
    expect(result.status).toBe("completed")
    if (result.status !== "completed")
      throw Error("Expected durable action result")
    const completed = await db.assistantWhatsAppInbox.findUniqueOrThrow({
      where: { id: inbox.id },
    })
    expect(completed.state).toBe("COMPLETED")
    expect(completed.runId).toBeNull()
    expect(
      await db.assistantWhatsAppOutbox.count({ where: { inboxId: inbox.id } }),
    ).toBe(1)
    const outbox = await db.assistantWhatsAppOutbox.findUniqueOrThrow({
      where: { id: result.outboxId },
    })
    expect(outbox.renderKind).toBe("action_result")
    const sent = await fakeAcceptedDelivery(outbox.id)
    expect(sent.body).toBe(outbox.content ?? "")
    return { inbox: completed, outbox }
  }

  async function assertNoStoredDecisionCodes() {
    const persisted = JSON.stringify({
      messages: await db.assistantMessage.findMany({
        where: { conversation: { tenantId, ownerUserId: userId } },
      }),
      inbox: await db.assistantWhatsAppInbox.findMany({
        where: { binding: { identity: { userId } } },
      }),
      outbox: await db.assistantWhatsAppOutbox.findMany({
        where: { inbox: { binding: { identity: { userId } } } },
      }),
      reviews: await db.assistantWhatsAppActionReview.findMany({
        where: { binding: { identity: { userId } } },
      }),
    })
    for (const code of rawDecisionCodes)
      expect(persisted.includes(code)).toBe(false)
  }

  async function browserContext() {
    const linked = await context(`${marker}-browser-context`)
    const browser: GeneralContext = {
      ...linked,
      session: {
        session: await db.session.findUniqueOrThrow({
          where: { id: sessionId },
        }),
        user: await db.user.findUniqueOrThrow({ where: { id: userId } }),
      },
      assistantConversationId: undefined,
      requestHeaders: new Headers({ "x-assistant-client": "dashboard" }),
    }
    return browser
  }
  async function switchConversation() {
    const next = `${marker}-chat-${randomUUID()}`
    await db.assistantConversation.create({
      data: {
        id: next,
        tenantId,
        storeId,
        ownerUserId: userId,
        purpose: "GENERAL",
        status: "ACTIVE",
      },
    })
    principal = await selectAssistantWhatsAppConversation(db, principal, next)
    conversationId = next
    savedSequence = 0
    return principal
  }
  return {
    setup,
    cleanup,
    context,
    browserContext,
    incoming,
    claim,
    stagedCustomer,
    stagedProposal,
    action,
    fakeAcceptedDelivery,
    assertNoStoredDecisionCodes,
    switchConversation,
    marker,
    userId,
    tenantId,
    storeId,
    membershipId,
    sessionId,
    signingKey,
    get db() {
      return db
    },
    get principal() {
      return principal
    },
    get conversationId() {
      return conversationId
    },
  }
}

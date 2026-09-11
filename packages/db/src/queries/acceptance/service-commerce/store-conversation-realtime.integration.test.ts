import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import type { ServiceCommerceProfileSettings } from "@ewatrade/service-commerce"
import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../../../../generated/prisma/client"

import { publishCustomerEntryPoint } from "../../customer-channels"
import {
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "../../service-commerce-access"
import {
  acknowledgeGuestStoreConversationProgress,
  acknowledgeMobileStoreConversationProgress,
  acknowledgeStoreConversationStaffRead,
  bootstrapWebStoreConversation,
  claimMobileStoreConversationTransfer,
  claimStoreConversation,
  createWebStoreConversationTransfer,
  getGuestStoreConversationMessagesAfter,
  listMobileStoreConversations,
  listStoreConversationQueue,
  redeemMobileStoreConversationTransfer,
  replyToStoreConversation,
  selectGuestStoreConversationRequest,
  sendGuestStoreConversationText,
} from "../../store-conversations"
import { describeWithServiceCommerceDatabase } from "./database"
import {
  type ServiceCommerceAcceptanceFixture,
  createServiceCommerceAcceptanceFixture,
  disposeServiceCommerceAcceptanceFixture,
} from "./fixture"

setDefaultTimeout(240_000)

const settings: ServiceCommerceProfileSettings = {
  capabilities: {
    attachments: false,
    booking: false,
    delivery: false,
    intake: true,
    payment: false,
    pickup: false,
    progressive_catalog: true,
    quote: true,
    service_completion: false,
    staff: true,
    web: true,
    whatsapp: false,
  },
  catalogAdoptionMode: "progressive",
  procureToOrderEnabled: false,
}

async function publishEntry(fixture: ServiceCommerceAcceptanceFixture) {
  const configured = await updateServiceCommerceStoreProfile(fixture.db, {
    actorUserId: fixture.actorUserId,
    expectedRevision: 0,
    reason: "Configure realtime Store Conversation acceptance",
    settings,
    storeId: fixture.storeId,
    tenantId: fixture.tenantId,
  })
  await setServiceCommerceStoreProfileActivation(fixture.db, {
    active: true,
    actorUserId: fixture.actorUserId,
    expectedRevision: configured.revision,
    reason: "Activate realtime Store Conversation acceptance",
    storeId: fixture.storeId,
    tenantId: fixture.tenantId,
  })
  return (
    await publishCustomerEntryPoint(fixture.db, {
      actorUserId: fixture.actorUserId,
      storeId: fixture.storeId,
      tenantId: fixture.tenantId,
    })
  ).publicToken
}

describeWithServiceCommerceDatabase("Store Conversation realtime truth", () => {
  let primary: ServiceCommerceAcceptanceFixture
  let primaryToken: string
  let concurrentDb: PrismaClient

  beforeAll(async () => {
    const databaseUrl = process.env.EWATRADE_DATABASE_URL
    if (!databaseUrl) throw new Error("EWATRADE_DATABASE_URL is required")
    concurrentDb = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
      transactionOptions: { maxWait: 10_000, timeout: 30_000 },
    })
    primary = await createServiceCommerceAcceptanceFixture()
    primaryToken = await publishEntry(primary)
  })

  afterAll(async () => {
    const errors: unknown[] = []
    try {
      if (primary) await disposeServiceCommerceAcceptanceFixture(primary)
    } catch (error) {
      errors.push(error)
    }
    try {
      await concurrentDb?.$disconnect()
    } catch (error) {
      errors.push(error)
    }
    if (errors.length > 0) throw new AggregateError(errors)
  })

  test("recovers committed messages and converges credential and staff watermarks", async () => {
    const web = await bootstrapWebStoreConversation(primary.db, {
      publicToken: primaryToken,
    })
    if (!web.credentialToken) throw new Error("Web credential missing")
    const customerMessage = await sendGuestStoreConversationText(primary.db, {
      clientOperationId: `realtime-message-${randomUUID()}`,
      conversationId: web.conversation.id,
      credentialToken: web.credentialToken,
      publicToken: primaryToken,
      requestIntent: "choose_request",
      text: "I need a quote for a Store item.",
    })
    const selected = await selectGuestStoreConversationRequest(primary.db, {
      clientOperationId: `realtime-request-${randomUUID()}`,
      conversationId: web.conversation.id,
      credentialToken: web.credentialToken,
      messageId: customerMessage.message.id,
      publicToken: primaryToken,
      target: { kind: "new_commerce_inquiry" },
    })
    const source = selected.message.request
    if (!source) throw new Error("Realtime Request source missing")

    const queueBeforeRead = await listStoreConversationQueue(primary.db, {
      actorUserId: primary.actorUserId,
      storeId: primary.storeId,
      tenantId: primary.tenantId,
    })
    expect(
      queueBeforeRead.items[0]?.unreadCustomerMessages,
      "staff queue should count the unread customer Request",
    ).toBe(1)

    await claimStoreConversation(primary.db, {
      actorUserId: primary.actorUserId,
      clientOperationId: `realtime-claim-${randomUUID()}`,
      conversationId: web.conversation.id,
      expectedAssignmentRevision: 0,
      storeId: primary.storeId,
      tenantId: primary.tenantId,
    })
    const reply = await replyToStoreConversation(primary.db, {
      actorUserId: primary.actorUserId,
      clientOperationId: `realtime-reply-${randomUUID()}`,
      conversationId: web.conversation.id,
      expectedAssignmentRevision: 1,
      expectedLastMessageSequence: 1,
      request: { id: source.id, kind: source.kind, revision: 1 },
      storeId: primary.storeId,
      tenantId: primary.tenantId,
      text: "Your Store response is ready.",
    })
    expect(reply.message.sequence, "Store reply should be sequence 2").toBe(2)

    const firstPage = await getGuestStoreConversationMessagesAfter(primary.db, {
      afterSequence: 0,
      conversationId: web.conversation.id,
      credentialToken: web.credentialToken,
      limit: 1,
      publicToken: primaryToken,
    })
    const secondPage = await getGuestStoreConversationMessagesAfter(
      primary.db,
      {
        afterSequence: firstPage.nextCursor ?? 0,
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken,
        limit: 1,
        publicToken: primaryToken,
      },
    )
    const recoveredSequences = [
      ...firstPage.messages.map((message) => message.sequence),
      ...secondPage.messages.map((message) => message.sequence),
    ]
    expect(
      recoveredSequences,
      "after-cursor recovery should return both messages in order",
    ).toEqual([1, 2])

    const webProgress = await acknowledgeGuestStoreConversationProgress(
      primary.db,
      {
        clientOperationId: `realtime-web-progress-${randomUUID()}`,
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken,
        deliveredThroughSequence: 2,
        publicToken: primaryToken,
        readThroughSequence: 2,
      },
    )
    expect(
      webProgress,
      "web progress should distinguish delivered and read through sequence 2",
    ).toMatchObject({
      deliveredThroughSequence: 2,
      readThroughSequence: 2,
    })

    const transferToken = `realtime-transfer-${randomUUID()}`
    await createWebStoreConversationTransfer(primary.db, {
      clientOperationId: `realtime-transfer-create-${randomUUID()}`,
      conversationId: web.conversation.id,
      credentialToken: web.credentialToken,
      publicToken: primaryToken,
      transferToken,
    })
    const installationToken = `realtime-install-${randomUUID()}`
    await claimMobileStoreConversationTransfer(primary.db, {
      installationToken,
      publicToken: primaryToken,
      transferToken,
    })
    const targetCredentialToken = `realtime-mobile-credential-${randomUUID()}`
    const mobile = await redeemMobileStoreConversationTransfer(primary.db, {
      installationToken,
      publicToken: primaryToken,
      targetCredentialToken,
      transferToken,
    })
    await acknowledgeMobileStoreConversationProgress(primary.db, {
      clientOperationId: `realtime-mobile-progress-${randomUUID()}`,
      conversationId: mobile.conversation.id,
      credentialToken: targetCredentialToken,
      deliveredThroughSequence: 2,
      installationToken,
      publicToken: primaryToken,
      readThroughSequence: 1,
    })
    const mobileList = await listMobileStoreConversations(primary.db, {
      credentialToken: targetCredentialToken,
      installationToken,
    })
    expect(
      mobileList.items[0]?.unreadStoreMessages,
      "mobile credential should retain one unread Store reply",
    ).toBe(1)

    await acknowledgeStoreConversationStaffRead(primary.db, {
      actorUserId: primary.actorUserId,
      clientOperationId: `realtime-staff-progress-${randomUUID()}`,
      conversationId: web.conversation.id,
      readThroughSequence: 2,
      storeId: primary.storeId,
      tenantId: primary.tenantId,
    })
    const queueAfterRead = await listStoreConversationQueue(primary.db, {
      actorUserId: primary.actorUserId,
      storeId: primary.storeId,
      tenantId: primary.tenantId,
    })
    expect(
      queueAfterRead.items[0]?.unreadCustomerMessages,
      "staff acknowledgement should clear the customer unread count",
    ).toBe(0)

    await Promise.all([
      acknowledgeGuestStoreConversationProgress(concurrentDb, {
        clientOperationId: `realtime-web-lower-progress-${randomUUID()}`,
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken,
        deliveredThroughSequence: 1,
        publicToken: primaryToken,
        readThroughSequence: 0,
      }),
      acknowledgeGuestStoreConversationProgress(primary.db, {
        clientOperationId: `realtime-web-current-progress-${randomUUID()}`,
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken,
        deliveredThroughSequence: 2,
        publicToken: primaryToken,
        readThroughSequence: 2,
      }),
    ])
    const convergedWebWatermark =
      await primary.db.storeConversationCustomerWatermark.findFirstOrThrow({
        where: {
          conversationId: web.conversation.id,
          credential: { purpose: "WEB_DEVICE" },
        },
      })
    expect(
      convergedWebWatermark,
      "concurrent lower progress must not regress the web watermark",
    ).toMatchObject({
      deliveredThroughSequence: 2,
      readThroughSequence: 2,
    })

    const customerWatermarkCount =
      await primary.db.storeConversationCustomerWatermark.count({
        where: { conversationId: web.conversation.id },
      })
    expect(
      customerWatermarkCount,
      "web and mobile credentials should own independent watermarks",
    ).toBe(2)
    const staffWatermarkCount =
      await primary.db.storeConversationStaffWatermark.count({
        where: { conversationId: web.conversation.id },
      })
    expect(
      staffWatermarkCount,
      "the staff membership should own one watermark",
    ).toBe(1)
    let foreignScopeDenied = false
    try {
      await getGuestStoreConversationMessagesAfter(primary.db, {
        afterSequence: 0,
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken,
        publicToken: `nonexistent-${randomUUID()}`,
      })
    } catch (error) {
      foreignScopeDenied =
        typeof error === "object" && error !== null && "code" in error
          ? error.code === "NOT_FOUND"
          : false
    }
    expect(
      foreignScopeDenied,
      "foreign Store token should fail closed with NOT_FOUND",
    ).toBe(true)
  })
})

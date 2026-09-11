import { afterAll, beforeAll, expect, setDefaultTimeout, test } from "bun:test"
import { randomUUID } from "node:crypto"
import {
  DEFAULT_STORE_CONVERSATION_WEEKLY_HOURS,
  type ServiceCommerceProfileSettings,
} from "@ewatrade/service-commerce"

import {
  ServiceCommercePolicyChannel,
  ServiceCommercePolicyOutcome,
  ServiceCommercePolicyVertical,
} from "../../../../generated/prisma/enums"
import { publishCustomerEntryPoint } from "../../customer-channels"
import {
  assignPrescriptionStoreRole,
  revokePrescriptionStoreRole,
} from "../../prescription-settings"
import {
  setServiceCommerceStoreProfileActivation,
  updateServiceCommerceStoreProfile,
} from "../../service-commerce-access"
import {
  setStoreConversationManualPause,
  updateStoreConversationAvailabilitySchedule,
} from "../../store-conversation-availability"
import {
  bootstrapWebStoreConversation,
  claimStoreConversation,
  getGuestStoreConversationTimeline,
  replyToStoreConversation,
  resolveGuestStoreConversationAttachmentUpload,
  selectGuestStoreConversationRequest,
  sendGuestStoreConversationText,
} from "../../store-conversations"
import { describeWithServiceCommerceDatabase } from "./database"
import {
  type ServiceCommerceAcceptanceFixture,
  createServiceCommerceAcceptanceFixture,
  disposeServiceCommerceAcceptanceFixture,
} from "./fixture"

setDefaultTimeout(300_000)

const profileSettings: ServiceCommerceProfileSettings = {
  capabilities: {
    attachments: true,
    booking: false,
    delivery: false,
    intake: true,
    payment: false,
    pickup: true,
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

function nextUtcOpening(now: Date) {
  const opening = new Date(now.getTime() + 5 * 60_000)
  const startMinute = opening.getUTCHours() * 60 + opening.getUTCMinutes()
  return {
    opening,
    weeklyHours: [
      {
        dayOfWeek: opening.getUTCDay(),
        endMinute: Math.min(startMinute + 30, 1_440),
        startMinute,
      },
    ],
  }
}

describeWithServiceCommerceDatabase("Store Conversation availability", () => {
  let fixture: ServiceCommerceAcceptanceFixture
  let publicToken: string

  beforeAll(async () => {
    fixture = await createServiceCommerceAcceptanceFixture()
    const configured = await updateServiceCommerceStoreProfile(fixture.db, {
      actorUserId: fixture.actorUserId,
      expectedRevision: 0,
      reason: "Configure Store Conversation availability acceptance",
      settings: profileSettings,
      storeId: fixture.storeId,
      tenantId: fixture.tenantId,
    })
    await setServiceCommerceStoreProfileActivation(fixture.db, {
      active: true,
      actorUserId: fixture.actorUserId,
      expectedRevision: configured.revision,
      reason: "Activate Store Conversation availability acceptance",
      storeId: fixture.storeId,
      tenantId: fixture.tenantId,
    })
    publicToken = (
      await publishCustomerEntryPoint(fixture.db, {
        actorUserId: fixture.actorUserId,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      })
    ).publicToken
  })

  afterAll(async () => {
    if (!fixture) return
    const tenantId = fixture.tenantId
    const userIds = [...fixture.cleanupUserIds]
    await disposeServiceCommerceAcceptanceFixture(fixture)
    expect(
      await Promise.all([
        fixture.db.tenant.count({ where: { id: tenantId } }),
        fixture.db.user.count({ where: { id: { in: userIds } } }),
      ]),
    ).toEqual([0, 0])
  })

  test("fails new intake closed while preserving history and guarded staff work", async () => {
    const web = await bootstrapWebStoreConversation(fixture.db, { publicToken })
    if (!web.credentialToken) throw new Error("Web credential missing")
    expect(web.availability.available).toBe(true)

    const customer = await sendGuestStoreConversationText(fixture.db, {
      clientOperationId: `availability-message-${randomUUID()}`,
      conversationId: web.conversation.id,
      credentialToken: web.credentialToken,
      publicToken,
      requestIntent: "choose_request",
      text: "I need a product quote.",
    })
    const selected = await selectGuestStoreConversationRequest(fixture.db, {
      clientOperationId: `availability-request-${randomUUID()}`,
      conversationId: web.conversation.id,
      credentialToken: web.credentialToken,
      messageId: customer.message.id,
      publicToken,
      target: { kind: "new_commerce_inquiry" },
    })
    const selectedRequest = selected.message.request
    if (!selectedRequest) throw new Error("Request source missing")
    const selectedSource = await fixture.db.commerceInquiry.findUniqueOrThrow({
      select: { revision: true },
      where: { id: selectedRequest.id },
    })
    await claimStoreConversation(fixture.db, {
      actorUserId: fixture.actorUserId,
      clientOperationId: `availability-claim-${randomUUID()}`,
      conversationId: web.conversation.id,
      expectedAssignmentRevision: 0,
      storeId: fixture.storeId,
      tenantId: fixture.tenantId,
    })

    const { opening, weeklyHours } = nextUtcOpening(new Date())
    const scheduled = await updateStoreConversationAvailabilitySchedule(
      fixture.db,
      {
        actorUserId: fixture.actorUserId,
        clientOperationId: `availability-schedule-${randomUUID()}`,
        expectedRevision: 0,
        reason: "Exercise the known reopening boundary",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
        timezone: "UTC",
        unreadNotificationGraceSeconds: 45,
        weeklyHours,
      },
    )
    expect(scheduled).toMatchObject({ replayed: false, revision: 1 })

    const closedTimeline = await getGuestStoreConversationTimeline(fixture.db, {
      conversationId: web.conversation.id,
      credentialToken: web.credentialToken,
      publicToken,
    })
    expect(closedTimeline.messages).toHaveLength(1)
    expect(closedTimeline.availability).toMatchObject({
      available: false,
      reason: "outside_service_hours",
      state: "unavailable_until",
    })
    expect(
      closedTimeline.availability.reopensAt?.getTime(),
    ).toBeGreaterThanOrEqual(opening.getTime() - 60_000)

    const beforeDenied = await Promise.all([
      fixture.db.storeConversationMessage.count({
        where: { conversationId: web.conversation.id },
      }),
      fixture.db.serviceCommerceMediaAsset.count({
        where: { storeId: fixture.storeId, tenantId: fixture.tenantId },
      }),
    ])
    await expect(
      sendGuestStoreConversationText(fixture.db, {
        clientOperationId: `availability-denied-${randomUUID()}`,
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken,
        publicToken,
        text: "This must not be accepted while closed.",
      }),
    ).rejects.toMatchObject({ code: "STORE_UNAVAILABLE" })
    await expect(
      resolveGuestStoreConversationAttachmentUpload(fixture.db, {
        channel: "web",
        conversationId: web.conversation.id,
        credentialToken: web.credentialToken,
        file: {
          attachmentCount: 1,
          byteSize: 128,
          kind: "image",
          mimeType: "image/png",
          signatureMimeType: "image/png",
        },
        privateMediaProviderReady: true,
        publicToken,
        target: {
          kind: "existing_request",
          request: {
            id: selectedRequest.id,
            kind: selectedRequest.kind,
            revision: selectedSource.revision,
          },
        },
      }),
    ).rejects.toMatchObject({ code: "STORE_UNAVAILABLE" })
    expect(
      await Promise.all([
        fixture.db.storeConversationMessage.count({
          where: { conversationId: web.conversation.id },
        }),
        fixture.db.serviceCommerceMediaAsset.count({
          where: { storeId: fixture.storeId, tenantId: fixture.tenantId },
        }),
      ]),
    ).toEqual(beforeDenied)

    const staffReply = await replyToStoreConversation(fixture.db, {
      actorUserId: fixture.actorUserId,
      clientOperationId: `availability-reply-${randomUUID()}`,
      conversationId: web.conversation.id,
      expectedAssignmentRevision: 1,
      expectedLastMessageSequence: 1,
      request: { ...selectedRequest, revision: selectedSource.revision },
      storeId: fixture.storeId,
      tenantId: fixture.tenantId,
      text: "Existing Store work can continue while intake is closed.",
    })
    expect(staffReply.message.sequence).toBe(2)

    const alwaysOpen = await updateStoreConversationAvailabilitySchedule(
      fixture.db,
      {
        actorUserId: fixture.actorUserId,
        clientOperationId: `availability-always-open-${randomUUID()}`,
        expectedRevision: 1,
        reason: "Restore the compatibility schedule",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
        timezone: "Africa/Lagos",
        unreadNotificationGraceSeconds: 45,
        weeklyHours: DEFAULT_STORE_CONVERSATION_WEEKLY_HOURS,
      },
    )
    expect(alwaysOpen.revision).toBe(2)

    const pauseOperation = `availability-pause-${randomUUID()}`
    const pauseInput = {
      actorUserId: fixture.actorUserId,
      clientOperationId: pauseOperation,
      customerWording: "temporarily_unavailable" as const,
      expectedRevision: 2,
      paused: true,
      reason: "Run-owned manual pause acceptance",
      storeId: fixture.storeId,
      tenantId: fixture.tenantId,
    }
    expect(
      await setStoreConversationManualPause(fixture.db, pauseInput),
    ).toMatchObject({
      manualPaused: true,
      replayed: false,
      revision: 3,
    })
    expect(
      await setStoreConversationManualPause(fixture.db, pauseInput),
    ).toMatchObject({
      manualPaused: true,
      replayed: true,
      revision: 3,
    })
    await expect(
      setStoreConversationManualPause(fixture.db, {
        ...pauseInput,
        reason: "A mismatched replay must fail",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" })

    const pausedTimeline = await getGuestStoreConversationTimeline(fixture.db, {
      conversationId: web.conversation.id,
      credentialToken: web.credentialToken,
      publicToken,
    })
    expect(pausedTimeline.messages.map((message) => message.sequence)).toEqual([
      1, 2,
    ])
    expect(pausedTimeline.availability).toMatchObject({
      available: false,
      reopensAt: null,
      state: "unavailable_indefinitely",
    })

    await setStoreConversationManualPause(fixture.db, {
      ...pauseInput,
      clientOperationId: `availability-resume-${randomUUID()}`,
      expectedRevision: 3,
      paused: false,
      reason: "Resume after manual pause acceptance",
    })
    const contenders = await Promise.allSettled([
      setStoreConversationManualPause(fixture.db, {
        ...pauseInput,
        clientOperationId: `availability-concurrent-a-${randomUUID()}`,
        expectedRevision: 4,
      }),
      setStoreConversationManualPause(fixture.db, {
        ...pauseInput,
        clientOperationId: `availability-concurrent-b-${randomUUID()}`,
        expectedRevision: 4,
      }),
    ])
    expect(
      contenders.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1)
    expect(
      contenders.filter((result) => result.status === "rejected"),
    ).toHaveLength(1)
    await setStoreConversationManualPause(fixture.db, {
      ...pauseInput,
      clientOperationId: `availability-final-resume-${randomUUID()}`,
      expectedRevision: 5,
      paused: false,
      reason: "Restore intake after concurrency acceptance",
    })

    await fixture.db.serviceCommerceStoreTeamAssignment.updateMany({
      data: { status: "SUSPENDED" },
      where: {
        capability: "ATTENDANT",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      },
    })
    expect(
      (
        await getGuestStoreConversationTimeline(fixture.db, {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          publicToken,
        })
      ).availability,
    ).toMatchObject({ available: false, state: "unavailable_indefinitely" })
    await fixture.db.serviceCommerceStoreTeamAssignment.updateMany({
      data: { status: "ACTIVE" },
      where: {
        capability: "ATTENDANT",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      },
    })

    await fixture.db.serviceCommercePolicyDecision.updateMany({
      data: { outcome: ServiceCommercePolicyOutcome.PROHIBITED },
      where: {
        channel: ServiceCommercePolicyChannel.WEB,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
        vertical: ServiceCommercePolicyVertical.SERVICE,
      },
    })
    expect(
      (
        await getGuestStoreConversationTimeline(fixture.db, {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          publicToken,
        })
      ).availability.available,
    ).toBe(true)
    const pharmacist = await fixture.db.prescriptionStoreRole.findFirstOrThrow({
      select: { id: true },
      where: {
        role: "PHARMACIST",
        status: "ACTIVE",
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
        userId: fixture.actorUserId,
      },
    })
    await revokePrescriptionStoreRole(fixture.db, {
      actorUserId: fixture.actorUserId,
      roleId: pharmacist.id,
      storeId: fixture.storeId,
      tenantId: fixture.tenantId,
    })
    expect(
      (
        await getGuestStoreConversationTimeline(fixture.db, {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          publicToken,
        })
      ).availability,
    ).toMatchObject({ available: false, state: "unavailable_indefinitely" })
    await assignPrescriptionStoreRole(fixture.db, {
      actorUserId: fixture.actorUserId,
      credentialReference: `ticket09-${randomUUID()}`,
      credentialVerified: true,
      role: "pharmacist",
      storeId: fixture.storeId,
      tenantId: fixture.tenantId,
      userId: fixture.actorUserId,
    })
    expect(
      (
        await getGuestStoreConversationTimeline(fixture.db, {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          publicToken,
        })
      ).availability.available,
    ).toBe(true)

    await fixture.db.serviceCommercePolicyDecision.updateMany({
      data: { outcome: ServiceCommercePolicyOutcome.PROHIBITED },
      where: {
        channel: ServiceCommercePolicyChannel.WEB,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      },
    })
    expect(
      (
        await getGuestStoreConversationTimeline(fixture.db, {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          publicToken,
        })
      ).availability,
    ).toMatchObject({ available: false, state: "unavailable_indefinitely" })
    await fixture.db.serviceCommercePolicyDecision.updateMany({
      data: { outcome: ServiceCommercePolicyOutcome.ALLOWED },
      where: {
        channel: ServiceCommercePolicyChannel.WEB,
        storeId: fixture.storeId,
        tenantId: fixture.tenantId,
      },
    })

    expect(
      (
        await getGuestStoreConversationTimeline(fixture.db, {
          conversationId: web.conversation.id,
          credentialToken: web.credentialToken,
          publicToken,
        })
      ).availability.available,
    ).toBe(true)
    expect(
      await fixture.db.storeConversationAvailabilityAuditEvent.count({
        where: { storeId: fixture.storeId, tenantId: fixture.tenantId },
      }),
    ).toBe(6)
  })
})

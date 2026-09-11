import { randomBytes } from "node:crypto"

import {
  DEFAULT_STORE_CONVERSATION_RESPONSE_SLA_MINUTES,
  type StoreConversationTimelineProjection,
  projectStoreConversationCursor,
  projectStoreConversationModeration,
  storeConversationSendTextInputSchema,
  storeConversationTimelineInputSchema,
} from "@ewatrade/service-commerce"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  StoreConversationAuditEventType,
  StoreConversationCommandKind,
  StoreConversationGuestAccessOrigin,
  StoreConversationGuestAccessStatus,
  StoreConversationGuestCredentialPurpose,
  StoreConversationLifecycle,
  StoreConversationMessageAuthorKind,
  StoreConversationMessageChannel,
  StoreConversationMessageKind,
  StoreConversationModerationState,
  StoreConversationRequestKind,
} from "../../generated/prisma/enums"
import { createChannelCommerceInquiryInTransaction } from "./commerce-inquiries"
import { loadStoreConversationForAccount } from "./store-conversation-accounts"
import { runStoreConversationActionTransaction } from "./store-conversation-action-transaction"
import {
  type StoreConversationActionMaterializationDependencies,
  materializeGuestStoreConversationActionMessagesInTransaction,
  storeConversationActionMessageInclude,
} from "./store-conversation-actions"
import { projectStoreConversationMessageAttachments } from "./store-conversation-attachments"
import {
  GUEST_CREDENTIAL_LIFETIME_MS,
  StoreConversationError,
  assertStoreConversationAvailable,
  assertStoreConversationComposerEnabled,
  digestStoreConversationValue,
  loadStoreConversationForGuest,
  loadStoreConversationRequestSummaries,
  lockStoreConversation,
  projectStoreConversationMessage,
  resolveStoreConversationEntry,
  resolveStoreConversationGuestCredential,
  storeConversationPayloadHash,
  touchStoreConversationGuestCredential,
} from "./store-conversations-core"

function createGuestCredential() {
  return randomBytes(32).toString("base64url")
}

type GuestConversationDeviceContext = {
  accessOrigin: StoreConversationGuestAccessOrigin
  auditReason: string
  channel: StoreConversationMessageChannel
  channelOrigin: "mobile" | "web"
  installationToken?: string
  purpose: StoreConversationGuestCredentialPurpose
}

type CustomerConversationPrincipal =
  | {
      accountUserId: string
      channel: StoreConversationMessageChannel
      channelOrigin: "mobile" | "web"
      kind: "account"
    }
  | {
      credentialToken: string
      device: GuestConversationDeviceContext
      kind: "guest"
    }

const WEB_DEVICE_CONTEXT: GuestConversationDeviceContext = {
  accessOrigin: StoreConversationGuestAccessOrigin.OWNER,
  auditReason: "guest_web_bootstrap",
  channel: StoreConversationMessageChannel.WEB,
  channelOrigin: "web",
  purpose: StoreConversationGuestCredentialPurpose.WEB_DEVICE,
}

export async function bootstrapWebStoreConversation(
  db: PrismaClient,
  input: { credentialToken?: string | null; publicToken: string },
  device: GuestConversationDeviceContext = WEB_DEVICE_CONTEXT,
) {
  const now = new Date()
  return db.$transaction(async (tx) => {
    const entry = await resolveStoreConversationEntry(tx, {
      publicToken: input.publicToken,
    })
    let rawCredential: string | null = null
    let credential: Awaited<
      ReturnType<typeof resolveStoreConversationGuestCredential>
    >
    if (input.credentialToken) {
      credential = await resolveStoreConversationGuestCredential(tx, {
        credentialToken: input.credentialToken,
        installationToken: device.installationToken,
        now,
        purpose: device.purpose,
      })
    } else {
      rawCredential = createGuestCredential()
      const guest = await tx.storeConversationGuestIdentity.create({ data: {} })
      credential = await tx.storeConversationGuestCredential.create({
        data: {
          expiresAt: new Date(now.getTime() + GUEST_CREDENTIAL_LIFETIME_MS),
          guestIdentityId: guest.id,
          deviceBindingDigest: device.installationToken
            ? digestStoreConversationValue(device.installationToken)
            : undefined,
          purpose: device.purpose,
          tokenDigest: digestStoreConversationValue(rawCredential),
        },
        include: { guestIdentity: { select: { id: true, status: true } } },
      })
    }

    const existingAccess =
      device.purpose === StoreConversationGuestCredentialPurpose.MOBILE_DEVICE
        ? await tx.storeConversationGuestAccess.findFirst({
            include: { conversation: true },
            orderBy: [{ lastOpenedAt: "desc" }, { id: "desc" }],
            where: {
              guestIdentityId: credential.guestIdentityId,
              status: StoreConversationGuestAccessStatus.ACTIVE,
              conversation: {
                storeId: entry.storeId,
                tenantId: entry.tenantId,
              },
            },
          })
        : null
    const existingOwner = existingAccess
      ? null
      : await tx.storeConversation.findFirst({
          where: {
            guestIdentityId: credential.guestIdentityId,
            storeId: entry.storeId,
            tenantId: entry.tenantId,
          },
        })
    const conversation =
      existingAccess?.conversation ??
      (await tx.storeConversation.upsert({
        create: {
          guestIdentityId: credential.guestIdentityId,
          storeId: entry.storeId,
          tenantId: entry.tenantId,
        },
        update: {},
        where: {
          storeId_guestIdentityId: {
            guestIdentityId: credential.guestIdentityId,
            storeId: entry.storeId,
          },
        },
      }))
    if (
      device.purpose === StoreConversationGuestCredentialPurpose.MOBILE_DEVICE
    ) {
      await tx.storeConversationGuestAccess.upsert({
        create: {
          conversationId: conversation.id,
          guestIdentityId: credential.guestIdentityId,
          lastOpenedAt: now,
          origin: device.accessOrigin,
          status: StoreConversationGuestAccessStatus.ACTIVE,
          storeId: entry.storeId,
          tenantId: entry.tenantId,
        },
        update: {
          lastOpenedAt: now,
          revokedAt: null,
          status: StoreConversationGuestAccessStatus.ACTIVE,
        },
        where: {
          conversationId_guestIdentityId: {
            conversationId: conversation.id,
            guestIdentityId: credential.guestIdentityId,
          },
        },
      })
    }
    if (!existingAccess && !existingOwner) {
      const priorAudit = await tx.storeConversationAuditEvent.findFirst({
        select: { id: true },
        where: {
          conversationId: conversation.id,
          type: StoreConversationAuditEventType.BOOTSTRAPPED,
        },
      })
      if (!priorAudit) {
        await tx.storeConversationAuditEvent.create({
          data: {
            actorKind: StoreConversationMessageAuthorKind.CUSTOMER,
            conversationId: conversation.id,
            reasonCode: device.auditReason,
            storeId: entry.storeId,
            tenantId: entry.tenantId,
            type: StoreConversationAuditEventType.BOOTSTRAPPED,
          },
        })
      }
    }
    const credentialExpiresAt = await touchStoreConversationGuestCredential(
      tx,
      {
        credentialId: credential.id,
        credentialStatus: credential.status,
        guestIdentityId: credential.guestIdentityId,
        now,
        overlapExpiresAt: credential.overlapExpiresAt,
      },
    )

    return {
      conversation: {
        id: conversation.id,
        moderation: projectStoreConversationModeration(conversation),
        state:
          conversation.moderationState ===
          StoreConversationModerationState.RESTRICTED
            ? ("restricted" as const)
            : conversation.lifecycle === StoreConversationLifecycle.ARCHIVED
              ? ("archived" as const)
              : ("active" as const),
        storeName: entry.storeName,
      },
      availability: entry.availability,
      channelMode: entry.channelMode,
      credentialExpiresAt,
      credentialToken: rawCredential,
    }
  })
}

async function sendStoreConversationTextForCustomer(
  db: PrismaClient,
  input: {
    clientOperationId: string
    conversationId: string
    publicToken: string
    requestIntent?: "choose_request" | "continue_current"
    text: string
  },
  principal: CustomerConversationPrincipal,
) {
  const parsed = storeConversationSendTextInputSchema.parse({
    clientOperationId: input.clientOperationId,
    conversationId: input.conversationId,
    publicToken: input.publicToken,
    requestIntent: input.requestIntent,
    text: input.text,
  })
  const now = new Date()
  const commandHash = storeConversationPayloadHash({
    conversationId: parsed.conversationId,
    publicToken: parsed.publicToken,
    ...(parsed.requestIntent ? { requestIntent: parsed.requestIntent } : {}),
    text: parsed.text,
  })
  return db.$transaction(async (tx) => {
    const entry = await resolveStoreConversationEntry(tx, {
      publicToken: parsed.publicToken,
    })
    const guestCustomer =
      principal.kind === "guest"
        ? await loadStoreConversationForGuest(tx, {
            conversationId: parsed.conversationId,
            credentialToken: principal.credentialToken,
            installationToken: principal.device.installationToken,
            now,
            purpose: principal.device.purpose,
            storeId: entry.storeId,
            tenantId: entry.tenantId,
          })
        : null
    const accountCustomer =
      principal.kind === "account"
        ? await loadStoreConversationForAccount(tx, {
            accountUserId: principal.accountUserId,
            conversationId: parsed.conversationId,
            now,
            storeId: entry.storeId,
            tenantId: entry.tenantId,
          })
        : null
    const conversation = (guestCustomer ?? accountCustomer)?.conversation
    if (!conversation) {
      throw new StoreConversationError(
        "NOT_FOUND",
        "This Store conversation is unavailable.",
      )
    }
    assertStoreConversationAvailable(entry.availability)
    assertStoreConversationComposerEnabled(entry.channelMode)
    if (entry.requestKinds.length === 0) {
      throw new StoreConversationError(
        "NOT_READY",
        "This Store is not accepting new chat messages right now.",
      )
    }
    await lockStoreConversation(tx, {
      conversationId: conversation.id,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    })
    const lockedConversation = await tx.storeConversation.findFirst({
      where: {
        guestIdentityId: conversation.guestIdentityId,
        id: conversation.id,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    if (!lockedConversation) {
      throw new StoreConversationError(
        "NOT_FOUND",
        "This Store conversation is unavailable.",
      )
    }
    const receipt = await tx.storeConversationCommandReceipt.findFirst({
      include: {
        message: {
          include: {
            requestLinks: { select: { kind: true, sourceId: true } },
          },
        },
      },
      where: {
        clientOperationId: parsed.clientOperationId,
        conversationId: conversation.id,
      },
    })
    if (receipt) {
      if (receipt.payloadHash !== commandHash || !receipt.message) {
        throw new StoreConversationError(
          "CONFLICT",
          "This message command was already used with different input.",
        )
      }
      return {
        message: projectStoreConversationMessage(receipt.message),
        replayed: true,
        source:
          receipt.sourceId && receipt.sourceKind
            ? {
                id: receipt.sourceId,
                kind:
                  receipt.sourceKind ===
                  StoreConversationRequestKind.COMMERCE_INQUIRY
                    ? ("commerce_inquiry" as const)
                    : receipt.sourceKind ===
                        StoreConversationRequestKind.SERVICE_REQUEST
                      ? ("service_request" as const)
                      : ("prescription_request" as const),
              }
            : null,
      }
    }
    if (
      lockedConversation.moderationState ===
      StoreConversationModerationState.RESTRICTED
    ) {
      throw new StoreConversationError(
        "FORBIDDEN",
        "This conversation cannot accept new messages right now.",
      )
    }

    const requestSummaries = await loadStoreConversationRequestSummaries(tx, {
      conversationId: conversation.id,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    })
    const eligibleKinds = new Set(
      entry.requestKinds.map((kind) =>
        kind === "product_inquiry"
          ? "commerce_inquiry"
          : kind === "service"
            ? "service_request"
            : "prescription_request",
      ),
    )
    const activeRequests = requestSummaries.filter(
      (request) =>
        request.lifecycle === "active" && eligibleKinds.has(request.kind),
    )
    let source: {
      id: string
      kind: StoreConversationRequestKind
      sourceRevision: number
    } | null = null
    if (
      parsed.requestIntent !== "choose_request" &&
      activeRequests.length === 1
    ) {
      const active = activeRequests[0]
      if (!active) {
        throw new StoreConversationError(
          "CONFLICT",
          "The current Request could not be resolved.",
        )
      }
      const kinds = {
        commerce_inquiry: StoreConversationRequestKind.COMMERCE_INQUIRY,
        prescription_request: StoreConversationRequestKind.PRESCRIPTION_REQUEST,
        service_request: StoreConversationRequestKind.SERVICE_REQUEST,
      } as const
      const sourceRevision =
        active.kind === "commerce_inquiry"
          ? (
              await tx.commerceInquiry.findFirst({
                select: { revision: true },
                where: {
                  id: active.id,
                  storeId: entry.storeId,
                  tenantId: entry.tenantId,
                },
              })
            )?.revision
          : active.kind === "service_request"
            ? (
                await tx.serviceRequest.findFirst({
                  select: { revision: true },
                  where: {
                    id: active.id,
                    storeId: entry.storeId,
                    tenantId: entry.tenantId,
                  },
                })
              )?.revision
            : (
                await tx.prescriptionRequest.findFirst({
                  select: { currentMediaRevision: true },
                  where: {
                    id: active.id,
                    storeId: entry.storeId,
                    tenantId: entry.tenantId,
                  },
                })
              )?.currentMediaRevision
      if (!sourceRevision) {
        throw new StoreConversationError(
          "CONFLICT",
          "The current Request changed. Refresh and try again.",
        )
      }
      source = {
        id: active.id,
        kind: kinds[active.kind],
        sourceRevision,
      }
    } else if (
      activeRequests.length === 0 &&
      entry.requestKinds.length === 1 &&
      entry.requestKinds[0] === "product_inquiry"
    ) {
      const created = await createChannelCommerceInquiryInTransaction(tx, {
        actorUserId: "public_store_conversation",
        // Commerce Inquiry still owns the established web/staff/WhatsApp
        // origin vocabulary. Mobile is a Store Conversation transport, so its
        // public Request intake remains attributable to the web channel.
        channelOrigin: "web",
        clientInquiryId: `store-conversation:${conversation.id}:${parsed.clientOperationId}`,
        customerName: "Guest customer",
        demand: { kind: "commerce_inquiry", reason: "needs_quote" },
        intakeContext: {
          entryPointId: entry.entryPointId,
          entryPointRevision: entry.entryPointRevision,
          kind: "entry_point",
        },
        lines: [{ description: parsed.text }],
        storeId: entry.storeId,
        summary: parsed.text,
        tenantId: entry.tenantId,
        vertical: "service",
      })
      source = {
        id: created.id,
        kind: StoreConversationRequestKind.COMMERCE_INQUIRY,
        sourceRevision: 1,
      }
    }
    const sequence = lockedConversation.lastMessageSequence + 1
    const message = await tx.storeConversationMessage.create({
      data: {
        authorKind: StoreConversationMessageAuthorKind.CUSTOMER,
        body: parsed.text,
        channel:
          principal.kind === "guest"
            ? principal.device.channel
            : principal.channel,
        conversationId: conversation.id,
        kind: StoreConversationMessageKind.CUSTOMER_TEXT,
        occurredAt: now,
        sequence,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    if (source) {
      await tx.storeConversationRequestLink.create({
        data: {
          conversationId: conversation.id,
          kind: source.kind,
          messageId: message.id,
          sourceId: source.id,
          sourceRevision: source.sourceRevision,
          storeId: entry.storeId,
          tenantId: entry.tenantId,
        },
      })
    }
    await tx.storeConversationCommandReceipt.create({
      data: {
        clientOperationId: parsed.clientOperationId,
        conversationId: conversation.id,
        kind: StoreConversationCommandKind.CUSTOMER_TEXT,
        messageId: message.id,
        payloadHash: commandHash,
        sourceId: source?.id,
        sourceKind: source?.kind,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    await Promise.all([
      tx.storeConversation.update({
        data: {
          archivedAt: null,
          lastActivityAt: now,
          lastCustomerMessageAt: now,
          lastCustomerMessageSequence: sequence,
          lastMessageSequence: sequence,
          lifecycle: StoreConversationLifecycle.ACTIVE,
          responseDueAt: new Date(
            now.getTime() +
              DEFAULT_STORE_CONVERSATION_RESPONSE_SLA_MINUTES * 60_000,
          ),
        },
        where: { id: conversation.id },
      }),
      tx.storeConversationAuditEvent.create({
        data: {
          actorKind: StoreConversationMessageAuthorKind.CUSTOMER,
          conversationId: conversation.id,
          conversationSequence: sequence,
          reasonCode: "customer_text_accepted",
          storeId: entry.storeId,
          tenantId: entry.tenantId,
          type: StoreConversationAuditEventType.CUSTOMER_MESSAGE_APPENDED,
        },
      }),
      ...(principal.kind === "guest" &&
      principal.device.purpose ===
        StoreConversationGuestCredentialPurpose.MOBILE_DEVICE
        ? [
            tx.storeConversationGuestAccess.updateMany({
              data: { lastOpenedAt: now },
              where: {
                conversationId: conversation.id,
                guestIdentityId: guestCustomer?.credential.guestIdentityId,
                status: StoreConversationGuestAccessStatus.ACTIVE,
              },
            }),
          ]
        : []),
    ])

    return {
      message: projectStoreConversationMessage({
        ...message,
        requestLinks: source
          ? [{ kind: source.kind, sourceId: source.id }]
          : [],
      }),
      replayed: false,
      source: source
        ? {
            id: source.id,
            kind:
              source.kind === StoreConversationRequestKind.COMMERCE_INQUIRY
                ? ("commerce_inquiry" as const)
                : source.kind === StoreConversationRequestKind.SERVICE_REQUEST
                  ? ("service_request" as const)
                  : ("prescription_request" as const),
          }
        : null,
    }
  })
}

export function sendGuestStoreConversationText(
  db: PrismaClient,
  input: {
    clientOperationId: string
    conversationId: string
    credentialToken: string
    publicToken: string
    requestIntent?: "choose_request" | "continue_current"
    text: string
  },
  device: GuestConversationDeviceContext = WEB_DEVICE_CONTEXT,
) {
  const { credentialToken, ...messageInput } = input
  return sendStoreConversationTextForCustomer(db, messageInput, {
    credentialToken,
    device,
    kind: "guest",
  })
}

export function sendAccountStoreConversationText(
  db: PrismaClient,
  input: {
    accountUserId: string
    channel: "mobile" | "web"
    clientOperationId: string
    conversationId: string
    publicToken: string
    requestIntent?: "choose_request" | "continue_current"
    text: string
  },
) {
  const { accountUserId, channel, ...messageInput } = input
  return sendStoreConversationTextForCustomer(db, messageInput, {
    accountUserId,
    channel:
      channel === "mobile"
        ? StoreConversationMessageChannel.MOBILE
        : StoreConversationMessageChannel.WEB,
    channelOrigin: channel,
    kind: "account",
  })
}

async function getStoreConversationTimelineForCustomer(
  db: PrismaClient,
  input: {
    beforeSequence?: number
    conversationId: string
    limit?: number
    publicToken: string
  },
  principal: CustomerConversationPrincipal,
  actionDependencies?: StoreConversationActionMaterializationDependencies,
): Promise<StoreConversationTimelineProjection> {
  const parsed = storeConversationTimelineInputSchema.parse({
    beforeSequence: input.beforeSequence,
    conversationId: input.conversationId,
    limit: input.limit,
  })
  const now = new Date()
  return runStoreConversationActionTransaction(db, async (tx) => {
    const entry = await resolveStoreConversationEntry(tx, {
      publicToken: input.publicToken,
    })
    const guestCustomer =
      principal.kind === "guest"
        ? await loadStoreConversationForGuest(tx, {
            conversationId: parsed.conversationId,
            credentialToken: principal.credentialToken,
            installationToken: principal.device.installationToken,
            now,
            purpose: principal.device.purpose,
            storeId: entry.storeId,
            tenantId: entry.tenantId,
          })
        : null
    const accountCustomer =
      principal.kind === "account"
        ? await loadStoreConversationForAccount(tx, {
            accountUserId: principal.accountUserId,
            conversationId: parsed.conversationId,
            now,
            storeId: entry.storeId,
            tenantId: entry.tenantId,
          })
        : null
    const conversation = (guestCustomer ?? accountCustomer)?.conversation
    if (!conversation) {
      throw new StoreConversationError(
        "NOT_FOUND",
        "This Store conversation is unavailable.",
      )
    }
    const [rows, requests] = await Promise.all([
      tx.storeConversationMessage.findMany({
        include: {
          accountInvitation: { select: { id: true, status: true } },
          actionMessage: {
            include: storeConversationActionMessageInclude,
          },
          attachments: {
            include: {
              prescriptionMedia: {
                select: { mediaType: true, status: true },
              },
              sourceAttachment: {
                include: {
                  mediaAsset: {
                    select: {
                      kind: true,
                      lifecycle: true,
                      verifiedDurationMs: true,
                    },
                  },
                },
              },
            },
          },
          requestLinks: { select: { kind: true, sourceId: true } },
          whatsAppObservation: {
            select: {
              provenance: true,
              status: true,
              statusOccurredAt: true,
            },
          },
        },
        orderBy: { sequence: "desc" },
        take: parsed.limit + 1,
        where: {
          conversationId: conversation.id,
          storeId: conversation.storeId,
          tenantId: conversation.tenantId,
          ...(parsed.beforeSequence
            ? { sequence: { lt: parsed.beforeSequence } }
            : {}),
        },
      }),
      loadStoreConversationRequestSummaries(tx, {
        conversationId: conversation.id,
        storeId: conversation.storeId,
        tenantId: conversation.tenantId,
      }),
      ...(principal.kind === "guest" &&
      principal.device.purpose ===
        StoreConversationGuestCredentialPurpose.MOBILE_DEVICE
        ? [
            tx.storeConversationGuestAccess.updateMany({
              data: { lastOpenedAt: now },
              where: {
                conversationId: conversation.id,
                guestIdentityId: guestCustomer?.credential.guestIdentityId,
                status: StoreConversationGuestAccessStatus.ACTIVE,
              },
            }),
          ]
        : []),
    ])
    const hasMore = rows.length > parsed.limit
    const selected = rows.slice(0, parsed.limit)
    const nextCursor = projectStoreConversationCursor({
      hasMore,
      messages: selected,
    })
    const actionMessages =
      await materializeGuestStoreConversationActionMessagesInTransaction(
        tx,
        {
          available: entry.availability.available,
          now,
          rows: selected.flatMap((message) =>
            message.actionMessage ? [message.actionMessage] : [],
          ),
        },
        actionDependencies,
      )
    return {
      availability: entry.availability,
      availableRequestKinds: entry.requestKinds,
      channelMode: entry.channelMode,
      conversation: {
        id: conversation.id,
        moderation: projectStoreConversationModeration(conversation),
        state:
          conversation.moderationState ===
          StoreConversationModerationState.RESTRICTED
            ? "restricted"
            : conversation.lifecycle === StoreConversationLifecycle.ARCHIVED
              ? "archived"
              : "active",
        storeName: conversation.store.name,
      },
      messages: selected.reverse().map((message) =>
        projectStoreConversationMessage({
          ...message,
          actionMessage: message.actionMessage
            ? actionMessages.get(message.id)
            : undefined,
          attachments: projectStoreConversationMessageAttachments(message),
        }),
      ),
      nextCursor,
      requests,
    }
  })
}

export function getGuestStoreConversationTimeline(
  db: PrismaClient,
  input: {
    beforeSequence?: number
    conversationId: string
    credentialToken: string
    limit?: number
    publicToken: string
  },
  device: GuestConversationDeviceContext = WEB_DEVICE_CONTEXT,
  actionDependencies?: StoreConversationActionMaterializationDependencies,
) {
  const { credentialToken, ...timelineInput } = input
  return getStoreConversationTimelineForCustomer(
    db,
    timelineInput,
    { credentialToken, device, kind: "guest" },
    actionDependencies,
  )
}

export function getAccountStoreConversationTimeline(
  db: PrismaClient,
  input: {
    accountUserId: string
    beforeSequence?: number
    conversationId: string
    limit?: number
    publicToken: string
  },
  actionDependencies?: StoreConversationActionMaterializationDependencies,
) {
  const { accountUserId, ...timelineInput } = input
  return getStoreConversationTimelineForCustomer(
    db,
    timelineInput,
    {
      accountUserId,
      channel: StoreConversationMessageChannel.WEB,
      channelOrigin: "web",
      kind: "account",
    },
    actionDependencies,
  )
}

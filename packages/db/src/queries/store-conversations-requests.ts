import {
  type StoreConversationSelectRequestInput,
  storeConversationSelectRequestInputSchema,
} from "@ewatrade/service-commerce"

import type { PrismaClient } from "../../generated/prisma/client"
import {
  StoreConversationAuditEventType,
  StoreConversationCommandKind,
  type StoreConversationGuestCredentialPurpose,
  StoreConversationMessageAuthorKind,
  StoreConversationRequestKind,
} from "../../generated/prisma/enums"
import { createChannelCommerceInquiryInTransaction } from "./commerce-inquiries"
import {
  StoreConversationError,
  loadStoreConversationForGuest,
  loadStoreConversationRequestSummaries,
  lockStoreConversation,
  projectStoreConversationMessage,
  resolveStoreConversationEntry,
  resolveStoreConversationGuestCredential,
  storeConversationPayloadHash,
  touchStoreConversationGuestCredential,
} from "./store-conversations-core"
import type { DbClient } from "./types"

const STORE_CONVERSATION_REQUEST_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 60_000,
} as const

const entryRequestKind = {
  [StoreConversationRequestKind.COMMERCE_INQUIRY]: "product_inquiry",
  [StoreConversationRequestKind.PRESCRIPTION_REQUEST]: "prescription",
  [StoreConversationRequestKind.SERVICE_REQUEST]: "service",
} as const

export async function resolveCurrentStoreConversationRequestRevision(
  db: DbClient,
  input: {
    kind: StoreConversationRequestKind
    sourceId: string
    storeId: string
    tenantId: string
  },
) {
  if (input.kind === StoreConversationRequestKind.COMMERCE_INQUIRY) {
    const source = await db.commerceInquiry.findFirst({
      select: { revision: true, status: true },
      where: {
        id: input.sourceId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (
      !source ||
      ["CONVERTED", "DECLINED", "WITHDRAWN", "EXPIRED"].includes(source.status)
    ) {
      throw new StoreConversationError(
        "CONFLICT",
        "This Product request is no longer current.",
      )
    }
    return source.revision
  }
  if (input.kind === StoreConversationRequestKind.SERVICE_REQUEST) {
    const source = await db.serviceRequest.findFirst({
      select: { revision: true, status: true },
      where: {
        id: input.sourceId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (
      !source ||
      ["CONVERTED", "DECLINED", "WITHDRAWN"].includes(source.status)
    ) {
      throw new StoreConversationError(
        "CONFLICT",
        "This Service request is no longer current.",
      )
    }
    return source.revision
  }
  const source = await db.prescriptionRequest.findFirst({
    select: { currentMediaRevision: true, status: true },
    where: {
      id: input.sourceId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (
    !source ||
    ["CONVERTED", "DECLINED", "WITHDRAWN", "EXPIRED"].includes(source.status)
  ) {
    throw new StoreConversationError(
      "CONFLICT",
      "This Prescription request is no longer current.",
    )
  }
  return source.currentMediaRevision
}

async function assertCurrentRequestSource(
  db: DbClient,
  input: {
    expectedSourceRevision: number
    kind: StoreConversationRequestKind
    sourceId: string
    storeId: string
    tenantId: string
  },
) {
  const revision = await resolveCurrentStoreConversationRequestRevision(
    db,
    input,
  )
  if (revision !== input.expectedSourceRevision) {
    throw new StoreConversationError(
      "CONFLICT",
      "This Request changed. Refresh and try again.",
    )
  }
}

async function linkRequestInTransaction(
  tx: DbClient,
  input: {
    clientOperationId: string
    conversationId: string
    credentialToken: string
    installationToken?: string
    expectedSourceRevision: number
    messageId: string
    publicToken: string
    sourceId: string
    sourceKind: StoreConversationRequestKind
    purpose?: StoreConversationGuestCredentialPurpose
    channelOrigin?: "mobile" | "web"
  },
) {
  const now = new Date()
  const credential = await resolveStoreConversationGuestCredential(tx, {
    credentialToken: input.credentialToken,
    installationToken: input.installationToken,
    now,
    purpose: input.purpose,
  })
  const conversation = await tx.storeConversation.findFirst({
    where: {
      id: input.conversationId,
      OR: [
        { guestIdentityId: credential.guestIdentityId },
        {
          guestAccesses: {
            some: {
              guestIdentityId: credential.guestIdentityId,
              status: "ACTIVE",
            },
          },
        },
      ],
    },
  })
  if (!conversation) {
    throw new StoreConversationError(
      "NOT_FOUND",
      "This Store conversation is unavailable.",
    )
  }
  await lockStoreConversation(tx, {
    conversationId: conversation.id,
    storeId: conversation.storeId,
    tenantId: conversation.tenantId,
  })
  const entry = await resolveStoreConversationEntry(tx, {
    publicToken: input.publicToken,
  })
  if (
    entry.storeId !== conversation.storeId ||
    entry.tenantId !== conversation.tenantId
  ) {
    throw new StoreConversationError("NOT_FOUND", "Store link unavailable.")
  }
  if (!entry.requestKinds.includes(entryRequestKind[input.sourceKind])) {
    throw new StoreConversationError(
      "NOT_READY",
      "This Request type is unavailable.",
    )
  }
  await touchStoreConversationGuestCredential(tx, {
    credentialId: credential.id,
    guestIdentityId: credential.guestIdentityId,
    now,
  })
  const payloadHash = storeConversationPayloadHash({
    conversationId: conversation.id,
    expectedSourceRevision: input.expectedSourceRevision,
    messageId: input.messageId,
    sourceId: input.sourceId,
    sourceKind: input.sourceKind,
  })
  const receipt = await tx.storeConversationCommandReceipt.findFirst({
    include: {
      message: {
        include: { requestLinks: { select: { kind: true, sourceId: true } } },
      },
    },
    where: {
      clientOperationId: input.clientOperationId,
      conversationId: conversation.id,
    },
  })
  if (receipt) {
    if (receipt.payloadHash !== payloadHash || !receipt.message) {
      throw new StoreConversationError(
        "CONFLICT",
        "This Request choice changed during replay.",
      )
    }
    return {
      message: projectStoreConversationMessage(receipt.message),
      replayed: true,
    }
  }
  const message = await tx.storeConversationMessage.findFirst({
    include: { requestLinks: { select: { id: true } } },
    where: {
      authorKind: StoreConversationMessageAuthorKind.CUSTOMER,
      conversationId: conversation.id,
      id: input.messageId,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    },
  })
  if (!message || message.requestLinks.length > 0) {
    throw new StoreConversationError(
      "CONFLICT",
      "This message already has a Request.",
    )
  }
  await assertCurrentRequestSource(tx, {
    expectedSourceRevision: input.expectedSourceRevision,
    kind: input.sourceKind,
    sourceId: input.sourceId,
    storeId: entry.storeId,
    tenantId: entry.tenantId,
  })
  const link = await tx.storeConversationRequestLink.create({
    data: {
      conversationId: conversation.id,
      kind: input.sourceKind,
      messageId: message.id,
      sourceId: input.sourceId,
      sourceRevision: input.expectedSourceRevision,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    },
  })
  await Promise.all([
    tx.storeConversationCommandReceipt.create({
      data: {
        clientOperationId: input.clientOperationId,
        conversationId: conversation.id,
        kind: StoreConversationCommandKind.REQUEST_SELECTED,
        messageId: message.id,
        payloadHash,
        sourceId: input.sourceId,
        sourceKind: input.sourceKind,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    }),
    tx.storeConversationAuditEvent.create({
      data: {
        actorKind: StoreConversationMessageAuthorKind.CUSTOMER,
        conversationId: conversation.id,
        conversationSequence: message.sequence,
        reasonCode: "typed_request_linked",
        storeId: entry.storeId,
        tenantId: entry.tenantId,
        type: StoreConversationAuditEventType.REQUEST_LINKED,
      },
    }),
  ])
  return {
    message: projectStoreConversationMessage({
      ...message,
      requestLinks: [{ kind: link.kind, sourceId: link.sourceId }],
    }),
    replayed: false,
  }
}

export async function attachStoreConversationTypedRequest(
  db: PrismaClient,
  input: Parameters<typeof linkRequestInTransaction>[1],
) {
  return db.$transaction(
    (tx) => linkRequestInTransaction(tx, input),
    STORE_CONVERSATION_REQUEST_TRANSACTION_OPTIONS,
  )
}

export async function selectGuestStoreConversationRequest(
  db: PrismaClient,
  input: StoreConversationSelectRequestInput & {
    credentialToken: string
    installationToken?: string
    purpose?: StoreConversationGuestCredentialPurpose
    channelOrigin?: "mobile" | "web"
  },
) {
  const parsed = storeConversationSelectRequestInputSchema.parse({
    clientOperationId: input.clientOperationId,
    conversationId: input.conversationId,
    messageId: input.messageId,
    publicToken: input.publicToken,
    target: input.target,
  })
  return db.$transaction(async (tx) => {
    const entry = await resolveStoreConversationEntry(tx, {
      publicToken: parsed.publicToken,
    })
    const { conversation } = await loadStoreConversationForGuest(tx, {
      conversationId: parsed.conversationId,
      credentialToken: input.credentialToken,
      installationToken: input.installationToken,
      now: new Date(),
      purpose: input.purpose,
      storeId: entry.storeId,
      tenantId: entry.tenantId,
    })
    const message = await tx.storeConversationMessage.findFirst({
      select: { body: true },
      where: {
        conversationId: conversation.id,
        id: parsed.messageId,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      },
    })
    if (!message) {
      throw new StoreConversationError(
        "NOT_FOUND",
        "This message is unavailable.",
      )
    }
    let sourceId: string
    let sourceKind: StoreConversationRequestKind
    let expectedSourceRevision = 1
    if (parsed.target.kind === "new_commerce_inquiry") {
      if (!entry.requestKinds.includes("product_inquiry")) {
        throw new StoreConversationError(
          "NOT_READY",
          "Product requests are unavailable.",
        )
      }
      const source = await createChannelCommerceInquiryInTransaction(tx, {
        actorUserId: "public_store_conversation",
        // The owning Commerce Inquiry aggregate has no mobile origin. Mobile
        // remains explicit on the conversation message while Request intake
        // uses the compatible public-web origin.
        channelOrigin:
          input.channelOrigin === "mobile"
            ? "web"
            : (input.channelOrigin ?? "web"),
        clientInquiryId: `store-conversation:${conversation.id}:${parsed.clientOperationId}`,
        customerName: "Guest customer",
        demand: { kind: "commerce_inquiry", reason: "needs_quote" },
        intakeContext: {
          entryPointId: entry.entryPointId,
          entryPointRevision: entry.entryPointRevision,
          kind: "entry_point",
        },
        lines: [{ description: message.body }],
        storeId: entry.storeId,
        summary: message.body,
        tenantId: entry.tenantId,
        vertical: "service",
      })
      sourceId = source.id
      sourceKind = StoreConversationRequestKind.COMMERCE_INQUIRY
    } else {
      const target = parsed.target
      const summaries = await loadStoreConversationRequestSummaries(tx, {
        conversationId: conversation.id,
        storeId: entry.storeId,
        tenantId: entry.tenantId,
      })
      const selected = summaries.find(
        (request) =>
          request.id === target.requestId &&
          request.kind === target.requestKind &&
          request.lifecycle === "active",
      )
      if (!selected) {
        throw new StoreConversationError(
          "CONFLICT",
          "This Request is no longer current.",
        )
      }
      sourceId = selected.id
      sourceKind =
        selected.kind === "commerce_inquiry"
          ? StoreConversationRequestKind.COMMERCE_INQUIRY
          : selected.kind === "service_request"
            ? StoreConversationRequestKind.SERVICE_REQUEST
            : StoreConversationRequestKind.PRESCRIPTION_REQUEST
      if (sourceKind === StoreConversationRequestKind.COMMERCE_INQUIRY) {
        const source = await tx.commerceInquiry.findFirst({
          select: { revision: true },
          where: {
            id: sourceId,
            storeId: entry.storeId,
            tenantId: entry.tenantId,
          },
        })
        expectedSourceRevision = source?.revision ?? 0
      } else if (sourceKind === StoreConversationRequestKind.SERVICE_REQUEST) {
        const source = await tx.serviceRequest.findFirst({
          select: { revision: true },
          where: {
            id: sourceId,
            storeId: entry.storeId,
            tenantId: entry.tenantId,
          },
        })
        expectedSourceRevision = source?.revision ?? 0
      } else {
        const source = await tx.prescriptionRequest.findFirst({
          select: { currentMediaRevision: true },
          where: {
            id: sourceId,
            storeId: entry.storeId,
            tenantId: entry.tenantId,
          },
        })
        expectedSourceRevision = source?.currentMediaRevision ?? 0
      }
    }
    return linkRequestInTransaction(tx, {
      clientOperationId: parsed.clientOperationId,
      conversationId: parsed.conversationId,
      credentialToken: input.credentialToken,
      installationToken: input.installationToken,
      expectedSourceRevision,
      messageId: parsed.messageId,
      publicToken: parsed.publicToken,
      sourceId,
      sourceKind,
      purpose: input.purpose,
      channelOrigin: input.channelOrigin,
    })
  }, STORE_CONVERSATION_REQUEST_TRANSACTION_OPTIONS)
}

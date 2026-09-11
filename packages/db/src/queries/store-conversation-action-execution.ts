import type { IssueServiceCommerceCustomerActionToken } from "./service-commerce-actions/capabilities"

import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  CommerceQuoteVersionStatus,
  ServiceCommerceCustomerActionTargetType,
  StoreConversationGuestCredentialPurpose,
} from "../../generated/prisma/enums"
import { executeServiceCommerceCustomerActionInTransaction } from "./service-commerce-actions/capabilities"
import {
  customerActionSourceValues,
  customerActionTokenDigest,
  customerActionValues,
} from "./service-commerce-actions/shared"
import { loadStoreConversationForAccount } from "./store-conversation-accounts"
import {
  allowedConversationActions,
  materializeGuestStoreConversationActionMessagesInTransaction,
  publicSourceKind,
  storeConversationActionMessageInclude,
} from "./store-conversation-action-projection"
import { runStoreConversationActionTransaction } from "./store-conversation-action-transaction"
import {
  StoreConversationError,
  assertStoreConversationAvailable,
  loadStoreConversationForGuest,
  lockStoreConversation,
  resolveStoreConversationEntry,
} from "./store-conversations-core"

type GuestActionDevice = {
  installationToken?: string
  purpose: StoreConversationGuestCredentialPurpose
}

type CustomerActionPrincipal =
  | { accountUserId: string; kind: "account" }
  | {
      credentialToken: string
      device: GuestActionDevice
      kind: "guest"
    }

const WEB_ACTION_DEVICE: GuestActionDevice = {
  purpose: StoreConversationGuestCredentialPurpose.WEB_DEVICE,
}

async function previewStoreConversationActionMessageForCustomer(
  db: PrismaClient,
  input: {
    conversationId: string
    messageId: string
    publicToken: string
  },
  dependencies: {
    issueCapabilityToken: IssueServiceCommerceCustomerActionToken
  },
  principal: CustomerActionPrincipal,
) {
  const now = new Date()
  return runStoreConversationActionTransaction(db, async (tx) => {
    const entry = await resolveStoreConversationEntry(tx, {
      publicToken: input.publicToken,
    })
    const customer =
      principal.kind === "guest"
        ? await loadStoreConversationForGuest(tx, {
            conversationId: input.conversationId,
            credentialToken: principal.credentialToken,
            installationToken: principal.device.installationToken,
            now,
            purpose: principal.device.purpose,
            storeId: entry.storeId,
            tenantId: entry.tenantId,
            touchCredential: false,
          })
        : await loadStoreConversationForAccount(tx, {
            accountUserId: principal.accountUserId,
            conversationId: input.conversationId,
            now,
            storeId: entry.storeId,
            tenantId: entry.tenantId,
          })
    const conversation = customer.conversation
    await lockStoreConversation(tx, {
      conversationId: conversation.id,
      storeId: conversation.storeId,
      tenantId: conversation.tenantId,
    })
    const actionMessage = await tx.storeConversationActionMessage.findFirst({
      include: storeConversationActionMessageInclude,
      where: {
        conversationId: conversation.id,
        messageId: input.messageId,
        storeId: conversation.storeId,
        tenantId: conversation.tenantId,
      },
    })
    if (!actionMessage) {
      throw new StoreConversationError(
        "NOT_FOUND",
        "This conversation action is unavailable.",
      )
    }
    assertStoreConversationAvailable(entry.availability)

    const projections =
      await materializeGuestStoreConversationActionMessagesInTransaction(
        tx,
        { available: true, now, rows: [actionMessage] },
        dependencies,
      )
    const projection = projections.get(actionMessage.messageId)
    if (!projection) {
      throw new StoreConversationError(
        "NOT_FOUND",
        "This conversation action is unavailable.",
      )
    }
    return projection
  })
}

export function previewGuestStoreConversationActionMessage(
  db: PrismaClient,
  input: {
    conversationId: string
    credentialToken: string
    messageId: string
    publicToken: string
  },
  dependencies: {
    issueCapabilityToken: IssueServiceCommerceCustomerActionToken
  },
  device: GuestActionDevice = WEB_ACTION_DEVICE,
) {
  const { credentialToken, ...actionInput } = input
  return previewStoreConversationActionMessageForCustomer(
    db,
    actionInput,
    dependencies,
    { credentialToken, device, kind: "guest" },
  )
}

export function previewAccountStoreConversationActionMessage(
  db: PrismaClient,
  input: {
    accountUserId: string
    conversationId: string
    messageId: string
    publicToken: string
  },
  dependencies: {
    issueCapabilityToken: IssueServiceCommerceCustomerActionToken
  },
) {
  const { accountUserId, ...actionInput } = input
  return previewStoreConversationActionMessageForCustomer(
    db,
    actionInput,
    dependencies,
    { accountUserId, kind: "account" },
  )
}

export function previewMobileStoreConversationActionMessage(
  db: PrismaClient,
  input: Parameters<typeof previewGuestStoreConversationActionMessage>[1] & {
    installationToken: string
  },
  dependencies: Parameters<
    typeof previewGuestStoreConversationActionMessage
  >[2],
) {
  return previewGuestStoreConversationActionMessage(db, input, dependencies, {
    installationToken: input.installationToken,
    purpose: StoreConversationGuestCredentialPurpose.MOBILE_DEVICE,
  })
}

async function executeStoreConversationActionMessageForCustomer(
  db: PrismaClient,
  input: {
    capabilityToken: string
    clientOperationId: string
    confirmed: boolean
    conversationId: string
    messageId: string
    publicToken: string
  },
  principal: CustomerActionPrincipal,
) {
  const now = new Date()
  const execute = async (tx: Prisma.TransactionClient) => {
    const entry = await resolveStoreConversationEntry(tx, {
      publicToken: input.publicToken,
    })
    const customer =
      principal.kind === "guest"
        ? await loadStoreConversationForGuest(tx, {
            conversationId: input.conversationId,
            credentialToken: principal.credentialToken,
            installationToken: principal.device.installationToken,
            now,
            purpose: principal.device.purpose,
            storeId: entry.storeId,
            tenantId: entry.tenantId,
            touchCredential: false,
          })
        : await loadStoreConversationForAccount(tx, {
            accountUserId: principal.accountUserId,
            conversationId: input.conversationId,
            now,
            storeId: entry.storeId,
            tenantId: entry.tenantId,
          })
    const conversation = customer.conversation
    await lockStoreConversation(tx, {
      conversationId: conversation.id,
      storeId: conversation.storeId,
      tenantId: conversation.tenantId,
    })
    const actionMessage = await tx.storeConversationActionMessage.findFirst({
      select: {
        createdByUserId: true,
        messageId: true,
        quoteVersion: {
          select: {
            revokedAt: true,
            status: true,
            quote: { select: { currentVersionId: true } },
          },
        },
        quoteVersionId: true,
        sourceId: true,
        sourceKind: true,
      },
      where: {
        conversationId: conversation.id,
        messageId: input.messageId,
        storeId: conversation.storeId,
        tenantId: conversation.tenantId,
      },
    })
    if (!actionMessage) {
      throw new StoreConversationError(
        "NOT_FOUND",
        "This conversation action is unavailable.",
      )
    }
    assertStoreConversationAvailable(entry.availability)

    const capability =
      await tx.serviceCommerceCustomerActionCapability.findFirst({
        select: {
          action: true,
          channel: true,
          createdByUserId: true,
          sourceId: true,
          sourceKind: true,
          storeId: true,
          targetId: true,
          targetType: true,
          tenantId: true,
        },
        where: {
          tokenDigest: customerActionTokenDigest(input.capabilityToken),
        },
      })
    const action = capability ? customerActionValues[capability.action] : null
    const exactSource =
      capability &&
      customerActionSourceValues[capability.sourceKind] ===
        publicSourceKind[actionMessage.sourceKind]
    const exactTarget =
      action === "choose_quote_option"
        ? capability?.targetId === actionMessage.quoteVersionId &&
          capability.targetType ===
            ServiceCommerceCustomerActionTargetType.QUOTE_OPTION
        : action === "view_quote" ||
            action === "pay_now" ||
            action === "pick_up" ||
            action === "delivery"
          ? capability?.targetId === actionMessage.quoteVersionId &&
            capability.targetType ===
              ServiceCommerceCustomerActionTargetType.QUOTE_VERSION
          : action === "book"
            ? capability?.targetType ===
              ServiceCommerceCustomerActionTargetType.SOURCE
            : action === "reschedule" || action === "cancel"
              ? capability?.targetType ===
                ServiceCommerceCustomerActionTargetType.BOOKING
              : action === "talk_to_staff" &&
                capability?.targetType ===
                  ServiceCommerceCustomerActionTargetType.CUSTOMER_ENTRY_POINT
    const currentMessage =
      actionMessage.quoteVersion.quote.currentVersionId ===
        actionMessage.quoteVersionId &&
      (actionMessage.quoteVersion.status ===
        CommerceQuoteVersionStatus.ISSUED ||
        actionMessage.quoteVersion.status ===
          CommerceQuoteVersionStatus.ACCEPTED) &&
      !actionMessage.quoteVersion.revokedAt
    const actionAllowed =
      action &&
      allowedConversationActions(
        actionMessage.sourceKind,
        actionMessage.quoteVersion.status,
      ).includes(action)
    if (
      !capability ||
      !currentMessage ||
      !actionAllowed ||
      !exactSource ||
      !exactTarget ||
      capability.channel !== "WEB" ||
      capability.createdByUserId !== actionMessage.createdByUserId ||
      capability.sourceId !== actionMessage.sourceId ||
      capability.storeId !== conversation.storeId ||
      capability.tenantId !== conversation.tenantId
    ) {
      throw new StoreConversationError(
        "NOT_FOUND",
        "This conversation action is unavailable.",
      )
    }
    return executeServiceCommerceCustomerActionInTransaction(tx, {
      capabilityToken: input.capabilityToken,
      clientOperationId: input.clientOperationId,
      confirmed: input.confirmed,
      now,
    })
  }
  return runStoreConversationActionTransaction(db, execute)
}

export function executeGuestStoreConversationActionMessage(
  db: PrismaClient,
  input: {
    capabilityToken: string
    clientOperationId: string
    confirmed: boolean
    conversationId: string
    credentialToken: string
    messageId: string
    publicToken: string
  },
  device: GuestActionDevice = WEB_ACTION_DEVICE,
) {
  const { credentialToken, ...actionInput } = input
  return executeStoreConversationActionMessageForCustomer(db, actionInput, {
    credentialToken,
    device,
    kind: "guest",
  })
}

export function executeAccountStoreConversationActionMessage(
  db: PrismaClient,
  input: {
    accountUserId: string
    capabilityToken: string
    clientOperationId: string
    confirmed: boolean
    conversationId: string
    messageId: string
    publicToken: string
  },
) {
  const { accountUserId, ...actionInput } = input
  return executeStoreConversationActionMessageForCustomer(db, actionInput, {
    accountUserId,
    kind: "account",
  })
}

export function executeMobileStoreConversationActionMessage(
  db: PrismaClient,
  input: Parameters<typeof executeGuestStoreConversationActionMessage>[1] & {
    installationToken: string
  },
) {
  return executeGuestStoreConversationActionMessage(db, input, {
    installationToken: input.installationToken,
    purpose: StoreConversationGuestCredentialPurpose.MOBILE_DEVICE,
  })
}

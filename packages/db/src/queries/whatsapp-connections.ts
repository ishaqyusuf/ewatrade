import { createHash, randomBytes } from "node:crypto"

import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  CommunicationAttemptStatus,
  CommunicationIntentStatus,
  type PrescriptionCommunicationType,
  type PrescriptionQuickActionType,
  WhatsAppBindingStatus,
  WhatsAppConnectionStatus,
  WhatsAppInboundEventStatus,
} from "../../generated/prisma/enums"
import {
  assertServiceCommercePolicyAllowedInTransaction,
  evaluateServiceCommercePolicy,
  evaluateServiceCommercePolicyBatchInTransaction,
  evaluateServiceCommercePolicyInTransaction,
} from "./service-commerce-policy"

export class WhatsAppConnectionError extends Error {
  constructor(
    readonly code:
      | "AMBIGUOUS_ROUTING"
      | "CONNECTION_CONFLICT"
      | "CONNECTION_NOT_FOUND"
      | "QUICK_ACTION_INVALID",
    message: string,
  ) {
    super(message)
  }
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

type WhatsAppConnectionWriteClient = PrismaClient | Prisma.TransactionClient

type DiscoveredWhatsAppNumber = {
  businessDisplayName?: string
  displayNumber: string
  phoneNumberId: string
  wabaId: string
}

async function upsertWhatsAppConnectionWithBinding(
  db: WhatsAppConnectionWriteClient,
  input: {
    actorUserId: string
    billingOwner?: string
    businessDisplayName?: string
    credentialReference: string
    displayNumber: string
    phoneNumberId: string
    storeId: string
    tenantId: string
    testRecipient?: string
    wabaId: string
  },
) {
  const conflicting = await db.whatsAppConnection.findUnique({
    where: { phoneNumberId: input.phoneNumberId },
  })
  if (conflicting && conflicting.tenantId !== input.tenantId) {
    throw new WhatsAppConnectionError(
      "CONNECTION_CONFLICT",
      "This WhatsApp number is already connected.",
    )
  }
  const rotatingActiveConnection =
    conflicting?.status === WhatsAppConnectionStatus.ACTIVE
  const connection = conflicting
    ? await db.whatsAppConnection.update({
        data: {
          billingOwner: input.billingOwner?.trim() || null,
          businessDisplayName: input.businessDisplayName?.trim() || null,
          credentialReference: rotatingActiveConnection
            ? undefined
            : input.credentialReference,
          displayNumber: input.displayNumber.trim(),
          pendingCredentialReference: rotatingActiveConnection
            ? input.credentialReference
            : null,
          status: rotatingActiveConnection
            ? WhatsAppConnectionStatus.ACTIVE
            : WhatsAppConnectionStatus.DRAFT,
          testRecipient: input.testRecipient?.trim() || null,
          wabaId: input.wabaId.trim(),
        },
        where: { id: conflicting.id },
      })
    : await db.whatsAppConnection.create({
        data: {
          billingOwner: input.billingOwner?.trim(),
          businessDisplayName: input.businessDisplayName?.trim(),
          createdByUserId: input.actorUserId,
          credentialReference: input.credentialReference,
          displayNumber: input.displayNumber.trim(),
          phoneNumberId: input.phoneNumberId.trim(),
          tenantId: input.tenantId,
          testRecipient: input.testRecipient?.trim(),
          wabaId: input.wabaId.trim(),
        },
      })
  const existingBinding = await db.whatsAppStoreBinding.findUnique({
    where: {
      connectionId_storeId: {
        connectionId: connection.id,
        storeId: input.storeId,
      },
    },
  })
  await db.whatsAppStoreBinding.upsert({
    create: {
      boundByUserId: input.actorUserId,
      connectionId: connection.id,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
    update: {
      connectionId: connection.id,
      status:
        existingBinding?.status === WhatsAppBindingStatus.ACTIVE
          ? WhatsAppBindingStatus.ACTIVE
          : WhatsAppBindingStatus.PENDING,
    },
    where: {
      connectionId_storeId: {
        connectionId: connection.id,
        storeId: input.storeId,
      },
    },
  })
  await db.whatsAppConnectionAuditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      connectionId: connection.id,
      payload: { bindingStatus: existingBinding?.status ?? "new" },
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: rotatingActiveConnection
        ? "credential_rotation_staged"
        : "connection_saved",
    },
  })
  return connection
}

export async function upsertManualWhatsAppConnection(
  db: PrismaClient,
  input: {
    actorUserId: string
    billingOwner?: string
    businessDisplayName?: string
    credentialReference: string
    displayNumber: string
    phoneNumberId: string
    storeId: string
    tenantId: string
    testRecipient?: string
    wabaId: string
  },
) {
  return db.$transaction(async (tx) => {
    const connection = await upsertWhatsAppConnectionWithBinding(tx, input)
    return { connectionId: connection.id, status: connection.status }
  })
}

export async function createWhatsAppEmbeddedSignupSession(
  db: PrismaClient,
  input: {
    credentialReference: string
    discoveredNumbers: DiscoveredWhatsAppNumber[]
    storeId: string
    tenantId: string
    userId: string
  },
) {
  const publicToken = randomBytes(32).toString("base64url")
  await db.whatsAppEmbeddedSignupSession.create({
    data: {
      credentialReference: input.credentialReference,
      discoveredNumbers: input.discoveredNumbers as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + 15 * 60_000),
      publicTokenDigest: digest(publicToken),
      storeId: input.storeId,
      tenantId: input.tenantId,
      userId: input.userId,
    },
  })
  return { publicToken }
}

function parseDiscoveredNumbers(value: Prisma.JsonValue) {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): DiscoveredWhatsAppNumber[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return []
    const record = item as Record<string, Prisma.JsonValue>
    const displayNumber = String(record.displayNumber ?? "").trim()
    const phoneNumberId = String(record.phoneNumberId ?? "").trim()
    const wabaId = String(record.wabaId ?? "").trim()
    if (!displayNumber || !phoneNumberId || !wabaId) return []
    return [
      {
        businessDisplayName:
          String(record.businessDisplayName ?? "").trim() || undefined,
        displayNumber,
        phoneNumberId,
        wabaId,
      },
    ]
  })
}

export async function getWhatsAppEmbeddedSignupSession(
  db: PrismaClient,
  input: {
    publicToken: string
    storeId: string
    tenantId: string
    userId: string
  },
) {
  const session = await db.whatsAppEmbeddedSignupSession.findFirst({
    where: {
      consumedAt: null,
      expiresAt: { gt: new Date() },
      publicTokenDigest: digest(input.publicToken),
      storeId: input.storeId,
      tenantId: input.tenantId,
      userId: input.userId,
    },
  })
  return session
    ? {
        expiresAt: session.expiresAt,
        numbers: parseDiscoveredNumbers(session.discoveredNumbers),
      }
    : null
}

export async function getPendingWhatsAppEmbeddedSignupSession(
  db: PrismaClient,
  input: { storeId: string; tenantId: string; userId: string },
) {
  const session = await db.whatsAppEmbeddedSignupSession.findFirst({
    orderBy: { createdAt: "desc" },
    where: {
      consumedAt: null,
      expiresAt: { gt: new Date() },
      storeId: input.storeId,
      tenantId: input.tenantId,
      userId: input.userId,
    },
  })
  return session
    ? {
        expiresAt: session.expiresAt,
        numbers: parseDiscoveredNumbers(session.discoveredNumbers),
      }
    : null
}

async function completeEmbeddedSignupSession(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string
    billingOwner?: string
    phoneNumberId: string
    storeId: string
    tenantId: string
    testRecipient: string
  },
  sessionWhere: Prisma.WhatsAppEmbeddedSignupSessionWhereInput,
) {
  const session = await tx.whatsAppEmbeddedSignupSession.findFirst({
    orderBy: { createdAt: "desc" },
    where: {
      consumedAt: null,
      expiresAt: { gt: new Date() },
      storeId: input.storeId,
      tenantId: input.tenantId,
      userId: input.actorUserId,
      ...sessionWhere,
    },
  })
  const selected = session
    ? parseDiscoveredNumbers(session.discoveredNumbers).find(
        (number) => number.phoneNumberId === input.phoneNumberId,
      )
    : null
  if (!session || !selected) {
    throw new WhatsAppConnectionError(
      "CONNECTION_NOT_FOUND",
      "This Embedded Signup selection has expired or is invalid.",
    )
  }
  const connection = await upsertWhatsAppConnectionWithBinding(tx, {
    actorUserId: input.actorUserId,
    billingOwner: input.billingOwner,
    businessDisplayName: selected.businessDisplayName,
    credentialReference: session.credentialReference,
    displayNumber: selected.displayNumber,
    phoneNumberId: selected.phoneNumberId,
    storeId: input.storeId,
    tenantId: input.tenantId,
    testRecipient: input.testRecipient,
    wabaId: selected.wabaId,
  })
  await tx.whatsAppEmbeddedSignupSession.update({
    data: { consumedAt: new Date(), credentialReference: "consumed" },
    where: { id: session.id },
  })
  return { connectionId: connection.id, status: connection.status }
}

export async function completeWhatsAppEmbeddedSignupSession(
  db: PrismaClient,
  input: {
    actorUserId: string
    billingOwner?: string
    phoneNumberId: string
    publicToken: string
    storeId: string
    tenantId: string
    testRecipient: string
  },
) {
  return db.$transaction((tx) =>
    completeEmbeddedSignupSession(tx, input, {
      publicTokenDigest: digest(input.publicToken),
    }),
  )
}

export async function completePendingWhatsAppEmbeddedSignupSession(
  db: PrismaClient,
  input: {
    actorUserId: string
    billingOwner?: string
    phoneNumberId: string
    storeId: string
    tenantId: string
    testRecipient: string
  },
) {
  return db.$transaction((tx) => completeEmbeddedSignupSession(tx, input, {}))
}

export async function getWhatsAppConnectionForBackend(
  db: PrismaClient,
  input: { connectionId: string; tenantId: string },
) {
  const connection = await db.whatsAppConnection.findFirst({
    include: { bindings: true },
    where: { id: input.connectionId, tenantId: input.tenantId },
  })
  if (!connection) {
    throw new WhatsAppConnectionError(
      "CONNECTION_NOT_FOUND",
      "WhatsApp connection was not found.",
    )
  }
  return connection
}

export async function listWhatsAppConnections(
  db: PrismaClient,
  input: { tenantId: string },
) {
  const connections = await db.whatsAppConnection.findMany({
    include: {
      bindings: {
        include: { store: { select: { id: true, name: true } } },
      },
    },
    orderBy: { updatedAt: "desc" },
    where: { tenantId: input.tenantId },
  })
  return connections.map(
    ({
      credentialReference: _,
      pendingCredentialReference: __,
      ...connection
    }) => connection,
  )
}

export async function recordWhatsAppConnectionTest(
  db: PrismaClient,
  input: {
    businessVerified: boolean
    connectionId: string
    displayNumber: string
    failureCode?: string
    numberVerified: boolean
    outboundVerified: boolean
    tenantId: string
    webhookSubscribed: boolean
    templatesReady: boolean
    templateConfiguration: Record<string, string>
  },
) {
  return db.$transaction(async (tx) => {
    const current = await tx.whatsAppConnection.findFirstOrThrow({
      where: { id: input.connectionId, tenantId: input.tenantId },
    })
    const ready =
      input.businessVerified &&
      input.numberVerified &&
      input.outboundVerified &&
      input.webhookSubscribed
    const testingRotation = Boolean(
      current.status === WhatsAppConnectionStatus.ACTIVE &&
        current.pendingCredentialReference,
    )
    const updated = await tx.whatsAppConnection.update({
      data: {
        businessVerified:
          testingRotation && !ready ? undefined : input.businessVerified,
        credentialReference:
          testingRotation && ready
            ? (current.pendingCredentialReference ?? undefined)
            : undefined,
        displayNumber:
          testingRotation && !ready ? undefined : input.displayNumber,
        lastTestFailureCode: ready
          ? null
          : (input.failureCode ?? "readiness_incomplete"),
        lastTestedAt: new Date(),
        numberVerified:
          testingRotation && !ready ? undefined : input.numberVerified,
        outboundVerified:
          testingRotation && !ready ? undefined : input.outboundVerified,
        pendingCredentialReference: testingRotation && ready ? null : undefined,
        status:
          testingRotation && !ready
            ? WhatsAppConnectionStatus.ACTIVE
            : ready
              ? WhatsAppConnectionStatus.ACTIVE
              : WhatsAppConnectionStatus.RECONNECTING,
        webhookSubscribed:
          testingRotation && !ready ? undefined : input.webhookSubscribed,
        templatesReady:
          testingRotation && !ready ? undefined : input.templatesReady,
        templateConfiguration:
          testingRotation && !ready ? undefined : input.templateConfiguration,
      },
      where: { id: input.connectionId, tenantId: input.tenantId },
    })
    if (ready) {
      const pharmacyActivatedStoreIds: string[] = []
      const pendingBindings = await tx.whatsAppStoreBinding.findMany({
        select: { id: true, storeId: true },
        where: {
          connectionId: updated.id,
          status: WhatsAppBindingStatus.PENDING,
          tenantId: input.tenantId,
        },
      })
      for (const binding of pendingBindings) {
        const store = await tx.store.findFirst({
          select: {
            prescriptionSettings: { select: { status: true } },
            serviceCommerceProfile: {
              select: {
                intakeEnabled: true,
                status: true,
                whatsappEnabled: true,
              },
            },
          },
          where: { id: binding.storeId, tenantId: input.tenantId },
        })
        if (!store) continue
        const verticals: Array<"pharmacy" | "service"> = []
        if (
          store.serviceCommerceProfile?.status === "ACTIVE" &&
          store.serviceCommerceProfile.intakeEnabled &&
          store.serviceCommerceProfile.whatsappEnabled
        ) {
          verticals.push("service")
        }
        if (store.prescriptionSettings?.status === "ACTIVE") {
          verticals.push("pharmacy")
        }
        if (verticals.length === 0) continue
        const policy = await evaluateServiceCommercePolicyBatchInTransaction(
          tx,
          {
            actorUserId: "system_whatsapp_connection_test",
            purpose: "customer_channel_binding_activation",
            scopes: verticals.flatMap((vertical) => [
              {
                channel: "whatsapp" as const,
                subject: "whatsapp" as const,
                vertical,
              },
              {
                channel: "whatsapp" as const,
                subject: "intake" as const,
                vertical,
              },
            ]),
            storeId: binding.storeId,
            tenantId: input.tenantId,
          },
        )
        const allowedVerticals = verticals.filter((vertical, index) => {
          const offset = index * 2
          return (
            policy[offset]?.outcome === "allowed" &&
            policy[offset + 1]?.outcome === "allowed" &&
            (vertical !== "pharmacy" || input.templatesReady)
          )
        })
        if (allowedVerticals.length === 0) {
          continue
        }
        await tx.whatsAppStoreBinding.updateMany({
          data: { status: WhatsAppBindingStatus.SUSPENDED },
          where: {
            id: { not: binding.id },
            status: WhatsAppBindingStatus.ACTIVE,
            storeId: binding.storeId,
            tenantId: input.tenantId,
          },
        })
        const activated = await tx.whatsAppStoreBinding.updateMany({
          data: {
            activatedAt: new Date(),
            status: WhatsAppBindingStatus.ACTIVE,
          },
          where: {
            id: binding.id,
            status: WhatsAppBindingStatus.PENDING,
            storeId: binding.storeId,
            tenantId: input.tenantId,
          },
        })
        if (activated.count !== 1) continue
        if (allowedVerticals.includes("pharmacy")) {
          pharmacyActivatedStoreIds.push(binding.storeId)
        }
      }
      if (pharmacyActivatedStoreIds.length > 0) {
        await tx.prescriptionChannel.updateMany({
          data: { whatsappEnabled: true },
          where: {
            storeId: { in: pharmacyActivatedStoreIds },
            tenantId: input.tenantId,
          },
        })
      }
    }
    await tx.whatsAppConnectionAuditEvent.create({
      data: {
        connectionId: updated.id,
        payload: {
          businessVerified: input.businessVerified,
          numberVerified: input.numberVerified,
          outboundVerified: input.outboundVerified,
          templatesReady: input.templatesReady,
          webhookSubscribed: input.webhookSubscribed,
        },
        tenantId: input.tenantId,
        type: ready ? "readiness_passed" : "readiness_failed",
      },
    })
    return updated
  })
}

export async function resolveWhatsAppInboundConnection(
  db: PrismaClient,
  input: { phoneNumberId: string },
) {
  const connection = await db.whatsAppConnection.findFirst({
    include: {
      bindings: {
        include: {
          store: {
            include: {
              prescriptionSettings: true,
              serviceCommerceProfile: true,
            },
          },
        },
        where: { status: WhatsAppBindingStatus.ACTIVE },
      },
    },
    where: {
      phoneNumberId: input.phoneNumberId,
      status: WhatsAppConnectionStatus.ACTIVE,
    },
  })
  if (!connection || connection.bindings.length === 0) {
    throw new WhatsAppConnectionError(
      "CONNECTION_NOT_FOUND",
      "No active WhatsApp routing context was found.",
    )
  }
  if (
    connection.bindings.some(
      (binding) =>
        binding.tenantId !== connection.tenantId ||
        binding.store.tenantId !== connection.tenantId,
    )
  ) {
    throw new WhatsAppConnectionError(
      "CONNECTION_NOT_FOUND",
      "No active WhatsApp routing context was found.",
    )
  }
  const bindings = connection.bindings.filter((binding) => {
    const serviceReady =
      binding.store.serviceCommerceProfile?.status === "ACTIVE" &&
      binding.store.serviceCommerceProfile.intakeEnabled &&
      binding.store.serviceCommerceProfile.whatsappEnabled
    const pharmacyReady =
      binding.store.prescriptionSettings?.status === "ACTIVE"
    return serviceReady || pharmacyReady
  })
  if (!bindings.length) {
    throw new WhatsAppConnectionError(
      "CONNECTION_NOT_FOUND",
      "No active customer-channel Store binding was found.",
    )
  }
  return {
    bindings: bindings.map((binding) => ({
      storeId: binding.storeId,
      storeName: binding.store.name,
      tenantId: binding.tenantId,
    })),
    connectionId: connection.id,
    credentialReference: connection.credentialReference,
    phoneNumberId: connection.phoneNumberId,
    requiresStoreSelection: bindings.length > 1,
    tenantId: connection.tenantId,
  }
}

export async function resolveWhatsAppStatusConnection(
  db: PrismaClient,
  input: { phoneNumberId: string; providerMessageId: string },
) {
  const attempt = await db.prescriptionCommunicationAttempt.findFirst({
    select: {
      connectionId: true,
      intent: { select: { tenantId: true } },
    },
    where: {
      connection: { phoneNumberId: input.phoneNumberId },
      providerMessageId: input.providerMessageId,
    },
  })
  if (attempt?.connectionId) {
    return {
      connectionId: attempt.connectionId,
      kind: "prescription" as const,
      tenantId: attempt.intent.tenantId,
    }
  }
  const connection = await db.whatsAppConnection.findUnique({
    select: { billingOwner: true, id: true, tenantId: true },
    where: { phoneNumberId: input.phoneNumberId },
  })
  const customerAttempt = connection
    ? await db.serviceCommerceCustomerNotificationAttempt.findFirst({
        select: {
          notificationIntentId: true,
          storeId: true,
          store: { select: { currencyCode: true, tenantId: true } },
          tenantId: true,
        },
        where: {
          providerConnectionId: connection.id,
          providerOperationId: input.providerMessageId,
          tenantId: connection.tenantId,
        },
      })
    : null
  if (
    !connection ||
    !customerAttempt ||
    customerAttempt.tenantId !== connection.tenantId ||
    customerAttempt.store.tenantId !== connection.tenantId
  ) {
    throw new WhatsAppConnectionError(
      "CONNECTION_NOT_FOUND",
      "WhatsApp status connection was not found.",
    )
  }
  return {
    billingOwnerSnapshot: connection.billingOwner ?? "tenant",
    connectionId: connection.id,
    currencyCode: customerAttempt.store.currencyCode,
    intentId: customerAttempt.notificationIntentId,
    kind: "service_commerce" as const,
    storeId: customerAttempt.storeId,
    tenantId: customerAttempt.tenantId,
  }
}

type WhatsAppInboundStoreInput = {
  channelToken?: string
  connectionId: string
  quickActionId?: string
  storeId?: string
  tenantId: string
}

async function resolveWhatsAppInboundStoreInTransaction(
  db: Prisma.TransactionClient,
  input: WhatsAppInboundStoreInput,
) {
  const quickActionToken = input.quickActionId?.startsWith("rx:")
    ? input.quickActionId.slice(3)
    : ""
  if (!input.channelToken && !input.storeId && !quickActionToken) {
    throw new WhatsAppConnectionError(
      "AMBIGUOUS_ROUTING",
      "A Store channel context is required for this WhatsApp number.",
    )
  }
  const binding = await db.whatsAppStoreBinding.findFirst({
    select: {
      store: {
        select: {
          customerEntryPoint: {
            select: { publicToken: true, status: true },
          },
          prescriptionChannel: {
            select: { publicToken: true, status: true, whatsappEnabled: true },
          },
          prescriptionSettings: { select: { status: true } },
          serviceCommerceProfile: {
            select: {
              intakeEnabled: true,
              status: true,
              whatsappEnabled: true,
            },
          },
        },
      },
      storeId: true,
      tenantId: true,
    },
    where: {
      connectionId: input.connectionId,
      status: WhatsAppBindingStatus.ACTIVE,
      storeId: input.storeId,
      tenantId: input.tenantId,
      store: {
        OR: input.channelToken
          ? [
              {
                customerEntryPoint: {
                  is: {
                    publicToken: input.channelToken,
                    status: "PUBLISHED",
                  },
                },
              },
              {
                prescriptionChannel: {
                  is: {
                    publicToken: input.channelToken,
                    status: "ACTIVE",
                    whatsappEnabled: true,
                  },
                },
              },
            ]
          : undefined,
        prescriptionQuickActions: quickActionToken
          ? {
              some: {
                consumedAt: null,
                expiresAt: { gt: new Date() },
                tokenDigest: digest(quickActionToken),
              },
            }
          : undefined,
      },
    },
  })
  if (!binding) {
    throw new WhatsAppConnectionError(
      "CONNECTION_NOT_FOUND",
      "No active Store binding matches this WhatsApp context.",
    )
  }
  const genericEntry = Boolean(
    input.channelToken &&
      binding.store.customerEntryPoint?.status === "PUBLISHED" &&
      binding.store.customerEntryPoint.publicToken === input.channelToken,
  )
  const prescriptionEntry = Boolean(
    input.channelToken &&
      binding.store.prescriptionChannel?.status === "ACTIVE" &&
      binding.store.prescriptionChannel.whatsappEnabled &&
      binding.store.prescriptionChannel.publicToken === input.channelToken,
  )
  const serviceConfigured =
    binding.store.serviceCommerceProfile?.status === "ACTIVE" &&
    binding.store.serviceCommerceProfile.intakeEnabled &&
    binding.store.serviceCommerceProfile.whatsappEnabled
  const pharmacyConfigured =
    binding.store.prescriptionSettings?.status === "ACTIVE"
  const verticals: Array<"pharmacy" | "service"> = []
  if (genericEntry && serviceConfigured) {
    verticals.push("service")
  } else if ((prescriptionEntry || quickActionToken) && pharmacyConfigured) {
    verticals.push("pharmacy")
  } else if (!input.channelToken && !quickActionToken) {
    // Compatibility: an established Pharmacy route keeps its existing
    // single-Store behavior. A non-Pharmacy Store uses the generic Service
    // route. Multi-vertical entry is explicit through the stable entry page.
    if (pharmacyConfigured) verticals.push("pharmacy")
    else if (serviceConfigured) verticals.push("service")
  }
  if (verticals.length === 0) {
    throw new WhatsAppConnectionError(
      "CONNECTION_NOT_FOUND",
      "No active Store binding matches this WhatsApp context.",
    )
  }
  const evaluations = await evaluateServiceCommercePolicyBatchInTransaction(
    db,
    {
      actorUserId: "public_whatsapp_routing",
      purpose: "customer_channel_whatsapp_inbound_route",
      scopes: verticals.flatMap((vertical) => [
        {
          channel: "whatsapp" as const,
          subject: "whatsapp" as const,
          vertical,
        },
        { channel: "whatsapp" as const, subject: "intake" as const, vertical },
      ]),
      storeId: binding.storeId,
      tenantId: binding.tenantId,
    },
  )
  const allowedVerticals = verticals.filter((_, index) => {
    const offset = index * 2
    return (
      evaluations[offset]?.outcome === "allowed" &&
      evaluations[offset + 1]?.outcome === "allowed"
    )
  })
  if (allowedVerticals.length !== 1) {
    throw new WhatsAppConnectionError(
      "CONNECTION_NOT_FOUND",
      "No unambiguous Store channel route matches this WhatsApp context.",
    )
  }
  return { ...binding, routeVertical: allowedVerticals[0] }
}

export async function resolveWhatsAppInboundStore(
  db: PrismaClient,
  input: WhatsAppInboundStoreInput,
) {
  return db.$transaction((tx) =>
    resolveWhatsAppInboundStoreInTransaction(tx, input),
  )
}

export async function recordWhatsAppInboundEvent(
  db: PrismaClient,
  input: {
    connectionId: string
    externalCustomerId: string
    messageType: string
    normalizedPayload: Record<string, unknown>
    providerEventId: string
    requestId?: string
    routeVertical?: "pharmacy" | "service"
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const routeVertical = input.routeVertical ?? "pharmacy"
    await assertServiceCommercePolicyAllowedInTransaction(tx, {
      actorUserId: "public_whatsapp_webhook",
      channel: "whatsapp",
      purpose: "customer_channel_whatsapp_inbound_persist",
      storeId: input.storeId,
      subject: "intake",
      tenantId: input.tenantId,
      vertical: routeVertical,
    })
    return tx.whatsAppInboundEvent.upsert({
      create: {
        connectionId: input.connectionId,
        externalCustomerId: input.externalCustomerId,
        messageType: input.messageType,
        normalizedPayload: input.normalizedPayload as Prisma.InputJsonValue,
        providerEventId: input.providerEventId,
        requestId: input.requestId,
        routeVertical: routeVertical === "pharmacy" ? "PHARMACY" : "SERVICE",
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      update: {},
      where: { providerEventId: input.providerEventId },
    })
  })
}

export async function recordWhatsAppRoutingAlert(
  db: PrismaClient,
  input: {
    code: "ambiguous_store_binding" | "inactive_or_unknown_connection"
    connectionId?: string
    phoneNumberId: string
    providerEventId: string
    tenantId?: string
  },
) {
  return db.whatsAppRoutingAlert.upsert({
    create: {
      code: input.code,
      connectionId: input.connectionId,
      phoneNumberIdDigest: digest(input.phoneNumberId),
      providerEventIdDigest: digest(input.providerEventId),
      tenantId: input.tenantId,
    },
    update: {},
    where: { providerEventIdDigest: digest(input.providerEventId) },
  })
}

export async function claimWhatsAppInboundEvent(
  db: PrismaClient,
  input: { inboundEventId: string },
) {
  return db.$transaction(async (tx) => {
    const event = await tx.whatsAppInboundEvent.findUnique({
      include: { connection: true },
      where: { id: input.inboundEventId },
    })
    if (
      !event ||
      event.status === WhatsAppInboundEventStatus.PROCESSED ||
      event.status === WhatsAppInboundEventStatus.PROCESSING ||
      event.connection.status !== WhatsAppConnectionStatus.ACTIVE
    ) {
      return null
    }
    const activeBinding = await tx.whatsAppStoreBinding.findFirst({
      where: {
        connectionId: event.connectionId,
        status: WhatsAppBindingStatus.ACTIVE,
        storeId: event.storeId,
        tenantId: event.tenantId,
      },
    })
    if (!activeBinding || event.connection.tenantId !== event.tenantId) {
      await tx.whatsAppInboundEvent.update({
        data: {
          failureCode: "ambiguous_store_binding",
          processedAt: new Date(),
          status: WhatsAppInboundEventStatus.FAILED,
        },
        where: { id: event.id },
      })
      return null
    }
    const policy = await evaluateServiceCommercePolicyInTransaction(tx, {
      actorUserId: "job_customer_channel_whatsapp_inbound",
      channel: "whatsapp",
      purpose: "customer_channel_whatsapp_inbound_claim",
      storeId: event.storeId,
      subject: "intake",
      tenantId: event.tenantId,
      vertical: event.routeVertical === "PHARMACY" ? "pharmacy" : "service",
    })
    if (policy.outcome !== "allowed") {
      await tx.whatsAppInboundEvent.update({
        data: {
          failureCode: "policy_restricted",
          processedAt: new Date(),
          status: WhatsAppInboundEventStatus.FAILED,
        },
        where: { id: event.id },
      })
      return null
    }
    await tx.whatsAppInboundEvent.update({
      data: { status: WhatsAppInboundEventStatus.PROCESSING },
      where: { id: event.id },
    })
    return {
      connectionId: event.connectionId,
      credentialReference: event.connection.credentialReference,
      externalCustomerId: event.externalCustomerId,
      inboundEventId: event.id,
      messageType: event.messageType,
      normalizedPayload: event.normalizedPayload,
      phoneNumberId: event.connection.phoneNumberId,
      providerEventId: event.providerEventId,
      requestId: event.requestId,
      routeVertical:
        event.routeVertical === "PHARMACY"
          ? ("pharmacy" as const)
          : ("service" as const),
      storeId: event.storeId,
      tenantId: event.tenantId,
    }
  })
}

export async function markWhatsAppInboundEventProcessed(
  db: PrismaClient,
  input: { failureCode?: string; inboundEventId: string; requestId?: string },
) {
  return db.whatsAppInboundEvent.update({
    data: {
      failureCode: input.failureCode,
      processedAt: new Date(),
      requestId: input.requestId,
      status: input.failureCode
        ? WhatsAppInboundEventStatus.FAILED
        : WhatsAppInboundEventStatus.PROCESSED,
    },
    where: { id: input.inboundEventId },
  })
}

export async function releaseWhatsAppInboundEventForRetry(
  db: PrismaClient,
  input: {
    failureCode: string
    inboundEventId: string
    storeId: string
    tenantId: string
  },
) {
  return db.whatsAppInboundEvent.updateMany({
    data: {
      failureCode: input.failureCode.trim().slice(0, 120),
      status: WhatsAppInboundEventStatus.RECEIVED,
    },
    where: {
      id: input.inboundEventId,
      status: WhatsAppInboundEventStatus.PROCESSING,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
}

type PrescriptionCommunicationIntentInput = {
  deduplicationKey: string
  orderId?: string
  payload: Record<string, unknown>
  recipientReference: string
  requestId?: string
  storeId: string
  tenantId: string
  type:
    | "clarification"
    | "delivery_failed"
    | "delivery_progress"
    | "expiry"
    | "payment_receipt"
    | "pickup_ready"
    | "quote_ready"
}

async function upsertPrescriptionCommunicationIntent(
  tx: Prisma.TransactionClient,
  input: PrescriptionCommunicationIntentInput,
) {
  const type = input.type.toUpperCase() as PrescriptionCommunicationType
  return tx.prescriptionCommunicationIntent.upsert({
    create: {
      deduplicationKey: input.deduplicationKey,
      orderId: input.orderId,
      payload: input.payload as Prisma.InputJsonValue,
      recipientReference: input.recipientReference,
      requestId: input.requestId,
      storeId: input.storeId,
      tenantId: input.tenantId,
      type,
    },
    update: {},
    where: {
      tenantId_deduplicationKey: {
        deduplicationKey: input.deduplicationKey,
        tenantId: input.tenantId,
      },
    },
  })
}

export async function createPrescriptionCommunicationIntentInTransaction(
  tx: Prisma.TransactionClient,
  input: PrescriptionCommunicationIntentInput,
) {
  await assertServiceCommercePolicyAllowedInTransaction(tx, {
    actorUserId: "system_prescription_notification",
    channel: "whatsapp",
    purpose: "prescription_whatsapp_outbound_create",
    storeId: input.storeId,
    subject: "whatsapp",
    tenantId: input.tenantId,
    vertical: "pharmacy",
  })
  return upsertPrescriptionCommunicationIntent(tx, input)
}

export async function createPrescriptionCommunicationIntent(
  db: PrismaClient,
  input: PrescriptionCommunicationIntentInput,
) {
  return db.$transaction(async (tx) => {
    return createPrescriptionCommunicationIntentInTransaction(tx, input)
  })
}

export async function claimPrescriptionCommunicationIntent(
  db: PrismaClient,
  input: { intentId: string },
) {
  return db.$transaction(async (tx) => {
    const intent = await tx.prescriptionCommunicationIntent.findUnique({
      where: { id: input.intentId },
    })
    if (!intent || intent.status === CommunicationIntentStatus.SENT) return null
    const binding = await tx.whatsAppStoreBinding.findFirst({
      include: { connection: true },
      orderBy: { activatedAt: "desc" },
      where: {
        status: WhatsAppBindingStatus.ACTIVE,
        storeId: intent.storeId,
        tenantId: intent.tenantId,
      },
    })
    if (
      !binding ||
      binding.status !== WhatsAppBindingStatus.ACTIVE ||
      binding.connection.status !== WhatsAppConnectionStatus.ACTIVE
    ) {
      await tx.prescriptionCommunicationIntent.update({
        data: { status: CommunicationIntentStatus.DEFERRED },
        where: { id: intent.id },
      })
      return null
    }
    const policy = await evaluateServiceCommercePolicyInTransaction(tx, {
      actorUserId: "job_prescription_communication_dispatch",
      channel: "whatsapp",
      purpose: "prescription_whatsapp_outbound_claim",
      storeId: intent.storeId,
      subject: "whatsapp",
      tenantId: intent.tenantId,
      vertical: "pharmacy",
    })
    if (policy.outcome !== "allowed") {
      await tx.prescriptionCommunicationIntent.update({
        data: { status: CommunicationIntentStatus.DEFERRED },
        where: { id: intent.id },
      })
      return null
    }
    const attemptCount = await tx.prescriptionCommunicationAttempt.count({
      where: { intentId: intent.id },
    })
    const attempt = await tx.prescriptionCommunicationAttempt.create({
      data: {
        attemptNumber: attemptCount + 1,
        connectionId: binding.connectionId,
        intentId: intent.id,
        provider: "meta-cloud-api",
      },
    })
    await tx.prescriptionCommunicationIntent.update({
      data: { status: CommunicationIntentStatus.PROCESSING },
      where: { id: intent.id },
    })
    return {
      attemptId: attempt.id,
      connectionId: binding.connection.id,
      credentialReference: binding.connection.credentialReference,
      intentId: intent.id,
      payload: intent.payload,
      phoneNumberId: binding.connection.phoneNumberId,
      recipientReference: intent.recipientReference,
      storeId: intent.storeId,
      tenantId: intent.tenantId,
      templateConfiguration: binding.connection.templateConfiguration,
      type: intent.type.toLowerCase(),
    }
  })
}

export async function authorizePrescriptionCommunicationAttempt(
  db: PrismaClient,
  input: {
    attemptId: string
    intentId: string
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const attempt = await tx.prescriptionCommunicationAttempt.findFirst({
      select: { id: true },
      where: {
        id: input.attemptId,
        intentId: input.intentId,
        intent: { storeId: input.storeId, tenantId: input.tenantId },
      },
    })
    if (!attempt) return false
    const policy = await evaluateServiceCommercePolicyInTransaction(tx, {
      actorUserId: "job_prescription_communication_provider_send",
      channel: "whatsapp",
      purpose: "prescription_whatsapp_provider_send",
      storeId: input.storeId,
      subject: "whatsapp",
      tenantId: input.tenantId,
      vertical: "pharmacy",
    })
    return policy.outcome === "allowed"
  })
}

export async function completePrescriptionCommunicationAttempt(
  db: PrismaClient,
  input: {
    attemptId: string
    failureCode?: string
    intentId: string
    providerMessageId?: string
  },
) {
  return db.$transaction(async (tx) => {
    await tx.prescriptionCommunicationAttempt.update({
      data: {
        failureCode: input.failureCode,
        providerMessageId: input.providerMessageId,
        status: input.failureCode
          ? CommunicationAttemptStatus.FAILED
          : CommunicationAttemptStatus.SENT,
      },
      where: { id: input.attemptId },
    })
    if (!input.failureCode) {
      const intent = await tx.prescriptionCommunicationIntent.findUniqueOrThrow(
        {
          where: { id: input.intentId },
        },
      )
      await tx.prescriptionUsageEvent.upsert({
        create: {
          amounts: { metaCostMinor: null, platformChargeMinor: null },
          deduplicationKey: `message-sent:${input.attemptId}`,
          eventType: "MESSAGE_SENT",
          occurredAt: new Date(),
          sourceId: input.attemptId,
          sourceType: "communication_attempt",
          storeId: intent.storeId,
          tenantId: intent.tenantId,
        },
        update: {},
        where: {
          tenantId_deduplicationKey: {
            deduplicationKey: `message-sent:${input.attemptId}`,
            tenantId: intent.tenantId,
          },
        },
      })
    }
    return tx.prescriptionCommunicationIntent.update({
      data: {
        status: input.failureCode
          ? CommunicationIntentStatus.FAILED
          : CommunicationIntentStatus.SENT,
      },
      where: { id: input.intentId },
    })
  })
}

export async function recordWhatsAppCommunicationStatus(
  db: PrismaClient,
  input: {
    connectionId: string
    failureCode?: string
    occurredAt: Date
    providerMessageId: string
    status: "delivered" | "failed" | "read" | "sent"
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const identity = await tx.prescriptionCommunicationAttempt.findFirst({
      select: { id: true },
      where: {
        connectionId: input.connectionId,
        intent: { tenantId: input.tenantId },
        providerMessageId: input.providerMessageId,
      },
    })
    if (!identity) return null

    await tx.$queryRaw`
      SELECT "id"
      FROM "PrescriptionCommunicationAttempt"
      WHERE "id" = ${identity.id}
      FOR UPDATE
    `
    const attempt = await tx.prescriptionCommunicationAttempt.findUnique({
      where: { id: identity.id },
    })
    if (!attempt) return null

    const statusRank: Record<CommunicationAttemptStatus, number> = {
      DELIVERED: 3,
      FAILED: 2,
      PENDING: 0,
      READ: 4,
      SENT: 1,
    }
    const nextStatus =
      input.status === "read"
        ? CommunicationAttemptStatus.READ
        : input.status === "delivered"
          ? CommunicationAttemptStatus.DELIVERED
          : input.status === "failed"
            ? CommunicationAttemptStatus.FAILED
            : CommunicationAttemptStatus.SENT
    if (statusRank[nextStatus] <= statusRank[attempt.status]) return attempt

    return tx.prescriptionCommunicationAttempt.update({
      data: {
        deliveredAt:
          input.status === "delivered" || input.status === "read"
            ? (attempt.deliveredAt ?? input.occurredAt)
            : undefined,
        failureCode:
          input.status === "failed"
            ? (input.failureCode ?? "provider_delivery_failed")
            : null,
        readAt:
          input.status === "read"
            ? (attempt.readAt ?? input.occurredAt)
            : undefined,
        status: nextStatus,
      },
      where: { id: attempt.id },
    })
  })
}

type PrescriptionQuickActionInput = {
  action: "ask_pharmacy" | "delivery" | "pickup" | "review_and_pay"
  entityId: string
  entityType: "order" | "quote_version"
  expiresAt: Date
  storeId: string
  tenantId: string
}

async function createPrescriptionQuickActionWithClient(
  db: WhatsAppConnectionWriteClient,
  input: PrescriptionQuickActionInput,
) {
  const rawToken = randomBytes(24).toString("base64url")
  const action = input.action.toUpperCase() as PrescriptionQuickActionType
  await db.prescriptionQuickAction.create({
    data: {
      action,
      entityId: input.entityId,
      entityType: input.entityType,
      expiresAt: input.expiresAt,
      storeId: input.storeId,
      tenantId: input.tenantId,
      tokenDigest: digest(rawToken),
    },
  })
  return { actionId: `rx:${rawToken}` }
}

export async function createPrescriptionQuickActionInTransaction(
  tx: Prisma.TransactionClient,
  input: PrescriptionQuickActionInput,
) {
  return createPrescriptionQuickActionWithClient(tx, input)
}

export async function createPrescriptionQuickAction(
  db: PrismaClient,
  input: PrescriptionQuickActionInput,
) {
  return createPrescriptionQuickActionWithClient(db, input)
}

export async function materializePrescriptionQuoteReadyEffectsInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    expiresAt: Date
    protectActionId: (actionId: string) => string
    requestId: string
    storeId: string
    tenantId: string
    versionId: string
  },
) {
  const deduplicationKey = `quote-ready:${input.versionId}`
  const request = await tx.prescriptionRequest.findFirst({
    select: { customerPhone: true, id: true },
    where: {
      id: input.requestId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!request?.customerPhone) return { communicationIntentId: null }

  const policy = await evaluateServiceCommercePolicyInTransaction(tx, {
    actorUserId: "system_prescription_notification",
    channel: "whatsapp",
    purpose: "prescription_quote_ready_effects",
    storeId: input.storeId,
    subject: "whatsapp",
    tenantId: input.tenantId,
    vertical: "pharmacy",
  })
  if (policy.outcome !== "allowed") return { communicationIntentId: null }
  const existing = await tx.prescriptionCommunicationIntent.findUnique({
    select: { id: true },
    where: {
      tenantId_deduplicationKey: {
        deduplicationKey,
        tenantId: input.tenantId,
      },
    },
  })
  if (existing) return { communicationIntentId: existing.id }

  const actions: Array<{ protectedId: string; title: string }> = []
  for (const action of ["pickup", "delivery", "ask_pharmacy"] as const) {
    const { actionId } = await createPrescriptionQuickActionInTransaction(tx, {
      action,
      entityId: input.versionId,
      entityType: "quote_version",
      expiresAt: input.expiresAt,
      storeId: input.storeId,
      tenantId: input.tenantId,
    })
    const protectedId = input.protectActionId(actionId)
    if (
      !protectedId.trim() ||
      protectedId.includes(actionId) ||
      protectedId.includes(actionId.slice(3))
    ) {
      throw new Error(
        "A protected Communications action reference is required.",
      )
    }
    actions.push({
      protectedId,
      title:
        action === "pickup"
          ? "Pick up"
          : action === "delivery"
            ? "Delivery"
            : "Ask pharmacy",
    })
  }
  const intent = await upsertPrescriptionCommunicationIntent(tx, {
    deduplicationKey,
    payload: { actions },
    recipientReference: request.customerPhone,
    requestId: request.id,
    storeId: input.storeId,
    tenantId: input.tenantId,
    type: "quote_ready",
  })
  return { communicationIntentId: intent.id }
}

export async function getPrescriptionNotificationContext(
  db: PrismaClient,
  input: { requestId: string; storeId: string; tenantId: string },
) {
  return db.prescriptionRequest.findFirst({
    select: { customerPhone: true, id: true, storeId: true, tenantId: true },
    where: {
      id: input.requestId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
}

export async function getOrderNotificationContext(
  db: PrismaClient,
  input: { orderId: string; storeId: string; tenantId: string },
) {
  return db.commercialOrder.findFirst({
    select: { customerPhone: true, id: true, storeId: true, tenantId: true },
    where: {
      id: input.orderId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
}

export async function consumePrescriptionQuickAction(
  db: PrismaClient,
  input: { actionId: string; storeId: string; tenantId: string },
) {
  const rawToken = input.actionId.startsWith("rx:")
    ? input.actionId.slice(3)
    : ""
  return db.$transaction(async (tx) => {
    const action = await tx.prescriptionQuickAction.findFirst({
      where: {
        consumedAt: null,
        expiresAt: { gt: new Date() },
        storeId: input.storeId,
        tenantId: input.tenantId,
        tokenDigest: digest(rawToken),
      },
    })
    if (!action) {
      throw new WhatsAppConnectionError(
        "QUICK_ACTION_INVALID",
        "This action is no longer available.",
      )
    }
    await assertServiceCommercePolicyAllowedInTransaction(tx, {
      actorUserId: "public_prescription_quick_action",
      channel: "whatsapp",
      purpose: "prescription_whatsapp_quick_action",
      storeId: input.storeId,
      subject: "whatsapp",
      tenantId: input.tenantId,
      vertical: "pharmacy",
    })
    await tx.prescriptionQuickAction.update({
      data: { consumedAt: new Date() },
      where: { id: action.id },
    })
    return {
      action: action.action.toLowerCase(),
      entityId: action.entityId,
      entityType: action.entityType,
      publicAccessToken: rawToken,
    }
  })
}

export async function setWhatsAppConnectionLifecycle(
  db: PrismaClient,
  input: {
    actorUserId: string
    connectionId: string
    status: "reconnecting" | "revoked" | "suspended"
    tenantId: string
  },
) {
  const status = input.status.toUpperCase() as WhatsAppConnectionStatus
  return db.$transaction(async (tx) => {
    const connection = await tx.whatsAppConnection.update({
      data: {
        revokedAt:
          status === WhatsAppConnectionStatus.REVOKED ? new Date() : undefined,
        status,
        suspendedAt:
          status === WhatsAppConnectionStatus.SUSPENDED
            ? new Date()
            : undefined,
      },
      where: { id: input.connectionId, tenantId: input.tenantId },
    })
    await tx.whatsAppStoreBinding.updateMany({
      data: { status: WhatsAppBindingStatus.SUSPENDED },
      where: { connectionId: connection.id, tenantId: input.tenantId },
    })
    await tx.whatsAppConnectionAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        connectionId: connection.id,
        tenantId: input.tenantId,
        type: `connection_${input.status}`,
      },
    })
    return connection
  })
}

export async function suspendWhatsAppStoreBinding(
  db: PrismaClient,
  input: {
    actorUserId: string
    connectionId: string
    storeId: string
    tenantId: string
  },
) {
  return db.$transaction(async (tx) => {
    const binding = await tx.whatsAppStoreBinding.findFirst({
      where: {
        connectionId: input.connectionId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!binding) {
      throw new WhatsAppConnectionError(
        "CONNECTION_NOT_FOUND",
        "This Store binding was not found.",
      )
    }
    await tx.whatsAppStoreBinding.update({
      data: {
        status: WhatsAppBindingStatus.SUSPENDED,
        suspendedAt: new Date(),
      },
      where: { id: binding.id },
    })
    await tx.whatsAppConnectionAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        connectionId: input.connectionId,
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: "store_binding_suspended",
      },
    })
    const remaining = await tx.whatsAppStoreBinding.count({
      where: {
        status: WhatsAppBindingStatus.ACTIVE,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!remaining) {
      await tx.prescriptionChannel.updateMany({
        data: { whatsappEnabled: false },
        where: { storeId: input.storeId, tenantId: input.tenantId },
      })
    }
    return { suspended: true }
  })
}

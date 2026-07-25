import {
  type DomainConnectionStatus,
  DomainConnectionType,
  DomainOperationKind,
  type DomainOperationStatus,
  DomainPaymentStatus,
  type DomainProvider,
  DomainQuoteOperation,
  DomainQuoteStatus,
  DomainRegistrationStatus,
  DomainRenewalMode,
  type ManagedDomainStatus,
  type Prisma,
  type PrismaClient,
  TenantHostnameSurface,
} from "../../generated/prisma/client"
import type { DbClient } from "./types"

export type DomainRegistrantProfileInput = {
  consentVersion: string
  consentedAt: Date
  countryCode: string
  displayName: string
  encryptedPayload: string
  maskedEmail: string
  tenantId: string
}

export type CreateDomainQuoteInput = {
  exchangeRate: string | null
  expiresAt: Date
  isPremium: boolean
  normalizedDomain: string
  provider: DomainProvider
  providerCostMinor: number
  providerCurrencyCode: string
  renewalPriceMinor: number | null
  retailCurrencyCode: string
  retailPriceMinor: number
  storeId: string
  tenantId: string
  tld: string
}

export type CreateDomainOrderInput = {
  idempotencyKey: string
  paymentReference: string
  quoteId: string
  registrantProfileId: string
  tenantId: string
  termsAcceptedAt: Date
  termsVersion: string
}

function serializeDate(value: Date | null | undefined) {
  return value?.toISOString() ?? null
}

function serializeDomainOrder(order: {
  amountMinor: number
  checkoutUrl: string | null
  createdAt: Date
  currencyCode: string
  failureCode: string | null
  failureMessage: string | null
  id: string
  normalizedDomain: string
  paymentReference: string
  paymentStatus: DomainPaymentStatus
  provider: DomainProvider
  registeredAt: Date | null
  registrationStatus: DomainRegistrationStatus
  updatedAt: Date
}) {
  return {
    ...order,
    createdAt: order.createdAt.toISOString(),
    registeredAt: serializeDate(order.registeredAt),
    updatedAt: order.updatedAt.toISOString(),
  }
}

export async function assertDomainStoreAccess(
  db: DbClient,
  input: { storeId: string; tenantId: string },
) {
  const store = await db.store.findFirst({
    select: {
      id: true,
      name: true,
      slug: true,
      supportEmail: true,
    },
    where: { id: input.storeId, tenantId: input.tenantId },
  })

  if (!store) {
    throw new Error("Store not found.")
  }

  return store
}

async function assertHostnameOwnershipAvailable(
  db: DbClient,
  input: { hostname: string; tenantId: string },
) {
  const [connection, tenantHostname] = await Promise.all([
    db.domainConnection.findUnique({
      select: { tenantId: true },
      where: { hostname: input.hostname },
    }),
    db.tenantHostname.findUnique({
      select: { tenantId: true },
      where: { hostname: input.hostname },
    }),
  ])

  if (
    (connection && connection.tenantId !== input.tenantId) ||
    (tenantHostname && tenantHostname.tenantId !== input.tenantId)
  ) {
    throw new Error("This hostname belongs to another workspace.")
  }
}

export async function upsertDomainRegistrantProfile(
  db: DbClient,
  input: DomainRegistrantProfileInput,
) {
  return db.domainRegistrantProfile.upsert({
    create: input,
    select: {
      consentVersion: true,
      consentedAt: true,
      countryCode: true,
      displayName: true,
      id: true,
      maskedEmail: true,
      updatedAt: true,
    },
    update: {
      consentVersion: input.consentVersion,
      consentedAt: input.consentedAt,
      countryCode: input.countryCode,
      displayName: input.displayName,
      encryptedPayload: input.encryptedPayload,
      maskedEmail: input.maskedEmail,
    },
    where: { tenantId: input.tenantId },
  })
}

export async function getDomainRegistrantProfile(
  db: DbClient,
  input: { tenantId: string },
) {
  return db.domainRegistrantProfile.findUnique({
    where: { tenantId: input.tenantId },
  })
}

export async function createDomainQuote(
  db: PrismaClient,
  input: CreateDomainQuoteInput,
) {
  return db.$transaction(async (tx) => {
    await assertDomainStoreAccess(tx, input)
    await tx.domainQuote.updateMany({
      data: { status: DomainQuoteStatus.EXPIRED },
      where: {
        normalizedDomain: input.normalizedDomain,
        status: DomainQuoteStatus.ACTIVE,
        tenantId: input.tenantId,
      },
    })

    const quote = await tx.domainQuote.create({
      data: {
        exchangeRate: input.exchangeRate,
        expiresAt: input.expiresAt,
        isPremium: input.isPremium,
        normalizedDomain: input.normalizedDomain,
        operation: DomainQuoteOperation.REGISTER,
        provider: input.provider,
        providerCostMinor: input.providerCostMinor,
        providerCurrencyCode: input.providerCurrencyCode,
        renewalPriceMinor: input.renewalPriceMinor,
        retailCurrencyCode: input.retailCurrencyCode,
        retailPriceMinor: input.retailPriceMinor,
        storeId: input.storeId,
        tenantId: input.tenantId,
        tld: input.tld,
      },
      select: {
        exchangeRate: true,
        expiresAt: true,
        id: true,
        isPremium: true,
        normalizedDomain: true,
        provider: true,
        providerCostMinor: true,
        providerCurrencyCode: true,
        renewalPriceMinor: true,
        retailCurrencyCode: true,
        retailPriceMinor: true,
        storeId: true,
        tld: true,
      },
    })

    return { ...quote, expiresAt: quote.expiresAt.toISOString() }
  })
}

export async function createDomainOrder(
  db: PrismaClient,
  input: CreateDomainOrderInput,
) {
  return db.$transaction(async (tx) => {
    const existing = await tx.domainOrder.findUnique({
      where: {
        tenantId_idempotencyKey: {
          idempotencyKey: input.idempotencyKey,
          tenantId: input.tenantId,
        },
      },
    })

    if (existing) {
      if (
        existing.quoteId !== input.quoteId ||
        existing.registrantProfileId !== input.registrantProfileId
      ) {
        throw new Error(
          "This checkout key was already used for a different domain order.",
        )
      }
      return serializeDomainOrder(existing)
    }

    const quote = await tx.domainQuote.findFirst({
      where: {
        expiresAt: { gt: new Date() },
        id: input.quoteId,
        status: DomainQuoteStatus.ACTIVE,
        tenantId: input.tenantId,
      },
    })

    if (!quote) {
      throw new Error("This domain quote has expired. Search again.")
    }

    const registrant = await tx.domainRegistrantProfile.findFirst({
      select: { id: true },
      where: {
        id: input.registrantProfileId,
        tenantId: input.tenantId,
      },
    })

    if (!registrant) {
      throw new Error("Save the domain owner details before checkout.")
    }

    const order = await tx.domainOrder.create({
      data: {
        amountMinor: quote.retailPriceMinor,
        currencyCode: quote.retailCurrencyCode,
        exchangeRate: quote.exchangeRate,
        idempotencyKey: input.idempotencyKey,
        normalizedDomain: quote.normalizedDomain,
        paymentReference: input.paymentReference,
        provider: quote.provider,
        providerCostMinor: quote.providerCostMinor,
        providerCurrencyCode: quote.providerCurrencyCode,
        quoteId: quote.id,
        registrantProfileId: registrant.id,
        storeId: quote.storeId,
        tenantId: input.tenantId,
        termsAcceptedAt: input.termsAcceptedAt,
        termsVersion: input.termsVersion,
      },
    })
    await tx.domainQuote.update({
      data: {
        consumedAt: new Date(),
        status: DomainQuoteStatus.CONSUMED,
      },
      where: { id: quote.id },
    })
    await tx.domainEvent.create({
      data: {
        kind: DomainOperationKind.REGISTER,
        orderId: order.id,
        payload: {
          amountMinor: order.amountMinor,
          currencyCode: order.currencyCode,
          paymentReference: order.paymentReference,
        },
        provider: order.provider,
        status: "PENDING",
        tenantId: input.tenantId,
      },
    })

    return serializeDomainOrder(order)
  })
}

export async function attachDomainCheckout(
  db: DbClient,
  input: {
    checkoutUrl: string
    orderId: string
    paymentReference: string
    tenantId: string
  },
) {
  const order = await db.domainOrder.update({
    data: {
      checkoutUrl: input.checkoutUrl,
      paymentStatus: DomainPaymentStatus.PENDING,
    },
    where: {
      id: input.orderId,
      paymentReference: input.paymentReference,
      tenantId: input.tenantId,
    },
  })
  return serializeDomainOrder(order)
}

export async function markDomainOrderPaid(
  db: PrismaClient,
  input: {
    amountMinor: number
    currencyCode: string
    paymentReference: string
    providerEventId: string
    rawEvent: Prisma.InputJsonValue
  },
) {
  return db.$transaction(async (tx) => {
    const order = await tx.domainOrder.findUnique({
      where: { paymentReference: input.paymentReference },
    })

    if (!order) {
      throw new Error("Domain order not found for payment reference.")
    }

    if (
      order.amountMinor !== input.amountMinor ||
      order.currencyCode !== input.currencyCode.toUpperCase()
    ) {
      throw new Error("Domain payment amount or currency does not match.")
    }

    if (
      order.paymentStatus === DomainPaymentStatus.PAID ||
      order.paymentStatus === DomainPaymentStatus.REFUND_PENDING ||
      order.paymentStatus === DomainPaymentStatus.REFUNDED
    ) {
      return { order: serializeDomainOrder(order), newlyPaid: false }
    }

    const updated = await tx.domainOrder.update({
      data: {
        paidAt: new Date(),
        paymentStatus: DomainPaymentStatus.PAID,
      },
      where: { id: order.id },
    })
    await tx.domainEvent.create({
      data: {
        kind: DomainOperationKind.REGISTER,
        orderId: order.id,
        payload: input.rawEvent,
        provider: order.provider,
        providerEventId: input.providerEventId,
        status: "SUCCEEDED",
        tenantId: order.tenantId,
      },
    })

    return { order: serializeDomainOrder(updated), newlyPaid: true }
  })
}

const registrationOrderGraph = {
  quote: {
    select: {
      isPremium: true,
    },
  },
  registrantProfile: {
    select: {
      encryptedPayload: true,
      id: true,
      providerHandles: true,
    },
  },
} satisfies Prisma.DomainOrderInclude

export async function getDomainOrderForRegistration(
  db: DbClient,
  input: { orderId: string },
) {
  return db.domainOrder.findUnique({
    include: registrationOrderGraph,
    where: { id: input.orderId },
  })
}

export async function startDomainRegistrationAttempt(
  db: PrismaClient,
  input: { orderId: string },
) {
  return db.$transaction(async (tx) => {
    const order = await tx.domainOrder.findUnique({
      include: registrationOrderGraph,
      where: { id: input.orderId },
    })

    if (!order || order.paymentStatus !== DomainPaymentStatus.PAID) {
      throw new Error("A paid domain order is required for registration.")
    }

    if (order.registrationStatus === DomainRegistrationStatus.REGISTERED) {
      return { attempt: null, order }
    }

    const idempotencyKey = `domain-register:${order.id}`
    const existing = await tx.domainOperationAttempt.findUnique({
      where: {
        tenantId_idempotencyKey: {
          idempotencyKey,
          tenantId: order.tenantId,
        },
      },
    })

    if (
      existing &&
      (existing.status === "RUNNING" || existing.status === "SUCCEEDED")
    ) {
      return { attempt: existing, order }
    }

    const attempt = existing
      ? await tx.domainOperationAttempt.update({
          data: {
            errorCode: null,
            errorMessage: null,
            startedAt: new Date(),
            status: "RUNNING",
          },
          where: { id: existing.id },
        })
      : await tx.domainOperationAttempt.create({
          data: {
            idempotencyKey,
            kind: DomainOperationKind.REGISTER,
            orderId: order.id,
            provider: order.provider,
            requestFingerprint: `${order.normalizedDomain}:${order.quoteId}`,
            startedAt: new Date(),
            status: "RUNNING",
            tenantId: order.tenantId,
          },
        })
    await tx.domainOrder.update({
      data: {
        registrationStartedAt: order.registrationStartedAt ?? new Date(),
        registrationStatus: DomainRegistrationStatus.REGISTERING,
      },
      where: { id: order.id },
    })

    return { attempt, order }
  })
}

export async function completeDomainRegistration(
  db: PrismaClient,
  input: {
    attemptId: string
    expiresAt: Date | null
    orderId: string
    providerCustomerHandle: string | null
    providerDomainId: string | null
    registeredAt: Date
    vercelProjectId: string
  },
) {
  return db.$transaction(async (tx) => {
    const order = await tx.domainOrder.findUniqueOrThrow({
      where: { id: input.orderId },
    })
    const conflictingDomain = await tx.managedDomain.findUnique({
      select: { id: true, tenantId: true },
      where: { hostname: order.normalizedDomain },
    })

    if (conflictingDomain && conflictingDomain.tenantId !== order.tenantId) {
      throw new Error("This hostname belongs to another workspace.")
    }
    await assertHostnameOwnershipAvailable(tx, {
      hostname: order.normalizedDomain,
      tenantId: order.tenantId,
    })
    const managedDomain = await tx.managedDomain.upsert({
      create: {
        expiresAt: input.expiresAt,
        hostname: order.normalizedDomain,
        provider: order.provider,
        providerCustomerHandle: input.providerCustomerHandle,
        providerDomainId: input.providerDomainId,
        registeredAt: input.registeredAt,
        registrantProfileId: order.registrantProfileId,
        renewalMode: DomainRenewalMode.MANUAL,
        status: "ACTIVE",
        storeId: order.storeId,
        tenantId: order.tenantId,
        tld: order.normalizedDomain.endsWith(".com.ng") ? "com.ng" : "com",
      },
      update: {
        expiresAt: input.expiresAt,
        providerCustomerHandle: input.providerCustomerHandle,
        providerDomainId: input.providerDomainId,
        registeredAt: input.registeredAt,
        status: "ACTIVE",
      },
      where: { hostname: order.normalizedDomain },
    })
    const connection = await tx.domainConnection.upsert({
      create: {
        hostname: order.normalizedDomain,
        managedDomainId: managedDomain.id,
        status: "DNS_CONFIGURING",
        storeId: order.storeId,
        tenantId: order.tenantId,
        type: DomainConnectionType.MANAGED,
        vercelProjectId: input.vercelProjectId,
      },
      update: {
        disconnectedAt: null,
        failureCode: null,
        failureMessage: null,
        managedDomainId: managedDomain.id,
        status: "DNS_CONFIGURING",
        type: DomainConnectionType.MANAGED,
        vercelProjectId: input.vercelProjectId,
      },
      where: { hostname: order.normalizedDomain },
    })
    await tx.domainOrder.update({
      data: {
        managedDomainId: managedDomain.id,
        registeredAt: input.registeredAt,
        registrationStatus: DomainRegistrationStatus.REGISTERED,
      },
      where: { id: order.id },
    })
    await tx.domainOperationAttempt.update({
      data: {
        completedAt: new Date(),
        providerReference: input.providerDomainId,
        status: "SUCCEEDED",
      },
      where: { id: input.attemptId },
    })
    await tx.domainEvent.create({
      data: {
        connectionId: connection.id,
        kind: DomainOperationKind.REGISTER,
        managedDomainId: managedDomain.id,
        orderId: order.id,
        provider: order.provider,
        status: "SUCCEEDED",
        tenantId: order.tenantId,
      },
    })

    return { connection, managedDomain, order }
  })
}

export async function failDomainRegistrationAttempt(
  db: PrismaClient,
  input: {
    attemptId: string
    errorCode: string
    errorMessage: string
    isUncertain: boolean
    orderId: string
    providerReference?: string | null
    responseMetadata?: Prisma.InputJsonValue
  },
) {
  const operationStatus: DomainOperationStatus = input.isUncertain
    ? "UNCERTAIN"
    : "FAILED"
  const registrationStatus: DomainRegistrationStatus = input.isUncertain
    ? "UNCERTAIN"
    : "FAILED"

  return db.$transaction(async (tx) => {
    const order = await tx.domainOrder.update({
      data: {
        failedAt: input.isUncertain ? null : new Date(),
        failureCode: input.errorCode,
        failureMessage: input.errorMessage.slice(0, 500),
        registrationStatus,
      },
      where: { id: input.orderId },
    })
    await tx.domainOperationAttempt.update({
      data: {
        completedAt: new Date(),
        errorCode: input.errorCode,
        errorMessage: input.errorMessage.slice(0, 500),
        providerReference: input.providerReference,
        responseMetadata: input.responseMetadata,
        status: operationStatus,
      },
      where: { id: input.attemptId },
    })
    await tx.domainEvent.create({
      data: {
        kind: DomainOperationKind.REGISTER,
        orderId: order.id,
        payload: {
          errorCode: input.errorCode,
          errorMessage: input.errorMessage.slice(0, 500),
        },
        provider: order.provider,
        status: operationStatus,
        tenantId: order.tenantId,
      },
    })

    return serializeDomainOrder(order)
  })
}

export async function markDomainOrderRefundPending(
  db: PrismaClient,
  input: { orderId: string; reason: string },
) {
  return db.$transaction(async (tx) => {
    const order = await tx.domainOrder.update({
      data: { paymentStatus: DomainPaymentStatus.REFUND_PENDING },
      where: {
        id: input.orderId,
        paymentStatus: DomainPaymentStatus.PAID,
      },
    })
    await tx.domainEvent.create({
      data: {
        kind: DomainOperationKind.REFUND,
        orderId: order.id,
        payload: { reason: input.reason.slice(0, 500) },
        provider: order.provider,
        status: "PENDING",
        tenantId: order.tenantId,
      },
    })
    return order
  })
}

export async function markDomainOrderRefunded(
  db: PrismaClient,
  input: {
    paymentReference: string
    providerEventId: string
    rawEvent: Prisma.InputJsonValue
  },
) {
  return db.$transaction(async (tx) => {
    const order = await tx.domainOrder.findUniqueOrThrow({
      where: { paymentReference: input.paymentReference },
    })

    if (order.paymentStatus === DomainPaymentStatus.REFUNDED) {
      return serializeDomainOrder(order)
    }

    const updated = await tx.domainOrder.update({
      data: { paymentStatus: DomainPaymentStatus.REFUNDED },
      where: { id: order.id },
    })
    await tx.domainEvent.create({
      data: {
        kind: DomainOperationKind.REFUND,
        orderId: order.id,
        payload: input.rawEvent,
        provider: order.provider,
        providerEventId: input.providerEventId,
        status: "SUCCEEDED",
        tenantId: order.tenantId,
      },
    })
    return serializeDomainOrder(updated)
  })
}

export async function recordDomainRefundEvent(
  db: PrismaClient,
  input: {
    paymentReference: string
    providerEventId: string
    rawEvent: Prisma.InputJsonValue
    status: DomainOperationStatus
  },
) {
  return db.$transaction(async (tx) => {
    const order = await tx.domainOrder.findUniqueOrThrow({
      where: { paymentReference: input.paymentReference },
    })

    return tx.domainEvent.upsert({
      create: {
        kind: DomainOperationKind.REFUND,
        orderId: order.id,
        payload: input.rawEvent,
        provider: order.provider,
        providerEventId: input.providerEventId,
        status: input.status,
        tenantId: order.tenantId,
      },
      update: {
        payload: input.rawEvent,
        status: input.status,
      },
      where: {
        provider_providerEventId: {
          provider: order.provider,
          providerEventId: input.providerEventId,
        },
      },
    })
  })
}

export async function createExternalDomainConnection(
  db: DbClient,
  input: {
    hostname: string
    ownershipTokenHash: string
    ownershipTokenValue: string
    storeId: string
    tenantId: string
    vercelProjectId: string
  },
) {
  await assertDomainStoreAccess(db, input)
  await assertHostnameOwnershipAvailable(db, input)

  return db.domainConnection.upsert({
    create: {
      hostname: input.hostname,
      ownershipTokenHash: input.ownershipTokenHash,
      status: "OWNERSHIP_PENDING",
      storeId: input.storeId,
      tenantId: input.tenantId,
      type: DomainConnectionType.EXTERNAL,
      vercelProjectId: input.vercelProjectId,
      verificationRecordName: `_ewatrade-verification.${input.hostname}`,
      verificationRecordType: "TXT",
      verificationRecordValue: input.ownershipTokenValue,
    },
    update: {
      disconnectedAt: null,
      failureCode: null,
      failureMessage: null,
      ownershipTokenHash: input.ownershipTokenHash,
      status: "OWNERSHIP_PENDING",
      type: DomainConnectionType.EXTERNAL,
      vercelProjectId: input.vercelProjectId,
      verificationRecordName: `_ewatrade-verification.${input.hostname}`,
      verificationRecordType: "TXT",
      verificationRecordValue: input.ownershipTokenValue,
    },
    where: { hostname: input.hostname },
  })
}

export async function updateDomainConnectionStatus(
  db: PrismaClient,
  input: {
    connectionId: string
    failureCode?: string | null
    failureMessage?: string | null
    status: DomainConnectionStatus
    verificationRecordName?: string | null
    verificationRecordType?: string | null
    verificationRecordValue?: string | null
  },
) {
  return db.$transaction(async (tx) => {
    const connection = await tx.domainConnection.update({
      data: {
        activeAt: input.status === "ACTIVE" ? new Date() : undefined,
        failureCode: input.failureCode,
        failureMessage: input.failureMessage?.slice(0, 500),
        lastCheckedAt: new Date(),
        status: input.status,
        verifiedAt: input.status === "ACTIVE" ? new Date() : undefined,
        verificationRecordName: input.verificationRecordName,
        verificationRecordType: input.verificationRecordType,
        verificationRecordValue: input.verificationRecordValue,
      },
      where: { id: input.connectionId },
    })

    if (input.status === "ACTIVE") {
      await assertHostnameOwnershipAvailable(tx, {
        hostname: connection.hostname,
        tenantId: connection.tenantId,
      })
      await tx.domainConnection.updateMany({
        data: { isPrimary: false },
        where: {
          id: { not: connection.id },
          storeId: connection.storeId,
          tenantId: connection.tenantId,
        },
      })
      await tx.domainConnection.update({
        data: { isPrimary: true },
        where: { id: connection.id },
      })
      await tx.tenantHostname.updateMany({
        data: { isPrimary: false },
        where: {
          surface: TenantHostnameSurface.STOREFRONT,
          tenantId: connection.tenantId,
        },
      })
      await tx.tenantHostname.upsert({
        create: {
          hostname: connection.hostname,
          isCustom: true,
          isPrimary: true,
          surface: TenantHostnameSurface.STOREFRONT,
          tenantId: connection.tenantId,
          verifiedAt: new Date(),
        },
        update: {
          isCustom: true,
          isPrimary: true,
          tenantId: connection.tenantId,
          verifiedAt: new Date(),
        },
        where: { hostname: connection.hostname },
      })

      if (connection.siteId) {
        await tx.site.update({
          data: { domain: connection.hostname },
          where: { id: connection.siteId },
        })
      }
    }

    return connection
  })
}

export async function listDomainConnections(
  db: DbClient,
  input: {
    query?: string | null
    statuses?: DomainConnectionStatus[]
    tenantId: string
  },
) {
  const connections = await db.domainConnection.findMany({
    include: {
      managedDomain: {
        select: {
          expiresAt: true,
          provider: true,
          renewalMode: true,
          status: true,
        },
      },
      store: { select: { id: true, name: true } },
    },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    take: 100,
    where: {
      hostname: input.query
        ? { contains: input.query.trim().toLowerCase(), mode: "insensitive" }
        : undefined,
      status: input.statuses?.length ? { in: input.statuses } : undefined,
      tenantId: input.tenantId,
    },
  })

  return connections.map((connection) => ({
    activeAt: serializeDate(connection.activeAt),
    createdAt: connection.createdAt.toISOString(),
    expiresAt: serializeDate(connection.managedDomain?.expiresAt),
    hostname: connection.hostname,
    id: connection.id,
    isPrimary: connection.isPrimary,
    managedDomainStatus: connection.managedDomain?.status ?? null,
    provider: connection.managedDomain?.provider ?? "EXTERNAL",
    renewalMode: connection.managedDomain?.renewalMode ?? null,
    status: connection.status,
    store: connection.store,
    type: connection.type,
    updatedAt: connection.updatedAt.toISOString(),
    verification: {
      name: connection.verificationRecordName,
      type: connection.verificationRecordType,
      value: connection.verificationRecordValue,
    },
  }))
}

export async function getDomainOrder(
  db: DbClient,
  input: { orderId: string; tenantId: string },
) {
  const order = await db.domainOrder.findFirst({
    where: { id: input.orderId, tenantId: input.tenantId },
  })
  return order ? serializeDomainOrder(order) : null
}

export async function listDueManagedDomains(
  db: DbClient,
  input: { before: Date; limit?: number },
) {
  return db.managedDomain.findMany({
    orderBy: { expiresAt: "asc" },
    take: Math.min(input.limit ?? 100, 500),
    where: {
      expiresAt: { lte: input.before },
      status: { in: ["ACTIVE", "PENDING"] satisfies ManagedDomainStatus[] },
    },
  })
}

export async function listDomainConnectionsForReconciliation(
  db: DbClient,
  input: { limit?: number },
) {
  return db.domainConnection.findMany({
    orderBy: { updatedAt: "asc" },
    select: {
      hostname: true,
      id: true,
      status: true,
      vercelProjectId: true,
    },
    take: Math.min(input.limit ?? 100, 500),
    where: {
      status: { in: ["DNS_CONFIGURING", "VERIFYING", "FAILED"] },
    },
  })
}

export async function listUncertainDomainOrders(
  db: DbClient,
  input: { limit?: number },
) {
  return db.domainOrder.findMany({
    include: {
      operationAttempts: {
        orderBy: { createdAt: "desc" },
        take: 1,
        where: {
          kind: DomainOperationKind.REGISTER,
          status: "UNCERTAIN",
        },
      },
    },
    orderBy: { updatedAt: "asc" },
    take: Math.min(input.limit ?? 100, 500),
    where: {
      paymentStatus: DomainPaymentStatus.PAID,
      registrationStatus: DomainRegistrationStatus.UNCERTAIN,
    },
  })
}

export async function reconcileManagedDomain(
  db: DbClient,
  input: {
    expiresAt: Date | null
    managedDomainId: string
    providerDomainId: string | null
    providerStatus: string
  },
) {
  const statusByProviderState: Partial<Record<string, ManagedDomainStatus>> = {
    active: "ACTIVE",
    expired: "EXPIRED",
    failed: "FAILED",
    pending: "PENDING",
    redemption: "REDEMPTION",
    suspended: "SUSPENDED",
    transferred_out: "TRANSFERRED_OUT",
  }
  const status = statusByProviderState[input.providerStatus.toLowerCase()]

  return db.managedDomain.update({
    data: {
      expiresAt: input.expiresAt ?? undefined,
      lastSyncedAt: new Date(),
      providerDomainId: input.providerDomainId ?? undefined,
      status: status ?? undefined,
    },
    where: { id: input.managedDomainId },
  })
}

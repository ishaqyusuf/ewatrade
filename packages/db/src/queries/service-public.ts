import { createHash, randomBytes, randomUUID } from "node:crypto"

import {
  multiplyExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"

import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  CatalogRecordStatus,
  CustomerTrackingStatus,
  OfferingPricingPolicy,
  PaymentStatus,
  SellableOfferingKind,
  ServiceDeliveryAttemptStatus,
  ServiceEvidenceUploadStatus,
  ServiceEvidenceVisibility,
  ServiceJobLineStatus,
  ServiceNotificationChannel,
  ServiceNotificationIntentStatus,
  ServicePriority,
  ServiceQuoteStatus,
  ServiceRequestFormStatus,
  ServiceRequestStatus,
  ServiceWorkEventType,
  ServiceWorkPolicy,
  WorkAuthorizationPolicy,
  WorkAuthorizationStatus,
} from "../../generated/prisma/enums"
import { CatalogError } from "./catalog"
import { createCommercialOrderInTransaction } from "./commercial-orders"

function token() {
  return randomBytes(32).toString("base64url")
}

function digest(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

function stableJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString())
  if (value === undefined || value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null"
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`
}

function hash(value: unknown) {
  return digest(stableJson(value))
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function lineTotal(unitPriceMinor: number, quantity: string) {
  const total = multiplyExactDecimals(String(unitPriceMinor), quantity)
  if (!/^\d+$/.test(total)) {
    throw new CatalogError(
      "QUOTE_CONFLICT",
      "Quoted line total must resolve to a whole minor currency unit.",
    )
  }
  return Number(total)
}

export async function createServiceRequestForm(
  db: PrismaClient,
  input: {
    activeFrom?: Date
    actorUserId: string
    expiresAt?: Date
    label: string
    offeringIds: string[]
    storeId: string
    tenantId: string
  },
) {
  const rawToken = token()
  const form = await db.$transaction(async (tx) => {
    const offerings = await tx.sellableOffering.count({
      where: {
        id: { in: input.offeringIds },
        kind: SellableOfferingKind.SERVICE,
        status: CatalogRecordStatus.ACTIVE,
        storeAvailability: {
          some: { isAvailable: true, storeId: input.storeId },
        },
        tenantId: input.tenantId,
      },
    })
    if (offerings !== new Set(input.offeringIds).size) {
      throw new CatalogError(
        "OFFERING_UNAVAILABLE",
        "Request Form contains an unavailable Service Offering.",
      )
    }
    const created = await tx.serviceRequestForm.create({
      data: {
        activeFrom: input.activeFrom,
        createdByUserId: input.actorUserId,
        expiresAt: input.expiresAt,
        label: input.label.trim(),
        publicTokenDigest: digest(rawToken),
        status: ServiceRequestFormStatus.ACTIVE,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    await tx.serviceRequestFormOffering.createMany({
      data: input.offeringIds.map((offeringId) => ({
        offeringId,
        requestFormId: created.id,
      })),
    })
    return created
  })
  return { form, token: rawToken }
}

export async function listServiceRequestForms(
  db: PrismaClient,
  input: { storeId?: string; tenantId: string },
) {
  const forms = await db.serviceRequestForm.findMany({
    include: {
      offerings: {
        include: {
          offering: {
            include: { catalogItem: true, variant: true },
          },
        },
      },
      _count: { select: { requests: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    where: { storeId: input.storeId, tenantId: input.tenantId },
  })
  return forms.map((form) => ({
    activeFrom: form.activeFrom,
    createdAt: form.createdAt,
    expiresAt: form.expiresAt,
    id: form.id,
    label: form.label,
    offerings: form.offerings.map(({ offering }) => ({
      catalogItemName: offering.catalogItem.name,
      id: offering.id,
      name: offering.name,
      variantName: offering.variant.name,
    })),
    requestCount: form._count.requests,
    status: form.status,
    storeId: form.storeId,
  }))
}

export async function listServiceRequests(
  db: PrismaClient,
  input: {
    limit?: number
    status?:
      | "submitted"
      | "needs_information"
      | "quoted"
      | "declined"
      | "converted"
    storeId?: string
    tenantId: string
  },
) {
  const status =
    input.status === "needs_information"
      ? ServiceRequestStatus.NEEDS_INFORMATION
      : input.status === "quoted"
        ? ServiceRequestStatus.QUOTED
        : input.status === "declined"
          ? ServiceRequestStatus.DECLINED
          : input.status === "converted"
            ? ServiceRequestStatus.CONVERTED
            : input.status === "submitted"
              ? ServiceRequestStatus.SUBMITTED
              : undefined
  const requests = await db.serviceRequest.findMany({
    include: {
      currentQuote: {
        include: { currentVersion: true },
      },
      lines: {
        include: {
          offering: true,
        },
      },
      requestForm: { select: { label: true } },
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(input.limit ?? 100, 1), 200),
    where: {
      status,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  return requests.map((request) => ({
    createdAt: request.createdAt,
    currentQuote: request.currentQuote?.currentVersion
      ? {
          currencyCode: request.currentQuote.currentVersion.currencyCode,
          expiresAt: request.currentQuote.currentVersion.expiresAt,
          status: request.currentQuote.currentVersion.status,
          totalMinor: request.currentQuote.currentVersion.totalMinor,
          version: request.currentQuote.currentVersion.version,
        }
      : null,
    customerEmail: request.customerEmail,
    customerName: request.customerName,
    customerPhone: request.customerPhone,
    details: request.details,
    formLabel: request.requestForm.label,
    id: request.id,
    lines: request.lines.map((line) => ({
      details: line.details,
      fixedPriceMinor: line.offering.fixedPriceMinor,
      id: line.id,
      offeringId: line.offeringId,
      offeringName: line.offeringName,
      quantity: line.requestedQuantity.toString(),
      variantName: line.variantName,
    })),
    requestedAt: request.requestedAt,
    staffResponse: request.staffResponse,
    status: request.status,
    storeId: request.storeId,
  }))
}

export async function getPublicServiceRequestForm(
  db: PrismaClient,
  input: { formToken: string },
) {
  const now = new Date()
  const form = await db.serviceRequestForm.findFirst({
    include: {
      offerings: {
        include: {
          offering: {
            include: {
              catalogItem: true,
              serviceOffering: true,
              storeAvailability: true,
              variant: true,
            },
          },
        },
      },
      store: { select: { currencyCode: true, name: true } },
    },
    where: {
      AND: [
        { OR: [{ activeFrom: null }, { activeFrom: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
      publicTokenDigest: digest(input.formToken),
      status: ServiceRequestFormStatus.ACTIVE,
    },
  })
  if (!form) {
    throw new CatalogError(
      "PUBLIC_TOKEN_INVALID",
      "This Service Request Form is unavailable.",
    )
  }
  return {
    label: form.label,
    offerings: form.offerings.flatMap(({ offering }) => {
      const available = offering.storeAvailability.some(
        (row) => row.storeId === form.storeId && row.isAvailable,
      )
      if (
        !available ||
        offering.status !== CatalogRecordStatus.ACTIVE ||
        !offering.serviceOffering
      ) {
        return []
      }
      return [
        {
          catalogItemName: offering.catalogItem.name,
          fixedPriceMinor: offering.fixedPriceMinor,
          guidance: offering.serviceOffering.guidance,
          id: offering.id,
          name: offering.name,
          pricingPolicy:
            offering.pricingPolicy === OfferingPricingPolicy.FIXED
              ? ("fixed" as const)
              : ("quote_required" as const),
          quantityScale: offering.serviceOffering.quantityScale,
          variantName: offering.variant.name,
        },
      ]
    }),
    store: form.store,
  }
}

export async function submitPublicServiceRequest(
  db: PrismaClient,
  input: {
    clientRequestId: string
    customerEmail?: string
    customerName: string
    customerPhone?: string
    details?: string
    formToken: string
    lines: Array<{
      details?: string
      offeringId: string
      quantity: string
    }>
    requestedAt?: Date
  },
) {
  const now = new Date()
  const payloadHash = hash({
    customerEmail: input.customerEmail?.trim() || null,
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone?.trim() || null,
    details: input.details?.trim() || null,
    lines: input.lines,
    requestedAt: input.requestedAt ?? null,
  })
  return db.$transaction(async (tx) => {
    const form = await tx.serviceRequestForm.findFirst({
      include: {
        offerings: {
          include: {
            offering: {
              include: {
                serviceOffering: true,
                variant: {
                  include: {
                    selections: { include: { group: true, value: true } },
                  },
                },
              },
            },
          },
        },
      },
      where: {
        AND: [
          { OR: [{ activeFrom: null }, { activeFrom: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ],
        publicTokenDigest: digest(input.formToken),
        status: ServiceRequestFormStatus.ACTIVE,
      },
    })
    if (!form) {
      throw new CatalogError(
        "PUBLIC_TOKEN_INVALID",
        "This Service Request Form is unavailable.",
      )
    }
    const previous = await tx.serviceRequest.findUnique({
      where: {
        tenantId_clientRequestId: {
          clientRequestId: input.clientRequestId,
          tenantId: form.tenantId,
        },
      },
    })
    if (previous) {
      if (previous.payloadHash !== payloadHash) {
        throw new CatalogError(
          "IDEMPOTENCY_MISMATCH",
          "This request command was already used with different details.",
        )
      }
      return previous
    }
    const allowed = new Map(
      form.offerings.map((row) => [row.offeringId, row.offering]),
    )
    for (const line of input.lines) {
      const offering = allowed.get(line.offeringId)
      if (!offering?.serviceOffering) {
        throw new CatalogError(
          "OFFERING_UNAVAILABLE",
          "Request selected an Offering outside this Form.",
        )
      }
      parseExactDecimal(line.quantity, {
        allowZero: false,
        maxScale: offering.serviceOffering.quantityScale,
      })
    }
    const request = await tx.serviceRequest.create({
      data: {
        clientRequestId: input.clientRequestId,
        payloadHash,
        customerEmail: input.customerEmail?.trim() || null,
        customerName: input.customerName.trim(),
        customerPhone: input.customerPhone?.trim() || null,
        details: input.details?.trim() || null,
        requestFormId: form.id,
        requestedAt: input.requestedAt,
        storeId: form.storeId,
        tenantId: form.tenantId,
      },
    })
    for (const line of input.lines) {
      const offering = allowed.get(line.offeringId)!
      await tx.serviceRequestLine.create({
        data: {
          details: line.details?.trim() || null,
          offeringId: offering.id,
          offeringName: offering.name,
          optionSelections: json(
            offering.variant.selections.map((selection) => ({
              group: selection.group.name,
              value: selection.value.label,
            })),
          ),
          requestId: request.id,
          requestedQuantity: parseExactDecimal(line.quantity, {
            allowZero: false,
            maxScale: offering.serviceOffering!.quantityScale,
          }),
          variantName: offering.variant.name,
        },
      })
    }
    return request
  })
}

export async function updateServiceRequestDisposition(
  db: PrismaClient,
  input: {
    response: string
    requestId: string
    status: "declined" | "needs_information"
    tenantId: string
  },
) {
  const request = await db.serviceRequest.findFirst({
    where: { id: input.requestId, tenantId: input.tenantId },
  })
  if (!request) {
    throw new CatalogError(
      "SERVICE_INTAKE_NOT_FOUND",
      "Service Request not found.",
    )
  }
  return db.serviceRequest.update({
    data: {
      staffResponse: input.response.trim(),
      status:
        input.status === "declined"
          ? ServiceRequestStatus.DECLINED
          : ServiceRequestStatus.NEEDS_INFORMATION,
    },
    where: { id: request.id },
  })
}

export async function issueServiceQuote(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientQuoteId: string
    clientVersionId: string
    discountMinor?: number
    expiresAt?: Date
    lines: Array<{
      offeringId: string
      quantity: string
      unitPriceMinor: number
    }>
    requestId?: string
    storeId: string
    taxMinor?: number
    tenantId: string
  },
) {
  const rawToken = token()
  const payloadHash = hash({
    discountMinor: input.discountMinor ?? 0,
    expiresAt: input.expiresAt ?? null,
    lines: input.lines,
    requestId: input.requestId ?? null,
    storeId: input.storeId,
    taxMinor: input.taxMinor ?? 0,
  })
  return db.$transaction(async (tx) => {
    const store = await tx.store.findFirst({
      where: { id: input.storeId, tenantId: input.tenantId },
    })
    if (!store) throw new CatalogError("STORE_NOT_FOUND", "Store not found.")
    const quote = await tx.serviceQuote.upsert({
      create: {
        clientQuoteId: input.clientQuoteId,
        createdByUserId: input.actorUserId,
        requestId: input.requestId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
      update: {},
      where: {
        tenantId_clientQuoteId: {
          clientQuoteId: input.clientQuoteId,
          tenantId: input.tenantId,
        },
      },
    })
    const current = quote.currentVersionId
      ? await tx.serviceQuoteVersion.findUnique({
          where: { id: quote.currentVersionId },
        })
      : null
    const previousVersion = await tx.serviceQuoteVersion.findUnique({
      where: {
        quoteId_clientVersionId: {
          clientVersionId: input.clientVersionId,
          quoteId: quote.id,
        },
      },
    })
    if (previousVersion) {
      if (previousVersion.payloadHash !== payloadHash) {
        throw new CatalogError(
          "IDEMPOTENCY_MISMATCH",
          "This Quote version command was already used with different details.",
        )
      }
      return {
        quoteId: quote.id,
        token: null,
        versionId: previousVersion.id,
      }
    }
    if (current?.status === ServiceQuoteStatus.ACCEPTED) {
      throw new CatalogError(
        "QUOTE_CONFLICT",
        "An accepted Quote cannot be revised.",
      )
    }
    const offerings = await tx.sellableOffering.findMany({
      include: {
        catalogItem: true,
        serviceOffering: true,
        storeAvailability: { where: { storeId: input.storeId } },
        variant: {
          include: {
            selections: { include: { group: true, value: true } },
          },
        },
      },
      where: {
        id: { in: input.lines.map((line) => line.offeringId) },
        kind: SellableOfferingKind.SERVICE,
        status: CatalogRecordStatus.ACTIVE,
        tenantId: input.tenantId,
      },
    })
    if (
      offerings.length !==
      new Set(input.lines.map((line) => line.offeringId)).size
    ) {
      throw new CatalogError(
        "OFFERING_UNAVAILABLE",
        "Quote contains an unavailable Service Offering.",
      )
    }
    const byId = new Map(offerings.map((offering) => [offering.id, offering]))
    let subtotalMinor = 0
    const resolved = input.lines.map((line) => {
      const offering = byId.get(line.offeringId)!
      if (
        !offering.serviceOffering ||
        !offering.storeAvailability[0]?.isAvailable
      ) {
        throw new CatalogError(
          "OFFERING_UNAVAILABLE",
          "Quote contains a Store-unavailable Service Offering.",
        )
      }
      if (
        !Number.isSafeInteger(line.unitPriceMinor) ||
        line.unitPriceMinor < 0
      ) {
        throw new CatalogError("QUOTE_CONFLICT", "Quote price is invalid.")
      }
      const quantity = parseExactDecimal(line.quantity, {
        allowZero: false,
        maxScale: offering.serviceOffering.quantityScale,
      })
      const totalMinor = lineTotal(line.unitPriceMinor, quantity)
      subtotalMinor += totalMinor
      return { line, offering, quantity, totalMinor }
    })
    const discountMinor = input.discountMinor ?? 0
    const taxMinor = input.taxMinor ?? 0
    const totalMinor = subtotalMinor - discountMinor + taxMinor
    if (totalMinor < 0) {
      throw new CatalogError(
        "QUOTE_CONFLICT",
        "Quote total cannot be negative.",
      )
    }
    const last = await tx.serviceQuoteVersion.aggregate({
      _max: { version: true },
      where: { quoteId: quote.id },
    })
    if (current) {
      await tx.serviceQuoteVersion.update({
        data: {
          status: ServiceQuoteStatus.SUPERSEDED,
          supersededAt: new Date(),
        },
        where: { id: current.id },
      })
    }
    const version = await tx.serviceQuoteVersion.create({
      data: {
        acceptanceTokenDigest: digest(rawToken),
        clientVersionId: input.clientVersionId,
        createdByUserId: input.actorUserId,
        currencyCode: store.currencyCode,
        discountMinor,
        expiresAt: input.expiresAt,
        issuedAt: new Date(),
        payloadHash,
        quoteId: quote.id,
        status: ServiceQuoteStatus.ISSUED,
        subtotalMinor,
        taxMinor,
        totalMinor,
        version: (last._max.version ?? 0) + 1,
      },
    })
    await tx.serviceQuoteLine.createMany({
      data: resolved.map(({ line, offering, quantity, totalMinor }) => ({
        catalogItemName: offering.catalogItem.name,
        offeringId: offering.id,
        offeringName: offering.name,
        optionSelections: json(
          offering.variant.selections.map((selection) => ({
            group: selection.group.name,
            value: selection.value.label,
          })),
        ),
        quantity,
        quoteVersionId: version.id,
        totalMinor,
        unitPriceMinor: line.unitPriceMinor,
        variantName: offering.variant.name,
      })),
    })
    await tx.serviceQuote.update({
      data: { currentVersionId: version.id },
      where: { id: quote.id },
    })
    if (input.requestId) {
      await tx.serviceRequest.updateMany({
        data: {
          currentQuoteId: quote.id,
          status: ServiceRequestStatus.QUOTED,
        },
        where: { id: input.requestId, tenantId: input.tenantId },
      })
    }
    return { quoteId: quote.id, token: rawToken, versionId: version.id }
  })
}

async function createTrackedJobsForOrder(
  tx: Prisma.TransactionClient,
  input: {
    actorUserId: string
    commercialOrderId: string
    sourceKey: string
    storeId: string
    tenantId: string
  },
) {
  const order = await tx.commercialOrder.findUniqueOrThrow({
    where: { id: input.commercialOrderId },
  })
  const lines = await tx.commercialOrderLine.findMany({
    include: {
      offering: { include: { serviceOffering: true } },
      snapshot: true,
    },
    where: {
      orderId: input.commercialOrderId,
      offering: { serviceOffering: { workPolicy: ServiceWorkPolicy.TRACKED } },
    },
  })
  if (lines.length === 0) return null
  const job = await tx.serviceJob.create({
    data: {
      clientJobId: `${input.sourceKey}:job:1`,
      commercialOrderId: order.id,
      createdByUserId: input.actorUserId,
      priority: ServicePriority.NORMAL,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  for (const orderLine of lines) {
    const policy = orderLine.offering.serviceOffering!.authorizationPolicy
    const authorizationStatus =
      policy === WorkAuthorizationPolicy.ON_ORDER_CONFIRMATION ||
      (policy === WorkAuthorizationPolicy.AFTER_REQUIRED_PAYMENT &&
        order.paymentStatus === PaymentStatus.PAID)
        ? WorkAuthorizationStatus.AUTHORIZED
        : policy === WorkAuthorizationPolicy.AFTER_REQUIRED_PAYMENT
          ? WorkAuthorizationStatus.PENDING_PAYMENT
          : WorkAuthorizationStatus.PENDING_RELEASE
    const line = await tx.serviceJobLine.create({
      data: {
        allocatedQuantity: orderLine.quantity,
        allocationSnapshot: json(orderLine.snapshot),
        authorizationPolicy: policy,
        authorizationSource:
          authorizationStatus === WorkAuthorizationStatus.AUTHORIZED
            ? "quote_acceptance"
            : null,
        authorizationStatus,
        authorizedAt:
          authorizationStatus === WorkAuthorizationStatus.AUTHORIZED
            ? new Date()
            : null,
        commercialOrderLineId: orderLine.id,
        serviceJobId: job.id,
      },
    })
    await tx.serviceWorkEvent.create({
      data: {
        actorUserId: input.actorUserId,
        serviceJobId: job.id,
        serviceJobLineId: line.id,
        source: "quote_acceptance",
        tenantId: input.tenantId,
        type: ServiceWorkEventType.CREATED,
      },
    })
  }
  return job.id
}

export async function acceptServiceQuote(
  db: PrismaClient,
  input: {
    acceptanceToken: string
    actorUserId: string
    clientAcceptanceId: string
  },
) {
  return db.$transaction(async (tx) => {
    const version = await tx.serviceQuoteVersion.findFirst({
      include: { lines: true, quote: { include: { request: true } } },
      where: { acceptanceTokenDigest: digest(input.acceptanceToken) },
    })
    if (!version) {
      throw new CatalogError("PUBLIC_TOKEN_INVALID", "Quote is unavailable.")
    }
    if (version.status === ServiceQuoteStatus.ACCEPTED) {
      if (version.acceptanceClientId !== input.clientAcceptanceId) {
        throw new CatalogError(
          "IDEMPOTENCY_MISMATCH",
          "Quote was already accepted with another command identity.",
        )
      }
      return {
        jobId: await tx.serviceJob
          .findFirst({ where: { commercialOrderId: version.acceptedOrderId! } })
          .then((job) => job?.id ?? null),
        orderId: version.acceptedOrderId!,
      }
    }
    if (
      version.status !== ServiceQuoteStatus.ISSUED ||
      version.quote.currentVersionId !== version.id ||
      (version.expiresAt && version.expiresAt <= new Date())
    ) {
      throw new CatalogError(
        "QUOTE_CONFLICT",
        "Only the current unexpired Quote Version can be accepted.",
      )
    }
    const request = version.quote.request
    const order = await createCommercialOrderInTransaction(tx, {
      actorUserId: input.actorUserId,
      clientOrderId: `${input.clientAcceptanceId}:order`,
      customerEmail: request?.customerEmail ?? undefined,
      customerName: request?.customerName ?? undefined,
      customerPhone: request?.customerPhone ?? undefined,
      createTrackedServiceWork: false,
      discountMinor: version.discountMinor,
      lines: version.lines.map((line) => ({
        offeringId: line.offeringId,
        quantity: line.quantity.toString(),
        trustedUnitPriceMinor: line.unitPriceMinor,
      })),
      schemaVersion: 1,
      storeId: version.quote.storeId,
      taxMinor: version.taxMinor,
      tenantId: version.quote.tenantId,
    })
    const jobId = await createTrackedJobsForOrder(tx, {
      actorUserId: input.actorUserId,
      commercialOrderId: order.id,
      sourceKey: input.clientAcceptanceId,
      storeId: version.quote.storeId,
      tenantId: version.quote.tenantId,
    })
    await tx.serviceQuoteVersion.update({
      data: {
        acceptanceClientId: input.clientAcceptanceId,
        acceptedAt: new Date(),
        acceptedOrderId: order.id,
        status: ServiceQuoteStatus.ACCEPTED,
      },
      where: { id: version.id },
    })
    if (request) {
      await tx.serviceRequest.update({
        data: {
          convertedAt: new Date(),
          status: ServiceRequestStatus.CONVERTED,
        },
        where: { id: request.id },
      })
    }
    return { jobId, orderId: order.id }
  })
}

export async function getPublicServiceQuote(
  db: PrismaClient,
  input: { acceptanceToken: string },
) {
  const version = await db.serviceQuoteVersion.findFirst({
    include: {
      lines: true,
      quote: { include: { store: { select: { name: true } } } },
    },
    where: { acceptanceTokenDigest: digest(input.acceptanceToken) },
  })
  if (
    !version ||
    version.quote.currentVersionId !== version.id ||
    (version.status !== ServiceQuoteStatus.ISSUED &&
      version.status !== ServiceQuoteStatus.ACCEPTED) ||
    (version.expiresAt && version.expiresAt <= new Date())
  ) {
    throw new CatalogError("PUBLIC_TOKEN_INVALID", "Quote is unavailable.")
  }
  return {
    accepted: version.status === ServiceQuoteStatus.ACCEPTED,
    currencyCode: version.currencyCode,
    discountMinor: version.discountMinor,
    expiresAt: version.expiresAt,
    lines: version.lines.map((line) => ({
      catalogItemName: line.catalogItemName,
      offeringName: line.offeringName,
      quantity: line.quantity.toString(),
      totalMinor: line.totalMinor,
      unitPriceMinor: line.unitPriceMinor,
      variantName: line.variantName,
    })),
    storeName: version.quote.store.name,
    subtotalMinor: version.subtotalMinor,
    taxMinor: version.taxMinor,
    totalMinor: version.totalMinor,
    version: version.version,
  }
}

export async function createCustomerTrackingAccess(
  db: PrismaClient,
  input: {
    actorUserId: string
    customerScopeKey: string
    expiresAt?: Date
    jobId: string
    tenantId: string
  },
) {
  const job = await db.serviceJob.findFirst({
    where: { id: input.jobId, tenantId: input.tenantId },
  })
  if (!job) throw new CatalogError("SERVICE_JOB_NOT_FOUND", "Job not found.")
  const rawToken = token()
  const access = await db.customerTrackingAccess.create({
    data: {
      createdByUserId: input.actorUserId,
      customerScopeKey: input.customerScopeKey,
      expiresAt: input.expiresAt,
      serviceJobId: job.id,
      tenantId: input.tenantId,
      tokenDigest: digest(rawToken),
    },
  })
  return { accessId: access.id, token: rawToken }
}

function publicMilestone(statuses: ServiceJobLineStatus[]) {
  if (statuses.every((status) => status === ServiceJobLineStatus.CANCELLED)) {
    return "cancelled"
  }
  if (
    statuses.every(
      (status) =>
        status === ServiceJobLineStatus.COMPLETED ||
        status === ServiceJobLineStatus.CANCELLED,
    )
  ) {
    return "completed"
  }
  const ready = statuses.filter(
    (status) =>
      status === ServiceJobLineStatus.READY_FOR_HANDOFF ||
      status === ServiceJobLineStatus.COMPLETED,
  ).length
  if (ready > 0 && ready < statuses.length) return "partially_ready"
  if (ready > 0) return "ready"
  if (statuses.some((status) => status === ServiceJobLineStatus.IN_PROGRESS)) {
    return "work_started"
  }
  return "received"
}

export async function getPublicServiceTracking(
  db: PrismaClient,
  input: { trackingToken: string },
) {
  return db.$transaction(async (tx) => {
    const access = await tx.customerTrackingAccess.findFirst({
      include: {
        serviceJob: {
          include: {
            commercialOrder: {
              select: { customerName: true, orderNumber: true },
            },
            dueCommitments: { where: { supersededAt: null } },
            evidence: {
              select: {
                label: true,
                mediaType: true,
                purpose: true,
                publishedAt: true,
                safePublicAssetId: true,
              },
              where: {
                safePublicAssetId: { not: null },
                uploadStatus: ServiceEvidenceUploadStatus.AVAILABLE,
                visibility: ServiceEvidenceVisibility.PUBLISHED,
              },
            },
            lines: {
              include: {
                commercialOrderLine: { include: { snapshot: true } },
              },
            },
            notificationIntents: {
              select: {
                createdAt: true,
                renderedMessage: true,
                renderedSubject: true,
              },
              where: {
                status: {
                  in: [
                    ServiceNotificationIntentStatus.READY,
                    ServiceNotificationIntentStatus.COMPLETED,
                  ],
                },
              },
            },
            tenant: { select: { timezone: true } },
          },
        },
      },
      where: {
        status: CustomerTrackingStatus.ACTIVE,
        tokenDigest: digest(input.trackingToken),
      },
    })
    if (!access || (access.expiresAt && access.expiresAt <= new Date())) {
      throw new CatalogError(
        "PUBLIC_TOKEN_INVALID",
        "Tracking access is unavailable.",
      )
    }
    const now = new Date()
    const windowAge = now.getTime() - access.rateWindowStartedAt.getTime()
    if (windowAge < 60_000 && access.rateWindowCount >= 60) {
      throw new CatalogError(
        "PUBLIC_TOKEN_INVALID",
        "Tracking access is temporarily unavailable.",
      )
    }
    await tx.customerTrackingAccess.update({
      data:
        windowAge >= 60_000
          ? {
              accessCount: { increment: 1 },
              lastAccessedAt: now,
              rateWindowCount: 1,
              rateWindowStartedAt: now,
            }
          : {
              accessCount: { increment: 1 },
              lastAccessedAt: now,
              rateWindowCount: { increment: 1 },
            },
      where: { id: access.id },
    })
    const job = access.serviceJob
    return {
      customerName: job.commercialOrder.customerName,
      dueAt: job.dueCommitments[0]?.promisedAt ?? null,
      evidence: job.evidence,
      lines: job.lines.map((line) => ({
        item: line.commercialOrderLine.snapshot?.catalogItemName ?? "Service",
        offering: line.commercialOrderLine.snapshot?.offeringName ?? "Service",
        quantity: line.allocatedQuantity.toString(),
        ready:
          line.status === ServiceJobLineStatus.READY_FOR_HANDOFF ||
          line.status === ServiceJobLineStatus.COMPLETED,
      })),
      messages: job.notificationIntents,
      milestone: publicMilestone(job.lines.map((line) => line.status)),
      orderNumber: job.commercialOrder.orderNumber,
      timeZone: job.tenant.timezone,
    }
  })
}

export async function revokeCustomerTrackingAccess(
  db: PrismaClient,
  input: { accessId: string; actorUserId: string; tenantId: string },
) {
  return db.customerTrackingAccess.updateMany({
    data: {
      revokedAt: new Date(),
      revokedByUserId: input.actorUserId,
      status: CustomerTrackingStatus.REVOKED,
    },
    where: { id: input.accessId, tenantId: input.tenantId },
  })
}

export async function createServiceNotificationIntent(
  db: PrismaClient,
  input: {
    actorUserId: string
    audienceKey: string
    businessEventKey: string
    customerEmail?: string
    customerPhone?: string
    jobId: string
    renderedMessage: string
    renderedSubject?: string
    templatePurpose: string
    tenantId: string
  },
) {
  const job = await db.serviceJob.findFirst({
    where: { id: input.jobId, tenantId: input.tenantId },
  })
  if (!job) throw new CatalogError("SERVICE_JOB_NOT_FOUND", "Job not found.")
  return db.serviceNotificationIntent.upsert({
    create: {
      audienceKey: input.audienceKey,
      businessEventKey: input.businessEventKey,
      createdByUserId: input.actorUserId,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone,
      renderedMessage: input.renderedMessage.trim(),
      renderedSubject: input.renderedSubject?.trim() || null,
      serviceJobId: job.id,
      status: ServiceNotificationIntentStatus.READY,
      storeId: job.storeId,
      templatePurpose: input.templatePurpose,
      tenantId: input.tenantId,
    },
    update: {},
    where: {
      tenantId_businessEventKey_audienceKey_templatePurpose: {
        audienceKey: input.audienceKey,
        businessEventKey: input.businessEventKey,
        templatePurpose: input.templatePurpose,
        tenantId: input.tenantId,
      },
    },
  })
}

export async function recordServiceManualShare(
  db: PrismaClient,
  input: {
    actorUserId: string
    channel?: "email" | "manual" | "sms" | "whatsapp"
    intentId: string
    note?: string
    tenantId: string
  },
) {
  const intent = await db.serviceNotificationIntent.findFirst({
    where: { id: input.intentId, tenantId: input.tenantId },
  })
  if (!intent)
    throw new CatalogError("SERVICE_JOB_NOT_FOUND", "Intent not found.")
  const channel =
    input.channel === "email"
      ? ServiceNotificationChannel.EMAIL
      : input.channel === "sms"
        ? ServiceNotificationChannel.SMS
        : input.channel === "whatsapp"
          ? ServiceNotificationChannel.WHATSAPP
          : ServiceNotificationChannel.MANUAL
  return db.serviceManualShare.create({
    data: {
      channel,
      note: input.note?.trim() || null,
      notificationIntentId: intent.id,
      sharedByUserId: input.actorUserId,
    },
  })
}

export async function recordServiceDeliveryAttempt(
  db: PrismaClient,
  input: {
    channel: "email" | "sms" | "whatsapp"
    failureCode?: string
    failureMessage?: string
    intentId: string
    providerAttemptId?: string
    providerKey: string
    status: "delivered" | "failed" | "pending" | "sent"
    tenantId: string
  },
) {
  const intent = await db.serviceNotificationIntent.findFirst({
    where: { id: input.intentId, tenantId: input.tenantId },
  })
  if (!intent)
    throw new CatalogError("SERVICE_JOB_NOT_FOUND", "Intent not found.")
  return db.serviceDeliveryAttempt.create({
    data: {
      channel:
        input.channel === "email"
          ? ServiceNotificationChannel.EMAIL
          : input.channel === "sms"
            ? ServiceNotificationChannel.SMS
            : ServiceNotificationChannel.WHATSAPP,
      completedAt: input.status === "pending" ? null : new Date(),
      failureCode: input.failureCode,
      failureMessage: input.failureMessage,
      notificationIntentId: intent.id,
      providerAttemptId: input.providerAttemptId,
      providerKey: input.providerKey,
      status:
        input.status === "delivered"
          ? ServiceDeliveryAttemptStatus.DELIVERED
          : input.status === "failed"
            ? ServiceDeliveryAttemptStatus.FAILED
            : input.status === "sent"
              ? ServiceDeliveryAttemptStatus.SENT
              : ServiceDeliveryAttemptStatus.PENDING,
    },
  })
}

import { createHash, randomBytes } from "node:crypto"

import {
  multiplyExactDecimals,
  parseExactDecimal,
} from "@ewatrade/utils/exact-decimal"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  CatalogAvailabilityAttestationType,
  CatalogRecordStatus,
  CommerceQuoteSourceType,
  CustomerTrackingStatus,
  PaymentStatus,
  SellableOfferingKind,
  ServiceCommerceIntakeChannelOrigin,
  ServiceDeliveryAttemptStatus,
  ServiceEvidenceUploadStatus,
  ServiceEvidenceVisibility,
  ServiceJobLineStatus,
  ServiceNotificationChannel,
  ServiceNotificationIntentStatus,
  ServicePriority,
  ServiceRequestFormStatus,
  ServiceRequestStatus,
  ServiceWorkEventType,
  ServiceWorkPolicy,
  WorkAuthorizationPolicy,
  WorkAuthorizationStatus,
} from "../../generated/prisma/enums"
import { CatalogError } from "./catalog"
import {
  CommerceQuoteError,
  getCommerceQuoteAcceptanceContext,
  getPublicCommerceQuote,
  issueCommerceQuote,
  recordCommerceQuoteAcceptance,
  selectCommerceQuoteOption,
} from "./commerce-quotes"
import { createCommercialOrderInTransaction } from "./commercial-orders"
import {
  type ServiceCommerceIntakeAuthorizationContext,
  assertServiceCommerceIntakeContextInTransaction,
} from "./service-commerce-intake-context"
import {
  assertServiceCommercePolicyAllowedInTransaction,
  evaluateServiceCommercePolicy,
} from "./service-commerce-policy"
import {
  projectPublicServiceRequestForm,
  publicServiceRequestFormInclude,
} from "./service-public-projection"

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

const intakeChannelOriginMap = {
  staff: ServiceCommerceIntakeChannelOrigin.STAFF,
  web: ServiceCommerceIntakeChannelOrigin.WEB,
  whatsapp: ServiceCommerceIntakeChannelOrigin.WHATSAPP,
} as const

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
    await assertServiceCommercePolicyAllowedInTransaction(tx, {
      actorUserId: input.actorUserId,
      channel: "staff",
      purpose: "service_request_form_create",
      storeId: input.storeId,
      subject: "web",
      tenantId: input.tenantId,
      vertical: "service",
    })
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
  const quotes = await db.commerceQuote.findMany({
    include: { currentVersion: true },
    where: {
      sourceId: { in: requests.map((request) => request.id) },
      sourceType: CommerceQuoteSourceType.SERVICE_REQUEST,
      tenantId: input.tenantId,
    },
  })
  const quoteByRequestId = new Map(
    quotes.map((quote) => [quote.sourceId, quote.currentVersion]),
  )
  return requests.map((request) => {
    const currentQuote = quoteByRequestId.get(request.id)
    return {
      createdAt: request.createdAt,
      currentQuote: currentQuote
        ? {
            currencyCode: currentQuote.currencyCode,
            expiresAt: currentQuote.expiresAt,
            status: currentQuote.status,
            totalMinor: currentQuote.totalMinor,
            version: currentQuote.version,
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
    }
  })
}

export async function getPublicServiceRequestForm(
  db: PrismaClient,
  input: { formToken: string },
) {
  const now = new Date()
  const form = await db.serviceRequestForm.findFirst({
    include: publicServiceRequestFormInclude,
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
  const policy = await evaluateServiceCommercePolicy(db, {
    actorUserId: "public_service_form",
    channel: "web",
    purpose: "public_service_form_projection",
    storeId: form.storeId,
    subject: "intake",
    tenantId: form.tenantId,
    vertical: "service",
  })
  if (policy.outcome !== "allowed") {
    throw new CatalogError(
      "PUBLIC_TOKEN_INVALID",
      "This Service Request Form is unavailable.",
    )
  }
  return projectPublicServiceRequestForm(form)
}

type SubmitPublicServiceRequestInput = {
  actorUserId?: string
  channelOrigin?: "staff" | "web" | "whatsapp"
  clientRequestId: string
  consent?: { contactOptIn: boolean; privacyNoticeVersion: string }
  customerEmail?: string
  customerName: string
  customerPhone?: string
  details?: string
  intakeContext?: ServiceCommerceIntakeAuthorizationContext
  lines: Array<{
    details?: string
    offeringId: string
    quantity: string
  }>
  providerEventId?: string
  requestedAt?: Date
} & (
  | {
      expectedScope?: { storeId: string; tenantId: string }
      formId?: never
      formToken: string
    }
  | {
      expectedScope: { storeId: string; tenantId: string }
      formId: string
      formToken?: never
    }
)

export async function submitPublicServiceRequest(
  db: PrismaClient,
  input: SubmitPublicServiceRequestInput,
) {
  const now = new Date()
  const channelOrigin = input.channelOrigin ?? "web"
  const providerEventId = input.providerEventId?.trim() || null
  const payloadHash = hash({
    customerEmail: input.customerEmail?.trim() || null,
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone?.trim() || null,
    details: input.details?.trim() || null,
    lines: input.lines,
    requestedAt: input.requestedAt ?? null,
    ...(input.channelOrigin || input.consent || input.providerEventId
      ? {
          attribution: {
            channelOrigin,
            consent: input.consent ?? null,
            providerEventId: input.providerEventId?.trim() || null,
          },
        }
      : {}),
  })
  try {
    return await db.$transaction(async (tx) => {
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
          ...(input.formId
            ? {
                id: input.formId,
                storeId: input.expectedScope.storeId,
                tenantId: input.expectedScope.tenantId,
              }
            : { publicTokenDigest: digest(input.formToken ?? "") }),
          status: ServiceRequestFormStatus.ACTIVE,
        },
      })
      if (!form) {
        throw new CatalogError(
          "PUBLIC_TOKEN_INVALID",
          "This Service Request Form is unavailable.",
        )
      }
      if (
        input.expectedScope &&
        (form.storeId !== input.expectedScope.storeId ||
          form.tenantId !== input.expectedScope.tenantId)
      ) {
        throw new CatalogError(
          "PUBLIC_TOKEN_INVALID",
          "This Service Request Form is unavailable for the selected Store.",
        )
      }
      await assertServiceCommerceIntakeContextInTransaction(tx, {
        context: input.intakeContext,
        storeId: form.storeId,
        tenantId: form.tenantId,
        vertical: "service",
      })
      await assertServiceCommercePolicyAllowedInTransaction(tx, {
        actorUserId:
          input.actorUserId ?? `public_service_request_${channelOrigin}`,
        channel: channelOrigin,
        purpose: "public_service_request_intake",
        storeId: form.storeId,
        subject: "intake",
        tenantId: form.tenantId,
        vertical: "service",
      })
      const previous = await tx.serviceRequest.findFirst({
        where: {
          OR: [
            { clientRequestId: input.clientRequestId },
            ...(providerEventId ? [{ providerEventId }] : []),
          ],
          tenantId: form.tenantId,
        },
      })
      if (previous) {
        if (previous.payloadHash !== payloadHash) {
          throw new CatalogError(
            "IDEMPOTENCY_MISMATCH",
            "This request command was already used with different details.",
          )
        }
        return { ...previous, created: false as const }
      }
      const allowed = new Map(
        form.offerings.map((row) => [row.offeringId, row.offering]),
      )
      const normalizedLines = input.lines.map((line) => {
        const offering = allowed.get(line.offeringId)
        if (!offering?.serviceOffering) {
          throw new CatalogError(
            "OFFERING_UNAVAILABLE",
            "Request selected an Offering outside this Form.",
          )
        }
        const requestedQuantity = parseExactDecimal(line.quantity, {
          allowZero: false,
          maxScale: offering.serviceOffering.quantityScale,
        })
        return { line, offering, requestedQuantity }
      })
      const request = await tx.serviceRequest.create({
        data: {
          clientRequestId: input.clientRequestId,
          channelOrigin: intakeChannelOriginMap[channelOrigin],
          consentVersion: input.consent?.privacyNoticeVersion,
          contactOptIn: input.consent?.contactOptIn ?? false,
          createdByUserId: channelOrigin === "staff" ? input.actorUserId : null,
          payloadHash,
          providerEventId,
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
      for (const { line, offering, requestedQuantity } of normalizedLines) {
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
            requestedQuantity,
            variantName: offering.variant.name,
          },
        })
      }
      return { ...request, created: true as const }
    })
  } catch (error) {
    if (
      !(
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
    ) {
      throw error
    }
    const replay = await db.serviceRequest.findFirst({
      where: {
        OR: [
          { clientRequestId: input.clientRequestId },
          ...(providerEventId ? [{ providerEventId }] : []),
        ],
        requestForm: input.formId
          ? {
              id: input.formId,
              storeId: input.expectedScope.storeId,
              tenantId: input.expectedScope.tenantId,
            }
          : { publicTokenDigest: digest(input.formToken ?? "") },
        ...(input.expectedScope ?? {}),
      },
    })
    if (!replay) {
      throw error
    }
    if (replay.payloadHash !== payloadHash) {
      throw new CatalogError(
        "IDEMPOTENCY_MISMATCH",
        "This request command was already used with different details.",
      )
    }
    return { ...replay, created: false as const }
  }
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
      revision: { increment: 1 },
      staffResponse: input.response.trim(),
      status:
        input.status === "declined"
          ? ServiceRequestStatus.DECLINED
          : ServiceRequestStatus.NEEDS_INFORMATION,
    },
    where: { id: request.id },
  })
}

function mapCommerceQuoteError(error: CommerceQuoteError) {
  const code =
    error.code === "PUBLIC_TOKEN_INVALID"
      ? "PUBLIC_TOKEN_INVALID"
      : error.code === "IDEMPOTENCY_MISMATCH"
        ? "IDEMPOTENCY_MISMATCH"
        : error.code === "OFFERING_UNAVAILABLE"
          ? "OFFERING_UNAVAILABLE"
          : error.code === "STORE_NOT_FOUND"
            ? "STORE_NOT_FOUND"
            : "QUOTE_CONFLICT"
  return new CatalogError(code, error.message)
}

export async function issueServiceQuote(
  db: PrismaClient,
  input: {
    actorUserId: string
    clientQuoteId: string
    clientVersionId: string
    discountMinor?: number
    expiresAt?: Date
    lines?: Array<{
      offeringId: string
      quantity: string
      sourceLineId?: string
      unitPriceMinor: number
    }>
    options?: Array<{
      clientOptionId: string
      discountMinor?: number
      fulfilmentFeeMinor?: number
      fulfilmentPromise?: string
      fulfilmentType?: "delivery" | "pickup" | "unspecified"
      label: string
      lines: Array<{
        offeringId: string
        quantity: string
        sourceLineId?: string
        unitPriceMinor: number
      }>
      taxMinor?: number
    }>
    requestId?: string
    storeId: string
    taxMinor?: number
    tenantId: string
  },
) {
  if (!input.requestId) {
    throw new CatalogError(
      "QUOTE_CONFLICT",
      "A Commerce Quote requires a Service Request source.",
    )
  }
  try {
    return await issueCommerceQuote(db, {
      actorUserId: input.actorUserId,
      authorize: async (tx) => {
        await assertServiceCommercePolicyAllowedInTransaction(tx, {
          actorUserId: input.actorUserId,
          channel: "staff",
          purpose: "service_quote_issue",
          storeId: input.storeId,
          subject: "quote",
          tenantId: input.tenantId,
          vertical: "service",
        })
      },
      clientQuoteId: input.clientQuoteId,
      clientVersionId: input.clientVersionId,
      expiresAt: input.expiresAt,
      ...(input.options
        ? {
            options: input.options.map((option) => ({
              ...option,
              availabilityOutcome: "full" as const,
              lines: option.lines.map((line) => ({
                ...line,
                outcome: "included" as const,
              })),
            })),
          }
        : {
            availabilityOutcome: "full" as const,
            discountMinor: input.discountMinor,
            fulfilmentType: "unspecified" as const,
            lines: (input.lines ?? []).map((line) => ({
              ...line,
              outcome: "included" as const,
            })),
            taxMinor: input.taxMinor,
          }),
      sourceId: input.requestId,
      sourceType: "service_request",
      storeId: input.storeId,
      tenantId: input.tenantId,
    })
  } catch (error) {
    if (error instanceof CommerceQuoteError) throw mapCommerceQuoteError(error)
    throw error
  }
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
    const serviceOffering = orderLine.offering.serviceOffering
    if (!serviceOffering) {
      throw new CatalogError(
        "SERVICE_JOB_NOT_FOUND",
        "Tracked Service Offering was not found.",
      )
    }
    const policy = serviceOffering.authorizationPolicy
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
  try {
    return await db.$transaction(async (tx) => {
      const context = await getCommerceQuoteAcceptanceContext(tx, {
        ...input,
        allowedCustomerActions: ["view_quote"],
      })
      const { payable, version } = context
      if (
        version.quote.sourceType !== CommerceQuoteSourceType.SERVICE_REQUEST
      ) {
        throw new CommerceQuoteError(
          "QUOTE_CONFLICT",
          "This Quote is not a Service Request Quote.",
        )
      }
      await assertServiceCommercePolicyAllowedInTransaction(tx, {
        actorUserId: input.actorUserId,
        channel: "web",
        purpose: "service_quote_acceptance",
        storeId: version.quote.storeId,
        subject: "quote",
        tenantId: version.quote.tenantId,
        vertical: "service",
      })
      if (context.replayOrderId) {
        return {
          jobId: await tx.serviceJob
            .findFirst({ where: { commercialOrderId: context.replayOrderId } })
            .then((job) => job?.id ?? null),
          orderId: context.replayOrderId,
        }
      }
      if (!payable) {
        throw new CommerceQuoteError(
          "QUOTE_CONFLICT",
          "Choose one Offer Option before accepting this Quote.",
        )
      }
      const request = await tx.serviceRequest.findFirst({
        where: {
          id: version.quote.sourceId,
          storeId: version.quote.storeId,
          tenantId: version.quote.tenantId,
        },
      })
      if (!request) {
        throw new CommerceQuoteError(
          "QUOTE_SOURCE_NOT_FOUND",
          "Service Request source not found.",
        )
      }
      const completePayableLines = payable.lines.map((line) => {
        if (
          !line.offeringId ||
          !line.quantity ||
          line.unitPriceMinor === null
        ) {
          throw new CommerceQuoteError(
            "QUOTE_CONFLICT",
            "Accepted Quote contains an incomplete payable line.",
          )
        }
        return {
          progressiveAvailabilityAttestationId:
            line.availabilityAttestation?.type ===
            CatalogAvailabilityAttestationType.MANUAL_PROCURE_TO_ORDER
              ? (line.availabilityAttestationId ?? undefined)
              : undefined,
          offeringId: line.offeringId,
          quantity: line.quantity.toString(),
          trustedUnitPriceMinor: line.unitPriceMinor,
        }
      })
      const order = await createCommercialOrderInTransaction(tx, {
        actorUserId: input.actorUserId,
        clientOrderId: `${input.clientAcceptanceId}:order`,
        customerEmail: request.customerEmail ?? undefined,
        customerName: request.customerName,
        customerPhone: request.customerPhone ?? undefined,
        createTrackedServiceWork: false,
        discountMinor: payable.discountMinor,
        lines: completePayableLines,
        schemaVersion: 1,
        serviceChargeMinor: payable.fulfilmentFeeMinor,
        storeId: version.quote.storeId,
        taxMinor: payable.taxMinor,
        tenantId: version.quote.tenantId,
      })
      const jobId = await createTrackedJobsForOrder(tx, {
        actorUserId: input.actorUserId,
        commercialOrderId: order.id,
        sourceKey: input.clientAcceptanceId,
        storeId: version.quote.storeId,
        tenantId: version.quote.tenantId,
      })
      await recordCommerceQuoteAcceptance(tx, {
        clientAcceptanceId: input.clientAcceptanceId,
        orderId: order.id,
        versionId: version.id,
      })
      await tx.serviceRequest.update({
        data: {
          convertedAt: new Date(),
          revision: { increment: 1 },
          status: ServiceRequestStatus.CONVERTED,
        },
        where: { id: request.id },
      })
      return { jobId, orderId: order.id }
    })
  } catch (error) {
    if (error instanceof CommerceQuoteError) throw mapCommerceQuoteError(error)
    throw error
  }
}

export async function selectServiceQuoteOption(
  db: PrismaClient,
  input: {
    acceptanceToken: string
    clientSelectionId: string
    optionId: string
  },
) {
  try {
    return await selectCommerceQuoteOption(db, {
      ...input,
      authorize: async (tx, quote) => {
        if (quote.sourceType !== CommerceQuoteSourceType.SERVICE_REQUEST) {
          throw new CommerceQuoteError(
            "PUBLIC_TOKEN_INVALID",
            "Quote is unavailable.",
          )
        }
        await assertServiceCommercePolicyAllowedInTransaction(tx, {
          actorUserId: "public_quote_option_selection",
          channel: "web",
          purpose: "service_quote_option_selection",
          storeId: quote.storeId,
          subject: "quote",
          tenantId: quote.tenantId,
          vertical: "service",
        })
      },
    })
  } catch (error) {
    if (error instanceof CommerceQuoteError) throw mapCommerceQuoteError(error)
    throw error
  }
}

export async function getPublicServiceQuote(
  db: PrismaClient,
  input: { acceptanceToken: string },
) {
  try {
    const quote = await getPublicCommerceQuote(db, {
      ...input,
      authorize: async (tx, source) => {
        if (source.sourceType !== CommerceQuoteSourceType.SERVICE_REQUEST) {
          throw new CommerceQuoteError(
            "PUBLIC_TOKEN_INVALID",
            "Quote is unavailable.",
          )
        }
        await assertServiceCommercePolicyAllowedInTransaction(tx, {
          actorUserId: "public_service_quote",
          channel: "web",
          purpose: "public_service_quote_projection",
          storeId: source.storeId,
          subject: "quote",
          tenantId: source.tenantId,
          vertical: "service",
        })
      },
    })
    if (quote.sourceType !== "service_request") {
      throw new CommerceQuoteError(
        "PUBLIC_TOKEN_INVALID",
        "Quote is unavailable.",
      )
    }
    return quote
  } catch (error) {
    if (error instanceof CommerceQuoteError) throw mapCommerceQuoteError(error)
    throw error
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
    await assertServiceCommercePolicyAllowedInTransaction(tx, {
      actorUserId: "public_service_tracking",
      channel: "web",
      purpose: "public_service_tracking_projection",
      storeId: access.serviceJob.storeId,
      subject: "service_completion",
      tenantId: access.tenantId,
      vertical: "service",
    })
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
      dueAt:
        [...job.dueCommitments]
          .reverse()
          .find((commitment) => !commitment.supersededAt)?.promisedAt ?? null,
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
    channel: "sms" | "whatsapp"
    customerEmail?: string
    customerPhone?: string
    jobId: string
    renderedMessage: string
    renderedSubject?: string
    scheduledFor?: Date
    templatePurpose: string
    tenantId: string
  },
) {
  const job = await db.serviceJob.findFirst({
    include: { commercialOrder: true },
    where: { id: input.jobId, tenantId: input.tenantId },
  })
  if (!job) throw new CatalogError("SERVICE_JOB_NOT_FOUND", "Job not found.")
  const customerPhone =
    input.customerPhone?.trim() || job.commercialOrder.customerPhone
  if (!customerPhone) {
    throw new CatalogError(
      "INVALID_SERVICE_TRANSITION",
      "SMS and WhatsApp updates require a customer phone number.",
    )
  }
  const scheduledFor = input.scheduledFor
  return db.serviceNotificationIntent.upsert({
    create: {
      audienceKey: input.audienceKey,
      businessEventKey: input.businessEventKey,
      channel:
        input.channel === "whatsapp"
          ? ServiceNotificationChannel.WHATSAPP
          : ServiceNotificationChannel.SMS,
      createdByUserId: input.actorUserId,
      customerEmail: input.customerEmail,
      customerPhone,
      renderedMessage: input.renderedMessage.trim(),
      renderedSubject: input.renderedSubject?.trim() || null,
      scheduledFor,
      serviceJobId: job.id,
      status:
        scheduledFor && scheduledFor.getTime() > Date.now()
          ? ServiceNotificationIntentStatus.PENDING
          : ServiceNotificationIntentStatus.READY,
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

export async function createBatchServiceNotificationIntents(
  db: PrismaClient,
  input: {
    actorUserId: string
    channel: "sms" | "whatsapp"
    clientBatchId: string
    jobs: Array<{ jobId: string; message: string }>
    scheduledFor?: Date
    templatePurpose: string
    tenantId: string
  },
) {
  if (input.jobs.length === 0 || input.jobs.length > 100) {
    throw new CatalogError(
      "INVALID_SERVICE_TRANSITION",
      "Select between 1 and 100 Service Jobs to notify.",
    )
  }
  const uniqueJobIds = [...new Set(input.jobs.map((job) => job.jobId))]
  if (uniqueJobIds.length !== input.jobs.length) {
    throw new CatalogError(
      "INVALID_SERVICE_TRANSITION",
      "Each Service Job can appear only once in a notification batch.",
    )
  }
  const jobs = await db.serviceJob.findMany({
    include: { commercialOrder: true },
    where: { id: { in: uniqueJobIds }, tenantId: input.tenantId },
  })
  if (jobs.length !== uniqueJobIds.length) {
    throw new CatalogError(
      "SERVICE_JOB_NOT_FOUND",
      "One or more selected Service Jobs could not be found.",
    )
  }
  const jobsById = new Map(jobs.map((job) => [job.id, job]))
  for (const entry of input.jobs) {
    if (!jobsById.get(entry.jobId)?.commercialOrder.customerPhone) {
      throw new CatalogError(
        "INVALID_SERVICE_TRANSITION",
        "Every selected Service Job needs a customer phone number.",
      )
    }
  }

  const batchKey = input.clientBatchId
  const channel =
    input.channel === "whatsapp"
      ? ServiceNotificationChannel.WHATSAPP
      : ServiceNotificationChannel.SMS
  const status =
    input.scheduledFor && input.scheduledFor.getTime() > Date.now()
      ? ServiceNotificationIntentStatus.PENDING
      : ServiceNotificationIntentStatus.READY

  return db.$transaction(async (tx) => {
    const businessEventKey = `service-batch:${input.templatePurpose}:${batchKey}`
    await tx.$queryRaw`
      SELECT pg_advisory_xact_lock(
        hashtext(${`${input.tenantId}:${input.templatePurpose}:${batchKey}`})
      )
    `
    const existing = await tx.serviceNotificationIntent.findMany({
      select: { serviceJobId: true },
      where: {
        businessEventKey,
        templatePurpose: input.templatePurpose,
        tenantId: input.tenantId,
      },
    })
    if (
      existing.length > 0 &&
      (existing.length !== uniqueJobIds.length ||
        existing.some((intent) => !uniqueJobIds.includes(intent.serviceJobId)))
    ) {
      throw new CatalogError(
        "IDEMPOTENCY_MISMATCH",
        "This notification batch identity was already used with a different Job selection.",
      )
    }
    return Promise.all(
      input.jobs.map((entry) => {
        const job = jobsById.get(entry.jobId)
        const customerPhone = job?.commercialOrder.customerPhone
        if (!job || !customerPhone) {
          throw new CatalogError(
            "INVALID_SERVICE_TRANSITION",
            "Every selected Service Job needs a customer phone number.",
          )
        }
        const renderedMessage = entry.message.trim()
        return tx.serviceNotificationIntent
          .upsert({
            create: {
              audienceKey: entry.jobId,
              businessEventKey,
              channel,
              createdByUserId: input.actorUserId,
              customerPhone,
              renderedMessage,
              scheduledFor: input.scheduledFor,
              serviceJobId: job.id,
              status,
              storeId: job.storeId,
              templatePurpose: input.templatePurpose,
              tenantId: input.tenantId,
            },
            update: {},
            where: {
              tenantId_businessEventKey_audienceKey_templatePurpose: {
                audienceKey: entry.jobId,
                businessEventKey,
                templatePurpose: input.templatePurpose,
                tenantId: input.tenantId,
              },
            },
          })
          .then((intent) => {
            if (
              intent.channel !== channel ||
              intent.renderedMessage !== renderedMessage ||
              intent.serviceJobId !== job.id ||
              intent.scheduledFor?.getTime() !== input.scheduledFor?.getTime()
            ) {
              throw new CatalogError(
                "IDEMPOTENCY_MISMATCH",
                "This notification batch identity was already used with different details.",
              )
            }
            return intent
          })
      }),
    )
  })
}

const notificationDispatchLeaseMs = 15 * 60_000

export async function listDueServiceNotificationIntentIds(
  db: PrismaClient,
  input: { limit?: number; now?: Date },
) {
  const now = input.now ?? new Date()
  const staleBefore = new Date(now.getTime() - notificationDispatchLeaseMs)
  const intents = await db.serviceNotificationIntent.findMany({
    orderBy: { scheduledFor: "asc" },
    select: { id: true },
    take: Math.min(Math.max(input.limit ?? 100, 1), 500),
    where: {
      AND: [
        {
          OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
        },
        {
          OR: [
            { dispatchRequestedAt: null },
            { dispatchRequestedAt: { lte: staleBefore } },
          ],
        },
      ],
      channel: {
        in: [
          ServiceNotificationChannel.SMS,
          ServiceNotificationChannel.WHATSAPP,
        ],
      },
      status: {
        in: [
          ServiceNotificationIntentStatus.PENDING,
          ServiceNotificationIntentStatus.READY,
        ],
      },
    },
  })
  return intents.map((intent) => intent.id)
}

export async function getServiceNotificationIntentForDelivery(
  db: PrismaClient,
  input: { intentId: string },
) {
  const intent = await db.serviceNotificationIntent.findUnique({
    where: { id: input.intentId },
  })
  if (!intent) {
    throw new CatalogError("SERVICE_JOB_NOT_FOUND", "Intent not found.")
  }
  if (
    intent.status === ServiceNotificationIntentStatus.COMPLETED ||
    intent.status === ServiceNotificationIntentStatus.CANCELLED
  ) {
    return null
  }
  if (
    intent.channel !== ServiceNotificationChannel.SMS &&
    intent.channel !== ServiceNotificationChannel.WHATSAPP
  ) {
    return null
  }
  if (
    intent.status === ServiceNotificationIntentStatus.PENDING &&
    (!intent.scheduledFor || intent.scheduledFor.getTime() > Date.now())
  ) {
    throw new CatalogError(
      "INVALID_SERVICE_TRANSITION",
      "Notification is not due yet.",
    )
  }
  const now = new Date()
  const staleBefore = new Date(now.getTime() - notificationDispatchLeaseMs)
  const claimed = await db.serviceNotificationIntent.updateMany({
    data: {
      dispatchRequestedAt: now,
      status: ServiceNotificationIntentStatus.READY,
    },
    where: {
      OR: [
        { dispatchRequestedAt: null },
        { dispatchRequestedAt: { lte: staleBefore } },
      ],
      id: intent.id,
      status: {
        in: [
          ServiceNotificationIntentStatus.PENDING,
          ServiceNotificationIntentStatus.READY,
        ],
      },
    },
  })
  if (claimed.count !== 1) return null
  const tenant = await db.tenant.findUnique({
    select: { dataClassification: true },
    where: { id: intent.tenantId },
  })
  if (!tenant) return null
  return {
    channel:
      intent.channel === ServiceNotificationChannel.WHATSAPP
        ? ("whatsapp" as const)
        : ("sms" as const),
    customerPhone: intent.customerPhone,
    id: intent.id,
    message: intent.renderedMessage,
    tenantDataClassification: tenant.dataClassification,
    tenantId: intent.tenantId,
  }
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
  return db.$transaction(async (tx) => {
    const attempt = await tx.serviceDeliveryAttempt.create({
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
    if (
      (input.status === "delivered" || input.status === "sent") &&
      intent.status !== ServiceNotificationIntentStatus.CANCELLED
    ) {
      await tx.serviceNotificationIntent.updateMany({
        data: {
          completedAt: new Date(),
          status: ServiceNotificationIntentStatus.COMPLETED,
        },
        where: {
          id: intent.id,
          status: { not: ServiceNotificationIntentStatus.CANCELLED },
        },
      })
    } else if (
      input.status === "failed" &&
      intent.status !== ServiceNotificationIntentStatus.COMPLETED &&
      intent.status !== ServiceNotificationIntentStatus.CANCELLED
    ) {
      await tx.serviceNotificationIntent.updateMany({
        data: {
          dispatchRequestedAt: null,
          status: ServiceNotificationIntentStatus.READY,
        },
        where: {
          id: intent.id,
          status: {
            notIn: [
              ServiceNotificationIntentStatus.CANCELLED,
              ServiceNotificationIntentStatus.COMPLETED,
            ],
          },
        },
      })
    }
    return attempt
  })
}

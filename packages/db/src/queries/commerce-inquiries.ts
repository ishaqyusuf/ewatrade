import { createHash } from "node:crypto"

import {
  type ServiceCommerceProductDemand,
  type ServiceCommerceRequestState,
  serviceCommerceProductDemandSchema,
} from "@ewatrade/service-commerce"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  CommerceInquiryAuditEventType,
  CommerceInquiryChannelOrigin,
  CommerceInquiryDemandReason,
  CommerceInquiryStatus,
  CommerceQuoteSourceType,
  SellableOfferingKind,
} from "../../generated/prisma/enums"
import {
  CommerceQuoteError,
  getCommerceQuoteAcceptanceContext,
  getPublicCommerceQuote,
  issueCommerceQuote,
  recordCommerceQuoteAcceptance,
} from "./commerce-quotes"
import { createCommercialOrderInTransaction } from "./commercial-orders"
import { getServiceCommerceWorkspaceAccess } from "./service-commerce-access"
import type { DbClient } from "./types"

export type CommerceInquiryErrorCode =
  | "CONFLICT"
  | "EXACT_PRODUCT_REQUIRES_COMMERCE"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "NOT_READY"

export class CommerceInquiryError extends Error {
  constructor(
    readonly code: CommerceInquiryErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "CommerceInquiryError"
  }
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
  return createHash("sha256").update(stableJson(value)).digest("hex")
}

function mapDemandReason(
  reason: Extract<
    ServiceCommerceProductDemand,
    { kind: "commerce_inquiry" }
  >["reason"],
) {
  const reasons = {
    needs_availability_confirmation:
      CommerceInquiryDemandReason.NEEDS_AVAILABILITY_CONFIRMATION,
    needs_identification: CommerceInquiryDemandReason.NEEDS_IDENTIFICATION,
    needs_quote: CommerceInquiryDemandReason.NEEDS_QUOTE,
  } as const
  return reasons[reason]
}

function mapChannelOrigin(origin: "staff" | "web" | "whatsapp") {
  const origins = {
    staff: CommerceInquiryChannelOrigin.STAFF,
    web: CommerceInquiryChannelOrigin.WEB,
    whatsapp: CommerceInquiryChannelOrigin.WHATSAPP,
  } as const
  return origins[origin]
}

const normalizedInquiryStates = {
  CONVERTED: "converted",
  DECLINED: "declined",
  EXPIRED: "expired",
  NEEDS_CLARIFICATION: "needs_clarification",
  QUOTED: "quoted",
  READY_TO_QUOTE: "ready_to_quote",
  RECEIVED: "received",
  WITHDRAWN: "withdrawn",
} satisfies Record<CommerceInquiryStatus, ServiceCommerceRequestState>

export function normalizeCommerceInquiryState(status: CommerceInquiryStatus) {
  return normalizedInquiryStates[status]
}

const allowedTransitions = {
  CONVERTED: [],
  DECLINED: [],
  EXPIRED: [],
  NEEDS_CLARIFICATION: [
    CommerceInquiryStatus.READY_TO_QUOTE,
    CommerceInquiryStatus.DECLINED,
    CommerceInquiryStatus.WITHDRAWN,
    CommerceInquiryStatus.EXPIRED,
  ],
  QUOTED: [
    CommerceInquiryStatus.DECLINED,
    CommerceInquiryStatus.WITHDRAWN,
    CommerceInquiryStatus.EXPIRED,
  ],
  READY_TO_QUOTE: [
    CommerceInquiryStatus.NEEDS_CLARIFICATION,
    CommerceInquiryStatus.DECLINED,
    CommerceInquiryStatus.WITHDRAWN,
    CommerceInquiryStatus.EXPIRED,
  ],
  RECEIVED: [
    CommerceInquiryStatus.NEEDS_CLARIFICATION,
    CommerceInquiryStatus.READY_TO_QUOTE,
    CommerceInquiryStatus.DECLINED,
    CommerceInquiryStatus.WITHDRAWN,
    CommerceInquiryStatus.EXPIRED,
  ],
  WITHDRAWN: [],
} satisfies Record<CommerceInquiryStatus, CommerceInquiryStatus[]>

export function assertCommerceInquiryTransition(input: {
  from: CommerceInquiryStatus
  to: CommerceInquiryStatus
}) {
  const allowed = allowedTransitions[input.from] as CommerceInquiryStatus[]
  if (
    input.to === CommerceInquiryStatus.CONVERTED ||
    input.to === CommerceInquiryStatus.QUOTED ||
    !allowed.includes(input.to)
  ) {
    throw new CommerceInquiryError(
      "CONFLICT",
      "Commerce Inquiry state transition is unavailable.",
    )
  }
}

async function assertInquiryOperator(
  db: DbClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  const workspace = await getServiceCommerceWorkspaceAccess(db, input)
  if (!workspace.access.canOperate) {
    throw new CommerceInquiryError(
      "FORBIDDEN",
      "Commerce Inquiry access is unavailable.",
    )
  }
  if (
    workspace.configuration.status !== "active" ||
    !workspace.canCreateAssistedRequest
  ) {
    throw new CommerceInquiryError(
      "NOT_READY",
      "Service Commerce intake is not ready for this Store.",
    )
  }
  return workspace
}

export type CreateCommerceInquiryInput = {
  actorUserId: string
  channelOrigin: "staff" | "web" | "whatsapp"
  clientInquiryId: string
  customerEmail?: string
  customerName: string
  customerPhone?: string
  demand: ServiceCommerceProductDemand
  lines: Array<{ description: string; requestedQuantity?: string }>
  storeId: string
  summary: string
  tenantId: string
}

export async function createCommerceInquiry(
  db: DbClient,
  input: CreateCommerceInquiryInput,
) {
  const demand = serviceCommerceProductDemandSchema.parse(input.demand)
  if (demand.kind === "exact_product") {
    throw new CommerceInquiryError(
      "EXACT_PRODUCT_REQUIRES_COMMERCE",
      "Exact Product demand must use the cart or Commercial Order command.",
    )
  }
  const clientInquiryId = input.clientInquiryId.trim()
  const customerName = input.customerName.trim()
  const summary = input.summary.trim()
  if (!clientInquiryId || !customerName || !summary) {
    throw new CommerceInquiryError(
      "CONFLICT",
      "Commerce Inquiry identity, customer and summary are required.",
    )
  }
  if (input.lines.length < 1 || input.lines.length > 100) {
    throw new CommerceInquiryError(
      "CONFLICT",
      "A Commerce Inquiry requires between one and 100 lines.",
    )
  }
  const lines = input.lines.map((line, position) => {
    const description = line.description.trim()
    if (!description || description.length > 500) {
      throw new CommerceInquiryError(
        "CONFLICT",
        "Every Commerce Inquiry line requires a bounded description.",
      )
    }
    let requestedQuantity: string | undefined
    try {
      requestedQuantity = line.requestedQuantity
        ? parseExactDecimal(line.requestedQuantity, {
            allowZero: false,
            maxScale: 6,
          })
        : undefined
    } catch (error) {
      throw new CommerceInquiryError(
        "CONFLICT",
        error instanceof Error
          ? error.message
          : "Requested quantity is invalid.",
      )
    }
    return { description, position, requestedQuantity }
  })
  const payloadHash = hash({
    channelOrigin: input.channelOrigin,
    customerEmail: input.customerEmail?.trim() || null,
    customerName,
    customerPhone: input.customerPhone?.trim() || null,
    demand,
    lines,
    storeId: input.storeId,
    summary,
  })

  return db.$transaction(async (tx) => {
    await assertInquiryOperator(tx, input)
    const inquiry = await tx.commerceInquiry.upsert({
      create: {
        channelOrigin: mapChannelOrigin(input.channelOrigin),
        clientInquiryId,
        createdByUserId: input.actorUserId,
        customerEmail: input.customerEmail?.trim() || null,
        customerName,
        customerPhone: input.customerPhone?.trim() || null,
        demandReason: mapDemandReason(demand.reason),
        payloadHash,
        lines: {
          create: lines.map((line) => ({
            ...line,
            storeId: input.storeId,
            tenantId: input.tenantId,
          })),
        },
        storeId: input.storeId,
        summary,
        tenantId: input.tenantId,
      },
      include: { lines: { orderBy: { position: "asc" } } },
      update: {},
      where: {
        tenantId_clientInquiryId: {
          clientInquiryId,
          tenantId: input.tenantId,
        },
      },
    })
    if (
      inquiry.payloadHash !== payloadHash ||
      inquiry.storeId !== input.storeId
    ) {
      throw new CommerceInquiryError(
        "CONFLICT",
        "This Commerce Inquiry identity was already used with different input.",
      )
    }
    const existingAudit = await tx.commerceInquiryAuditEvent.findFirst({
      select: { id: true },
      where: {
        inquiryId: inquiry.id,
        storeId: input.storeId,
        tenantId: input.tenantId,
        type: CommerceInquiryAuditEventType.CREATED,
      },
    })
    if (!existingAudit) {
      await tx.commerceInquiryAuditEvent.create({
        data: {
          actorUserId: input.actorUserId,
          inquiryId: inquiry.id,
          storeId: input.storeId,
          tenantId: input.tenantId,
          toStatus: inquiry.status,
          type: CommerceInquiryAuditEventType.CREATED,
        },
      })
    }
    return {
      id: inquiry.id,
      lines: inquiry.lines.map((line) => ({ id: line.id })),
      state: normalizeCommerceInquiryState(inquiry.status),
    }
  })
}

export async function transitionCommerceInquiry(
  db: DbClient,
  input: {
    actorUserId: string
    inquiryId: string
    reason: string
    storeId: string
    targetStatus: Exclude<
      CommerceInquiryStatus,
      "CONVERTED" | "QUOTED" | "RECEIVED"
    >
    tenantId: string
  },
) {
  const reason = input.reason.trim()
  if (!reason) {
    throw new CommerceInquiryError("CONFLICT", "A reason is required.")
  }
  return db.$transaction(async (tx) => {
    await assertInquiryOperator(tx, input)
    const inquiry = await tx.commerceInquiry.findFirst({
      where: {
        id: input.inquiryId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!inquiry) {
      throw new CommerceInquiryError("NOT_FOUND", "Commerce Inquiry not found.")
    }
    assertCommerceInquiryTransition({
      from: inquiry.status,
      to: input.targetStatus,
    })
    const updated = await tx.commerceInquiry.updateMany({
      data: { status: input.targetStatus },
      where: {
        id: inquiry.id,
        status: inquiry.status,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (updated.count !== 1) {
      throw new CommerceInquiryError(
        "CONFLICT",
        "Commerce Inquiry changed. Refresh and try again.",
      )
    }
    await tx.commerceInquiryAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        fromStatus: inquiry.status,
        inquiryId: inquiry.id,
        reason,
        storeId: input.storeId,
        tenantId: input.tenantId,
        toStatus: input.targetStatus,
        type: CommerceInquiryAuditEventType.STATE_CHANGED,
      },
    })
    return {
      id: inquiry.id,
      state: normalizeCommerceInquiryState(input.targetStatus),
    }
  })
}

export async function getPublicCommerceInquiryQuote(
  db: PrismaClient,
  input: { acceptanceToken: string },
) {
  const quote = await getPublicCommerceQuote(db, input)
  if (quote.sourceType !== "commerce_inquiry") {
    throw new CommerceQuoteError(
      "PUBLIC_TOKEN_INVALID",
      "This Commerce Inquiry Quote is unavailable.",
    )
  }
  return quote
}

export async function issueCommerceInquiryQuote(
  db: PrismaClient,
  input: {
    actorUserId: string
    availabilityOutcome: "full" | "partial" | "unavailable"
    clientQuoteId: string
    clientVersionId: string
    customerNote?: string
    discountMinor?: number
    expiresAt?: Date
    fulfilmentFeeMinor?: number
    fulfilmentPromise?: string
    fulfilmentType?: "delivery" | "pickup" | "unspecified"
    inquiryId: string
    lines: Array<{
      customerNote?: string
      offeringId?: string
      outcome: "alternative" | "declined" | "included" | "unavailable"
      quantity?: string
      sourceLineId: string
      unitPriceMinor?: number
    }>
    storeId: string
    taxMinor?: number
    tenantId: string
  },
) {
  return issueCommerceQuote(db, {
    ...input,
    authorize: async (tx) => {
      await assertInquiryOperator(tx, input)
    },
    sourceId: input.inquiryId,
    sourceType: "commerce_inquiry",
  })
}

export async function acceptCommerceInquiryQuote(
  db: PrismaClient,
  input: { acceptanceToken: string; clientAcceptanceId: string },
) {
  return db.$transaction(async (tx) => {
    const context = await getCommerceQuoteAcceptanceContext(tx, input)
    const { version } = context
    if (version.quote.sourceType !== CommerceQuoteSourceType.COMMERCE_INQUIRY) {
      throw new CommerceQuoteError(
        "QUOTE_CONFLICT",
        "This Quote is not a Commerce Inquiry Quote.",
      )
    }
    if (context.replayOrderId) return { orderId: context.replayOrderId }
    const inquiry = await tx.commerceInquiry.findFirst({
      where: {
        id: version.quote.sourceId,
        status: CommerceInquiryStatus.QUOTED,
        storeId: version.quote.storeId,
        tenantId: version.quote.tenantId,
      },
    })
    if (!inquiry) {
      throw new CommerceQuoteError(
        "QUOTE_SOURCE_NOT_FOUND",
        "Commerce Inquiry source not found.",
      )
    }
    const payableLines = version.lines.filter(
      (line) => line.outcome === "INCLUDED" || line.outcome === "ALTERNATIVE",
    )
    const completePayableLines = payableLines.map((line) => {
      if (!line.offeringId || !line.quantity || line.unitPriceMinor === null) {
        throw new CommerceQuoteError(
          "QUOTE_CONFLICT",
          "Accepted Quote contains an incomplete payable line.",
        )
      }
      return {
        balanceRevision: line.balanceRevision ?? undefined,
        configurationVersionId: line.configurationVersionId ?? undefined,
        offeringId: line.offeringId,
        quantity: line.quantity.toString(),
        unitPriceMinor: line.unitPriceMinor,
      }
    })
    const nonProduct = await tx.sellableOffering.findFirst({
      select: { id: true },
      where: {
        id: { in: completePayableLines.map((line) => line.offeringId) },
        kind: { not: SellableOfferingKind.PRODUCT_UNIT },
        tenantId: version.quote.tenantId,
      },
    })
    if (nonProduct) {
      throw new CommerceQuoteError(
        "QUOTE_CONFLICT",
        "A Commerce Inquiry Quote can contain only Product Offerings.",
      )
    }
    const order = await createCommercialOrderInTransaction(tx, {
      actorUserId: "public_quote_acceptance",
      clientOrderId: `${input.clientAcceptanceId}:order`,
      customerEmail: inquiry.customerEmail ?? undefined,
      customerName: inquiry.customerName,
      customerPhone: inquiry.customerPhone ?? undefined,
      lines: completePayableLines.map((line) => ({
        expectedBalanceRevision: line.balanceRevision,
        expectedConfigurationVersionId: line.configurationVersionId,
        offeringId: line.offeringId,
        quantity: line.quantity,
        trustedUnitPriceMinor: line.unitPriceMinor,
      })),
      schemaVersion: 1,
      serviceChargeMinor: version.fulfilmentFeeMinor,
      storeId: version.quote.storeId,
      taxMinor: version.taxMinor,
      tenantId: version.quote.tenantId,
    })
    await recordCommerceQuoteAcceptance(tx, {
      clientAcceptanceId: input.clientAcceptanceId,
      orderId: order.id,
      versionId: version.id,
    })
    const converted = await tx.commerceInquiry.updateMany({
      data: {
        convertedAt: new Date(),
        status: CommerceInquiryStatus.CONVERTED,
      },
      where: {
        id: inquiry.id,
        status: CommerceInquiryStatus.QUOTED,
        storeId: version.quote.storeId,
        tenantId: version.quote.tenantId,
      },
    })
    if (converted.count !== 1) {
      throw new CommerceQuoteError(
        "QUOTE_CONFLICT",
        "Commerce Inquiry changed before Quote acceptance.",
      )
    }
    await tx.commerceInquiryAuditEvent.create({
      data: {
        actorUserId: "public_quote_acceptance",
        fromStatus: CommerceInquiryStatus.QUOTED,
        inquiryId: inquiry.id,
        storeId: version.quote.storeId,
        tenantId: version.quote.tenantId,
        toStatus: CommerceInquiryStatus.CONVERTED,
        type: CommerceInquiryAuditEventType.CONVERTED,
      },
    })
    return { orderId: order.id }
  })
}

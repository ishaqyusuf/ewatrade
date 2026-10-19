import { createHash } from "node:crypto"
import type { Prisma } from "../../generated/prisma/client"
import { literalContains } from "./literal-contains"
import {
  ServiceIntakeReviewError,
  assertAssistantServiceIntakeAuthority,
} from "./service-intake-review"
import { assertNonClinicalServiceWorkOrder } from "./service-work-order-scope"

export type ServiceRequestReadScope = {
  tenantId: string
  storeId: string
  actorUserId: string
}
type Scope = ServiceRequestReadScope
export { ServiceIntakeReviewError as ServiceRequestReadError }
const statuses = {
  submitted: "SUBMITTED",
  needs_information: "NEEDS_INFORMATION",
  quoted: "QUOTED",
  declined: "DECLINED",
  withdrawn: "WITHDRAWN",
  converted: "CONVERTED",
} as const
export type ServiceRequestReadStatus = keyof typeof statuses
export type ServiceRequestPageInput = Scope & {
  status?: ServiceRequestReadStatus
  query?: string
  cursor?: string
  limit?: number
}
export type ServiceRequestOriginalInput = Scope & { requestId: string }
function unavailable(
  message = "This exact Service Request is unavailable.",
): never {
  throw new ServiceIntakeReviewError("CONFLICT", message)
}
function identity(value: string) {
  if (typeof value !== "string" || !value.trim() || value.length > 128)
    unavailable("Choose an exact saved Service Request identity.")
  return value
}
async function authority(tx: Prisma.TransactionClient, input: Scope) {
  const actor = await assertAssistantServiceIntakeAuthority(tx, input)
  if (actor.role === "MANAGER" && actor.staffAccessMode !== "LEGACY")
    throw new ServiceIntakeReviewError(
      "FORBIDDEN",
      "Scoped Manager Service Request access is not available yet.",
    )
  const current = await tx.membership.findFirst({
    where: {
      id: actor.id,
      tenantId: input.tenantId,
      status: "ACTIVE",
      tenant: { isActive: true },
    },
    select: { staffAccessRevision: true },
  })
  if (
    !current ||
    !Number.isSafeInteger(current.staffAccessRevision) ||
    current.staffAccessRevision < 1
  )
    throw new ServiceIntakeReviewError(
      "FORBIDDEN",
      "Current Service Request access is unavailable.",
    )
  return {
    membershipId: actor.id,
    role: actor.role,
    accessMode: actor.staffAccessMode,
    accessRevision: current.staffAccessRevision,
  }
}
const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex")
function readCursor(cursor: string | undefined, scope: string) {
  if (cursor === undefined) return null
  try {
    if (!cursor || cursor.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(cursor))
      throw Error()
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"))
    if (
      !value ||
      Object.keys(value).sort().join(",") !== "createdAt,id,scope,version" ||
      value.version !== 1 ||
      value.scope !== scope ||
      typeof value.createdAt !== "string" ||
      typeof value.id !== "string"
    )
      throw Error()
    identity(value.id)
    const createdAt = new Date(value.createdAt)
    if (
      !Number.isFinite(createdAt.getTime()) ||
      createdAt.toISOString() !== value.createdAt
    )
      throw Error()
    return { id: value.id as string, createdAt }
  } catch {
    unavailable(
      "Keep the original request filters and current access when continuing; start at the first page.",
    )
  }
}
const target = (input: Scope, requestId: string) => ({
  kind: "service_request" as const,
  requestId,
  origin: { tenantId: input.tenantId, storeId: input.storeId },
})

/** Caller owns a RepeatableRead transaction: count and page share one snapshot. */
export async function listServiceRequestPageInTransaction(
  tx: Prisma.TransactionClient,
  input: ServiceRequestPageInput,
) {
  const actor = await authority(tx, input)
  const limit = input.limit ?? 10
  const query = input.query?.trim()
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 10 ||
    (input.status !== undefined && !Object.hasOwn(statuses, input.status)) ||
    (input.query !== undefined && (!query || query.length > 120))
  )
    unavailable(
      "Choose supported Service Request filters and a page size from 1 to 10.",
    )
  const scope = fingerprint({
    ...actor,
    actorUserId: input.actorUserId,
    tenantId: input.tenantId,
    storeId: input.storeId,
    status: input.status ?? null,
    query: query ?? null,
    limit,
  })
  const after = readCursor(input.cursor, scope)
  const where: Prisma.ServiceRequestWhereInput = {
    tenantId: input.tenantId,
    storeId: input.storeId,
    ...(input.status ? { status: statuses[input.status] } : {}),
    ...(query
      ? {
          customerName: {
            contains: literalContains(query),
            mode: "insensitive",
          },
        }
      : {}),
  }
  const [total, rows] = await Promise.all([
    tx.serviceRequest.count({ where }),
    tx.serviceRequest.findMany({
      where: {
        ...where,
        ...(after
          ? {
              OR: [
                { createdAt: { lt: after.createdAt } },
                { createdAt: after.createdAt, id: { lt: after.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        revision: true,
        status: true,
        customerName: true,
        requestedAt: true,
        createdAt: true,
        requestForm: {
          select: { id: true, label: true, tenantId: true, storeId: true },
        },
        _count: { select: { lines: true } },
      },
    }),
  ])
  if (!Number.isSafeInteger(total) || total < 0)
    unavailable("The complete matching request count is unavailable.")
  const page = rows.slice(0, limit)
  const items = page.map((row) => {
    if (
      row.requestForm.tenantId !== input.tenantId ||
      row.requestForm.storeId !== input.storeId
    )
      unavailable()
    return {
      id: row.id,
      revision: row.revision,
      status: row.status,
      customerName: row.customerName,
      requestedAt: row.requestedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      form: { id: row.requestForm.id, label: row.requestForm.label },
      lineCount: row._count.lines,
      originalTarget: target(input, row.id),
    }
  })
  const last = page.at(-1)
  return {
    actorUserId: input.actorUserId,
    tenantId: input.tenantId,
    storeId: input.storeId,
    asOf: new Date().toISOString(),
    coverage: "service_requests_only" as const,
    totalMatching: String(total),
    items,
    nextCursor:
      rows.length > limit && last
        ? Buffer.from(
            JSON.stringify({
              version: 1,
              scope,
              createdAt: last.createdAt.toISOString(),
              id: last.id,
            }),
          ).toString("base64url")
        : null,
  }
}

export type ServiceRequestPage = Awaited<
  ReturnType<typeof listServiceRequestPageInTransaction>
>
export type ServiceRequestOriginal = Awaited<
  ReturnType<typeof readServiceRequestOriginalInTransaction>
>

function selections(value: Prisma.JsonValue) {
  if (!Array.isArray(value) || value.length > 100)
    unavailable("Original request option snapshots are unavailable.")
  return value.map((option) => {
    if (
      !option ||
      typeof option !== "object" ||
      Array.isArray(option) ||
      Object.keys(option).sort().join(",") !== "group,value" ||
      typeof option.group !== "string" ||
      typeof option.value !== "string" ||
      option.group.length > 500 ||
      option.value.length > 500
    )
      unavailable("Original request option snapshots are unavailable.")
    return { group: option.group, value: option.value }
  })
}

/** Exact generic source only; no prescription/inquiry aggregation or capabilities. */
export async function readServiceRequestOriginalInTransaction(
  tx: Prisma.TransactionClient,
  input: ServiceRequestOriginalInput,
) {
  await authority(tx, input)
  identity(input.requestId)
  const request = await tx.serviceRequest.findFirst({
    where: {
      id: input.requestId,
      tenantId: input.tenantId,
      storeId: input.storeId,
    },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      revision: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      requestedAt: true,
      details: true,
      staffResponse: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      channelOrigin: true,
      contactOptIn: true,
      consentVersion: true,
      requestForm: {
        select: { id: true, label: true, tenantId: true, storeId: true },
      },
      lines: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 101,
        select: {
          id: true,
          requestId: true,
          offeringId: true,
          offeringName: true,
          variantName: true,
          optionSelections: true,
          requestedQuantity: true,
          details: true,
        },
      },
    },
  })
  if (
    !request ||
    request.id !== input.requestId ||
    request.tenantId !== input.tenantId ||
    request.storeId !== input.storeId ||
    request.requestForm.tenantId !== input.tenantId ||
    request.requestForm.storeId !== input.storeId
  )
    unavailable()
  if (request.lines.length > 100)
    unavailable(
      "This request exceeds the bounded original line view; no partial original is shown.",
    )
  const quote = await tx.commerceQuote.findUnique({
    where: {
      tenantId_sourceType_sourceId: {
        tenantId: input.tenantId,
        sourceType: "SERVICE_REQUEST",
        sourceId: request.id,
      },
    },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      sourceType: true,
      sourceId: true,
      currentVersionId: true,
      currentVersion: {
        select: {
          id: true,
          quoteId: true,
          version: true,
          status: true,
          currencyCode: true,
          totalMinor: true,
          expiresAt: true,
          acceptedOrderId: true,
          acceptedOrder: {
            select: {
              id: true,
              tenantId: true,
              storeId: true,
              acceptedCommerceQuoteVersion: {
                select: { quote: { select: { sourceType: true } } },
              },
              prescriptionPickupFulfillment: { select: { id: true } },
              prescriptionDeliveryAddress: { select: { id: true } },
              _count: { select: { prescriptionPaymentIntents: true } },
            },
          },
        },
      },
    },
  })
  if (
    quote &&
    (quote.tenantId !== input.tenantId ||
      quote.storeId !== input.storeId ||
      quote.sourceId !== request.id ||
      quote.sourceType !== "SERVICE_REQUEST" ||
      (quote.currentVersionId !== null && !quote.currentVersion) ||
      (quote.currentVersion &&
        (quote.currentVersion.id !== quote.currentVersionId ||
          quote.currentVersion.quoteId !== quote.id)))
  )
    unavailable("The exact current canonical quotation is unavailable.")
  const version = quote?.currentVersion
  if (version?.acceptedOrderId && !version.acceptedOrder) unavailable()
  if (version?.acceptedOrder) {
    if (
      version.acceptedOrder.id !== version.acceptedOrderId ||
      version.acceptedOrder.tenantId !== input.tenantId ||
      version.acceptedOrder.storeId !== input.storeId
    )
      unavailable()
    assertNonClinicalServiceWorkOrder(version.acceptedOrder)
  }
  const lines = request.lines.map((line) => {
    const quantity = line.requestedQuantity.toFixed()
    if (
      line.requestId !== request.id ||
      !/^\d{1,32}(?:\.\d{1,6})?$/.test(quantity) ||
      !/[1-9]/.test(quantity)
    )
      unavailable(
        "The original request line quantity or ownership is unavailable.",
      )
    return {
      id: line.id,
      offeringId: line.offeringId,
      offeringName: line.offeringName,
      variantName: line.variantName,
      optionSelections: selections(line.optionSelections),
      quantity,
      details: line.details,
    }
  })
  return {
    actorUserId: input.actorUserId,
    tenantId: input.tenantId,
    storeId: input.storeId,
    asOf: new Date().toISOString(),
    request: {
      id: request.id,
      revision: request.revision,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      requestedAt: request.requestedAt?.toISOString() ?? null,
      details: request.details,
      staffResponse: request.staffResponse,
      customer: {
        name: request.customerName,
        phone: request.customerPhone,
        email: request.customerEmail,
      },
      channelOrigin: request.channelOrigin,
      contactOptIn: request.contactOptIn,
      consentVersion: request.consentVersion,
    },
    form: { id: request.requestForm.id, label: request.requestForm.label },
    lines,
    currentQuote:
      quote && version
        ? {
            quoteId: quote.id,
            versionId: version.id,
            version: version.version,
            status: version.status,
            currencyCode: version.currencyCode,
            totalMinor: version.totalMinor,
            expiresAt: version.expiresAt?.toISOString() ?? null,
            acceptedOrderId: version.acceptedOrderId,
          }
        : null,
  }
}

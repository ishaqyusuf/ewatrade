import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"
import { normalizeWhatsAppPhone } from "@ewatrade/customer-messages"
import {
  storefrontRequestReplySchema,
  storefrontWithdrawSchema,
} from "@ewatrade/storefront-contracts/orders"
import { z } from "zod"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { issueServiceQuote } from "./service-public"
import { assertStoreConversationTextScreened } from "./store-conversation-text-safety"
import { loadLiveStorefrontForHost } from "./storefront-factory-loader"
import {
  StorefrontOrderError,
  newStorefrontReference,
  storefrontReceiptDigest,
  storefrontReceiptToken,
} from "./storefront-orders"
import { submitStorefrontServiceRequest } from "./storefront-service-intake"
import type { DbClient } from "./types"

/**
 * Flagship storefront extension of the canonical storefront service intake:
 * receipt capability, optional preferred date (never a booking), collection
 * address, customer replies and quote decline. Quote acceptance stays on the
 * canonical `/service-quote/[token]` authority.
 */

const TX = () => ({ maxWait: 10_000, timeout: 30_000 })

const plainText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .refine((value) => !/<\s*\/?\s*[a-z!]|javascript:/i.test(value), {
      message: "Use plain text only.",
    })

export const storefrontServiceExtrasSchema = z
  .object({
    preferredDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.")
      .optional(),
    collectionAddress: plainText(300).optional(),
  })
  .strict()

/** Date-only preference in the business's local calendar (Africa/Lagos default). */
export function parsePreferredDate(value: string, now = new Date()) {
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, 12))
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== (month ?? 1) - 1 ||
    date.getUTCDate() !== day
  )
    throw new StorefrontOrderError("INVALID", "Choose a valid date.", {
      field: "preferredDate",
    })
  const today = new Date(
    `${new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(now)}T12:00:00Z`,
  )
  if (date.getTime() < today.getTime())
    throw new StorefrontOrderError("INVALID", "Choose today or a later date.", {
      field: "preferredDate",
    })
  if (date.getTime() > today.getTime() + 180 * 86_400_000)
    throw new StorefrontOrderError(
      "INVALID",
      "Choose a date within the next six months.",
      { field: "preferredDate" },
    )
  return date
}

function quoteKey(secret: string) {
  return createHash("sha256")
    .update(`ewatrade:storefront-quote-access:v1:${secret}`)
    .digest()
}
export function sealQuoteAccess(token: string, secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", quoteKey(secret), iv)
  const body = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  return [iv, cipher.getAuthTag(), body]
    .map((part) => part.toString("base64url"))
    .join(".")
}
export function openQuoteAccess(sealed: string, secret: string) {
  try {
    const [iv, tag, body] = sealed
      .split(".")
      .map((part) => Buffer.from(part, "base64url"))
    if (!iv || !tag || !body) return null
    const decipher = createDecipheriv("aes-256-gcm", quoteKey(secret), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(body), decipher.final()]).toString(
      "utf8",
    )
  } catch {
    return null
  }
}

export async function submitStorefrontServiceRequestWithReceipt(
  db: PrismaClient,
  input: { request: unknown; extras: unknown },
  context: { host: string; receiptSecret: string; customerId?: string | null },
) {
  const extras = storefrontServiceExtrasSchema.parse(input.extras ?? {})
  const requestedAt = extras.preferredDate
    ? parsePreferredDate(extras.preferredDate)
    : undefined
  if (extras.collectionAddress)
    await assertStoreConversationTextScreened(extras.collectionAddress)
  let saved: { id: string; tenantId: string } | null = null
  const receipt = await submitStorefrontServiceRequest(
    db,
    input.request,
    context.host,
    {
      requestedAt,
      onSaved: async (tx, request) => {
        saved = { id: request.id, tenantId: request.tenantId }
        const existing = await tx.storefrontServiceRequestContext.findUnique({
          where: { serviceRequestId: request.id },
          select: { id: true },
        })
        if (existing) return
        const token = storefrontReceiptToken(
          "service",
          request.id,
          context.receiptSecret,
        )
        const created = await tx.storefrontServiceRequestContext.create({
          data: {
            tenantId: request.tenantId,
            serviceRequestId: request.id,
            siteId: request.siteId,
            reference: newStorefrontReference("S"),
            receiptTokenDigest: storefrontReceiptDigest(token),
            customerId: context.customerId ?? null,
            collectionAddress: extras.collectionAddress?.trim() || null,
          },
          select: { id: true },
        })
        await tx.storefrontMerchantAlert.createMany({
          data: [
            {
              tenantId: request.tenantId,
              storeId: request.storeId,
              kind: "SERVICE",
              serviceContextId: created.id,
              dedupeKey: `service-request:${request.id}:new`,
            },
          ],
          skipDuplicates: true,
        })
      },
    },
  )
  const savedRequest = saved as { id: string; tenantId: string } | null
  if (!savedRequest)
    throw new StorefrontOrderError(
      "UNAVAILABLE",
      "We couldn't save your request. Please try again.",
    )
  const contextRow = await db.storefrontServiceRequestContext.findUniqueOrThrow(
    {
      where: { serviceRequestId: savedRequest.id },
      select: { reference: true },
    },
  )
  return {
    ...receipt,
    reference: contextRow.reference,
    receiptToken: storefrontReceiptToken(
      "service",
      savedRequest.id,
      context.receiptSecret,
    ),
  }
}

async function businessForHost(db: DbClient, host: string) {
  const current = await loadLiveStorefrontForHost(db, host, undefined, {})
  return current
    ? {
        tenantId: current.site.release.tenantId,
        storeId: current.site.storeId,
        businessName: current.storefront.name,
      }
    : null
}

/** Customer stage for a service request, its current quote and resulting Order. */
export function storefrontServiceStage(input: {
  status: string
  quoteStatus: string | null
  order: { status: string } | null
}) {
  if (input.order) {
    if (input.order.status === "COMPLETED") return "completed" as const
    if (input.order.status === "CANCELLED" || input.order.status === "REFUNDED")
      return "cancelled" as const
    return "confirmed" as const
  }
  if (input.status === "DECLINED") return "declined" as const
  if (input.status === "WITHDRAWN") return "withdrawn" as const
  if (input.status === "NEEDS_INFORMATION") return "needs_information" as const
  if (input.quoteStatus === "ISSUED") return "quoted" as const
  return "received" as const
}

const serviceReceiptSelect = {
  id: true,
  reference: true,
  collectionAddress: true,
  customerId: true,
  quoteVersionId: true,
  quoteAccessCiphertext: true,
  createdAt: true,
  messages: {
    orderBy: { createdAt: "asc" as const },
    take: 50,
    select: { id: true, author: true, body: true, createdAt: true },
  },
  serviceRequest: {
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      status: true,
      revision: true,
      customerName: true,
      customerPhone: true,
      details: true,
      staffResponse: true,
      requestedAt: true,
      lines: {
        select: {
          offeringId: true,
          offeringName: true,
          variantName: true,
          requestedQuantity: true,
          offering: {
            select: {
              catalogItemId: true,
              pricingPolicy: true,
              fixedPriceMinor: true,
              currencyCode: true,
              catalogItem: { select: { name: true } },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.StorefrontServiceRequestContextSelect

async function latestQuote(db: DbClient, tenantId: string, requestId: string) {
  const quote = await db.commerceQuote.findFirst({
    where: { tenantId, sourceType: "SERVICE_REQUEST", sourceId: requestId },
    select: {
      versions: {
        where: { status: { not: "DRAFT" } },
        orderBy: { version: "desc" },
        take: 1,
        select: {
          id: true,
          version: true,
          status: true,
          currencyCode: true,
          subtotalMinor: true,
          discountMinor: true,
          taxMinor: true,
          fulfilmentFeeMinor: true,
          fulfilmentType: true,
          totalMinor: true,
          customerNote: true,
          expiresAt: true,
          acceptedOrderId: true,
          lines: {
            where: { quoteOptionId: null },
            select: {
              catalogItemName: true,
              offeringName: true,
              variantName: true,
              quantity: true,
              unitPriceMinor: true,
              totalMinor: true,
              outcome: true,
            },
          },
          serviceBookings: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              status: true,
              startAt: true,
              endAt: true,
              timezoneSnapshot: true,
            },
          },
        },
      },
    },
  })
  return quote?.versions[0] ?? null
}

/** Guest service receipt, scoped to the business behind the Host. */
export async function getStorefrontServiceReceipt(
  db: DbClient,
  input: { host: string; token: string; quoteSecret?: string },
) {
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(input.token)) return null
  const business = await businessForHost(db, input.host)
  if (!business) return null
  const row = await db.storefrontServiceRequestContext.findFirst({
    where: {
      receiptTokenDigest: storefrontReceiptDigest(input.token),
      tenantId: business.tenantId,
      serviceRequest: { storeId: business.storeId },
    },
    select: serviceReceiptSelect,
  })
  if (!row) return null
  return projectServiceReceipt(
    db,
    row,
    business.businessName,
    input.quoteSecret,
  )
}

async function projectServiceReceipt(
  db: DbClient,
  row: Prisma.StorefrontServiceRequestContextGetPayload<{
    select: typeof serviceReceiptSelect
  }>,
  businessName: string,
  quoteSecret?: string,
) {
  const request = row.serviceRequest
  const quote = await latestQuote(db, request.tenantId, request.id)
  const order = quote?.acceptedOrderId
    ? await db.commercialOrder.findFirst({
        where: { id: quote.acceptedOrderId, tenantId: request.tenantId },
        select: {
          orderNumber: true,
          status: true,
          paymentStatus: true,
          totalMinor: true,
          amountPaidMinor: true,
          currencyCode: true,
          manualPaymentLinks: {
            where: { closedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              expiresAt: true,
              amountMinor: true,
              reports: {
                where: { status: { not: "DRAFT" } },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { status: true, claimedAmountMinor: true },
              },
            },
          },
        },
      })
    : null
  const quoteToken =
    quote &&
    quoteSecret &&
    row.quoteAccessCiphertext &&
    row.quoteVersionId === quote.id &&
    quote.status === "ISSUED"
      ? openQuoteAccess(row.quoteAccessCiphertext, quoteSecret)
      : null
  const booking = quote?.serviceBookings[0] ?? null
  const link = order?.manualPaymentLinks[0]
  return {
    kind: "service" as const,
    reference: row.reference,
    businessName,
    stage: storefrontServiceStage({
      status: request.status,
      quoteStatus: quote?.status ?? null,
      order,
    }),
    status: request.status,
    revision: request.revision,
    createdAt: row.createdAt.toISOString(),
    customerName: request.customerName,
    details: request.details,
    staffResponse: request.staffResponse,
    preferredDate: request.requestedAt
      ? request.requestedAt.toISOString().slice(0, 10)
      : null,
    collectionAddress: row.collectionAddress,
    lines: request.lines.map((line) => ({
      offeringId: line.offeringId,
      serviceName: line.offering.catalogItem.name,
      optionName: line.variantName || line.offeringName,
      quantity: line.requestedQuantity.toString(),
      priceMinor:
        line.offering.pricingPolicy === "FIXED"
          ? line.offering.fixedPriceMinor
          : null,
      currencyCode: line.offering.currencyCode,
    })),
    messages: row.messages.map((message) => ({
      id: message.id,
      author: message.author === "STAFF" ? "business" : "you",
      body: message.body,
      at: message.createdAt.toISOString(),
    })),
    quote: quote
      ? {
          versionId: quote.id,
          version: quote.version,
          status: quote.status,
          currencyCode: quote.currencyCode,
          subtotalMinor: quote.subtotalMinor,
          discountMinor: quote.discountMinor,
          taxMinor: quote.taxMinor,
          feeMinor: quote.fulfilmentFeeMinor,
          fulfilmentType: quote.fulfilmentType,
          totalMinor: quote.totalMinor,
          note: quote.customerNote,
          expiresAt: quote.expiresAt?.toISOString() ?? null,
          acceptToken: quoteToken,
          lines: quote.lines
            .filter((line) => line.outcome !== "DECLINED")
            .map((line) => ({
              name: line.catalogItemName,
              option: line.variantName || line.offeringName,
              quantity: line.quantity?.toString() ?? null,
              unitPriceMinor: line.unitPriceMinor,
              totalMinor: line.totalMinor,
            })),
        }
      : null,
    appointment: booking
      ? {
          status: booking.status,
          startsAt: booking.startAt.toISOString(),
          endsAt: booking.endAt.toISOString(),
          timezone: booking.timezoneSnapshot,
        }
      : null,
    order: order
      ? {
          orderNumber: order.orderNumber,
          status: order.status,
          paymentStatus: order.paymentStatus,
          totalMinor: order.totalMinor,
          paidMinor: order.amountPaidMinor,
          balanceMinor: Math.max(0, order.totalMinor - order.amountPaidMinor),
          currencyCode: order.currencyCode,
          paymentLink:
            link && link.expiresAt.getTime() > Date.now()
              ? {
                  id: link.id,
                  expiresAt: link.expiresAt,
                  amountMinor: link.amountMinor,
                }
              : null,
          paymentReport: link?.reports[0] ?? null,
        }
      : null,
  }
}
export type StorefrontServiceReceipt = NonNullable<
  Awaited<ReturnType<typeof getStorefrontServiceReceipt>>
>

/** Customer reply while the business is waiting for more information. */
export async function replyToStorefrontServiceRequest(
  db: PrismaClient,
  input: { host: string; token: string; reply: unknown },
) {
  const value = storefrontRequestReplySchema.parse(input.reply)
  await assertStoreConversationTextScreened(value.body)
  const business = await businessForHost(db, input.host)
  if (!business)
    throw new StorefrontOrderError("NOT_FOUND", "Request not found.")
  return db.$transaction(async (tx) => {
    const row = await tx.storefrontServiceRequestContext.findFirst({
      where: {
        receiptTokenDigest: storefrontReceiptDigest(input.token),
        tenantId: business.tenantId,
      },
      select: {
        id: true,
        serviceRequest: {
          select: { id: true, status: true, revision: true, storeId: true },
        },
      },
    })
    if (!row) throw new StorefrontOrderError("NOT_FOUND", "Request not found.")
    const previous = await tx.storefrontRequestMessage.findUnique({
      where: {
        tenantId_clientMessageId: {
          tenantId: business.tenantId,
          clientMessageId: value.clientMessageId,
        },
      },
      select: { serviceContextId: true },
    })
    if (previous?.serviceContextId === row.id)
      return { replayed: true, revision: row.serviceRequest.revision }
    if (row.serviceRequest.status !== "NEEDS_INFORMATION")
      throw new StorefrontOrderError(
        "INVALID_STATE",
        "This request isn't waiting for a reply.",
      )
    const updated = await tx.serviceRequest.updateMany({
      where: {
        id: row.serviceRequest.id,
        tenantId: business.tenantId,
        status: "NEEDS_INFORMATION",
        revision: value.expectedRevision,
      },
      data: { status: "SUBMITTED", revision: { increment: 1 } },
    })
    if (updated.count !== 1)
      throw new StorefrontOrderError(
        "STALE",
        "This request changed. Refresh to see the latest.",
      )
    const message = await tx.storefrontRequestMessage.create({
      data: {
        tenantId: business.tenantId,
        kind: "SERVICE",
        serviceContextId: row.id,
        author: "CUSTOMER",
        body: value.body,
        clientMessageId: value.clientMessageId,
      },
      select: { id: true },
    })
    await tx.storefrontMerchantAlert.create({
      data: {
        tenantId: business.tenantId,
        storeId: row.serviceRequest.storeId,
        kind: "SERVICE",
        serviceContextId: row.id,
        dedupeKey: `service-request:${row.serviceRequest.id}:reply:${message.id}`,
      },
    })
    return { replayed: false, revision: value.expectedRevision + 1 }
  }, TX())
}

/**
 * Customer declines the current issued quote. Only ISSUED → DECLINED for the quote
 * of this exact request; the business can then send a revised quote.
 */
export async function declineStorefrontServiceQuote(
  db: PrismaClient,
  input: {
    host: string
    token: string
    versionId: string
    reason?: string
    clientMessageId: string
  },
) {
  const reason = input.reason?.trim().slice(0, 500) ?? ""
  if (reason) await assertStoreConversationTextScreened(reason)
  const business = await businessForHost(db, input.host)
  if (!business)
    throw new StorefrontOrderError("NOT_FOUND", "Request not found.")
  return db.$transaction(async (tx) => {
    const row = await tx.storefrontServiceRequestContext.findFirst({
      where: {
        receiptTokenDigest: storefrontReceiptDigest(input.token),
        tenantId: business.tenantId,
      },
      select: {
        id: true,
        serviceRequest: { select: { id: true, storeId: true } },
      },
    })
    if (!row) throw new StorefrontOrderError("NOT_FOUND", "Request not found.")
    const updated = await tx.commerceQuoteVersion.updateMany({
      where: {
        id: input.versionId,
        status: "ISSUED",
        acceptedOrderId: null,
        quote: {
          tenantId: business.tenantId,
          sourceType: "SERVICE_REQUEST",
          sourceId: row.serviceRequest.id,
        },
      },
      data: { status: "DECLINED", declinedAt: new Date() },
    })
    if (updated.count !== 1)
      throw new StorefrontOrderError(
        "STALE",
        "This quote can no longer be declined. Refresh to see the latest.",
      )
    const message = await tx.storefrontRequestMessage.create({
      data: {
        tenantId: business.tenantId,
        kind: "SERVICE",
        serviceContextId: row.id,
        author: "CUSTOMER",
        body: reason ? `Declined the quote: ${reason}` : "Declined the quote.",
        clientMessageId: input.clientMessageId,
      },
      select: { id: true },
    })
    await tx.storefrontMerchantAlert.create({
      data: {
        tenantId: business.tenantId,
        storeId: row.serviceRequest.storeId,
        kind: "SERVICE",
        serviceContextId: row.id,
        dedupeKey: `service-request:${row.serviceRequest.id}:quote-declined:${message.id}`,
      },
    })
    return { declined: true }
  }, TX())
}

export async function withdrawStorefrontServiceRequest(
  db: PrismaClient,
  input: { host: string; token: string; request: unknown },
) {
  const value = storefrontWithdrawSchema.parse(input.request)
  const business = await businessForHost(db, input.host)
  if (!business)
    throw new StorefrontOrderError("NOT_FOUND", "Request not found.")
  const row = await db.storefrontServiceRequestContext.findFirst({
    where: {
      receiptTokenDigest: storefrontReceiptDigest(input.token),
      tenantId: business.tenantId,
    },
    select: { serviceRequestId: true },
  })
  if (!row) throw new StorefrontOrderError("NOT_FOUND", "Request not found.")
  const updated = await db.serviceRequest.updateMany({
    where: {
      id: row.serviceRequestId,
      tenantId: business.tenantId,
      revision: value.expectedRevision,
      status: { in: ["SUBMITTED", "NEEDS_INFORMATION"] },
    },
    data: { status: "WITHDRAWN", revision: { increment: 1 } },
  })
  if (updated.count !== 1)
    throw new StorefrontOrderError(
      "STALE",
      "This request can no longer be withdrawn. Refresh to see the latest.",
    )
  return { status: "WITHDRAWN" as const }
}

/**
 * Staff issues a fixed or per-line priced quote for a storefront service request
 * through the canonical quote command, and keeps the acceptance capability
 * (encrypted) so the customer's receipt can open the canonical quote page.
 */
export async function issueStorefrontServiceQuote(
  db: PrismaClient,
  input: {
    tenantId: string
    storeId: string
    actorUserId: string
    requestId: string
    clientQuoteId: string
    lines: { offeringId: string; quantity: string; unitPriceMinor: number }[]
    feeMinor?: number
    fulfilmentType?: "delivery" | "pickup" | "unspecified"
    note?: string
    expiresAt?: Date
    quoteSecret: string
  },
) {
  const context = await db.storefrontServiceRequestContext.findFirst({
    where: {
      tenantId: input.tenantId,
      serviceRequestId: input.requestId,
      serviceRequest: { storeId: input.storeId },
    },
    select: { id: true },
  })
  // One quote per request (same identity as the existing dashboard quote form);
  // each issue is a new version identified by the staff action's own ID.
  // A fee needs an Offer Option (options own their monetary facts and text);
  // without one, plain lines carry the customer note.
  const fee = input.feeMinor ?? 0
  const issued = await issueServiceQuote(db, {
    actorUserId: input.actorUserId,
    clientQuoteId: `request-${input.requestId}`,
    clientVersionId: input.clientQuoteId,
    requestId: input.requestId,
    storeId: input.storeId,
    tenantId: input.tenantId,
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    ...(fee > 0 || input.fulfilmentType
      ? {
          options: [
            {
              clientOptionId: `${input.clientQuoteId}:o`,
              label: "Quote",
              lines: input.lines,
              fulfilmentFeeMinor: fee,
              fulfilmentType: input.fulfilmentType ?? "unspecified",
              ...(input.note
                ? { fulfilmentPromise: input.note.slice(0, 280) }
                : {}),
            },
          ],
        }
      : {
          lines: input.lines,
          ...(input.note ? { customerNote: input.note } : {}),
        }),
  })
  const result = issued as {
    token?: string | null
    versionId?: string
    releaseState?: string
  }
  if (context && result.token && result.versionId)
    await db.storefrontServiceRequestContext.update({
      where: { id: context.id },
      data: {
        quoteVersionId: result.versionId,
        quoteAccessCiphertext: sealQuoteAccess(result.token, input.quoteSecret),
      },
    })
  return {
    versionId: result.versionId ?? null,
    releaseState: result.releaseState ?? "released",
    token: result.token ?? null,
  }
}

/** Staff list of storefront service requests with their receipt reference. */
export async function listStorefrontServiceRequests(
  db: DbClient,
  input: {
    tenantId: string
    storeIds: readonly string[]
    filter?: "open" | "quoted" | "closed" | "all"
    take?: number
    cursor?: string
  },
) {
  const take = Math.min(Math.max(input.take ?? 25, 1), 50)
  const status =
    input.filter === "quoted"
      ? { in: ["QUOTED" as const] }
      : input.filter === "closed"
        ? {
            in: [
              "DECLINED" as const,
              "WITHDRAWN" as const,
              "CONVERTED" as const,
            ],
          }
        : input.filter === "all"
          ? undefined
          : { in: ["SUBMITTED" as const, "NEEDS_INFORMATION" as const] }
  const rows = await db.storefrontServiceRequestContext.findMany({
    where: {
      tenantId: input.tenantId,
      serviceRequest: {
        storeId: { in: [...input.storeIds] },
        ...(status ? { status } : {}),
      },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      reference: true,
      createdAt: true,
      collectionAddress: true,
      serviceRequest: {
        select: {
          id: true,
          storeId: true,
          store: { select: { countryCode: true } },
          status: true,
          revision: true,
          customerName: true,
          customerPhone: true,
          requestedAt: true,
          details: true,
          staffResponse: true,
          lines: {
            select: {
              offeringId: true,
              offeringName: true,
              variantName: true,
              requestedQuantity: true,
              offering: {
                select: {
                  pricingPolicy: true,
                  fixedPriceMinor: true,
                  currencyCode: true,
                  catalogItem: { select: { name: true } },
                },
              },
            },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
        take: 20,
        select: { id: true, author: true, body: true, createdAt: true },
      },
      alerts: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, lastError: true },
      },
    },
  })
  const items = await Promise.all(
    rows.slice(0, take).map(async (row) => {
      const quote = await latestQuote(db, input.tenantId, row.serviceRequest.id)
      return {
        ...row,
        // Saved as typed by the customer; drafts need the international form.
        customerPhoneE164: row.serviceRequest.customerPhone
          ? (normalizeWhatsAppPhone(
              row.serviceRequest.customerPhone,
              row.serviceRequest.store.countryCode ?? "NG",
            )?.phoneE164 ?? null)
          : null,
        quote,
        stage: storefrontServiceStage({
          status: row.serviceRequest.status,
          quoteStatus: quote?.status ?? null,
          order: quote?.acceptedOrderId ? { status: "CONFIRMED" } : null,
        }),
      }
    }),
  )
  return {
    items,
    nextCursor: rows.length > take ? (rows[take - 1]?.id ?? null) : null,
  }
}

import { createHash, randomBytes } from "node:crypto"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import { isPrismaTransactionWriteConflict } from "../utils/prisma-transaction-conflict"
import { CatalogError } from "./catalog"
import {
  issuePreparedCommerceQuoteInTransaction,
  prepareCommerceQuoteIssue,
} from "./commerce-quotes"
import { assertServiceCommercePolicyAllowedInTransaction } from "./service-commerce-policy"
import { resolveServiceIntakeCustomer } from "./service-intake-customer"

export type StaffServiceQuoteInput = {
  actorUserId: string
  tenantId: string
  storeId: string
  clientQuoteId: string
  clientVersionId: string
  customerId?: string
  customerName?: string
  customerPhone?: string
  customerEmail?: string
  saveNewCustomer?: boolean
  customerNote: string
  lines: Array<{ offeringId: string; quantity: string; unitPriceMinor: number }>
}
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex")
function identity(input: StaffServiceQuoteInput) {
  return `staff-quote-${digest(JSON.stringify([input.tenantId, input.storeId, input.clientQuoteId]))}`
}

/** A private staff-attributed Request is the source for the existing Quote lifecycle. */
export async function createStaffServiceQuoteSourceInTransaction(
  tx: Prisma.TransactionClient,
  input: StaffServiceQuoteInput,
) {
  const manager = await tx.membership.findFirst({
    where: {
      tenantId: input.tenantId,
      userId: input.actorUserId,
      status: "ACTIVE",
      role: { in: ["OWNER", "ADMIN", "MANAGER"] },
    },
    select: { id: true },
  })
  if (!manager)
    throw new CatalogError(
      "QUOTE_CONFLICT",
      "Current manager access is required to prepare a staff quote.",
    )
  const id = identity(input)
  const payloadHash = digest(
    JSON.stringify({
      actorUserId: input.actorUserId,
      customerId: input.customerId ?? null,
      customerName: input.customerName?.trim() ?? null,
      customerPhone: input.customerPhone?.trim() ?? null,
      customerEmail: input.customerEmail?.trim() ?? null,
      saveNewCustomer: input.saveNewCustomer ?? false,
      customerNote: input.customerNote.trim(),
      lines: input.lines,
    }),
  )
  await assertServiceCommercePolicyAllowedInTransaction(tx, {
    actorUserId: input.actorUserId,
    channel: "staff",
    purpose: "service_quote_issue",
    storeId: input.storeId,
    subject: "quote",
    tenantId: input.tenantId,
    vertical: "service",
  })
  const previous = await tx.serviceRequest.findFirst({
    where: { id, tenantId: input.tenantId, storeId: input.storeId },
  })
  if (previous) {
    if (previous.payloadHash !== payloadHash)
      throw new CatalogError(
        "IDEMPOTENCY_MISMATCH",
        "This quote command was already used with different details.",
      )
    return id
  }
  if (!input.customerNote.trim())
    throw new CatalogError(
      "QUOTE_CONFLICT",
      "Describe the agreed service scope.",
    )
  if (
    !input.lines.length ||
    input.lines.length > 100 ||
    new Set(input.lines.map((line) => line.offeringId)).size !==
      input.lines.length
  ) {
    throw new CatalogError(
      "QUOTE_CONFLICT",
      "Select between 1 and 100 distinct service choices.",
    )
  }
  const offerings = await tx.sellableOffering.findMany({
    where: {
      id: { in: input.lines.map((line) => line.offeringId) },
      tenantId: input.tenantId,
      kind: "SERVICE",
      status: "ACTIVE",
      catalogItem: { systemRole: null, status: "ACTIVE" },
      storeAvailability: {
        some: { storeId: input.storeId, isAvailable: true },
      },
    },
    include: {
      serviceOffering: true,
      variant: {
        include: { selections: { include: { group: true, value: true } } },
      },
    },
  })
  if (offerings.length !== input.lines.length)
    throw new CatalogError(
      "OFFERING_UNAVAILABLE",
      "A service is no longer available in this store.",
    )
  const normalized = input.lines.map((line) => {
    const offering = offerings.find(
      (offering) => offering.id === line.offeringId,
    )
    if (!offering?.serviceOffering)
      throw new CatalogError(
        "OFFERING_UNAVAILABLE",
        "Service choice unavailable.",
      )
    if (
      !Number.isSafeInteger(line.unitPriceMinor) ||
      line.unitPriceMinor < 0 ||
      line.unitPriceMinor > 100_000_000
    )
      throw new CatalogError("QUOTE_CONFLICT", "Enter a valid quote amount.")
    if (
      offering.pricingPolicy === "FIXED" &&
      offering.fixedPriceMinor !== line.unitPriceMinor
    )
      throw new CatalogError(
        "REVISION_CONFLICT",
        "A fixed service price changed. Reload before quoting.",
      )
    return {
      offering,
      quantity: parseExactDecimal(line.quantity, {
        allowZero: false,
        maxScale: offering.serviceOffering.quantityScale,
      }),
    }
  })
  const customerId = await resolveServiceIntakeCustomer(tx, input)
  const customer = customerId
    ? await tx.customer.findFirst({
        where: { id: customerId, tenantId: input.tenantId },
        select: { name: true, phone: true, email: true },
      })
    : null
  const customerName = customer?.name || input.customerName?.trim()
  if (!customerName)
    throw new CatalogError(
      "QUOTE_CONFLICT",
      "Choose or enter the customer receiving this quote.",
    )
  // DRAFT has no public admission. The unshared digest is never returned to a client.
  const form = await tx.serviceRequestForm.create({
    data: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      createdByUserId: input.actorUserId,
      label: "Staff quote",
      status: "DRAFT",
      publicTokenDigest: digest(randomBytes(32).toString("base64url")),
    },
  })
  await tx.serviceRequest.create({
    data: {
      id,
      tenantId: input.tenantId,
      storeId: input.storeId,
      requestFormId: form.id,
      clientRequestId: id,
      payloadHash,
      channelOrigin: "STAFF",
      createdByUserId: input.actorUserId,
      customerName,
      customerPhone: customer?.phone ?? input.customerPhone,
      customerEmail: customer?.email ?? input.customerEmail,
      details: input.customerNote.trim(),
      contactOptIn: false,
    },
  })
  await tx.serviceRequestLine.createMany({
    data: normalized.map(({ offering, quantity }) => ({
      requestId: id,
      offeringId: offering.id,
      offeringName: offering.name,
      variantName: offering.variant.name,
      requestedQuantity: quantity,
      optionSelections: offering.variant.selections.map((selection) => ({
        group: selection.group.name,
        value: selection.value.label,
      })),
    })),
  })
  return id
}

/** Screening precedes writes; source and canonical issuance commit or roll back together. */
export async function createStaffServiceQuote(
  db: PrismaClient,
  input: StaffServiceQuoteInput,
) {
  const prepared = await prepareCommerceQuoteIssue({
    actorUserId: input.actorUserId,
    tenantId: input.tenantId,
    storeId: input.storeId,
    sourceId: identity(input),
    sourceType: "service_request",
    clientQuoteId: input.clientQuoteId,
    clientVersionId: input.clientVersionId,
    customerNote: input.customerNote,
    lines: input.lines.map((line) => ({ ...line, outcome: "included" })),
    availabilityOutcome: "full",
    fulfilmentType: "unspecified",
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
  })
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          const requestId = await createStaffServiceQuoteSourceInTransaction(
            tx,
            input,
          )
          const result = await issuePreparedCommerceQuoteInTransaction(
            tx,
            prepared,
          )
          return { ...result, requestId }
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        },
      )
    } catch (error) {
      if (
        attempt === 0 &&
        (isPrismaTransactionWriteConflict(error) ||
          (error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"))
      )
        continue
      throw error
    }
  }
  throw new CatalogError(
    "REVISION_CONFLICT",
    "The quote changed. Reload before retrying.",
  )
}

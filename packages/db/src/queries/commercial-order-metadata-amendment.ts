import { z } from "zod"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { CatalogError } from "./catalog-errors"
import {
  orderAmendmentDigest as digest,
  orderAmendmentJson as json,
} from "./commercial-order-amendment-evidence"
import { getCommercialOrderAmendmentEligibility } from "./commercial-order-amendment-review"
import {
  lockCommerceFinancialContext,
  lockCommerceFinancialOrder,
} from "./customer-ledger/commerce-locks"
import { runInOwnTransaction } from "./own-transaction"

export const orderMetadataPatchSchema = z
  .object({
    customerId: z.string().trim().min(1).max(128).nullable().optional(),
    deliveryDueAt: z
      .string()
      .datetime({ offset: true })
      .transform((value) => new Date(value).toISOString())
      .nullable()
      .optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict()
  .refine(
    (value) => Object.values(value).some((entry) => entry !== undefined),
    "Choose at least one field to amend.",
  )
export type OrderMetadataPatch = z.input<typeof orderMetadataPatchSchema>
type Scope = { tenantId: string; storeId: string; orderId: string }
function patch(value: OrderMetadataPatch) {
  const parsed = orderMetadataPatchSchema.safeParse(value)
  if (!parsed.success)
    throw new CatalogError(
      "INVALID_ORDER",
      parsed.error.issues[0]?.message ?? "Invalid order amendment.",
    )
  return parsed.data
}
export async function previewCommercialOrderMetadataAmendment(
  db: Prisma.TransactionClient,
  input: Scope & { patch: OrderMetadataPatch },
) {
  const changes = patch(input.patch)
  const review = await getCommercialOrderAmendmentEligibility(db, input)
  const source = review.source
  const before = {
    customerId: source.customerId,
    customerName: source.customerName,
    customerPhone: source.customerPhone,
    customerEmail: source.customerEmail,
    deliveryDueAt: source.deliveryDueAt?.toISOString() ?? null,
    notes: source.notes,
  }
  const after = { ...before }
  let selectedCustomer: {
    id: string
    name: string
    phone: string | null
    email: string | null
    updatedAt: Date
  } | null = null
  if (changes.customerId !== undefined) {
    if (changes.customerId !== null) {
      selectedCustomer = await db.customer.findFirst({
        where: { id: changes.customerId, tenantId: input.tenantId },
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          updatedAt: true,
        },
      })
      if (!selectedCustomer)
        throw new CatalogError(
          "INVALID_ORDER",
          "Selected Customer not found in this business.",
        )
    }
    after.customerId = selectedCustomer?.id ?? null
    after.customerName = selectedCustomer?.name ?? null
    after.customerPhone = selectedCustomer?.phone ?? null
    after.customerEmail = selectedCustomer?.email ?? null
  }
  if (changes.deliveryDueAt !== undefined)
    after.deliveryDueAt = changes.deliveryDueAt
  if (changes.notes !== undefined) after.notes = changes.notes?.trim() || null
  const changedFields = (
    Object.keys(before) as Array<keyof typeof before>
  ).filter((key) => before[key] !== after[key])
  if (!changedFields.length)
    throw new CatalogError(
      "INVALID_ORDER",
      "The proposed order fields are unchanged.",
    )
  const beforeSnapshot = json(source)
  return {
    orderId: source.id,
    orderNumber: source.orderNumber,
    eligible: review.eligibility.eligibleForOrdinaryAmendment,
    blockers: review.eligibility.blockers,
    before,
    after,
    changedFields,
    beforeSnapshot,
    reviewDigest: digest({
      beforeSnapshot,
      evidence: review.evidence,
      after,
      selectedCustomer,
    }),
    totalChangeMinor: 0 as const,
    stockOnHandChange: "0" as const,
    moneyMovementMinor: 0 as const,
  }
}
export type AmendCommercialOrderMetadataInput = Scope & {
  actorUserId: string
  clientOperationId: string
  expectedReviewDigest: string
  reason: string
  patch: OrderMetadataPatch
}
/** Caller owns current actor authorization; this path only amends eligible unpaid/unfulfilled orders. */
export async function amendCommercialOrderMetadataInTransaction(
  tx: Prisma.TransactionClient,
  input: AmendCommercialOrderMetadataInput,
) {
  const changes = patch(input.patch)
  if (
    !input.actorUserId.trim() ||
    !input.clientOperationId.trim() ||
    input.clientOperationId.length > 128 ||
    !input.reason.trim() ||
    input.reason.trim().length > 500 ||
    !/^[a-f0-9]{64}$/.test(input.expectedReviewDigest)
  )
    throw new CatalogError(
      "INVALID_ORDER",
      "A reviewed amendment, command identity and reason are required.",
    )
  const payloadHash = digest({
    ...input,
    patch: changes,
    reason: input.reason.trim(),
  })
  const readPrevious = () =>
    tx.commercialOrderAmendment.findUnique({
      where: {
        tenantId_clientOperationId: {
          tenantId: input.tenantId,
          clientOperationId: input.clientOperationId,
        },
      },
    })
  const replay = (
    previous: NonNullable<Awaited<ReturnType<typeof readPrevious>>>,
  ) => {
    if (
      previous.payloadHash !== payloadHash ||
      previous.kind !== "METADATA" ||
      previous.orderId !== input.orderId
    )
      throw new CatalogError(
        "IDEMPOTENCY_MISMATCH",
        "This amendment identity was used with different input.",
      )
    return previous
  }
  const previous = await readPrevious()
  if (previous) return replay(previous)
  const identity = await tx.commercialOrder.findFirst({
    where: {
      id: input.orderId,
      tenantId: input.tenantId,
      storeId: input.storeId,
    },
    select: { currencyCode: true, customerId: true },
  })
  if (!identity)
    throw new CatalogError(
      "ORDER_NOT_FOUND",
      "Order not found for this business and Store.",
    )
  // Acquire both old and new account contexts before the order; never add an account afterward.
  const customerIds = [
    ...new Set(
      [identity.customerId, changes.customerId].filter(
        (id): id is string => typeof id === "string",
      ),
    ),
  ].sort()
  for (const customerId of customerIds.length ? customerIds : [null])
    await lockCommerceFinancialContext(tx, {
      tenantId: input.tenantId,
      currencyCode: identity.currencyCode,
      customerId,
    })
  const locked = await lockCommerceFinancialOrder(tx, {
    ...input,
    expectedIdentity: identity,
  })
  if (!locked || locked.order.storeId !== input.storeId)
    throw new CatalogError(
      "ORDER_NOT_FOUND",
      "Order not found for this business and Store.",
    )
  const concurrent = await readPrevious()
  if (concurrent) return replay(concurrent)
  if (changes.customerId) {
    const selected = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "Customer" WHERE "id"=${changes.customerId} AND "tenantId"=${input.tenantId} FOR SHARE`
    if (selected.length !== 1 || selected[0]?.id !== changes.customerId)
      throw new CatalogError(
        "INVALID_ORDER",
        "Selected Customer not found in this business.",
      )
  }
  const preview = await previewCommercialOrderMetadataAmendment(tx, {
    ...input,
    patch: changes,
  })
  if (!preview.eligible)
    throw new CatalogError(
      "INVALID_ORDER",
      preview.blockers.map((block) => block.reason).join(" "),
    )
  if (preview.reviewDigest !== input.expectedReviewDigest)
    throw new CatalogError(
      "REVISION_CONFLICT",
      "Order or selected customer changed. Review the amendment again.",
    )
  await tx.commercialOrder.update({
    where: { id: input.orderId },
    data: {
      ...preview.after,
      deliveryDueAt: preview.after.deliveryDueAt
        ? new Date(preview.after.deliveryDueAt)
        : null,
    },
  })
  return tx.commercialOrderAmendment.create({
    data: {
      tenantId: input.tenantId,
      orderId: input.orderId,
      clientOperationId: input.clientOperationId,
      payloadHash,
      kind: "METADATA",
      actorUserId: input.actorUserId,
      reason: input.reason.trim(),
      beforeSnapshot: preview.beforeSnapshot,
      afterSnapshot: json({
        metadata: preview.after,
        changedFields: preview.changedFields,
        totalChangeMinor: 0,
        stockOnHandChange: "0",
        moneyMovementMinor: 0,
      }),
    },
  })
}
export async function amendCommercialOrderMetadata(
  db: PrismaClient,
  input: AmendCommercialOrderMetadataInput,
) {
  return runInOwnTransaction(db, (tx) =>
    amendCommercialOrderMetadataInTransaction(tx, input),
  )
}

import type {
  GeneralAction,
  GeneralActionName,
  GeneralReceipt,
} from "@ewatrade/assistant/general/contracts"
import {
  lockGeneralPaymentOrder,
  readGeneralOrderReview,
} from "@ewatrade/db/assistant-general"
import {
  createCommercialOrderInTransaction,
  createCustomerInTransaction,
  createSimpleCatalogItemInTransaction,
  recordCommercialOrderPaymentInTransaction,
  resolveOrderScope,
} from "@ewatrade/db/queries"
import type { Prisma } from "@ewatrade/db/types"
import { TRPCError } from "@trpc/server"
import { catalogCreateSimpleItemSchema } from "../schemas/catalog"
import { customerCreateSchema } from "../schemas/customers"
import {
  commercialOrderCreateSchema,
  commercialOrderPaymentSchema,
} from "../schemas/orders"
import { type GeneralContext, requireGeneralScope } from "./general-context"
import { proposalDigest } from "./proposal-security"

export type GeneralTransactionContext = Omit<GeneralContext, "db"> & {
  db: Prisma.TransactionClient
}
/** The existing record a proposal acts on, bound at draft and rechecked on Confirm. */
export type ProposalTarget = { id: string; revision: string }
type Action<Name extends GeneralActionName> = Extract<
  GeneralAction,
  { action: Name }
>
/**
 * One canonical command per proposal action. Authorization happens before
 * every call (see `assertCapability`); adapters only validate, describe and
 * execute through the same transaction commands as the forms.
 */
type GeneralActionAdapter<A extends GeneralAction> = {
  /** Check targets and references. `lock` is set while confirming. */
  validate(
    ctx: GeneralTransactionContext,
    payload: A,
    lock: boolean,
  ): Promise<ProposalTarget | null>
  /** Current review lines and target; throwing marks the draft unavailable. */
  review?(
    ctx: GeneralTransactionContext,
    payload: A,
  ): Promise<{ lines: string[]; target: ProposalTarget | null }>
  /** Shown when the bound target changed after drafting. */
  stale: string
  /** Shown when the review cannot be read. */
  unavailable: string
  execute(
    ctx: GeneralTransactionContext,
    payload: A,
    key: string,
  ): Promise<GeneralReceipt>
}

export const conflict = (message: string) =>
  new TRPCError({ code: "CONFLICT", message })
const currency = (ctx: GeneralTransactionContext) =>
  ctx.tenantContext.activeStore?.currencyCode ??
  ctx.tenantContext.tenant.currencyCode
const major = (minor: number) => (minor / 100).toFixed(2)

async function paymentTarget(
  ctx: GeneralTransactionContext,
  action: Action<"payment_record">,
  lock: boolean,
) {
  const scope = requireGeneralScope(ctx)
  if (lock)
    await lockGeneralPaymentOrder(ctx.db, {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      orderId: action.orderId,
    })
  const visibility = await resolveOrderScope(ctx.db, {
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    activeStoreId: scope.storeId,
    userId: scope.userId,
    role: ctx.tenantContext.membership.role,
    allowedStoreIds: ctx.tenantContext.stores.map((store) => store.id),
  })
  const target = await ctx.db.commercialOrder.findFirst({
    where: { ...visibility, id: action.orderId },
    select: {
      id: true,
      orderNumber: true,
      customerName: true,
      updatedAt: true,
      amountPaidMinor: true,
      totalMinor: true,
      status: true,
      paymentStatus: true,
      _count: { select: { payments: true } },
    },
  })
  if (!target)
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "This order is unavailable in your current Store.",
    })
  if (target.paymentStatus === "PAID" && target._count.payments === 0)
    throw conflict("This order is already paid.")
  if (["CANCELLED", "REFUNDED"].includes(target.status))
    throw conflict("This order no longer accepts payments.")
  if (action.amountMinor > target.totalMinor - target.amountPaidMinor)
    throw conflict("Payment exceeds the remaining balance. Check the order.")
  return {
    id: target.id,
    review: {
      orderNumber: target.orderNumber,
      customerName: target.customerName,
      balanceDueMinor: target.totalMinor - target.amountPaidMinor,
    },
    revision: proposalDigest({
      ...target,
      updatedAt: target.updatedAt.toISOString(),
    }),
  }
}

const customerCreate: GeneralActionAdapter<Action<"customer_create">> = {
  validate: async () => null,
  stale: "This draft changed. Review it again.",
  unavailable: "This customer draft is unavailable.",
  async execute(ctx, payload) {
    const scope = requireGeneralScope(ctx)
    const { action: _, ...input } = payload
    const result = await createCustomerInTransaction(ctx.db, {
      ...customerCreateSchema.parse(input),
      tenantId: scope.tenantId,
    })
    return {
      kind: "customer",
      recordId: result.id,
      title: "Customer added",
      detail: result.name,
    }
  },
}

const productCreate: GeneralActionAdapter<Action<"product_create">> = {
  validate: async () => null,
  stale: "This draft changed. Review it again.",
  unavailable: "This product draft is unavailable.",
  async execute(ctx, payload, key) {
    const scope = requireGeneralScope(ctx)
    const { action: _, ...input } = payload
    const result = await createSimpleCatalogItemInTransaction(ctx.db, {
      ...catalogCreateSimpleItemSchema.parse({
        ...input,
        kind: "product",
        storeId: scope.storeId,
        clientOperationId: key,
      }),
      storeId: scope.storeId,
      tenantId: scope.tenantId,
      actorUserId: scope.userId,
    })
    return {
      kind: "product",
      recordId: result.id,
      title: "Product added",
      detail: result.name,
    }
  },
}

const orderCreate: GeneralActionAdapter<Action<"order_create">> = {
  async validate(ctx, payload) {
    const scope = requireGeneralScope(ctx)
    if (
      payload.customerId &&
      !(await ctx.db.customer.findFirst({
        where: { id: payload.customerId, tenantId: scope.tenantId },
        select: { id: true },
      }))
    )
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Customer unavailable.",
      })
    await readGeneralOrderReview(ctx.db, scope, payload.lines)
    for (const line of payload.lines) {
      const offering = await ctx.db.sellableOffering.findFirst({
        where: { id: line.offeringId, tenantId: scope.tenantId },
        select: { id: true },
      })
      if (!offering)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "An offering could not be found. Search the Catalog first.",
        })
    }
    // Domain commands still validate current prices, precision, availability,
    // Terms, Finance prerequisites and plan limits on Confirm.
    return null
  },
  async review(ctx, payload) {
    const scope = requireGeneralScope(ctx)
    const review = await readGeneralOrderReview(ctx.db, scope, payload.lines)
    const customer = payload.customerId
      ? await ctx.db.customer.findFirst({
          where: { id: payload.customerId, tenantId: scope.tenantId },
          select: { name: true },
        })
      : null
    return {
      target: null,
      lines: [
        ...review.lines,
        `Total: ${currency(ctx)} ${major(review.totalMinor)}`,
        `Customer: ${customer?.name ?? "Walk-in"}`,
        ...(payload.notes ? [payload.notes] : []),
      ],
    }
  },
  stale: "This draft changed. Review it again.",
  unavailable:
    "Sale details changed or are unavailable. Edit quantities and save again, or use the sale form.",
  async execute(ctx, payload, key) {
    const scope = requireGeneralScope(ctx)
    const { action: _, ...input } = payload
    const result = await createCommercialOrderInTransaction(ctx.db, {
      ...commercialOrderCreateSchema.parse({
        ...input,
        storeId: scope.storeId,
        clientOrderId: key,
        schemaVersion: 1,
      }),
      storeId: scope.storeId,
      tenantId: scope.tenantId,
      actorUserId: scope.userId,
    })
    return {
      kind: "order",
      recordId: result.id,
      orderId: result.id,
      title: "Order created",
      detail: result.orderNumber,
    }
  },
}

const paymentRecord: GeneralActionAdapter<Action<"payment_record">> = {
  async validate(ctx, payload, lock) {
    const { id, revision } = await paymentTarget(ctx, payload, lock)
    return { id, revision }
  },
  async review(ctx, payload) {
    const target = await paymentTarget(ctx, payload, false)
    return {
      target: { id: target.id, revision: target.revision },
      lines: [
        `${target.review.customerName || "Walk-in customer"} · ${target.review.orderNumber}`,
        `${currency(ctx)} ${major(payload.amountMinor)} · ${payload.method.replaceAll("_", " ")}`,
        `Balance after: ${currency(ctx)} ${major(target.review.balanceDueMinor - payload.amountMinor)}`,
        ...(payload.note ? [payload.note] : []),
      ],
    }
  },
  stale: "This order changed. Edit and review the payment again.",
  unavailable:
    "This order is unavailable or no longer accepts this payment. Check it before trying again.",
  async execute(ctx, payload, key) {
    const scope = requireGeneralScope(ctx)
    const { action: _, ...input } = payload
    const result = await recordCommercialOrderPaymentInTransaction(ctx.db, {
      ...commercialOrderPaymentSchema.parse({
        ...input,
        clientPaymentId: key,
      }),
      tenantId: scope.tenantId,
      actorUserId: scope.userId,
    })
    return {
      kind: "payment",
      recordId: result.id,
      orderId: payload.orderId,
      title: "Payment recorded",
      detail: `${currency(ctx)} ${major(payload.amountMinor)} · ${payload.method.replaceAll("_", " ")} · remaining ${major(result.balanceDueMinor)}`,
    }
  },
}

const adapters: {
  [Name in GeneralActionName]: GeneralActionAdapter<Action<Name>>
} = {
  customer_create: customerCreate,
  product_create: productCreate,
  order_create: orderCreate,
  payment_record: paymentRecord,
}
export function generalActionAdapter<A extends GeneralAction>(payload: A) {
  return adapters[payload.action] as unknown as GeneralActionAdapter<A>
}
export function sameTarget(
  target: ProposalTarget | null,
  row: { targetRecordId: string | null; targetRevision: string | null },
) {
  return (
    (target?.id ?? null) === row.targetRecordId &&
    (target?.revision ?? null) === row.targetRevision
  )
}

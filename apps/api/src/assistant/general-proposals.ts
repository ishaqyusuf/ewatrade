import { randomUUID } from "node:crypto"
import {
  type GeneralAction,
  type GeneralProposal,
  type GeneralReceipt,
  generalActionSchema,
  generalReceiptSchema,
} from "@ewatrade/assistant/general/contracts"
import { isAccountPrivacyAccessBlocked } from "@ewatrade/db/account-privacy-access"
import {
  generalProposalWhere,
  lockGeneralMembership,
  lockGeneralPaymentOrder,
  readGeneralConversation,
  readGeneralOrderReview,
} from "@ewatrade/db/assistant-general"
import type { readGeneralProposals } from "@ewatrade/db/assistant-general"
import { isLegalSignupSessionBlocked } from "@ewatrade/db/legal-session-access"
import {
  createCommercialOrderInTransaction,
  createCustomerInTransaction,
  createSimpleCatalogItemInTransaction,
  getActiveTenantForUser,
  getCustomerAccountAgeStatus,
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
import {
  type GeneralContext,
  assertGeneralAction,
  requireGeneralScope,
} from "./general-context"
import {
  isProposalApprovalValid,
  proposalApprovalToken,
  proposalDigest,
} from "./proposal-security"
type AssistantActionProposal = Awaited<
  ReturnType<typeof readGeneralProposals>
>[number]
type GeneralTransactionContext = Omit<GeneralContext, "db"> & {
  db: Prisma.TransactionClient
}
const conflict = (message: string) =>
  new TRPCError({ code: "CONFLICT", message })
const signingKey = () => process.env.ASSISTANT_APPROVAL_SIGNING_KEY ?? ""
/** This DTO is issued only to the authenticated app. Never include it in a model result. */
export function generalProposalForApp(
  row: AssistantActionProposal,
): GeneralProposal {
  const payload = generalActionSchema.parse(row.payload)
  const pending = row.status === "PENDING" && row.expiresAt > new Date()
  const token = pending ? proposalApprovalToken(row, signingKey()) : undefined
  return {
    id: row.id,
    revision: row.revision,
    payload,
    status: row.status === "PENDING" && !pending ? "EXPIRED" : row.status,
    expiresAt: row.expiresAt.toISOString(),
    receipt: row.executedResult
      ? generalReceiptSchema.parse(row.executedResult)
      : null,
    ...(token && proposalDigest(token) === row.approvalTokenHash
      ? { approvalToken: token }
      : {}),
  }
}
async function inFreshGeneralTransaction<T>(
  ctx: GeneralContext,
  operation: (fresh: GeneralTransactionContext) => Promise<T>,
) {
  const scope = requireGeneralScope(ctx)
  for (let attempt = 0; ; attempt++) {
    try {
      return await ctx.db.$transaction(
        async (tx) => {
          await lockGeneralMembership(
            tx,
            ctx.tenantContext.membership.id,
            scope,
          )
          const db = tx
          const session = await db.session.findFirst({
            where: {
              id: ctx.session.session.id,
              userId: scope.userId,
              expiresAt: { gt: new Date() },
            },
            select: { id: true },
          })
          if (!session)
            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: "Sign in again before confirming.",
            })
          const tenantContext = await getActiveTenantForUser(db, {
            userId: scope.userId,
            tenantSlug: ctx.tenantSlug,
            storeId: scope.storeId,
          })
          const age = await getCustomerAccountAgeStatus(db, scope.userId)
          if (
            !tenantContext ||
            !age.eligible ||
            (await isAccountPrivacyAccessBlocked(db, scope.userId)) ||
            (await isLegalSignupSessionBlocked(db, scope.userId))
          )
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Your account or workspace access changed.",
            })
          if (
            ctx.qaSessionScope &&
            (tenantContext.tenant.id !== ctx.qaSessionScope.tenantId ||
              tenantContext.membership.id !== ctx.qaSessionScope.membershipId ||
              tenantContext.activeStore?.id !== ctx.qaSessionScope.storeId)
          )
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "QA session scope changed.",
            })
          const fresh: GeneralTransactionContext = { ...ctx, db, tenantContext }
          const current = requireGeneralScope(fresh)
          if (
            current.tenantId !== scope.tenantId ||
            current.storeId !== scope.storeId ||
            current.userId !== scope.userId
          )
            throw conflict("Workspace access changed. Refresh the assistant.")
          return operation(fresh)
        },
        { isolationLevel: "Serializable", maxWait: 10_000, timeout: 30_000 },
      )
    } catch (error) {
      if (
        attempt >= 2 ||
        !error ||
        typeof error !== "object" ||
        !("code" in error) ||
        error.code !== "P2034"
      )
        throw error
      // Only serialization failures have rolled back. Every retry rereads authority.
    }
  }
}
async function paymentTarget(
  ctx: GeneralTransactionContext,
  action: Extract<GeneralAction, { action: "payment_record" }>,
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
async function validateDraft(
  ctx: GeneralTransactionContext,
  action: GeneralAction,
  key: string,
) {
  const scope = assertGeneralAction(ctx, action.action)
  if (action.action === "payment_record")
    return paymentTarget(ctx, action, false)
  if (action.action === "order_create") {
    if (
      action.customerId &&
      !(await ctx.db.customer.findFirst({
        where: { id: action.customerId, tenantId: scope.tenantId },
        select: { id: true },
      }))
    )
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Customer unavailable.",
      })
    await readGeneralOrderReview(ctx.db, scope, action.lines)
    for (const line of action.lines) {
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
  }
  // Domain commands still validate current prices, precision, availability, Terms,
  // Finance prerequisites and plan limits on Confirm; a draft changes no record.
  void key
  return null
}
export async function draftGeneralProposal(
  ctx: GeneralContext,
  conversationId: string,
  raw: unknown,
) {
  const payload = generalActionSchema.parse(raw)
  return inFreshGeneralTransaction(ctx, async (fresh) => {
    const scope = assertGeneralAction(fresh, payload.action)
    if (!(await readGeneralConversation(fresh.db, scope, conversationId)))
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Conversation unavailable.",
      })
    const key = `assistant_${randomUUID()}`
    const target = await validateDraft(fresh, payload, key)
    const row = await fresh.db.assistantActionProposal.create({
      data: {
        id: randomUUID(),
        conversationId,
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        actorUserId: scope.userId,
        action: payload.action,
        payload,
        payloadHash: proposalDigest(payload),
        roleSnapshot: fresh.tenantContext.membership.role,
        approvalTokenHash: "pending",
        idempotencyKey: key,
        expiresAt: new Date(Date.now() + 15 * 60_000),
        targetRecordId: target?.id,
        targetRevision: target?.revision,
      },
    })
    await fresh.db.assistantActionProposal.update({
      where: { id: row.id },
      data: {
        approvalTokenHash: proposalDigest(
          proposalApprovalToken(row, signingKey()),
        ),
      },
    })
    // Safe model result: no credential or user-facing execution capability.
    return {
      proposalId: row.id,
      revision: row.revision,
      payload,
      status: "needs_user_confirmation",
    }
  })
}
async function executeAction(
  ctx: GeneralTransactionContext,
  payload: GeneralAction,
  key: string,
): Promise<GeneralReceipt> {
  const scope = assertGeneralAction(ctx, payload.action)
  switch (payload.action) {
    case "customer_create": {
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
    }
    case "product_create": {
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
    }
    case "order_create": {
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
    }
    case "payment_record": {
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
        detail: `${ctx.tenantContext.activeStore?.currencyCode ?? ctx.tenantContext.tenant.currencyCode} ${(payload.amountMinor / 100).toFixed(2)} · ${payload.method.replaceAll("_", " ")} · remaining ${(result.balanceDueMinor / 100).toFixed(2)}`,
      }
    }
  }
}
export async function decideGeneralProposal(
  ctx: GeneralContext,
  input: {
    proposalId: string
    revision: number
    decision: "confirm" | "cancel"
    approvalToken?: string
  },
) {
  return inFreshGeneralTransaction(ctx, async (fresh) => {
    const scope = requireGeneralScope(fresh)
    const row = await fresh.db.assistantActionProposal.findFirst({
      where: { ...generalProposalWhere(scope), id: input.proposalId },
    })
    if (!row)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Proposal unavailable.",
      })
    const payload = generalActionSchema.parse(row.payload)
    assertGeneralAction(fresh, payload.action)
    if (row.revision !== input.revision)
      throw conflict("This draft was edited. Review its latest version.")
    if (row.status === "COMPLETED" && input.decision === "confirm")
      return generalProposalForApp(row)
    if (row.status === "CANCELLED" && input.decision === "cancel")
      return generalProposalForApp(row)
    if (row.status !== "PENDING")
      throw conflict("This draft cannot be confirmed. Refresh its status.")
    if (input.decision === "cancel") {
      const changed = await fresh.db.assistantActionProposal.updateMany({
        where: { id: row.id, revision: row.revision, status: "PENDING" },
        data: { status: "CANCELLED", decidedAt: new Date() },
      })
      if (changed.count !== 1)
        throw conflict("Draft changed. Refresh the assistant.")
      return generalProposalForApp({ ...row, status: "CANCELLED" })
    }
    if (
      row.actionVersion !== 1 ||
      row.action !== payload.action ||
      proposalDigest(payload) !== row.payloadHash ||
      !isProposalApprovalValid(row, input.approvalToken ?? "", signingKey())
    )
      throw conflict(
        "Approval expired or changed. Review and save the draft again.",
      )
    if (payload.action === "payment_record") {
      const target = await paymentTarget(fresh, payload, true)
      if (
        target.id !== row.targetRecordId ||
        target.revision !== row.targetRevision
      )
        throw conflict("This order changed. Edit and review the payment again.")
    }
    await validateDraft(fresh, payload, row.idempotencyKey)
    const claimed = await fresh.db.assistantActionProposal.updateMany({
      where: {
        id: row.id,
        revision: row.revision,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      data: { status: "EXECUTING" },
    })
    if (claimed.count !== 1)
      throw conflict("Draft changed. Refresh before confirming.")
    const receipt = await executeAction(fresh, payload, row.idempotencyKey)
    const completed = await fresh.db.assistantActionProposal.update({
      where: { id: row.id },
      data: {
        status: "COMPLETED",
        executedResult: receipt,
        decidedAt: new Date(),
      },
    })
    return generalProposalForApp(completed)
  })
}
export async function editGeneralProposal(
  ctx: GeneralContext,
  input: { proposalId: string; revision: number; payload: GeneralAction },
) {
  return inFreshGeneralTransaction(ctx, async (fresh) => {
    const scope = assertGeneralAction(fresh, input.payload.action)
    const row = await fresh.db.assistantActionProposal.findFirst({
      where: { ...generalProposalWhere(scope), id: input.proposalId },
    })
    if (
      !row ||
      row.status !== "PENDING" ||
      row.revision !== input.revision ||
      row.action !== input.payload.action
    )
      throw conflict("Draft changed. Refresh before editing.")
    const target = await validateDraft(fresh, input.payload, row.idempotencyKey)
    const binding = {
      ...row,
      payload: input.payload,
      payloadHash: proposalDigest(input.payload),
      revision: row.revision + 1,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    }
    const saved = await fresh.db.assistantActionProposal.updateMany({
      where: { id: row.id, revision: row.revision, status: "PENDING" },
      data: {
        payload: binding.payload,
        payloadHash: binding.payloadHash,
        revision: binding.revision,
        expiresAt: binding.expiresAt,
        approvalTokenHash: proposalDigest(
          proposalApprovalToken(binding, signingKey()),
        ),
        targetRecordId: target?.id ?? null,
        targetRevision: target?.revision ?? null,
      },
    })
    if (saved.count !== 1)
      throw conflict("Draft changed. Refresh before editing.")
    return generalProposalForApp({
      ...binding,
      targetRecordId: target?.id ?? null,
      targetRevision: target?.revision ?? null,
      approvalTokenHash: proposalDigest(
        proposalApprovalToken(binding, signingKey()),
      ),
    })
  })
}

export async function generalProposalWithReview(
  ctx: GeneralContext,
  row: AssistantActionProposal,
): Promise<GeneralProposal> {
  const proposal = generalProposalForApp(row)
  if (
    proposal.payload.action === "payment_record" &&
    proposal.status === "PENDING"
  ) {
    try {
      const target = await paymentTarget(ctx, proposal.payload, false)
      const valid =
        target.id === row.targetRecordId &&
        target.revision === row.targetRevision
      const currency =
        ctx.tenantContext.activeStore?.currencyCode ??
        ctx.tenantContext.tenant.currencyCode
      return {
        ...proposal,
        approvalToken: valid ? proposal.approvalToken : undefined,
        review: valid
          ? [
              `${target.review.customerName || "Walk-in customer"} · ${target.review.orderNumber}`,
              `${currency} ${(proposal.payload.amountMinor / 100).toFixed(2)} · ${proposal.payload.method.replaceAll("_", " ")}`,
              `Balance after: ${currency} ${((target.review.balanceDueMinor - proposal.payload.amountMinor) / 100).toFixed(2)}`,
              ...(proposal.payload.note ? [proposal.payload.note] : []),
            ]
          : ["This order changed. Edit and review the payment again."],
      }
    } catch {
      return {
        ...proposal,
        approvalToken: undefined,
        review: [
          "This order is unavailable or no longer accepts this payment. Check it before trying again.",
        ],
      }
    }
  }
  if (
    proposal.payload.action !== "order_create" ||
    proposal.status !== "PENDING"
  )
    return proposal
  const scope = requireGeneralScope(ctx)
  try {
    const review = await readGeneralOrderReview(
      ctx.db,
      scope,
      proposal.payload.lines,
    )
    const customer = proposal.payload.customerId
      ? await ctx.db.customer.findFirst({
          where: { id: proposal.payload.customerId, tenantId: scope.tenantId },
          select: { name: true },
        })
      : null
    return {
      ...proposal,
      review: [
        ...review.lines,
        `Total: ${ctx.tenantContext.activeStore?.currencyCode ?? ctx.tenantContext.tenant.currencyCode} ${(review.totalMinor / 100).toFixed(2)}`,
        `Customer: ${customer?.name ?? "Walk-in"}`,
        ...(proposal.payload.notes ? [proposal.payload.notes] : []),
      ],
    }
  } catch {
    return {
      ...proposal,
      approvalToken: undefined,
      review: [
        "Sale details changed or are unavailable. Edit quantities and save again, or use the sale form.",
      ],
    }
  }
}

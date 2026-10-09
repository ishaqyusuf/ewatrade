import { randomUUID } from "node:crypto"
import {
  type GeneralAction,
  type GeneralProposal,
  generalActionSchema,
  generalReceiptSchema,
} from "@ewatrade/assistant/general/contracts"
import { isAccountPrivacyAccessBlocked } from "@ewatrade/db/account-privacy-access"
import {
  generalProposalWhere,
  lockGeneralMembership,
  readGeneralConversation,
} from "@ewatrade/db/assistant-general"
import type { readGeneralProposals } from "@ewatrade/db/assistant-general"
import { isLegalSignupSessionBlocked } from "@ewatrade/db/legal-session-access"
import {
  getActiveTenantForUser,
  getCustomerAccountAgeStatus,
} from "@ewatrade/db/queries"
import { TRPCError } from "@trpc/server"
import {
  type GeneralTransactionContext,
  conflict,
  generalActionAdapter,
  sameTarget,
} from "./general-actions"
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
async function prepareDraft<A extends GeneralAction>(
  ctx: GeneralTransactionContext,
  action: A,
) {
  const adapter = generalActionAdapter(action)
  return adapter.prepare ? adapter.prepare(ctx, action) : action
}
async function validateDraft(
  ctx: GeneralTransactionContext,
  action: GeneralAction,
  lock = false,
) {
  assertGeneralAction(ctx, action.action)
  return generalActionAdapter(action).validate(ctx, action, lock)
}
export async function draftGeneralProposal(
  ctx: GeneralContext,
  conversationId: string,
  raw: unknown,
) {
  const parsed = generalActionSchema.parse(raw)
  return inFreshGeneralTransaction(ctx, async (fresh) => {
    const scope = assertGeneralAction(fresh, parsed.action)
    const payload = await prepareDraft(fresh, parsed)
    if (!(await readGeneralConversation(fresh.db, scope, conversationId)))
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Conversation unavailable.",
      })
    const key = `assistant_${randomUUID()}`
    const target = await validateDraft(fresh, payload)
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
    const adapter = generalActionAdapter(payload)
    if (!sameTarget(await validateDraft(fresh, payload, true), row))
      throw conflict(adapter.stale)
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
    const receipt = await adapter.execute(fresh, payload, row.idempotencyKey)
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
    const payload = await prepareDraft(fresh, input.payload)
    const target = await validateDraft(fresh, payload)
    const binding = {
      ...row,
      payload,
      payloadHash: proposalDigest(payload),
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
  const adapter = generalActionAdapter(proposal.payload)
  if (proposal.status !== "PENDING" || !adapter.review) return proposal
  try {
    const { lines, target } = await adapter.review(ctx, proposal.payload)
    return sameTarget(target, row)
      ? { ...proposal, review: lines }
      : { ...proposal, approvalToken: undefined, review: [adapter.stale] }
  } catch {
    return {
      ...proposal,
      approvalToken: undefined,
      review: [adapter.unavailable],
    }
  }
}

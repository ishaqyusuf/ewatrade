import type { AssistantReviewLinkSource } from "@ewatrade/assistant/channels/review-links"
import {
  type GeneralAction,
  type GeneralProposal,
  generalActionSchema,
} from "@ewatrade/assistant/general/contracts"
import {
  assistantReviewLinkMatchesProposal,
  assistantWhatsAppAuthorityDigest,
  readAssistantReviewLinkLocator,
  readAssistantWhatsAppWebReviewSource,
  stageAssistantWhatsAppWebReviewOutcomeInTransaction,
  stageAssistantWhatsAppWebReviewRenewalInTransaction,
} from "@ewatrade/db/assistant-whatsapp"
import type { Prisma } from "@ewatrade/db/types"
import { enqueueAssistantWhatsAppDelivery } from "@ewatrade/jobs/assistant-whatsapp"
import { TRPCError } from "@trpc/server"
import {
  requireBrowserIdentity,
  resolveLinkedAssistantIdentity,
} from "./channel-principal"
import type { GeneralTransactionContext } from "./general-actions"
import {
  type GeneralContext,
  assertGeneralActionAuthority,
  requireGeneralScope,
} from "./general-context"
import {
  decideGeneralProposalInTransaction,
  editGeneralProposalInTransaction,
  generalProposalWithReview,
  inFreshGeneralTransaction,
} from "./general-proposals"

type ReviewContext = GeneralContext | GeneralTransactionContext
type UnavailableStatus =
  | "expired"
  | "used"
  | "changed"
  | "scope_mismatch"
  | "unavailable"
export type AssistantReviewLinkResult =
  | { status: UnavailableStatus }
  | {
      status: "ready"
      proposal: GeneralProposal
      businessName: string
      storeName: string
      currencyCode: string
      expiresAt: string
    }

function unavailable(): never {
  throw new TRPCError({
    code: "CONFLICT",
    message:
      "This review link expired, changed or is unavailable. Ask for a fresh review in WhatsApp.",
  })
}

/** Current browser session remains the decision principal; the locator never replaces it. */
async function resolveReview(
  ctx: ReviewContext,
  source: AssistantReviewLinkSource,
) {
  const session = requireBrowserIdentity(ctx.session)
  const scope = requireGeneralScope(ctx)
  const saved = await readAssistantWhatsAppWebReviewSource(ctx.db, source)
  if (!saved || saved.proposal.actorUserId !== session.user.id)
    return { status: "unavailable" as const }
  const binding = saved.binding
  const resolved = await resolveLinkedAssistantIdentity(ctx.db, {
    kind: "linked_whatsapp",
    phoneNumberId: binding.identity.phoneNumberId,
    senderId: binding.identity.senderId,
    bindingId: binding.id,
    grantId: binding.grantId,
    identityGeneration: binding.identityGeneration,
    grantGeneration: binding.grantGeneration,
    selectionGeneration: binding.selectionGeneration,
  })
  if (
    resolved.scope.userId !== session.user.id ||
    resolved.scope.tenantId !== saved.proposal.tenantId ||
    resolved.scope.storeId !== saved.proposal.storeId ||
    (await assistantWhatsAppAuthorityDigest(ctx.db, resolved)) !==
      saved.inbox.executionAuthorityDigest
  )
    return { status: "unavailable" as const }
  if (
    scope.tenantId !== saved.proposal.tenantId ||
    scope.storeId !== saved.proposal.storeId
  )
    return { status: "scope_mismatch" as const }
  assertGeneralActionAuthority(
    ctx,
    generalActionSchema.parse(saved.proposal.payload).action,
  )
  if (!assistantReviewLinkMatchesProposal(source, saved.proposal))
    return { status: "changed" as const }
  if (["COMPLETED", "CANCELLED", "FAILED"].includes(saved.proposal.status))
    return { status: "used" as const }
  if (
    source.expiresAt <= Date.now() ||
    saved.proposal.expiresAt <= new Date() ||
    saved.inbox.expiresAt <= new Date()
  )
    return { status: "expired" as const }
  if (saved.proposal.status !== "PENDING")
    return { status: "unavailable" as const }
  return { status: "ready" as const, saved }
}

/** POST read: no consumption, draft edit, business effect or provider send. */
export async function readAssistantReviewLink(
  ctx: GeneralContext,
  token: string,
): Promise<AssistantReviewLinkResult> {
  requireBrowserIdentity(ctx.session)
  const source = await readAssistantReviewLinkLocator(ctx.db, token)
  if (!source) return { status: "unavailable" }
  if (source.expiresAt <= Date.now()) return { status: "expired" }
  try {
    const result = await resolveReview(ctx, source)
    if (result.status !== "ready") return { status: result.status }
    return {
      status: "ready",
      proposal: await generalProposalWithReview(ctx, result.saved.proposal),
      businessName: ctx.tenantContext.tenant.name,
      storeName: ctx.tenantContext.activeStore?.name ?? "Store",
      currencyCode:
        ctx.tenantContext.activeStore?.currencyCode ??
        ctx.tenantContext.tenant.currencyCode,
      expiresAt: new Date(source.expiresAt).toISOString(),
    }
  } catch (error) {
    if (error instanceof TRPCError) return { status: "unavailable" }
    throw error
  }
}

/** Same identity→grant→inbox→membership order as channel revocation and decisions. */
async function lockReviewSource(
  tx: Prisma.TransactionClient,
  source: AssistantReviewLinkSource,
) {
  await tx.$queryRaw`SELECT i.id FROM "AssistantWhatsAppIdentity" i JOIN "AssistantWhatsAppBinding" b ON b."identityId"=i.id WHERE b.id=${source.bindingId} FOR SHARE OF i`
  await tx.$queryRaw`SELECT g.id FROM "AssistantWhatsAppGrant" g JOIN "AssistantWhatsAppBinding" b ON b."grantId"=g.id WHERE b.id=${source.bindingId} FOR SHARE OF g`
  await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppInbox" WHERE id=${source.inboxId} AND "bindingId"=${source.bindingId} FOR SHARE`
}

export async function decideAssistantReviewLink(
  ctx: GeneralContext,
  input: {
    token: string
    decision: "confirm" | "cancel"
    approvalToken?: string
  },
) {
  requireBrowserIdentity(ctx.session)
  const source = await readAssistantReviewLinkLocator(ctx.db, input.token)
  if (!source || source.expiresAt <= Date.now()) return unavailable()
  // Prevent another signed-in account from acquiring source locks using a forwarded link.
  if ((await resolveReview(ctx, source)).status !== "ready")
    return unavailable()
  const result = await inFreshGeneralTransaction(
    ctx,
    async (fresh) => {
      const resolved = await resolveReview(fresh, source)
      if (resolved.status !== "ready") return unavailable()
      const proposal = await decideGeneralProposalInTransaction(fresh, {
        proposalId: source.proposalId,
        revision: source.revision,
        decision: input.decision,
        approvalToken: input.approvalToken,
      })
      const staged = await stageAssistantWhatsAppWebReviewOutcomeInTransaction(
        fresh.db,
        {
          source,
          decision: input.decision,
        },
      )
      return { proposal, outboxId: staged.outboxId }
    },
    (tx) => lockReviewSource(tx, source),
  )
  try {
    await enqueueAssistantWhatsAppDelivery(result.outboxId)
  } catch {
    // Committed intent is recovered by the existing outbox cadence; never repeat the business command.
    console.error("[assistant] review result dispatch deferred to recovery")
  }
  return result.proposal
}

export async function editAssistantReviewLink(
  ctx: GeneralContext,
  input: { token: string; payload: GeneralAction },
) {
  requireBrowserIdentity(ctx.session)
  const source = await readAssistantReviewLinkLocator(ctx.db, input.token)
  if (!source || source.expiresAt <= Date.now()) return unavailable()
  if ((await resolveReview(ctx, source)).status !== "ready")
    return unavailable()
  const result = await inFreshGeneralTransaction(
    ctx,
    async (fresh) => {
      if ((await resolveReview(fresh, source)).status !== "ready")
        return unavailable()
      const proposal = await editGeneralProposalInTransaction(fresh, {
        proposalId: source.proposalId,
        revision: source.revision,
        payload: input.payload,
      })
      const row = await fresh.db.assistantActionProposal.findUniqueOrThrow({
        where: { id: proposal.id },
      })
      const staged = await stageAssistantWhatsAppWebReviewRenewalInTransaction(
        fresh.db,
        {
          source: {
            ...source,
            originRevision: source.originRevision ?? source.revision,
            originPayloadHash: source.originPayloadHash ?? source.payloadHash,
            revision: row.revision,
            payloadHash: row.payloadHash,
            expiresAt: Math.min(source.expiresAt, row.expiresAt.getTime()),
          },
          scopeLabel: `${fresh.tenantContext.tenant.name} · ${fresh.tenantContext.activeStore?.name ?? "Store"}`,
          trustedAppOrigin:
            process.env.DASHBOARD_URL ??
            process.env.NEXT_PUBLIC_DASHBOARD_URL ??
            "https://dash.ewatrade.com",
        },
      )
      return { token: staged.token, proposal, outboxId: staged.outboxId }
    },
    (tx) => lockReviewSource(tx, source),
  )
  try {
    await enqueueAssistantWhatsAppDelivery(result.outboxId)
  } catch {
    console.error("[assistant] review renewal dispatch deferred to recovery")
  }
  return { token: result.token, proposal: result.proposal }
}

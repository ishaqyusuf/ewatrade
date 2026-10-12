import { createHash } from "node:crypto"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import type { Prisma } from "../../generated/prisma/client"
import {
  CommerceQuoteError,
  approveCommerceQuoteVersionInTransaction,
  assertQuoteAuthorTermsAccepted,
  getCommerceQuoteDecisionReviewReadOnlyInTransaction,
  rejectCommerceQuoteVersionInTransaction,
} from "./commerce-quotes"

export type QuoteDecisionReviewInput = {
  actorUserId: string
  tenantId: string
  storeId: string
  approvalId: string
  quoteId: string
  quoteVersionId: string
  decision: "approve" | "reject"
  reason: string
}
function refuse(message: string): never {
  throw new CommerceQuoteError("QUOTE_RELEASE_FORBIDDEN", message)
}

/** Read-only preparation; execution belongs to the caller's fresh Serializable transaction. */
export async function prepareReviewedQuoteDecisionInTransaction(
  tx: Prisma.TransactionClient,
  input: QuoteDecisionReviewInput,
  publication = currentEffectiveLegalPublication(),
) {
  const reason = input.reason.trim()
  if (!reason || reason.length > 500)
    refuse("Explain this exact quotation decision.")
  const detail = await getCommerceQuoteDecisionReviewReadOnlyInTransaction(
    tx,
    input,
  )
  if (
    detail.status !== "pending" ||
    detail.currentReview.stale ||
    !(input.decision === "approve"
      ? detail.actions.canApprove
      : detail.actions.canReject)
  )
    refuse(
      "This original quotation is not eligible for that decision. Review again.",
    )
  const version = await tx.commerceQuoteVersion.findFirst({
    where: {
      id: input.quoteVersionId,
      quoteId: input.quoteId,
      quote: {
        tenantId: input.tenantId,
        storeId: input.storeId,
        currentVersionId: input.quoteVersionId,
      },
      status: "DRAFT",
    },
    include: {
      options: { include: { lines: true }, orderBy: { position: "asc" } },
    },
  })
  if (!version) refuse("Keep the exact current prepared quotation version.")
  const sourceScope = {
    id: detail.sourceId,
    storeId: input.storeId,
    tenantId: input.tenantId,
  }
  const sourceState =
    detail.sourceKind === "service"
      ? await tx.serviceRequest.findFirst({
          select: { status: true },
          where: sourceScope,
        })
      : await tx.commerceInquiry.findFirst({
          select: { status: true },
          where: sourceScope,
        })
  if (!sourceState)
    refuse("The current original quotation source is unavailable.")
  if (input.decision === "approve") {
    const lineCount = version.options.reduce(
      (count, option) => count + option.lines.length,
      0,
    )
    const customerTextLength = version.options.reduce(
      (count, option) =>
        count +
        (option.customerNote?.length ?? 0) +
        (option.fulfilmentPromise?.length ?? 0) +
        option.lines.reduce(
          (n, line) => n + (line.customerNote?.length ?? 0),
          0,
        ),
      0,
    )
    if (
      version.options.length > 10 ||
      lineCount > 50 ||
      customerTextLength > 20_000
    )
      refuse(
        "The complete released quotation is too large for this bounded review.",
      )
    // Terms assertions read only. Text safety can require a live provider and is NOT invoked by review.
    await assertQuoteAuthorTermsAccepted(tx, input.actorUserId, publication)
    await assertQuoteAuthorTermsAccepted(
      tx,
      version.createdByUserId,
      publication,
    )
  }
  const linked =
    input.decision === "approve"
      ? await tx.storeConversationRequestLink.findMany({
          distinct: ["conversationId"],
          select: { conversationId: true },
          take: 11,
          where: {
            tenantId: input.tenantId,
            storeId: input.storeId,
            sourceId: detail.sourceId,
            kind:
              detail.sourceKind === "service"
                ? "SERVICE_REQUEST"
                : "COMMERCE_INQUIRY",
          },
        })
      : []
  // A smaller assistant preview bound than the native 100-conversation release ceiling.
  if (linked.length > 10)
    refuse("This release has too many linked conversations for this review.")
  const conversationIds = linked.map((row) => row.conversationId).sort()
  const review = {
    decision: input.decision,
    reason,
    detail,
    sourceState: sourceState.status,
    releaseText:
      input.decision === "approve"
        ? version.options.map((option) => ({
            label: option.label,
            customerNote: option.customerNote,
            fulfilmentPromise: option.fulfilmentPromise,
            lineNotes: option.lines.flatMap((line) =>
              line.customerNote ? [line.customerNote] : [],
            ),
          }))
        : [],
    effects: {
      issueVersion: input.decision === "approve",
      createPublicAcceptanceCapability: input.decision === "approve",
      sourceIssuedFacts:
        input.decision === "approve" && sourceState.status !== "QUOTED",
      decisionAudit: true,
      conversationIds,
      linkedConversationCount: conversationIds.length,
      linkedMessagesAndNativeNotificationIntents:
        input.decision === "approve" && conversationIds.length > 0,
      textScreening:
        input.decision === "approve"
          ? "required_by_native_execution_not_checked"
          : "not_required_for_rejection",
      providerDelivery: "not_checked",
    },
  }
  const target = {
    id: detail.id,
    revision: createHash("sha256")
      .update(
        JSON.stringify({
          input: { ...input, reason },
          review,
          originalVersion: version,
          legal: input.decision === "approve" ? publication : null,
        }),
      )
      .digest("hex"),
  }
  return {
    target,
    review,
    async execute(clientDecisionId: string) {
      if (!clientDecisionId.trim())
        refuse("A server decision identity is required.")
      const nativeInput = {
        ...input,
        reason,
        clientDecisionId,
        expectedPolicyRevision: detail.policyRevision,
      }
      const result =
        input.decision === "approve"
          ? await approveCommerceQuoteVersionInTransaction(
              tx,
              nativeInput,
              publication,
            )
          : await rejectCommerceQuoteVersionInTransaction(tx, nativeInput)
      if ("superseded" in result)
        refuse(
          "The original quotation was superseded. This GENERAL transaction must roll back; no successful decision was recorded.",
        )
      // Native release may return a bearer token. Never propagate it into GENERAL receipts/model output.
      if ("communicationIntentId" in result && result.communicationIntentId)
        refuse(
          "Clinical communication effects are outside this commercial decision.",
        )
      const decided = await tx.serviceCommerceQuoteApproval.findFirst({
        where: {
          id: input.approvalId,
          quoteId: input.quoteId,
          quoteVersionId: input.quoteVersionId,
          storeId: input.storeId,
          tenantId: input.tenantId,
        },
        select: {
          id: true,
          quoteId: true,
          quoteVersionId: true,
          status: true,
          policyRevision: true,
          decidedAt: true,
          decidedByMembershipId: true,
          decisionClientId: true,
          reason: true,
          quoteVersion: { select: { status: true } },
        },
      })
      const status = input.decision === "approve" ? "APPROVED" : "REJECTED"
      if (
        !decided ||
        decided.status !== status ||
        decided.decisionClientId !== clientDecisionId ||
        !decided.decidedAt ||
        !decided.decidedByMembershipId ||
        decided.reason !== reason ||
        decided.policyRevision !== detail.policyRevision ||
        (input.decision === "approve" &&
          decided.quoteVersion.status !== "ISSUED")
      )
        refuse(
          "The original stored decision could not be verified. Roll back this transaction.",
        )
      return {
        approvalId: decided.id,
        quoteId: decided.quoteId,
        quoteVersionId: decided.quoteVersionId,
        decision:
          input.decision === "approve"
            ? ("approved" as const)
            : ("rejected" as const),
        policyRevision: decided.policyRevision,
        decidedAt: decided.decidedAt.toISOString(),
        decidedByMembershipId: decided.decidedByMembershipId,
        reason: decided.reason,
        releaseState: result.releaseState,
      }
    },
  }
}

import { createHash } from "node:crypto"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import type { Prisma } from "../../generated/prisma/client"
import {
  type CommerceQuoteIssueReviewInput,
  reviewCommerceQuoteIssueReadOnlyInTransaction,
} from "./commerce-quote-issue-review"
import {
  CommerceQuoteError,
  type PreparedCommerceQuoteIssue,
  issuePreparedCommerceQuoteInTransaction,
  normalizeIssueCommerceQuoteOptions,
  prepareCommerceQuoteIssue,
} from "./commerce-quotes"

type Publication = NonNullable<
  ReturnType<typeof currentEffectiveLegalPublication>
>
declare const reviewedCommerceQuoteIssue: unique symbol
/** Opaque process-local preparation; neither a signed proposal nor actor authority. */
export type ReviewedCommerceQuoteIssue = {
  readonly [reviewedCommerceQuoteIssue]: true
}
type State = {
  input: CommerceQuoteIssueReviewInput
  expectedRevision: string
  intentIdentity: string
  publication: Publication | null
  native: PreparedCommerceQuoteIssue
}
const prepared = new WeakMap<ReviewedCommerceQuoteIssue, State>()

function refuse(message: string): never {
  throw new CommerceQuoteError("QUOTE_CONFLICT", message)
}
function stable(value: unknown): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime()))
      refuse("Keep a valid quotation expiry.")
    return JSON.stringify(value.toISOString())
  }
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value)
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(",")}}`
  refuse("Keep the complete supported quotation intention.")
}
function intentIdentity(input: CommerceQuoteIssueReviewInput) {
  return createHash("sha256")
    .update(
      stable({
        version: 1,
        actorUserId: input.actorUserId,
        tenantId: input.tenantId,
        storeId: input.storeId,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        operation: input.operation,
        clientQuoteId: input.clientQuoteId,
        clientVersionId: input.clientVersionId,
        expiresAt: input.expiresAt ?? null,
        options: normalizeIssueCommerceQuoteOptions(input),
      }),
    )
    .digest("hex")
}

/**
 * Before calling, the server MUST validate the signed, authenticated pending
 * proposal and its exact command/server scope. This helper is not an endpoint or
 * permission grant. Screening runs outside the caller's write transaction.
 * Completed GENERAL receipt recovery must precede this new-version preflight.
 */
export async function prepareReviewedCommerceQuoteIssue(
  input: CommerceQuoteIssueReviewInput,
  expectedTargetRevision: string,
  publication: Publication | null = currentEffectiveLegalPublication(),
) {
  if (
    typeof expectedTargetRevision !== "string" ||
    !/^[a-f0-9]{64}$/.test(expectedTargetRevision)
  )
    refuse("Review this exact quotation intention before preparing it.")
  // Runtime callers may be wider than the public read input. Never retain or
  // pass their trusted native callbacks; fresh parent review supplies authority.
  const snapshot = structuredClone({
    ...input,
    authorize: undefined,
    protectActionId: undefined,
  })
  const legal = publication === null ? null : structuredClone(publication)
  if (!["service_request", "commerce_inquiry"].includes(snapshot.sourceType))
    refuse("Choose a supported nonclinical quotation source.")
  const identity = intentIdentity(snapshot)
  const {
    operation: _operation,
    authorize: _authorize,
    protectActionId: _protect,
    ...nativeInput
  } = snapshot
  const native = await prepareCommerceQuoteIssue(nativeInput, legal)
  const handle = Object.freeze({}) as ReviewedCommerceQuoteIssue
  prepared.set(handle, {
    input: snapshot,
    expectedRevision: expectedTargetRevision,
    intentIdentity: identity,
    publication: legal,
    native,
  })
  return handle
}

const receiptSelect = {
  id: true,
  quoteId: true,
  clientVersionId: true,
  version: true,
  status: true,
  currencyCode: true,
  createdByUserId: true,
  createdAt: true,
  issuedAt: true,
  expiresAt: true,
  quote: {
    select: {
      tenantId: true,
      storeId: true,
      sourceType: true,
      sourceId: true,
      currentVersionId: true,
      clientQuoteId: true,
    },
  },
  quoteApproval: {
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      quoteId: true,
      quoteVersionId: true,
      sourceType: true,
      sourceId: true,
      status: true,
      policyRevision: true,
      requesterMembershipId: true,
    },
  },
  _count: { select: { options: true } },
} satisfies Prisma.CommerceQuoteVersionSelect

function iso(value: Date, label: string) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    refuse(`The saved quotation ${label} is unavailable.`)
  return value.toISOString()
}

/**
 * Caller owns one fresh Serializable transaction and its pending proposal receipt.
 * This performs fresh canonical review, then the native issuer without nesting or
 * provider I/O. Native tokens remain private; only exact selected saved facts leave.
 * Retry the same handle after a rollback; recover a committed GENERAL receipt first.
 */
export async function issueReviewedCommerceQuoteInTransaction(
  tx: Prisma.TransactionClient,
  handle: ReviewedCommerceQuoteIssue,
) {
  const state = prepared.get(handle)
  if (!state || intentIdentity(state.input) !== state.intentIdentity)
    refuse(
      "Prepare the exact reviewed quotation before opening its transaction.",
    )
  const fresh = await reviewCommerceQuoteIssueReadOnlyInTransaction(
    tx,
    state.input,
    state.publication,
  )
  if (
    fresh.target.id !== state.input.sourceId ||
    fresh.target.revision !== state.expectedRevision
  )
    refuse("This quotation review changed. Review it again before confirming.")
  const result = await issuePreparedCommerceQuoteInTransaction(tx, state.native)
  const row = await tx.commerceQuoteVersion.findFirst({
    where: {
      id: result.versionId,
      quoteId: result.quoteId,
      quote: {
        tenantId: state.input.tenantId,
        storeId: state.input.storeId,
        sourceId: state.input.sourceId,
        sourceType:
          state.input.sourceType === "service_request"
            ? "SERVICE_REQUEST"
            : "COMMERCE_INQUIRY",
      },
    },
    select: receiptSelect,
  })
  const pending = fresh.review.effects.releaseState === "pending_approval"
  const sourceType =
    state.input.sourceType === "service_request"
      ? "SERVICE_REQUEST"
      : "COMMERCE_INQUIRY"
  if (
    !row ||
    row.id !== result.versionId ||
    row.quoteId !== result.quoteId ||
    row.quote.tenantId !== state.input.tenantId ||
    row.quote.storeId !== state.input.storeId ||
    row.quote.sourceType !== sourceType ||
    row.quote.sourceId !== state.input.sourceId ||
    row.quote.currentVersionId !== row.id ||
    row.quote.clientQuoteId !== state.input.clientQuoteId ||
    row.clientVersionId !== state.input.clientVersionId ||
    row.createdByUserId !== state.input.actorUserId ||
    row.currencyCode !== fresh.review.currencyCode ||
    row.version !== fresh.review.effects.newVersionSequence ||
    row._count.options !== fresh.review.options.length ||
    result.releaseState !== fresh.review.effects.releaseState ||
    row.status !== (pending ? "DRAFT" : "ISSUED")
  )
    refuse("The exact saved quotation result is unavailable.")
  const approval = row.quoteApproval
  if (
    pending &&
    (!approval ||
      !("approvalId" in result) ||
      approval.id !== result.approvalId ||
      approval.tenantId !== state.input.tenantId ||
      approval.storeId !== state.input.storeId ||
      approval.quoteId !== row.quoteId ||
      approval.quoteVersionId !== row.id ||
      approval.sourceType !== sourceType ||
      approval.sourceId !== state.input.sourceId ||
      approval.status !== "PENDING" ||
      approval.policyRevision !==
        fresh.review.authority.release.policy.revision ||
      approval.requesterMembershipId !==
        fresh.review.authority.actor.membershipId)
  )
    refuse("The exact saved quotation approval is unavailable.")
  if (!pending && approval !== null)
    refuse("The saved released quotation has an unexpected approval.")
  if ((pending && row.issuedAt !== null) || (!pending && row.issuedAt === null))
    refuse("The saved quotation release time is unavailable.")
  const expiresAt = row.expiresAt === null ? null : iso(row.expiresAt, "expiry")
  if (expiresAt !== (state.input.expiresAt?.toISOString() ?? null))
    refuse("The saved quotation expiry changed.")
  return {
    operation: state.input.operation.kind,
    quoteId: row.quoteId,
    quoteVersionId: row.id,
    sourceType: state.input.sourceType,
    sourceId: state.input.sourceId,
    origin: { tenantId: state.input.tenantId, storeId: state.input.storeId },
    currencyCode: row.currencyCode,
    version: row.version,
    status: row.status,
    releaseState: fresh.review.effects.releaseState,
    approvalId: pending ? (approval?.id ?? null) : null,
    policyRevision: pending ? (approval?.policyRevision ?? null) : null,
    createdAt: iso(row.createdAt, "creation time"),
    issuedAt: row.issuedAt === null ? null : iso(row.issuedAt, "release time"),
    expiresAt,
    optionCount: row._count.options,
  }
}

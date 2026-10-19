import { createHash } from "node:crypto"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import type { Prisma } from "../../generated/prisma/client"
import { readCommerceQuoteIssueAuthorityInTransaction } from "./commerce-quote-issue-authority"
import {
  CommerceQuoteReviewBudgetError,
  assertCommerceQuoteReviewBudget,
} from "./commerce-quote-review-budget"
import {
  CommerceQuoteError,
  type ReadCommerceQuoteIssueOptionsInput,
  readCommerceQuoteIssueOptionsInTransaction,
} from "./commerce-quotes"

export type CommerceQuoteIssueReviewInput = Omit<
  ReadCommerceQuoteIssueOptionsInput,
  "sourceType"
> & {
  sourceType: "service_request" | "commerce_inquiry"
  operation:
    | { kind: "issue" }
    | { kind: "revise"; quoteId: string; quoteVersionId: string }
}

function refuse(message: string): never {
  throw new CommerceQuoteError("QUOTE_CONFLICT", message)
}

export class CommerceQuoteCompleteReviewUnavailableError extends CommerceQuoteError {
  readonly reason: "complete_review_too_large" | "complete_review_unsupported"

  constructor(reason: "too_large" | "unsupported") {
    super(
      "QUOTE_CONFLICT",
      "The complete quotation review is unavailable. Keep the quotation unchanged.",
    )
    this.name = "CommerceQuoteCompleteReviewUnavailableError"
    this.reason =
      reason === "too_large"
        ? "complete_review_too_large"
        : "complete_review_unsupported"
  }
}

function identity(value: string) {
  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value ||
    value.length > 191
  )
    refuse("Keep the exact saved quotation and source identities.")
  return value
}

function quantity(value: { toFixed(): string } | null) {
  if (value === null) return null
  const exact = value.toFixed()
  if (!/^\d{1,32}(?:\.\d{1,6})?$/.test(exact) || !/[1-9]/.test(exact))
    refuse("The complete original source quantity is unavailable.")
  return exact
}

function selections(value: Prisma.JsonValue) {
  if (!Array.isArray(value) || value.length > 100)
    refuse("The original source option snapshots are unavailable.")
  return value.map((entry) => {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      Object.keys(entry).sort().join(",") !== "group,value" ||
      typeof entry.group !== "string" ||
      typeof entry.value !== "string" ||
      entry.group.length > 500 ||
      entry.value.length > 500
    )
      refuse("The original source option snapshots are unavailable.")
    return { group: entry.group, value: entry.value }
  })
}

async function readSource(
  tx: Prisma.TransactionClient,
  input: CommerceQuoteIssueReviewInput,
) {
  const where = {
    id: input.sourceId,
    tenantId: input.tenantId,
    storeId: input.storeId,
  }
  if (input.sourceType === "service_request") {
    const source = await tx.serviceRequest.findFirst({
      where,
      select: {
        id: true,
        tenantId: true,
        storeId: true,
        revision: true,
        status: true,
        customerName: true,
        customerPhone: true,
        customerEmail: true,
        channelOrigin: true,
        contactOptIn: true,
        consentVersion: true,
        details: true,
        staffResponse: true,
        requestedAt: true,
        createdAt: true,
        updatedAt: true,
        requestForm: {
          select: { id: true, tenantId: true, storeId: true, label: true },
        },
        lines: {
          take: 101,
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
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
      !source ||
      source.id !== input.sourceId ||
      source.tenantId !== input.tenantId ||
      source.storeId !== input.storeId ||
      source.requestForm.tenantId !== input.tenantId ||
      source.requestForm.storeId !== input.storeId ||
      !["SUBMITTED", "NEEDS_INFORMATION", "QUOTED"].includes(source.status) ||
      source.lines.length > 100
    )
      refuse("The complete eligible Service Request is unavailable.")
    if (!Number.isSafeInteger(source.revision) || source.revision < 1)
      refuse("The current Service Request revision is unavailable.")
    return {
      ...source,
      kind: "service_request" as const,
      vertical: "SERVICE" as const,
      lines: source.lines.map((line) => {
        if (line.requestId !== source.id)
          refuse("A source line does not belong to this Service Request.")
        return {
          ...line,
          optionSelections: selections(line.optionSelections),
          requestedQuantity: quantity(line.requestedQuantity),
        }
      }),
    }
  }
  const source = await tx.commerceInquiry.findFirst({
    where,
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      revision: true,
      status: true,
      vertical: true,
      demandReason: true,
      summary: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      channelOrigin: true,
      contactOptIn: true,
      consentVersion: true,
      createdAt: true,
      updatedAt: true,
      lines: {
        take: 101,
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: {
          id: true,
          tenantId: true,
          storeId: true,
          inquiryId: true,
          position: true,
          description: true,
          requestedQuantity: true,
        },
      },
    },
  })
  if (
    !source ||
    source.id !== input.sourceId ||
    source.tenantId !== input.tenantId ||
    source.storeId !== input.storeId ||
    source.vertical !== "SERVICE" ||
    !["READY_TO_QUOTE", "QUOTED"].includes(source.status) ||
    source.lines.length > 100
  )
    refuse("The complete eligible nonclinical Commerce Inquiry is unavailable.")
  if (!Number.isSafeInteger(source.revision) || source.revision < 1)
    refuse("The current Commerce Inquiry revision is unavailable.")
  return {
    ...source,
    kind: "commerce_inquiry" as const,
    lines: source.lines.map((line) => {
      if (
        line.inquiryId !== source.id ||
        line.tenantId !== input.tenantId ||
        line.storeId !== input.storeId
      )
        refuse("A source line does not belong to this Commerce Inquiry.")
      return { ...line, requestedQuantity: quantity(line.requestedQuantity) }
    }),
  }
}

const quoteSelect = {
  id: true,
  tenantId: true,
  storeId: true,
  sourceType: true,
  sourceId: true,
  clientQuoteId: true,
  currentVersionId: true,
  currentVersion: {
    select: {
      id: true,
      quoteId: true,
      clientVersionId: true,
      payloadHash: true,
      version: true,
      status: true,
      currencyCode: true,
      expiresAt: true,
      createdByUserId: true,
      createdAt: true,
      issuedAt: true,
      acceptedAt: true,
      declinedAt: true,
      supersededAt: true,
      revokedAt: true,
      acceptedOrderId: true,
      optionSelection: {
        select: { optionId: true, payloadHash: true, selectedAt: true },
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
          requesterMembershipId: true,
          decidedByMembershipId: true,
          policyRevision: true,
          reason: true,
          requestedAt: true,
          decidedAt: true,
          supersededAt: true,
        },
      },
    },
  },
} satisfies Prisma.CommerceQuoteSelect

async function readQuote(
  tx: Prisma.TransactionClient,
  input: CommerceQuoteIssueReviewInput,
) {
  const sourceType =
    input.sourceType === "service_request"
      ? "SERVICE_REQUEST"
      : "COMMERCE_INQUIRY"
  const quote = await tx.commerceQuote.findUnique({
    where: {
      tenantId_sourceType_sourceId: {
        tenantId: input.tenantId,
        sourceType,
        sourceId: input.sourceId,
      },
    },
    select: quoteSelect,
  })
  const commandQuote = await tx.commerceQuote.findUnique({
    where: {
      tenantId_clientQuoteId: {
        tenantId: input.tenantId,
        clientQuoteId: input.clientQuoteId,
      },
    },
    select: { id: true },
  })
  if (commandQuote && commandQuote.id !== quote?.id)
    throw new CommerceQuoteError(
      "IDEMPOTENCY_MISMATCH",
      "This Quote command identity belongs to another source.",
    )
  if (
    quote &&
    (quote.tenantId !== input.tenantId ||
      quote.storeId !== input.storeId ||
      quote.sourceType !== sourceType ||
      quote.sourceId !== input.sourceId ||
      quote.clientQuoteId !== input.clientQuoteId ||
      (quote.currentVersionId !== null &&
        (!quote.currentVersion ||
          quote.currentVersion.id !== quote.currentVersionId ||
          quote.currentVersion.quoteId !== quote.id)))
  )
    refuse("The exact current canonical quotation is unavailable.")
  if (input.operation.kind === "issue") {
    if (quote) refuse("Review the exact current quotation before revising it.")
  } else {
    identity(input.operation.quoteId)
    identity(input.operation.quoteVersionId)
    if (
      !quote ||
      quote.id !== input.operation.quoteId ||
      quote.currentVersionId !== input.operation.quoteVersionId ||
      !quote.currentVersion ||
      quote.currentVersion.status === "ACCEPTED" ||
      quote.currentVersion.acceptedOrderId !== null
    )
      refuse(
        "Keep the exact unaccepted current quotation version for revision.",
      )
  }
  if (quote) {
    const usedVersion = await tx.commerceQuoteVersion.findUnique({
      where: {
        quoteId_clientVersionId: {
          quoteId: quote.id,
          clientVersionId: input.clientVersionId,
        },
      },
      select: { id: true },
    })
    if (usedVersion)
      refuse(
        "This version command already has a saved result. Recover that original result before preparing another version.",
      )
    const approval = quote.currentVersion?.quoteApproval
    if (
      approval &&
      (approval.tenantId !== input.tenantId ||
        approval.storeId !== input.storeId ||
        approval.quoteId !== quote.id ||
        approval.quoteVersionId !== quote.currentVersionId ||
        approval.sourceType !== sourceType ||
        approval.sourceId !== input.sourceId)
    )
      refuse(
        "The current quotation approval does not match its original source.",
      )
  }
  return quote
}

async function readLinkedReleaseFacts(
  tx: Prisma.TransactionClient,
  input: CommerceQuoteIssueReviewInput,
  currentVersionId: string | null,
) {
  const kind =
    input.sourceType === "service_request"
      ? "SERVICE_REQUEST"
      : "COMMERCE_INQUIRY"
  const links = await tx.storeConversationRequestLink.findMany({
    distinct: ["conversationId"],
    select: { conversationId: true },
    take: 101,
    where: {
      tenantId: input.tenantId,
      storeId: input.storeId,
      sourceId: input.sourceId,
      kind,
    },
  })
  const ids = links.map((link) => identity(link.conversationId)).sort()
  if (ids.length > 100 || new Set(ids).size !== ids.length)
    refuse("The complete linked conversation set is unavailable.")
  if (!ids.length) return []
  const conversations = await tx.storeConversation.findMany({
    where: {
      id: { in: ids },
      tenantId: input.tenantId,
      storeId: input.storeId,
    },
    orderBy: { id: "asc" },
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      lastMessageSequence: true,
      customerBlockedAt: true,
      accountInvitations: {
        where: { milestone: "FIRST_RELEASED_QUOTE" },
        take: 2,
        select: {
          id: true,
          tenantId: true,
          storeId: true,
          conversationId: true,
          messageId: true,
          quoteVersionId: true,
          status: true,
          createdAt: true,
          dismissedAt: true,
          linkedAt: true,
        },
      },
      actionMessages: {
        where: { quoteVersionId: currentVersionId ?? "" },
        take: 2,
        select: {
          conversationId: true,
          tenantId: true,
          storeId: true,
          messageId: true,
          quoteVersionId: true,
          sourceId: true,
          sourceKind: true,
          payloadHash: true,
        },
      },
    },
  })
  if (conversations.length !== ids.length)
    refuse("A linked Store conversation is unavailable.")
  const byId = new Map(conversations.map((row) => [row.id, row]))
  return ids.map((id) => {
    const row = byId.get(id)
    if (
      !row ||
      row.tenantId !== input.tenantId ||
      row.storeId !== input.storeId ||
      !Number.isSafeInteger(row.lastMessageSequence) ||
      row.lastMessageSequence < 0 ||
      row.lastMessageSequence > 2_147_483_647 ||
      row.accountInvitations.length > 1 ||
      row.actionMessages.length > 1
    )
      refuse("The exact linked conversation facts are unavailable.")
    const invitation = row.accountInvitations[0] ?? null
    const currentPresentation = row.actionMessages[0] ?? null
    const sequenceIncrements = row.customerBlockedAt ? 0 : invitation ? 1 : 2
    if (row.lastMessageSequence > 2_147_483_647 - sequenceIncrements)
      refuse(
        "The linked conversation has no sequence capacity for these release effects.",
      )
    for (const record of [invitation, currentPresentation])
      if (
        record &&
        (record.tenantId !== input.tenantId ||
          record.storeId !== input.storeId ||
          record.conversationId !== id)
      )
        refuse("A linked record belongs to another Store conversation.")
    if (
      currentPresentation &&
      (currentPresentation.quoteVersionId !== currentVersionId ||
        currentPresentation.sourceId !== input.sourceId ||
        currentPresentation.sourceKind !== kind)
    )
      refuse("The existing quotation presentation belongs to another source.")
    return {
      conversationId: id,
      lastMessageSequence: row.lastMessageSequence,
      customerBlockedAt: row.customerBlockedAt,
      firstReleasedQuoteInvitation: invitation,
      currentPresentation,
      newVersionPresentation: row.customerBlockedAt
        ? ("skipped_customer_blocked" as const)
        : ("append_action_message_and_source_link" as const),
      newVersionInvitation: row.customerBlockedAt
        ? ("not_appended" as const)
        : invitation
          ? ("preserve_existing" as const)
          : ("append_first_released_quote_invitation" as const),
    }
  })
}

/** Canonical object ordering only; ordered options/lines retain their exact order. */
function stable(value: unknown): string {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime()))
      refuse("A review timestamp is invalid.")
    return JSON.stringify(value.toISOString())
  }
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value)
  if (typeof value === "number") {
    if (!Number.isFinite(value)) refuse("A review amount is invalid.")
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(",")}}`
  refuse("The complete quotation review contains unsupported facts.")
}

/**
 * Complete source/pricing/authority read. Caller owns the snapshot transaction.
 * No command, screening, customer capability or receipt is created here. This
 * digest is not a row lock; execution must recheck it in the owning transaction.
 */
export async function reviewCommerceQuoteIssueReadOnlyInTransaction(
  tx: Prisma.TransactionClient,
  input: CommerceQuoteIssueReviewInput,
  publication = currentEffectiveLegalPublication(),
) {
  // Trusted callback fields are intentionally outside this read interface.
  const snapshot = structuredClone({
    ...input,
    authorize: undefined,
    protectActionId: undefined,
  })
  const legalPublication = publication ? structuredClone(publication) : null
  for (const id of [
    snapshot.actorUserId,
    snapshot.tenantId,
    snapshot.storeId,
    snapshot.sourceId,
    snapshot.clientQuoteId,
    snapshot.clientVersionId,
  ])
    identity(id)
  if (
    !["service_request", "commerce_inquiry"].includes(snapshot.sourceType) ||
    !snapshot.operation ||
    !["issue", "revise"].includes(snapshot.operation.kind)
  )
    refuse("Choose an exact supported nonclinical quotation operation.")
  if (
    snapshot.expiresAt !== undefined &&
    (!(snapshot.expiresAt instanceof Date) ||
      !Number.isFinite(snapshot.expiresAt.getTime()))
  )
    refuse("Keep an exact valid quotation expiry.")
  const authority = await readCommerceQuoteIssueAuthorityInTransaction(
    tx,
    {
      actorUserId: snapshot.actorUserId,
      tenantId: snapshot.tenantId,
      storeId: snapshot.storeId,
      sourceType: snapshot.sourceType,
      vertical: "SERVICE",
    },
    legalPublication,
  )
  const source = await readSource(tx, snapshot)
  const currentQuote = await readQuote(tx, snapshot)
  // Native issuance numbers from all immutable versions, not just the current
  // pointer. Bind the same maximum, including an older noncurrent saved version.
  const lastVersion = currentQuote
    ? await tx.commerceQuoteVersion.aggregate({
        _max: { version: true },
        where: { quoteId: currentQuote.id },
      })
    : { _max: { version: null } }
  const lastSequence = lastVersion._max.version ?? 0
  if (
    !Number.isSafeInteger(lastSequence) ||
    lastSequence < 0 ||
    lastSequence >= 2_147_483_647 ||
    (currentQuote?.currentVersion &&
      (!Number.isSafeInteger(currentQuote.currentVersion.version) ||
        currentQuote.currentVersion.version < 1 ||
        currentQuote.currentVersion.version > lastSequence))
  )
    refuse("The next immutable quotation version cannot be reviewed safely.")
  if (
    source.kind === "commerce_inquiry" &&
    source.status === "QUOTED" &&
    !currentQuote
  )
    refuse("The quoted Inquiry's original canonical quotation is unavailable.")
  const resolved = await readCommerceQuoteIssueOptionsInTransaction(
    tx,
    snapshot,
  )
  if (resolved.currencyCode !== authority.store.currencyCode)
    refuse("The current Store quotation currency changed.")
  if (resolved.sourceState.alreadyQuoted !== (source.status === "QUOTED"))
    refuse("The original source changed during quotation review.")
  const pending = authority.release.policy.mode === "approval_required"
  if (
    !pending &&
    source.status !== "QUOTED" &&
    source.revision >= 2_147_483_647
  )
    refuse("The source has no revision capacity for this release.")
  // Private preparation has no conversation effects. A later approval owns its
  // own fresh linked-set review; release-only failures must not block a DRAFT.
  const linked = pending
    ? null
    : await readLinkedReleaseFacts(
        tx,
        snapshot,
        currentQuote?.currentVersionId ?? null,
      )
  const evidence = { ...resolved.evidence }
  const review = {
    operation: snapshot.operation,
    command: {
      clientQuoteId: snapshot.clientQuoteId,
      clientVersionId: snapshot.clientVersionId,
      expiresAt: snapshot.expiresAt ?? null,
    },
    source,
    authority,
    currentQuote,
    currencyCode: resolved.currencyCode,
    options: resolved.options,
    priceSuggestionCoverage: resolved.priceSuggestionCoverage,
    evidence,
    effects: {
      releaseState: pending
        ? ("pending_approval" as const)
        : ("released" as const),
      createsImmutableVersion: true,
      newVersionSequence: lastSequence + 1,
      advancesCurrentVersion: true,
      supersedesVersionId: currentQuote?.currentVersionId ?? null,
      supersedesPendingApprovalId:
        currentQuote?.currentVersion?.quoteApproval?.status === "PENDING"
          ? currentQuote.currentVersion.quoteApproval.id
          : null,
      requestsApproval: pending,
      createsPublicAcceptanceCapability: !pending,
      sourceBecomesQuoted: !pending && source.status !== "QUOTED",
      sourceRevisionIncrement: !pending && source.status !== "QUOTED" ? 1 : 0,
      createsInquiryIssuedAudit:
        !pending &&
        source.kind === "commerce_inquiry" &&
        source.status !== "QUOTED",
      linkedConversations: linked,
      linkedCoverage: pending
        ? "not_read_no_effects_until_approval"
        : "complete",
      linkedEffects: pending ? "deferred_until_approved_release" : "at_release",
      schedulesNativeUnreadNotificationIntents:
        !pending &&
        (linked?.some((row) => row.customerBlockedAt === null) ?? false),
      textScreening: "required_before_execution_not_checked" as const,
      providerDelivery: "not_performed_or_proven" as const,
      createsOrderBookingPaymentOrReservation: false,
    },
  }
  // Bound the complete logical intent/review/target before any digest strings.
  // This is an internal resource budget, not an HTTP transport guarantee or a
  // bound on objects already materialized by the source/calculator reads.
  try {
    assertCommerceQuoteReviewBudget({
      intent: snapshot,
      review,
      target: { id: snapshot.sourceId, revision: "0".repeat(64) },
    })
  } catch (error) {
    if (error instanceof CommerceQuoteReviewBudgetError)
      throw new CommerceQuoteCompleteReviewUnavailableError(error.reason)
    throw error
  }
  evidence.offerings = [...evidence.offerings].sort((a, b) =>
    a.id.localeCompare(b.id),
  )
  evidence.priceSuggestions = evidence.priceSuggestions
    .map((snapshot) => ({
      ...snapshot,
      // History evidence is an unordered set; retain every business value.
      evidence: [...snapshot.evidence].sort((a, b) =>
        stable(a).localeCompare(stable(b)),
      ),
    }))
    .sort((a, b) => a.offeringId.localeCompare(b.offeringId))
  evidence.sourcePreparations = [...evidence.sourcePreparations].sort((a, b) =>
    stable(a).localeCompare(stable(b)),
  )
  // This is the sole volatile observation clock emitted by the canonical
  // calculator. Preserve effective/expiry/source dates and every business fact.
  const digestOptions = resolved.options.map((option) => ({
    ...option,
    lines: option.lines.map(
      ({ catalogPriceEvaluationAt: _observedAt, ...line }) => line,
    ),
  }))
  const digest = stable({
    version: 1,
    intent: snapshot,
    review: { ...review, options: digestOptions },
  })
  return {
    target: {
      id: snapshot.sourceId,
      revision: createHash("sha256").update(digest).digest("hex"),
    },
    review,
  }
}

export type CommerceQuoteIssueReview = Awaited<
  ReturnType<typeof reviewCommerceQuoteIssueReadOnlyInTransaction>
>

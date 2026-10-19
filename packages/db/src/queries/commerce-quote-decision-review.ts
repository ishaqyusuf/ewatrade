import { createHash } from "node:crypto"
import { types } from "node:util"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"
import { Prisma } from "../../generated/prisma/client"
import {
  CommerceQuoteReviewBudgetError,
  assertCommerceQuoteReviewBudget,
} from "./commerce-quote-review-budget"
import {
  CommerceQuoteError,
  type PreparedCommerceQuoteApproval,
  approveCommerceQuoteVersionInTransaction,
  approvePreparedCommerceQuoteVersionInTransaction,
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

export class CommerceQuoteDecisionReviewUnavailableError extends CommerceQuoteError {
  readonly reason: "complete_review_too_large" | "complete_review_unsupported"
  constructor(reason: "too_large" | "unsupported") {
    super(
      "QUOTE_CONFLICT",
      "The complete quotation review is unavailable. Keep the quotation unchanged.",
    )
    this.name = "CommerceQuoteDecisionReviewUnavailableError"
    this.reason =
      reason === "too_large"
        ? "complete_review_too_large"
        : "complete_review_unsupported"
  }
}
type Snapshot =
  | null
  | boolean
  | number
  | string
  | Snapshot[]
  | { [key: string]: Snapshot }
// Select the supported optional-precision overload; omission preserves every digit.
const decimalFixed: (decimalPlaces?: number) => string =
  Prisma.Decimal.prototype.toFixed
const dateTime = Date.prototype.getTime
const dateISO = Date.prototype.toISOString
function unsupported(): never {
  throw new CommerceQuoteDecisionReviewUnavailableError("unsupported")
}

/** Copy database data without invoking arbitrary getters, toJSON or serializers. */
function snapshot(value: unknown): Snapshot {
  try {
    return snapshotValue(value, new Set<object>())
  } catch (error) {
    if (error instanceof CommerceQuoteDecisionReviewUnavailableError)
      throw error
    return unsupported()
  }
}
function snapshotValue(value: unknown, ancestors: Set<object>): Snapshot {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value !== "object" || types.isProxy(value) || ancestors.has(value))
    unsupported()
  const prototype = Object.getPrototypeOf(value)
  if (prototype === Date.prototype) {
    if (
      !types.isDate(value) ||
      Reflect.ownKeys(value).length ||
      !Number.isFinite(dateTime.call(value))
    )
      unsupported()
    return dateISO.call(value)
  }
  if (prototype === Prisma.Decimal.prototype) {
    // Decimal(38,6) quantities have only library-owned sign/exponent/digits.
    // Inspect every data descriptor first; never call an instance override.
    const descriptors = Object.getOwnPropertyDescriptors(value)
    if (
      Reflect.ownKeys(value).length !== 4 ||
      !["constructor", "d", "e", "s"].every((key) =>
        Object.hasOwn(descriptors, key),
      ) ||
      Object.getOwnPropertyDescriptor(value, "constructor")?.value !==
        Prisma.Decimal
    )
      unsupported()
    for (const descriptor of Object.values(descriptors))
      if (!("value" in descriptor)) unsupported()
    const sign: unknown = descriptors.s?.value
    const exponent: unknown = descriptors.e?.value
    const digits: unknown = descriptors.d?.value
    if (
      (sign !== 1 && sign !== -1) ||
      typeof exponent !== "number" ||
      !Number.isInteger(exponent) ||
      exponent < -6 ||
      exponent > 31 ||
      !Array.isArray(digits) ||
      types.isProxy(digits) ||
      Object.getPrototypeOf(digits) !== Array.prototype ||
      digits.length < 1 ||
      digits.length > 7 ||
      Reflect.ownKeys(digits).length !== digits.length + 1
    )
      unsupported()
    for (let i = 0; i < digits.length; i++) {
      const entry = Object.getOwnPropertyDescriptor(digits, String(i))
      if (
        !entry ||
        !("value" in entry) ||
        !Number.isInteger(entry.value) ||
        entry.value < 0 ||
        entry.value >= 10_000_000
      )
        unsupported()
    }
    const exact = decimalFixed.call(value, undefined)
    if (!/^-?\d{1,32}(?:\.\d{1,6})?$/.test(exact)) unsupported()
    return exact
  }
  if (
    prototype !== Object.prototype &&
    prototype !== null &&
    prototype !== Array.prototype
  )
    unsupported()
  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      if (Reflect.ownKeys(value).length !== value.length + 1) unsupported()
      const result: Snapshot[] = []
      for (let i = 0; i < value.length; i++) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(i))
        if (!descriptor || !("value" in descriptor)) unsupported()
        result.push(snapshotValue(descriptor.value, ancestors))
      }
      return result
    }
    const entries: [string, Snapshot][] = []
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      if (
        typeof key !== "string" ||
        !descriptor ||
        !("value" in descriptor) ||
        !descriptor.enumerable
      )
        unsupported()
      if (descriptor.value !== undefined)
        entries.push([key, snapshotValue(descriptor.value, ancestors)])
    }
    return Object.fromEntries(entries)
  } finally {
    ancestors.delete(value)
  }
}
function budget(value: unknown) {
  try {
    return assertCommerceQuoteReviewBudget(value)
  } catch (error) {
    if (error instanceof CommerceQuoteReviewBudgetError)
      throw new CommerceQuoteDecisionReviewUnavailableError(error.reason)
    throw error
  }
}

/** Only called after complete logical admission. Object key order is not a fact;
 * linked conversations are a set, while quotation option/line order is retained. */
function stable(value: Snapshot, path: string[] = []): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value)
  if (Array.isArray(value)) {
    const entries =
      path.join(".") === "review.effects.conversationIds"
        ? [...value].sort((left, right) => {
            if (typeof left !== "string" || typeof right !== "string")
              unsupported()
            return left < right ? -1 : left > right ? 1 : 0
          })
        : value
    return `[${entries.map((entry, index) => stable(entry, [...path, String(index)])).join(",")}]`
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => {
      const entry = value[key]
      if (entry === undefined) unsupported()
      return `${JSON.stringify(key)}:${stable(entry, [...path, key])}`
    })
    .join(",")}}`
}

function savedBusinessVersion(version: Record<string, Snapshot>) {
  // Credentials and command replay material stay private. Every business field
  // remains in the review; the complete original snapshot also binds the digest.
  const record = (value: Snapshot | undefined) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      unsupported()
    return value
  }
  const pick = (value: Record<string, Snapshot>, keys: string[]) =>
    Object.fromEntries(
      keys.flatMap((key) =>
        Object.hasOwn(value, key) ? [[key, value[key]]] : [],
      ),
    )
  if (!Array.isArray(version.options)) unsupported()
  return {
    ...pick(version, [
      "id",
      "quoteId",
      "version",
      "status",
      "availabilityOutcome",
      "fulfilmentType",
      "currencyCode",
      "subtotalMinor",
      "discountMinor",
      "taxMinor",
      "fulfilmentFeeMinor",
      "totalMinor",
      "customerNote",
      "fulfilmentPromise",
      "expiresAt",
      "issuedAt",
      "acceptedAt",
      "declinedAt",
      "supersededAt",
      "revokedAt",
      "acceptedOrderId",
      "createdByUserId",
      "createdAt",
    ]),
    options: version.options.map((entry) => {
      const option = record(entry)
      if (!Array.isArray(option.lines)) unsupported()
      return {
        ...pick(option, [
          "id",
          "quoteVersionId",
          "label",
          "position",
          "availabilityOutcome",
          "fulfilmentType",
          "currencyCode",
          "subtotalMinor",
          "discountMinor",
          "taxMinor",
          "fulfilmentFeeMinor",
          "totalMinor",
          "customerNote",
          "fulfilmentPromise",
          "createdAt",
        ]),
        lines: option.lines.map((line) =>
          pick(record(line), [
            "id",
            "quoteVersionId",
            "quoteOptionId",
            "sourceLineId",
            "offeringId",
            "outcome",
            "catalogItemName",
            "variantName",
            "optionSelections",
            "offeringName",
            "quantity",
            "unitPriceMinor",
            "catalogSuggestedUnitPriceMinor",
            "catalogPriceSuggestionSource",
            "catalogPriceSuggestionScope",
            "catalogPriceSuggestionEffectiveAt",
            "catalogPriceOverride",
            "catalogPriceEvaluationAt",
            "totalMinor",
            "customerNote",
            "configurationVersionId",
            "balanceRevision",
            "availabilityAttestationId",
            "createdAt",
          ]),
        ),
      }
    }),
  }
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
  const originalVersion = snapshot(version)
  if (
    !originalVersion ||
    typeof originalVersion !== "object" ||
    Array.isArray(originalVersion)
  )
    unsupported()
  const savedOptions = originalVersion.options
  if (
    !Array.isArray(savedOptions) ||
    savedOptions.length > 20 ||
    savedOptions.some(
      (option) =>
        !option ||
        typeof option !== "object" ||
        Array.isArray(option) ||
        !Array.isArray(option.lines) ||
        option.lines.length > 100,
    )
  )
    unsupported()
  budget(originalVersion)
  const sourceScope = {
    id: detail.sourceId,
    storeId: input.storeId,
    tenantId: input.tenantId,
  }
  const sourceState =
    detail.sourceKind === "service"
      ? await tx.serviceRequest.findFirst({
          select: { status: true, revision: true },
          where: sourceScope,
        })
      : await tx.commerceInquiry.findFirst({
          select: { status: true, revision: true },
          where: sourceScope,
        })
  if (!sourceState)
    refuse("The current original quotation source is unavailable.")
  if (!Number.isSafeInteger(sourceState.revision) || sourceState.revision < 0)
    unsupported()
  if (input.decision === "approve") {
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
          take: 101,
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
  snapshot(linked)
  if (
    linked.length > 100 ||
    linked.some(
      (row) =>
        typeof row.conversationId !== "string" ||
        !row.conversationId.trim() ||
        row.conversationId !== row.conversationId.trim(),
    ) ||
    new Set(linked.map((row) => row.conversationId)).size !== linked.length
  )
    unsupported()
  const conversationIds = linked.map((row) => row.conversationId)
  const review = {
    decision: input.decision,
    reason,
    detail,
    originalVersion: savedBusinessVersion(originalVersion),
    sourceState: sourceState.status,
    sourceRevision: sourceState.revision,
    releaseVersionText:
      input.decision === "approve"
        ? {
            customerNote: version.customerNote,
            fulfilmentPromise: version.fulfilmentPromise,
          }
        : null,
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
  const digestDocument = snapshot({
    input: { ...input, reason },
    review,
    originalVersion,
    legal: input.decision === "approve" ? publication : null,
  })
  budget({
    document: digestDocument,
    target: { id: detail.id, revision: "0".repeat(64) },
  })
  conversationIds.sort()
  const target = {
    id: detail.id,
    revision: createHash("sha256").update(stable(digestDocument)).digest("hex"),
  }
  return {
    target,
    review,
    async execute(
      clientDecisionId: string,
      preparedApproval?: PreparedCommerceQuoteApproval,
    ) {
      if (!clientDecisionId.trim())
        refuse("A server decision identity is required.")
      const nativeInput = {
        ...input,
        reason,
        clientDecisionId,
        expectedPolicyRevision: detail.policyRevision,
      }
      if (input.decision !== "approve" && preparedApproval !== undefined)
        refuse("Prepared approval evidence cannot change a rejection decision.")
      const result =
        input.decision === "approve"
          ? preparedApproval === undefined
            ? await approveCommerceQuoteVersionInTransaction(
                tx,
                nativeInput,
                publication,
              )
            : await approvePreparedCommerceQuoteVersionInTransaction(
                tx,
                nativeInput,
                preparedApproval,
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

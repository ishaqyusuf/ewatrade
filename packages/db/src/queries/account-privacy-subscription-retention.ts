import { z } from "zod"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { getAccountPrivacyProfileInventory } from "./account-privacy-profile-inventory"
import {
  getApprovedAccountPrivacyProfilePolicy,
  isAccountPrivacyProfileMinimizationConfirmed,
} from "./account-privacy-profile-policy"
import {
  AccountPrivacyRecordRetentionError,
  accountPrivacyRecordProcessingContext,
} from "./account-privacy-record-retention"
import {
  AccountPrivacySubscriptionError,
  accountPrivacySubscriptionDataIsEmpty,
  confirmNoAccountPrivacySubscriptions,
} from "./account-privacy-subscription"
import {
  type SubscriptionInventoryClient,
  getAccountPrivacySubscriptionInventory,
  subscriptionPrivacyDigest,
} from "./account-privacy-subscription-inventory"
import {
  getApprovedSubscriptionRetentionPolicy,
  reassessAccountPrivacySubscriptionsSchema,
  reviewAccountPrivacySubscriptionsSchema,
  subscriptionRetentionDecisionSchema,
  subscriptionReviewDeadline,
} from "./account-privacy-subscription-policy"
import { runInOwnSerializableTransaction } from "./own-transaction"

const PROCESSOR = "account-privacy-subscription-retention-v1"
function enabled() {
  if (
    process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_SUBSCRIPTION_PROCESSING_ENABLED !== "true" ||
    process.env.ACCOUNT_PRIVACY_SUBSCRIPTION_RETENTION_ENABLED !== "true"
  )
    throw new AccountPrivacySubscriptionError("DISABLED")
}
function approved(now: Date) {
  const policy = getApprovedSubscriptionRetentionPolicy(now)
  if (!policy) throw new AccountPrivacySubscriptionError("POLICY_NOT_APPROVED")
  return policy
}

/** A late receipt can require billing review after canonical profile minimization. Never revive the old login/contact. */
async function subscriptionProcessingContext(
  tx: Prisma.TransactionClient,
  input: { requestId: string; operatorUserId: string },
  now: Date,
) {
  try {
    return await accountPrivacyRecordProcessingContext(tx, input, now)
  } catch (error) {
    if (
      !(error instanceof AccountPrivacyRecordRetentionError) ||
      error.code !== "NOT_READY"
    )
      throw error
    // The ordinary guard has already authenticated a distinct platform administrator.
    const request = await tx.accountPrivacyRequest.findUnique({
      where: { id: input.requestId },
      select: {
        id: true,
        userId: true,
        verifiedSubjectUserId: true,
        requestKey: true,
        verifiedAt: true,
        status: true,
        contactEmail: true,
        outcome: true,
        user: { select: { email: true, emailVerified: true } },
        accessRevocation: { select: { status: true, userId: true } },
      },
    })
    const subjectId = request?.verifiedSubjectUserId
    if (
      !request ||
      !subjectId ||
      subjectId === input.operatorUserId ||
      !request.contactEmail ||
      request.status !== "PROCESSING" ||
      request.accessRevocation?.status !== "REVOKED" ||
      request.accessRevocation.userId !== subjectId
    )
      throw error
    const policy = getApprovedAccountPrivacyProfilePolicy(process.env, now)
    const outcome = await tx.accountPrivacyDomainOutcome.findUnique({
      where: {
        requestId_domain: { requestId: request.id, domain: "ACCOUNT_PROFILE" },
      },
    })
    if (
      !policy ||
      !outcome ||
      (await tx.membership.count({
        where: { userId: subjectId, status: { not: "REMOVED" } },
      }))
    )
      throw error
    const inventory = await getAccountPrivacyProfileInventory(
      tx,
      subjectId,
      request.contactEmail.trim().toLowerCase(),
    )
    if (
      !isAccountPrivacyProfileMinimizationConfirmed({
        request,
        outcome,
        inventory,
        policy,
        now,
      })
    )
      throw error
    return { request, subjectId }
  }
}
export async function inspectAccountPrivacySubscriptions(
  db: PrismaClient,
  input: { requestId: string; operatorUserId: string },
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    const { subjectId } = await subscriptionProcessingContext(
      tx,
      input,
      new Date(),
    )
    return getAccountPrivacySubscriptionInventory(tx, subjectId)
  })
}

/** Terminal checkout links serve no retention purpose. Provider references/codes, receipts and money are preserved. */
export async function minimizeAccountPrivacySubscriptionLinks(
  db: PrismaClient,
  input: {
    requestId: string
    operatorUserId: string
    expectedInventoryDigest: string
    now?: Date
  },
) {
  enabled()
  const now = input.now ?? new Date()
  approved(now)
  return runInOwnSerializableTransaction(db, async (tx) => {
    const { subjectId } = await subscriptionProcessingContext(tx, input, now)
    const inventory = await getAccountPrivacySubscriptionInventory(
      tx,
      subjectId,
    )
    if (inventory.inventoryDigest !== input.expectedInventoryDigest)
      throw new AccountPrivacySubscriptionError("SOURCE_CHANGED")
    if (
      inventory.blockers.some(
        (code) => code !== "CHECKOUT_LINK_MINIMIZATION_REQUIRED",
      )
    )
      throw new AccountPrivacySubscriptionError("SUBSCRIPTION_REVIEW_REQUIRED")
    const ids = (family: string) =>
      inventory.records
        .filter((row) => row.family === family)
        .map((row) => row.id)
    await tx.billingCheckoutSession.updateMany({
      where: { id: { in: ids("CHECKOUT") } },
      data: { checkoutUrl: null, successUrl: null, cancelUrl: null },
    })
    const journals = await tx.billingProviderEvent.findMany({
      where: {
        id: { in: ids("PROVIDER_EVENT") },
        type: "owner_paystack_checkout",
      },
    })
    for (const journal of journals) {
      const payload = journal.payload
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw new AccountPrivacySubscriptionError(
          "SUBSCRIPTION_REVIEW_REQUIRED",
        )
      const session = payload.session
      if (!session || typeof session !== "object" || Array.isArray(session))
        throw new AccountPrivacySubscriptionError(
          "SUBSCRIPTION_REVIEW_REQUIRED",
        )
      if (session.checkoutUrl)
        await tx.billingProviderEvent.update({
          where: { id: journal.id },
          data: {
            payload: { ...payload, session: { ...session, checkoutUrl: null } },
          },
        })
    }
    return {
      requestId: input.requestId,
      ...(await getAccountPrivacySubscriptionInventory(tx, subjectId)),
    }
  })
}

/** Records an explicit, scoped human decision. It neither disposes a profile nor cancels a provider subscription. */
export async function reviewAccountPrivacySubscriptions(
  db: PrismaClient,
  input: z.infer<typeof reviewAccountPrivacySubscriptionsSchema> & {
    operatorUserId: string
    now?: Date
  },
) {
  enabled()
  const now = input.now ?? new Date()
  const policy = approved(now)
  const { operatorUserId, now: _, ...raw } = input
  const parsed = reviewAccountPrivacySubscriptionsSchema.safeParse(raw)
  if (!parsed.success)
    throw new AccountPrivacySubscriptionError("SUBSCRIPTION_REVIEW_REQUIRED")
  const data = parsed.data
  if (data.policyDigest !== policy.policyDigest)
    throw new AccountPrivacySubscriptionError("POLICY_NOT_APPROVED")
  return runInOwnSerializableTransaction(db, async (tx) => {
    const { subjectId } = await subscriptionProcessingContext(tx, input, now)
    return recordSubscriptionRetentionReview(
      tx,
      data,
      subjectId,
      operatorUserId,
      policy,
      now,
    )
  })
}

async function recordSubscriptionRetentionReview(
  tx: Prisma.TransactionClient,
  data: z.infer<typeof reviewAccountPrivacySubscriptionsSchema>,
  subjectId: string,
  operatorUserId: string,
  policy: ReturnType<typeof approved>,
  now: Date,
) {
  const inventory = await getAccountPrivacySubscriptionInventory(tx, subjectId)
  if (inventory.inventoryDigest !== data.expectedInventoryDigest)
    throw new AccountPrivacySubscriptionError("SOURCE_CHANGED")
  if (inventory.blockers.length || !inventory.records.length)
    throw new AccountPrivacySubscriptionError("SUBSCRIPTION_REVIEW_REQUIRED")
  const families = [
    ...new Set(inventory.records.map((row) => row.family)),
  ].sort()
  const decisions = [...data.decisions].sort((a, b) =>
    a.family.localeCompare(b.family),
  )
  if (
    subscriptionPrivacyDigest(families) !==
    subscriptionPrivacyDigest(decisions.map((row) => row.family))
  )
    throw new AccountPrivacySubscriptionError("SUBSCRIPTION_REVIEW_REQUIRED")
  const nextReviewAt = subscriptionReviewDeadline(decisions, now)
  if (!nextReviewAt)
    throw new AccountPrivacySubscriptionError("SUBSCRIPTION_REVIEW_REQUIRED")
  const evidence = {
    requestId: data.requestId,
    subjectId,
    policyVersion: policy.version,
    policyDigest: policy.policyDigest,
    inventoryDigest: inventory.inventoryDigest,
    controllerEvidenceDigest: data.controllerEvidenceDigest,
    decisions,
    operatorUserId,
  }
  const decisionDigest = subscriptionPrivacyDigest(evidence)
  const existing = await tx.accountPrivacySubscriptionReview.findUnique({
    where: { decisionDigest },
  })
  if (existing?.supersededAt)
    throw new AccountPrivacySubscriptionError("CLAIM_CONFLICT")
  let reviewId = existing?.id
  if (!existing) {
    await tx.accountPrivacySubscriptionReview.updateMany({
      where: {
        requestId: data.requestId,
        subjectUserId: subjectId,
        supersededAt: null,
      },
      data: { supersededAt: now },
    })
    const created = await tx.accountPrivacySubscriptionReview.create({
      data: {
        requestId: data.requestId,
        subjectUserId: subjectId,
        policyVersion: policy.version,
        policyDigest: policy.policyDigest,
        inventoryDigest: inventory.inventoryDigest,
        controllerEvidenceDigest: data.controllerEvidenceDigest,
        decisionDigest,
        decisions,
        operatorUserId,
        reviewedAt: now,
        nextReviewAt,
      },
    })
    reviewId = created.id
  }
  return {
    reviewId,
    requestId: data.requestId,
    decisionDigest,
    nextReviewAt,
    recordsReviewed: inventory.records.length,
    replay: Boolean(existing),
  }
}

type SubscriptionOutcome = {
  userId: string
  policyVersion: string
  disposition: string
  processor: string
  evidenceDigest: string
  nextReviewAt: Date | null
  processedAt: Date
}
type ReviewClient = SubscriptionInventoryClient &
  Pick<PrismaClient, "accountPrivacySubscriptionReview">

/** Re-read all scope at profile processing/completion, including late receipt/refund/journal writes. */
export async function accountPrivacySubscriptionRetentionIsConfirmed(
  db: ReviewClient,
  input: {
    requestId: string
    subjectId: string
    outcome: SubscriptionOutcome
    now: Date
  },
) {
  // Other positive outcomes have no supported canonical proof.
  if (input.outcome.disposition === "NOT_APPLICABLE")
    return accountPrivacySubscriptionDataIsEmpty(db, input.subjectId)
  const policy = getApprovedSubscriptionRetentionPolicy(input.now)
  if (
    !policy ||
    input.outcome.processor !== PROCESSOR ||
    input.outcome.disposition !== "RETENTION_APPROVED" ||
    input.outcome.userId !== input.subjectId ||
    input.outcome.policyVersion !== policy.version
  )
    return false
  const review = await db.accountPrivacySubscriptionReview.findUnique({
    where: { decisionDigest: input.outcome.evidenceDigest },
  })
  if (
    !review ||
    review.supersededAt ||
    review.requestId !== input.requestId ||
    review.subjectUserId !== input.subjectId ||
    review.policyDigest !== policy.policyDigest ||
    review.policyVersion !== policy.version ||
    review.operatorUserId === input.subjectId ||
    review.reviewedAt > input.now ||
    review.reviewedAt > input.outcome.processedAt ||
    review.nextReviewAt <= input.now ||
    review.nextReviewAt.getTime() !== input.outcome.nextReviewAt?.getTime()
  )
    return false
  const parsed = z
    .array(subscriptionRetentionDecisionSchema)
    .safeParse(review.decisions)
  if (!parsed.success || !parsed.data.length) return false
  const deadline = subscriptionReviewDeadline(parsed.data, review.reviewedAt)
  if (!deadline || deadline.getTime() !== review.nextReviewAt.getTime())
    return false
  const inventory = await getAccountPrivacySubscriptionInventory(
    db,
    input.subjectId,
  )
  const families = [
    ...new Set(inventory.records.map((row) => row.family)),
  ].sort()
  if (
    inventory.blockers.length ||
    inventory.inventoryDigest !== review.inventoryDigest ||
    subscriptionPrivacyDigest(families) !==
      subscriptionPrivacyDigest(parsed.data.map((row) => row.family))
  )
    return false
  return (
    subscriptionPrivacyDigest({
      requestId: input.requestId,
      subjectId: input.subjectId,
      policyVersion: review.policyVersion,
      policyDigest: review.policyDigest,
      inventoryDigest: review.inventoryDigest,
      controllerEvidenceDigest: review.controllerEvidenceDigest,
      decisions: parsed.data,
      operatorUserId: review.operatorUserId,
    }) === review.decisionDigest
  )
}

/** The ordinary workflow consumes reviewed evidence; it never creates a retention decision. */
export async function confirmAccountPrivacySubscriptions(
  db: PrismaClient,
  input: { requestId: string; operatorUserId: string; now?: Date },
) {
  if (process.env.ACCOUNT_PRIVACY_SUBSCRIPTION_RETENTION_ENABLED !== "true")
    return confirmNoAccountPrivacySubscriptions(db, input)
  enabled()
  const now = input.now ?? new Date()
  const policy = approved(now)
  const result = await runInOwnSerializableTransaction(db, async (tx) => {
    const { request, subjectId } = await subscriptionProcessingContext(
      tx,
      input,
      now,
    )
    const inventory = await getAccountPrivacySubscriptionInventory(
      tx,
      subjectId,
    )
    if (!inventory.records.length) return null
    const review = await tx.accountPrivacySubscriptionReview.findFirst({
      where: {
        requestId: request.id,
        subjectUserId: subjectId,
        supersededAt: null,
      },
      orderBy: [{ reviewedAt: "desc" }, { id: "desc" }],
    })
    if (!review || review.reviewedAt < request.verifiedAt)
      throw new AccountPrivacySubscriptionError("SUBSCRIPTION_REVIEW_REQUIRED")
    const outcome = {
      userId: subjectId,
      policyVersion: policy.version,
      disposition: "RETENTION_APPROVED" as const,
      processor: PROCESSOR,
      evidenceDigest: review.decisionDigest,
      nextReviewAt: review.nextReviewAt,
      processedAt: now,
    }
    if (
      !(await accountPrivacySubscriptionRetentionIsConfirmed(tx, {
        requestId: request.id,
        subjectId,
        outcome,
        now,
      }))
    )
      throw new AccountPrivacySubscriptionError("SUBSCRIPTION_REVIEW_REQUIRED")
    const where = {
      requestId_domain: {
        requestId: request.id,
        domain: "SOFTWARE_SUBSCRIPTIONS" as const,
      },
    }
    const existing = await tx.accountPrivacyDomainOutcome.findUnique({ where })
    if (
      existing &&
      (existing.userId !== subjectId ||
        existing.policyVersion !== policy.version ||
        !(
          (existing.processor === PROCESSOR &&
            existing.disposition === "RETENTION_APPROVED") ||
          (existing.processor === "account-privacy-subscription-empty-v1" &&
            existing.disposition === "NOT_APPLICABLE")
        ))
    )
      throw new AccountPrivacySubscriptionError("CLAIM_CONFLICT")
    const replay = existing?.evidenceDigest === outcome.evidenceDigest
    if (!replay)
      await tx.accountPrivacyDomainOutcome.upsert({
        where,
        create: {
          requestId: request.id,
          domain: "SOFTWARE_SUBSCRIPTIONS",
          ...outcome,
        },
        update: outcome,
      })
    return {
      requestId: request.id,
      recordsRetained: inventory.records.length,
      replay,
    }
  })
  return result ?? confirmNoAccountPrivacySubscriptions(db, input)
}

/** Independent duties remain visible after deletion-case evidence expires. No automatic renewal or destructive purge. */
export async function listAccountPrivacySubscriptionReviews(
  db: PrismaClient,
  input: { operatorUserId: string; cursor?: string; now?: Date },
) {
  const operator = await db.user.findUnique({
    where: { id: input.operatorUserId },
    select: { isPlatformAdmin: true },
  })
  if (!operator?.isPlatformAdmin)
    throw new AccountPrivacySubscriptionError("OPERATOR_REQUIRED")
  return db.accountPrivacySubscriptionReview.findMany({
    where: {
      supersededAt: null,
      nextReviewAt: { lte: input.now ?? new Date() },
    },
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
    orderBy: [{ nextReviewAt: "asc" }, { id: "asc" }],
    take: 51,
    select: {
      id: true,
      requestId: true,
      subjectUserId: true,
      policyVersion: true,
      decisionDigest: true,
      nextReviewAt: true,
      operatorUserId: true,
    },
  })
}

async function retainedSubscriptionContext(
  tx: Prisma.TransactionClient,
  input: { reviewId: string; operatorUserId: string },
) {
  const operator = await tx.user.findUnique({
    where: { id: input.operatorUserId },
    select: { isPlatformAdmin: true },
  })
  if (!operator?.isPlatformAdmin)
    throw new AccountPrivacySubscriptionError("OPERATOR_REQUIRED")
  const review = await tx.accountPrivacySubscriptionReview.findUnique({
    where: { id: input.reviewId },
  })
  if (
    !review ||
    review.supersededAt ||
    review.subjectUserId === input.operatorUserId
  )
    throw new AccountPrivacySubscriptionError("SUBSCRIPTION_REVIEW_REQUIRED")
  return review
}

/** Annual/earlier review is independent of a completed or expired deletion case. No renewed account access. */
export async function inspectAccountPrivacySubscriptionRetention(
  db: PrismaClient,
  input: { reviewId: string; operatorUserId: string },
) {
  return runInOwnSerializableTransaction(db, async (tx) => {
    const review = await retainedSubscriptionContext(tx, input)
    return {
      review,
      ...(await getAccountPrivacySubscriptionInventory(
        tx,
        review.subjectUserId,
      )),
    }
  })
}

export async function reassessAccountPrivacySubscriptions(
  db: PrismaClient,
  input: z.infer<typeof reassessAccountPrivacySubscriptionsSchema> & {
    operatorUserId: string
    now?: Date
  },
) {
  enabled()
  const now = input.now ?? new Date()
  const policy = approved(now)
  const { operatorUserId, now: _, ...raw } = input
  const parsed = reassessAccountPrivacySubscriptionsSchema.safeParse(raw)
  if (!parsed.success)
    throw new AccountPrivacySubscriptionError("SUBSCRIPTION_REVIEW_REQUIRED")
  if (parsed.data.policyDigest !== policy.policyDigest)
    throw new AccountPrivacySubscriptionError("POLICY_NOT_APPROVED")
  return runInOwnSerializableTransaction(db, async (tx) => {
    const review = await retainedSubscriptionContext(tx, input)
    const { reviewId: _, ...data } = parsed.data
    return recordSubscriptionRetentionReview(
      tx,
      { ...data, requestId: review.requestId },
      review.subjectUserId,
      operatorUserId,
      policy,
      now,
    )
  })
}

import type { PrismaClient } from "../../generated/prisma/client"
import {
  beginAccountPrivacyReview,
  revokeAccountPrivacyAccess,
} from "./account-privacy-access"
import { processAccountPrivacyActivity } from "./account-privacy-activity"
import { confirmAccountPrivacyRetainedCommercialRecords } from "./account-privacy-commercial-retention"
import { completeAccountPrivacyRequest } from "./account-privacy-completion"
import { revokeAccountPrivacyConversationAccess } from "./account-privacy-conversation-access"
import { confirmNoAccountPrivacyConversations } from "./account-privacy-conversation-outcome"
import { confirmAccountPrivacyIdentityAccessRevoked } from "./account-privacy-identity-outcome"
import { revokeAccountPrivacyMembershipAccess } from "./account-privacy-membership"
import { confirmNoAccountPrivacyPrescriptions } from "./account-privacy-prescription-outcome"
import {
  type AccountPrivacyPrivateMediaPort,
  countAccountPrivacyPrivateAssistant,
  processAccountPrivacyPrivateAssistant,
} from "./account-privacy-private-assistant"
import { processAccountPrivacyProfile } from "./account-privacy-profile"
import { confirmNoAccountPrivacySubscriptions } from "./account-privacy-subscription"

export const ACCOUNT_PRIVACY_WORKFLOW_STEPS = [
  "BEGIN_REVIEW",
  "REVOKE_ACCESS",
  "REVOKE_MEMBERSHIPS",
  "REVOKE_CONVERSATION_ACCESS",
  "CONFIRM_IDENTITY",
  "ERASE_PRIVATE_ASSISTANT",
  "CONFIRM_CONVERSATIONS",
  "CONFIRM_PRESCRIPTIONS",
  "CONFIRM_COMMERCIAL_RECORDS",
  "CONFIRM_SUBSCRIPTIONS",
  "ERASE_ANALYTICS",
  "REVIEW_EXTERNAL_PROCESSORS",
  "MINIMIZE_PROFILE",
  "DELIVER_OUTCOME",
  "COMPLETE",
] as const
export type AccountPrivacyWorkflowStep =
  (typeof ACCOUNT_PRIVACY_WORKFLOW_STEPS)[number]
export class AccountPrivacyWorkflowError extends Error {
  constructor(
    readonly code:
      | "DISABLED"
      | "OPERATOR_REQUIRED"
      | "NOT_FOUND"
      | "IDENTITY_REVIEW_REQUIRED"
      | "REQUEST_NOT_PROCESSING"
      | "STALE_STEP"
      | "DOMAIN_REVIEW_REQUIRED"
      | "NOTICE_DELIVERY_REQUIRED",
  ) {
    super(code)
    this.name = "AccountPrivacyWorkflowError"
  }
}

type WorkflowSnapshot = {
  status: string
  accessStatus: string | null
  domains: readonly string[]
  analyticsEvents: number
  conversationAccessRemains: boolean
  privateAssistantRecords?: number
}
/** Next action only. Existing ledgers cannot bypass any processor or completion postcondition. */
export function nextAccountPrivacyWorkflowStep(
  snapshot: WorkflowSnapshot,
): AccountPrivacyWorkflowStep {
  if (snapshot.status === "COMPLETED") return "COMPLETE"
  if (snapshot.status === "RECEIVED") return "BEGIN_REVIEW"
  if (snapshot.accessStatus !== "REVOKED") return "REVOKE_ACCESS"
  const steps = [
    ["MEMBERSHIP", "REVOKE_MEMBERSHIPS"],
    ["IDENTITY_ACCESS", "CONFIRM_IDENTITY"],
    ["CONVERSATIONS", "CONFIRM_CONVERSATIONS"],
    ["PRESCRIPTIONS", "CONFIRM_PRESCRIPTIONS"],
    ["COMMERCIAL_RECORDS", "CONFIRM_COMMERCIAL_RECORDS"],
    ["SOFTWARE_SUBSCRIPTIONS", "CONFIRM_SUBSCRIPTIONS"],
  ] as const
  for (const [domain, step] of steps) {
    if (domain === "CONVERSATIONS" && snapshot.privateAssistantRecords)
      return "ERASE_PRIVATE_ASSISTANT"
    if (!snapshot.domains.includes(domain)) {
      if (domain === "IDENTITY_ACCESS" && snapshot.conversationAccessRemains)
        return "REVOKE_CONVERSATION_ACCESS"
      return step
    }
  }
  if (snapshot.analyticsEvents) return "ERASE_ANALYTICS"
  if (!snapshot.domains.includes("EXTERNAL_PROCESSORS"))
    return "REVIEW_EXTERNAL_PROCESSORS"
  if (!snapshot.domains.includes("ACCOUNT_PROFILE")) return "MINIMIZE_PROFILE"
  if (!snapshot.domains.includes("OUTCOME_NOTICE")) return "DELIVER_OUTCOME"
  return "COMPLETE"
}

/** Restricted counts/state projection. No contact, subject ID, credentials or provider receipts. */
export async function getAccountPrivacyWorkflow(
  db: PrismaClient,
  input: { requestId: string; operatorUserId: string },
) {
  const operator = await db.user.findUnique({
    where: { id: input.operatorUserId },
    select: { isPlatformAdmin: true },
  })
  if (!operator?.isPlatformAdmin)
    throw new AccountPrivacyWorkflowError("OPERATOR_REQUIRED")
  const request = await db.accountPrivacyRequest.findUnique({
    where: { id: input.requestId },
    select: {
      status: true,
      requestKey: true,
      userId: true,
      verifiedSubjectUserId: true,
      verifiedAt: true,
      accessRevocation: { select: { status: true } },
      domainOutcomes: { select: { domain: true } },
    },
  })
  if (!request) throw new AccountPrivacyWorkflowError("NOT_FOUND")
  const subjectId = request.verifiedSubjectUserId
  if (
    !subjectId ||
    subjectId === input.operatorUserId ||
    request.userId !== subjectId ||
    !request.verifiedAt ||
    request.verifiedAt > new Date() ||
    request.requestKey !== `account-deletion:${subjectId}`
  )
    throw new AccountPrivacyWorkflowError("IDENTITY_REVIEW_REQUIRED")
  if (
    !["RECEIVED", "UNDER_REVIEW", "PROCESSING", "COMPLETED"].includes(
      request.status,
    )
  )
    throw new AccountPrivacyWorkflowError("REQUEST_NOT_PROCESSING")
  const analyticsEvents = await db.productAnalyticsEvent.count({
    where: { userId: subjectId },
  })
  const activeConversationLinks = await db.storeConversationAccountAccess.count(
    { where: { accountUserId: subjectId, status: "ACTIVE" } },
  )
  const privateAssistant = await countAccountPrivacyPrivateAssistant(
    db,
    subjectId,
  )
  const snapshot = {
    status: request.status,
    accessStatus: request.accessRevocation?.status ?? null,
    domains: request.domainOutcomes.map((row) => row.domain),
    analyticsEvents,
    privateAssistantRecords: privateAssistant.total,
    conversationAccessRemains: activeConversationLinks > 0,
  }
  return {
    requestId: input.requestId,
    ...snapshot,
    nextStep: nextAccountPrivacyWorkflowStep(snapshot),
  }
}

/** One explicit, resumable stage per call; no automatic email, external attestation or gate override. */
export async function advanceAccountPrivacyWorkflow(
  db: PrismaClient,
  input: {
    requestId: string
    operatorUserId: string
    expectedStep: AccountPrivacyWorkflowStep
  },
  providers: Pick<
    Parameters<typeof revokeAccountPrivacyAccess>[1],
    "revokeApple" | "revokeAppleAccess" | "revokeGoogle"
  > & { removePrivateAttachment?: AccountPrivacyPrivateMediaPort },
) {
  if (process.env.ACCOUNT_PRIVACY_PROCESSING_ENABLED !== "true")
    throw new AccountPrivacyWorkflowError("DISABLED")
  const before = await getAccountPrivacyWorkflow(db, input)
  if (before.nextStep !== input.expectedStep)
    throw new AccountPrivacyWorkflowError("STALE_STEP")
  switch (input.expectedStep) {
    case "BEGIN_REVIEW":
      await beginAccountPrivacyReview(db, {
        requestId: input.requestId,
        reviewerUserId: input.operatorUserId,
      })
      break
    case "REVOKE_ACCESS":
      await revokeAccountPrivacyAccess(db, { ...input, ...providers })
      break
    case "REVOKE_MEMBERSHIPS":
      await revokeAccountPrivacyMembershipAccess(db, input)
      break
    case "REVOKE_CONVERSATION_ACCESS":
      await revokeAccountPrivacyConversationAccess(db, input)
      break
    case "CONFIRM_IDENTITY":
      await confirmAccountPrivacyIdentityAccessRevoked(db, input)
      break
    case "ERASE_PRIVATE_ASSISTANT":
      await processAccountPrivacyPrivateAssistant(
        db,
        input,
        providers.removePrivateAttachment,
      )
      break
    case "CONFIRM_CONVERSATIONS":
      await confirmNoAccountPrivacyConversations(db, input)
      break
    case "CONFIRM_PRESCRIPTIONS":
      await confirmNoAccountPrivacyPrescriptions(db, input)
      break
    case "CONFIRM_COMMERCIAL_RECORDS":
      await confirmAccountPrivacyRetainedCommercialRecords(db, input)
      break
    case "CONFIRM_SUBSCRIPTIONS":
      await confirmNoAccountPrivacySubscriptions(db, input)
      break
    case "ERASE_ANALYTICS":
      await processAccountPrivacyActivity(db, input)
      break
    case "REVIEW_EXTERNAL_PROCESSORS":
      throw new AccountPrivacyWorkflowError("DOMAIN_REVIEW_REQUIRED")
    case "MINIMIZE_PROFILE":
      await processAccountPrivacyProfile(db, input)
      break
    case "DELIVER_OUTCOME":
      throw new AccountPrivacyWorkflowError("NOTICE_DELIVERY_REQUIRED")
    case "COMPLETE":
      await completeAccountPrivacyRequest(db, input)
      break
  }
  return {
    executedStep: input.expectedStep,
    workflow: await getAccountPrivacyWorkflow(db, input),
  }
}

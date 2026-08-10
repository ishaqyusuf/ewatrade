import {
  type ServiceCommerceChannelOrigin,
  type ServiceCommercePolicyDecisionInput,
  type ServiceCommercePolicyEvaluation,
  type ServiceCommercePolicyFact,
  type ServiceCommercePolicyOutcome,
  type ServiceCommercePolicySubject,
  type ServiceCommerceVertical,
  evaluateServiceCommercePolicyFacts,
  serviceCommercePolicyDecisionInputSchema,
} from "@ewatrade/service-commerce"

import { Prisma, type PrismaClient } from "../../generated/prisma/client"
import {
  MembershipRole,
  MembershipStatus,
  ServiceCommercePolicyAuditEventType,
  ServiceCommercePolicyChannel,
  ServiceCommercePolicyOutcome as ServiceCommercePolicyOutcomeEnum,
  ServiceCommercePolicySubject as ServiceCommercePolicySubjectEnum,
  ServiceCommercePolicyVertical,
} from "../../generated/prisma/enums"
import type { DbClient } from "./types"

type PolicyTx = DbClient

export class ServiceCommercePolicyError extends Error {
  constructor(
    readonly code:
      | "CONFLICT"
      | "FORBIDDEN"
      | "INVALID_JURISDICTION"
      | "NOT_FOUND"
      | "POLICY_BLOCKED",
    message: string,
  ) {
    super(message)
    this.name = "ServiceCommercePolicyError"
  }
}

function translatePolicyWriteConflict(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2002" || error.code === "P2025")
  ) {
    throw new ServiceCommercePolicyError(
      "CONFLICT",
      "Policy decision changed before this operation completed.",
    )
  }
  throw error
}

const verticalToDb = {
  pharmacy: ServiceCommercePolicyVertical.PHARMACY,
  service: ServiceCommercePolicyVertical.SERVICE,
} satisfies Record<ServiceCommerceVertical, ServiceCommercePolicyVertical>

const channelToDb = {
  staff: ServiceCommercePolicyChannel.STAFF,
  web: ServiceCommercePolicyChannel.WEB,
  whatsapp: ServiceCommercePolicyChannel.WHATSAPP,
} satisfies Record<ServiceCommerceChannelOrigin, ServiceCommercePolicyChannel>
const channelFromDb = {
  STAFF: "staff",
  WEB: "web",
  WHATSAPP: "whatsapp",
} satisfies Record<ServiceCommercePolicyChannel, ServiceCommerceChannelOrigin>

const subjectToDb = {
  booking: ServiceCommercePolicySubjectEnum.BOOKING,
  catalog_publication: ServiceCommercePolicySubjectEnum.CATALOG_PUBLICATION,
  delivery: ServiceCommercePolicySubjectEnum.DELIVERY,
  intake: ServiceCommercePolicySubjectEnum.INTAKE,
  managed_inventory_graduation:
    ServiceCommercePolicySubjectEnum.MANAGED_INVENTORY_GRADUATION,
  payment: ServiceCommercePolicySubjectEnum.PAYMENT,
  pickup: ServiceCommercePolicySubjectEnum.PICKUP,
  price_promotion: ServiceCommercePolicySubjectEnum.PRICE_PROMOTION,
  procure_to_order: ServiceCommercePolicySubjectEnum.PROCURE_TO_ORDER,
  progressive_catalog: ServiceCommercePolicySubjectEnum.PROGRESSIVE_CATALOG,
  progressive_draft_capture:
    ServiceCommercePolicySubjectEnum.PROGRESSIVE_DRAFT_CAPTURE,
  quote: ServiceCommercePolicySubjectEnum.QUOTE,
  service_completion: ServiceCommercePolicySubjectEnum.SERVICE_COMPLETION,
  staff: ServiceCommercePolicySubjectEnum.STAFF,
  web: ServiceCommercePolicySubjectEnum.WEB,
  whatsapp: ServiceCommercePolicySubjectEnum.WHATSAPP,
} satisfies Record<
  ServiceCommercePolicySubject,
  ServiceCommercePolicySubjectEnum
>
const subjectFromDb = Object.fromEntries(
  Object.entries(subjectToDb).map(([key, value]) => [value, key]),
) as Record<ServiceCommercePolicySubjectEnum, ServiceCommercePolicySubject>

const verticalFromDb = {
  PHARMACY: "pharmacy",
  SERVICE: "service",
} satisfies Record<ServiceCommercePolicyVertical, ServiceCommerceVertical>

const outcomeToDb = {
  allowed: ServiceCommercePolicyOutcomeEnum.ALLOWED,
  pending_evidence: ServiceCommercePolicyOutcomeEnum.PENDING_EVIDENCE,
  prohibited: ServiceCommercePolicyOutcomeEnum.PROHIBITED,
  restricted: ServiceCommercePolicyOutcomeEnum.RESTRICTED,
} satisfies Record<
  Exclude<ServiceCommercePolicyOutcome, "expired_approval">,
  ServiceCommercePolicyOutcomeEnum
>

function mapOutcome(
  outcome: ServiceCommercePolicyOutcomeEnum,
): Exclude<ServiceCommercePolicyOutcome, "expired_approval"> {
  if (outcome === ServiceCommercePolicyOutcomeEnum.ALLOWED) return "allowed"
  if (outcome === ServiceCommercePolicyOutcomeEnum.PROHIBITED) {
    return "prohibited"
  }
  if (outcome === ServiceCommercePolicyOutcomeEnum.PENDING_EVIDENCE) {
    return "pending_evidence"
  }
  return "restricted"
}

function toFact(
  decision: {
    approvalReference: string | null
    channel: ServiceCommercePolicyChannel
    effectiveAt: Date
    evidenceReference: string
    expiresAt: Date
    jurisdictionCode: string
    outcome: ServiceCommercePolicyOutcomeEnum
    revision: number
    revokedAt: Date | null
    subject: ServiceCommercePolicySubjectEnum
    vertical: ServiceCommercePolicyVertical
  },
  scope: {
    channel: ServiceCommerceChannelOrigin
    subject: ServiceCommercePolicySubject
    vertical: ServiceCommerceVertical
  },
): ServiceCommercePolicyFact {
  return {
    approvalReferencePresent: Boolean(decision.approvalReference),
    channel: scope.channel,
    effectiveAt: decision.effectiveAt,
    evidenceReferencePresent: Boolean(decision.evidenceReference),
    expiresAt: decision.expiresAt,
    jurisdictionCode: decision.jurisdictionCode,
    outcome: mapOutcome(decision.outcome),
    revision: decision.revision,
    revokedAt: decision.revokedAt,
    subject: scope.subject,
    vertical: scope.vertical,
  }
}

function safeDecision(decision: {
  channel: ServiceCommercePolicyChannel
  effectiveAt: Date
  expiresAt: Date
  id: string
  jurisdictionCode: string
  outcome: ServiceCommercePolicyOutcomeEnum
  revision: number
  revokedAt: Date | null
  subject: ServiceCommercePolicySubjectEnum
  vertical: ServiceCommercePolicyVertical
}) {
  return {
    effectiveAt: decision.effectiveAt,
    expiresAt: decision.expiresAt,
    id: decision.id,
    jurisdictionCode: decision.jurisdictionCode,
    outcome: mapOutcome(decision.outcome),
    revision: decision.revision,
    revokedAt: decision.revokedAt,
  }
}

async function resolveManager(
  tx: PolicyTx,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  const store = await tx.store.findFirst({
    select: { countryCode: true, id: true },
    where: { id: input.storeId, tenantId: input.tenantId },
  })
  if (!store) {
    throw new ServiceCommercePolicyError("NOT_FOUND", "Store not found.")
  }
  const membership = await tx.membership.findFirst({
    select: { role: true },
    where: {
      status: MembershipStatus.ACTIVE,
      tenantId: input.tenantId,
      userId: input.actorUserId,
    },
  })
  const canManage =
    membership?.role === MembershipRole.OWNER ||
    membership?.role === MembershipRole.ADMIN
  return { canManage, store }
}

type EvaluatePolicyInput = {
  actorUserId: string
  channel: ServiceCommerceChannelOrigin
  purpose: string
  storeId: string
  subject: ServiceCommercePolicySubject
  tenantId: string
  vertical: ServiceCommerceVertical
}

export async function evaluateServiceCommercePolicyInTransaction(
  tx: PolicyTx,
  input: EvaluatePolicyInput,
): Promise<ServiceCommercePolicyEvaluation> {
  const [evaluation] = await evaluateServiceCommercePolicyBatchInTransaction(
    tx,
    {
      actorUserId: input.actorUserId,
      purpose: input.purpose,
      scopes: [input],
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  )
  if (!evaluation) {
    throw new ServiceCommercePolicyError(
      "POLICY_BLOCKED",
      "Service Commerce policy could not be evaluated.",
    )
  }
  return evaluation
}

export async function evaluateServiceCommercePolicyBatchInTransaction(
  tx: PolicyTx,
  input: {
    actorUserId: string
    purpose: string
    scopes: Array<Pick<EvaluatePolicyInput, "channel" | "subject" | "vertical">>
    storeId: string
    tenantId: string
  },
): Promise<ServiceCommercePolicyEvaluation[]> {
  const store = await tx.store.findFirst({
    select: { countryCode: true },
    where: { id: input.storeId, tenantId: input.tenantId },
  })
  if (!store) {
    throw new ServiceCommercePolicyError("NOT_FOUND", "Store not found.")
  }
  const decisions = await tx.serviceCommercePolicyDecision.findMany({
    where: {
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  const jurisdictionCode = store.countryCode?.trim().toUpperCase() || "UNKNOWN"
  const evaluated = input.scopes.map((scope) => {
    const scopedDecisions = decisions.filter(
      (decision) =>
        decision.channel === channelToDb[scope.channel] &&
        decision.subject === subjectToDb[scope.subject] &&
        decision.vertical === verticalToDb[scope.vertical],
    )
    const evaluation = evaluateServiceCommercePolicyFacts({
      ...scope,
      facts: scopedDecisions.map((decision) => toFact(decision, scope)),
      jurisdictionCode: store.countryCode,
    })
    const exactDecision = scopedDecisions.find(
      (decision) => decision.jurisdictionCode === jurisdictionCode,
    )
    return { evaluation, exactDecision, scope }
  })
  if (evaluated.length > 0) {
    await tx.serviceCommercePolicyAuditEvent.createMany({
      data: evaluated.map(({ evaluation, exactDecision, scope }) => ({
        actorUserId: input.actorUserId,
        channel: channelToDb[scope.channel],
        decisionId: exactDecision?.id,
        decisionRevision: exactDecision?.revision,
        jurisdictionCode,
        observedOutcome: evaluation.outcome,
        purpose: input.purpose.trim().slice(0, 240) || "policy_evaluation",
        storeId: input.storeId,
        subject: subjectToDb[scope.subject],
        tenantId: input.tenantId,
        type: ServiceCommercePolicyAuditEventType.READ,
        vertical: verticalToDb[scope.vertical],
      })),
    })
  }
  return evaluated.map(({ evaluation }) => evaluation)
}

export async function evaluateServiceCommercePolicy(
  db: PrismaClient,
  input: EvaluatePolicyInput,
) {
  return db.$transaction((tx) =>
    evaluateServiceCommercePolicyInTransaction(tx, input),
  )
}

export async function assertServiceCommercePolicyAllowedInTransaction(
  tx: PolicyTx,
  input: EvaluatePolicyInput,
) {
  const evaluation = await evaluateServiceCommercePolicyInTransaction(tx, input)
  if (evaluation.outcome !== "allowed") {
    throw new ServiceCommercePolicyError(
      "POLICY_BLOCKED",
      "This Service Commerce operation is unavailable under current policy.",
    )
  }
  return evaluation
}

export async function assertServiceCommercePolicyAllowed(
  db: PrismaClient,
  input: EvaluatePolicyInput,
) {
  return db.$transaction((tx) =>
    assertServiceCommercePolicyAllowedInTransaction(tx, input),
  )
}

export async function setServiceCommercePolicyDecision(
  db: PrismaClient,
  input: ServiceCommercePolicyDecisionInput & {
    actorUserId: string
    tenantId: string
  },
) {
  const {
    actorUserId: _actorUserId,
    tenantId: _tenantId,
    ...decisionInput
  } = input
  const parsed = serviceCommercePolicyDecisionInputSchema.parse(decisionInput)
  let result: Awaited<ReturnType<typeof runSetPolicyDecision>>
  try {
    result = await db.$transaction((tx) =>
      runSetPolicyDecision(tx, input, parsed),
    )
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2025")
    ) {
      await recordRejectedPolicySetAttempt(db, input, parsed)
    }
    translatePolicyWriteConflict(error)
  }
  if (result.rejected === "FORBIDDEN") {
    throw new ServiceCommercePolicyError(
      "FORBIDDEN",
      "Only an authorized release owner can change policy decisions.",
    )
  }
  if (result.rejected === "INVALID_JURISDICTION") {
    throw new ServiceCommercePolicyError(
      "INVALID_JURISDICTION",
      "Policy jurisdiction must match the Store jurisdiction.",
    )
  }
  if (result.rejected === "CONFLICT") {
    throw new ServiceCommercePolicyError(
      "CONFLICT",
      "Policy decision changed before this update.",
    )
  }
  return result.decision
}

async function recordRejectedPolicySetAttempt(
  db: PrismaClient,
  input: ServiceCommercePolicyDecisionInput & {
    actorUserId: string
    tenantId: string
  },
  parsed: ServiceCommercePolicyDecisionInput,
) {
  await db.$transaction(async (tx) => {
    const store = await tx.store.findFirst({
      select: { id: true },
      where: { id: input.storeId, tenantId: input.tenantId },
    })
    if (!store) return
    const scope = {
      channel: channelToDb[parsed.channel],
      jurisdictionCode: parsed.jurisdictionCode.toUpperCase(),
      storeId: input.storeId,
      subject: subjectToDb[parsed.subject],
      tenantId: input.tenantId,
      vertical: verticalToDb[parsed.vertical],
    }
    const decision = await tx.serviceCommercePolicyDecision.findUnique({
      where: {
        tenantId_storeId_vertical_jurisdictionCode_channel_subject: scope,
      },
    })
    await tx.serviceCommercePolicyAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        ...scope,
        decisionId: decision?.id,
        decisionRevision: decision?.revision,
        observedOutcome: "denied",
        purpose: "policy_write_conflict",
        type: ServiceCommercePolicyAuditEventType.OVERRIDE_DENIED,
      },
    })
  })
}

async function runSetPolicyDecision(
  tx: PolicyTx,
  input: ServiceCommercePolicyDecisionInput & {
    actorUserId: string
    tenantId: string
  },
  parsed: ServiceCommercePolicyDecisionInput,
) {
  const { canManage, store } = await resolveManager(tx, input)
  const jurisdictionCode = parsed.jurisdictionCode.toUpperCase()
  const reviewer = await tx.membership.findFirst({
    select: { role: true },
    where: {
      status: MembershipStatus.ACTIVE,
      tenantId: input.tenantId,
      userId: input.reviewedByUserId,
    },
  })
  const reviewerCanApprove =
    reviewer?.role === MembershipRole.OWNER ||
    reviewer?.role === MembershipRole.ADMIN
  const scope = {
    channel: channelToDb[parsed.channel],
    jurisdictionCode,
    storeId: input.storeId,
    subject: subjectToDb[parsed.subject],
    tenantId: input.tenantId,
    vertical: verticalToDb[parsed.vertical],
  }
  const previous = await tx.serviceCommercePolicyDecision.findUnique({
    where: {
      tenantId_storeId_vertical_jurisdictionCode_channel_subject: scope,
    },
  })
  if (store.countryCode?.trim().toUpperCase() !== jurisdictionCode) {
    await tx.serviceCommercePolicyAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        ...scope,
        decisionId: previous?.id,
        decisionRevision: previous?.revision,
        observedOutcome: "denied",
        purpose: "policy_jurisdiction_mismatch",
        type: ServiceCommercePolicyAuditEventType.OVERRIDE_DENIED,
      },
    })
    return { decision: null, rejected: "INVALID_JURISDICTION" as const }
  }
  if (!canManage || !reviewerCanApprove) {
    await tx.serviceCommercePolicyAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        ...scope,
        decisionId: previous?.id,
        decisionRevision: previous?.revision,
        observedOutcome: "denied",
        purpose: "policy_override_attempt",
        type: ServiceCommercePolicyAuditEventType.OVERRIDE_DENIED,
      },
    })
    return { decision: null, rejected: "FORBIDDEN" as const }
  }
  if (
    (parsed.expectedRevision === 0 && previous) ||
    (parsed.expectedRevision > 0 &&
      previous?.revision !== parsed.expectedRevision)
  ) {
    await tx.serviceCommercePolicyAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        ...scope,
        decisionId: previous?.id,
        decisionRevision: previous?.revision,
        observedOutcome: "denied",
        purpose: "policy_revision_conflict",
        type: ServiceCommercePolicyAuditEventType.OVERRIDE_DENIED,
      },
    })
    return { decision: null, rejected: "CONFLICT" as const }
  }
  const data = {
    approvalReference: parsed.approvalReference ?? null,
    effectiveAt: parsed.effectiveAt,
    evidenceReference: parsed.evidenceReference,
    expiresAt: parsed.expiresAt,
    licenceReference: parsed.licenceReference ?? null,
    outcome: outcomeToDb[parsed.outcome],
    reason: parsed.reason,
    reviewedByUserId: input.reviewedByUserId,
    revokedAt: null,
  }
  const decision = previous
    ? await tx.serviceCommercePolicyDecision.update({
        data: { ...data, revision: { increment: 1 } },
        where: { id: previous.id, revision: parsed.expectedRevision },
      })
    : await tx.serviceCommercePolicyDecision.create({
        data: { ...data, ...scope },
      })
  await tx.serviceCommercePolicyAuditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      ...scope,
      decisionId: decision.id,
      decisionRevision: decision.revision,
      observedOutcome: mapOutcome(decision.outcome),
      purpose: previous ? "policy_decision_updated" : "policy_decision_created",
      type: previous
        ? ServiceCommercePolicyAuditEventType.UPDATED
        : ServiceCommercePolicyAuditEventType.CREATED,
    },
  })
  return { decision: safeDecision(decision), rejected: null }
}

export async function revokeServiceCommercePolicyDecision(
  db: PrismaClient,
  input: {
    actorUserId: string
    decisionId: string
    expectedRevision: number
    reason: string
    storeId: string
    tenantId: string
  },
) {
  const reason = input.reason.trim()
  if (reason.length < 3 || reason.length > 500) {
    throw new ServiceCommercePolicyError(
      "CONFLICT",
      "A bounded policy revocation reason is required.",
    )
  }
  let result: Awaited<ReturnType<typeof runRevokePolicyDecision>>
  try {
    result = await db.$transaction((tx) =>
      runRevokePolicyDecision(tx, input, reason),
    )
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2025")
    ) {
      await recordRejectedPolicyRevokeAttempt(db, input)
    }
    translatePolicyWriteConflict(error)
  }
  if (result.rejected === "FORBIDDEN") {
    throw new ServiceCommercePolicyError(
      "FORBIDDEN",
      "Only an authorized release owner can revoke policy decisions.",
    )
  }
  if (result.rejected === "CONFLICT") {
    throw new ServiceCommercePolicyError(
      "CONFLICT",
      "Policy decision changed before revocation.",
    )
  }
  return result.decision
}

async function recordRejectedPolicyRevokeAttempt(
  db: PrismaClient,
  input: {
    actorUserId: string
    decisionId: string
    storeId: string
    tenantId: string
  },
) {
  await db.$transaction(async (tx) => {
    const decision = await tx.serviceCommercePolicyDecision.findFirst({
      where: {
        id: input.decisionId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!decision) return
    await tx.serviceCommercePolicyAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        channel: decision.channel,
        decisionId: decision.id,
        decisionRevision: decision.revision,
        jurisdictionCode: decision.jurisdictionCode,
        observedOutcome: "denied",
        purpose: "policy_revoke_write_conflict",
        storeId: input.storeId,
        subject: decision.subject,
        tenantId: input.tenantId,
        type: ServiceCommercePolicyAuditEventType.OVERRIDE_DENIED,
        vertical: decision.vertical,
      },
    })
  })
}

async function runRevokePolicyDecision(
  tx: PolicyTx,
  input: {
    actorUserId: string
    decisionId: string
    expectedRevision: number
    reason: string
    storeId: string
    tenantId: string
  },
  reason: string,
) {
  const { canManage } = await resolveManager(tx, input)
  const decision = await tx.serviceCommercePolicyDecision.findFirst({
    where: {
      id: input.decisionId,
      storeId: input.storeId,
      tenantId: input.tenantId,
    },
  })
  if (!decision) {
    throw new ServiceCommercePolicyError("NOT_FOUND", "Policy not found.")
  }
  if (!canManage) {
    await tx.serviceCommercePolicyAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        channel: decision.channel,
        decisionId: decision.id,
        decisionRevision: decision.revision,
        jurisdictionCode: decision.jurisdictionCode,
        observedOutcome: "denied",
        purpose: "policy_revoke_attempt",
        storeId: input.storeId,
        subject: decision.subject,
        tenantId: input.tenantId,
        type: ServiceCommercePolicyAuditEventType.OVERRIDE_DENIED,
        vertical: decision.vertical,
      },
    })
    return { decision: null, rejected: "FORBIDDEN" as const }
  }
  if (decision.revision !== input.expectedRevision || decision.revokedAt) {
    await tx.serviceCommercePolicyAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        channel: decision.channel,
        decisionId: decision.id,
        decisionRevision: decision.revision,
        jurisdictionCode: decision.jurisdictionCode,
        observedOutcome: "denied",
        purpose: "policy_revoke_revision_conflict",
        storeId: input.storeId,
        subject: decision.subject,
        tenantId: input.tenantId,
        type: ServiceCommercePolicyAuditEventType.OVERRIDE_DENIED,
        vertical: decision.vertical,
      },
    })
    return { decision: null, rejected: "CONFLICT" as const }
  }
  const revoked = await tx.serviceCommercePolicyDecision.update({
    data: { reason, revision: { increment: 1 }, revokedAt: new Date() },
    where: { id: decision.id, revision: input.expectedRevision },
  })
  await tx.serviceCommercePolicyAuditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      channel: revoked.channel,
      decisionId: revoked.id,
      decisionRevision: revoked.revision,
      jurisdictionCode: revoked.jurisdictionCode,
      observedOutcome: "restricted",
      purpose: "policy_decision_revoked",
      storeId: input.storeId,
      subject: revoked.subject,
      tenantId: input.tenantId,
      type: ServiceCommercePolicyAuditEventType.REVOKED,
      vertical: revoked.vertical,
    },
  })
  return { decision: safeDecision(revoked), rejected: null }
}

export async function getServiceCommercePolicyDecisionDetail(
  db: PrismaClient,
  input: {
    actorUserId: string
    decisionId: string
    storeId: string
    tenantId: string
  },
) {
  const result = await db.$transaction(async (tx) => {
    const { canManage } = await resolveManager(tx, input)
    const decision = await tx.serviceCommercePolicyDecision.findFirst({
      where: {
        id: input.decisionId,
        storeId: input.storeId,
        tenantId: input.tenantId,
      },
    })
    if (!decision) {
      throw new ServiceCommercePolicyError("NOT_FOUND", "Policy not found.")
    }
    await tx.serviceCommercePolicyAuditEvent.create({
      data: {
        actorUserId: input.actorUserId,
        channel: decision.channel,
        decisionId: decision.id,
        decisionRevision: decision.revision,
        jurisdictionCode: decision.jurisdictionCode,
        observedOutcome: canManage ? mapOutcome(decision.outcome) : "denied",
        purpose: canManage
          ? "policy_evidence_detail_read"
          : "policy_evidence_detail_read_denied",
        storeId: input.storeId,
        subject: decision.subject,
        tenantId: input.tenantId,
        type: ServiceCommercePolicyAuditEventType.READ,
        vertical: decision.vertical,
      },
    })
    if (!canManage) return { denied: true as const }
    return {
      denied: false as const,
      detail: {
        ...safeDecision(decision),
        approvalReference: decision.approvalReference,
        evidenceReference: decision.evidenceReference,
        licenceReference: decision.licenceReference,
        reason: decision.reason,
        reviewedByUserId: decision.reviewedByUserId,
      },
    }
  })
  if (result.denied) {
    throw new ServiceCommercePolicyError(
      "FORBIDDEN",
      "Policy evidence is unavailable.",
    )
  }
  return result.detail
}

export async function listServiceCommercePolicyDecisions(
  db: PrismaClient,
  input: { actorUserId: string; storeId: string; tenantId: string },
) {
  const result = await db.$transaction(async (tx) => {
    const { canManage } = await resolveManager(tx, input)
    const decisions = await tx.serviceCommercePolicyDecision.findMany({
      orderBy: [{ vertical: "asc" }, { channel: "asc" }, { subject: "asc" }],
      where: { storeId: input.storeId, tenantId: input.tenantId },
    })
    if (decisions.length > 0) {
      await tx.serviceCommercePolicyAuditEvent.createMany({
        data: decisions.map((decision) => ({
          actorUserId: input.actorUserId,
          channel: decision.channel,
          decisionId: decision.id,
          decisionRevision: decision.revision,
          jurisdictionCode: decision.jurisdictionCode,
          observedOutcome: canManage ? mapOutcome(decision.outcome) : "denied",
          purpose: canManage
            ? "policy_decision_list_read"
            : "policy_decision_list_read_denied",
          storeId: input.storeId,
          subject: decision.subject,
          tenantId: input.tenantId,
          type: ServiceCommercePolicyAuditEventType.READ,
          vertical: decision.vertical,
        })),
      })
    }
    if (!canManage) return { denied: true as const }
    return {
      decisions: decisions.map((decision) => ({
        ...safeDecision(decision),
        channel: channelFromDb[decision.channel],
        subject: subjectFromDb[decision.subject],
        vertical: verticalFromDb[decision.vertical],
      })),
      denied: false as const,
    }
  })
  if (result.denied) {
    throw new ServiceCommercePolicyError(
      "FORBIDDEN",
      "Policy decisions are unavailable.",
    )
  }
  return result.decisions
}

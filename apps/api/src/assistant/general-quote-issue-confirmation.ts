import { types } from "node:util"
import type { AssistantActionProposal } from "@ewatrade/db/browser"
import { readCommerceQuoteIssueRecoveryAuthorityInTransaction } from "@ewatrade/db/commerce-quote-issue-authority"
import type { CommerceQuoteIssueReviewInput } from "@ewatrade/db/commerce-quote-issue-review"
import { assertCommerceQuoteReviewBudget } from "@ewatrade/db/commerce-quote-review-budget"
import {
  type ReviewedCommerceQuoteIssue,
  issueReviewedCommerceQuoteInTransaction,
  prepareReviewedCommerceQuoteIssue,
} from "@ewatrade/db/commerce-quote-reviewed-issue"
import { commerceQuoteIssuePayloadHash } from "@ewatrade/db/commerce-quotes"
import type { Prisma } from "@ewatrade/db/types"
import { z } from "zod"
import {
  type GeneralQuoteIssueDraftScope,
  generalQuoteIssueDraftPayload,
  readGeneralQuoteIssueDraftInTransaction,
} from "./general-quote-issue-draft-store"
import { generalQuoteIssueNativeInput } from "./general-quote-issue-intent"
import { isProposalApprovalValid, proposalDigest } from "./proposal-security"

const id = z
  .string()
  .min(1)
  .max(191)
  .refine((value) => value === value.trim())
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const revision = z.number().int().positive().max(2_147_483_647)
const requestSchema = z
  .object({
    conversationId: id,
    draftRef: id,
    revision,
    decision: z.enum(["confirm", "cancel"]),
    approvalToken: z.string().max(128).optional(),
  })
  .strict()
const scopeSchema = z
  .object({
    actorUserId: id.max(128),
    tenantId: id.max(128),
    storeId: id.max(128),
  })
  .strict()
const receiptSchema = z
  .object({
    operation: z.enum(["issue", "revise"]),
    quoteId: id,
    quoteVersionId: id,
    sourceType: z.enum(["service_request", "commerce_inquiry"]),
    sourceId: id,
    origin: z.object({ tenantId: id, storeId: id }).strict(),
    currencyCode: z.string().regex(/^[A-Z]{3}$/),
    version: revision,
    status: z.enum(["DRAFT", "ISSUED"]),
    releaseState: z.enum(["pending_approval", "released"]),
    approvalId: id.nullable(),
    policyRevision: z
      .number()
      .int()
      .nonnegative()
      .max(2_147_483_647)
      .nullable(),
    createdAt: z.string().datetime(),
    issuedAt: z.string().datetime().nullable(),
    expiresAt: z.string().datetime().nullable(),
    optionCount: z.number().int().min(1).max(20),
  })
  .strict()
type Request = z.infer<typeof requestSchema>
export type GeneralQuoteIssueConfirmationReceipt = z.infer<typeof receiptSchema>
export type GeneralQuoteIssueConfirmationResult =
  | {
      kind: "completed"
      draftRef: string
      revision: number
      receipt: GeneralQuoteIssueConfirmationReceipt
    }
  | { kind: "cancelled"; draftRef: string; revision: number }
declare const planBrand: unique symbol
declare const preparedBrand: unique symbol
export type GeneralQuoteIssueConfirmationPlan = { readonly [planBrand]: true }
export type PreparedGeneralQuoteIssueConfirmation = {
  readonly [preparedBrand]: true
}
type DraftRead = Awaited<
  ReturnType<typeof readGeneralQuoteIssueDraftInTransaction>
>
type State = {
  scope: GeneralQuoteIssueDraftScope
  request: Pick<Request, "conversationId" | "draftRef" | "revision">
  rowBinding: string
  input: CommerceQuoteIssueReviewInput
  targetRevision: string
  publication: DraftRead["review"]["review"]["authority"]["legal"]["publication"]
}
const plans = new WeakMap<GeneralQuoteIssueConfirmationPlan, State>()
const prepared = new WeakMap<
  PreparedGeneralQuoteIssueConfirmation,
  { state: State; native: ReviewedCommerceQuoteIssue }
>()
const preparing = new WeakMap<
  GeneralQuoteIssueConfirmationPlan,
  Promise<PreparedGeneralQuoteIssueConfirmation>
>()

export class GeneralQuoteIssueConfirmationError extends Error {
  readonly code = "QUOTE_CONFIRMATION_CONFLICT"
  constructor(
    readonly reason:
      | "invalid_request"
      | "unavailable"
      | "stale"
      | "approval_unavailable"
      | "preparation_required"
      | "saved_result_unavailable",
  ) {
    super(
      "The exact quotation decision is unavailable. Keep the draft and review its current status.",
    )
    this.name = "GeneralQuoteIssueConfirmationError"
  }
}
function refuse(reason: GeneralQuoteIssueConfirmationError["reason"]): never {
  throw new GeneralQuoteIssueConfirmationError(reason)
}
function scalarRecord(raw: unknown) {
  assertCommerceQuoteReviewBudget({ json: raw }, 4096)
  if (
    raw === null ||
    typeof raw !== "object" ||
    types.isProxy(raw) ||
    Array.isArray(raw) ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(raw))
  )
    refuse("invalid_request")
  const values: [string, unknown][] = []
  for (const key of Reflect.ownKeys(raw)) {
    const descriptor = Object.getOwnPropertyDescriptor(raw, key)
    if (
      typeof key !== "string" ||
      !descriptor ||
      !("value" in descriptor) ||
      !descriptor.enumerable ||
      !["string", "number", "undefined"].includes(typeof descriptor.value)
    )
      refuse("invalid_request")
    values.push([key, descriptor.value])
  }
  return Object.fromEntries(values)
}
function inputs(scope: GeneralQuoteIssueDraftScope, raw: unknown) {
  try {
    return {
      scope: scopeSchema.parse(scalarRecord(scope)),
      request: requestSchema.parse(scalarRecord(raw)),
    }
  } catch {
    return refuse("invalid_request")
  }
}
function iso(value: Date | null) {
  if (value === null) return null
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    refuse("unavailable")
  return value.toISOString()
}
function fingerprint(row: AssistantActionProposal) {
  assertCommerceQuoteReviewBudget(row)
  return proposalDigest({
    ...row,
    expiresAt: iso(row.expiresAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    decidedAt: iso(row.decidedAt),
  })
}
function conversationWhere(
  scope: GeneralQuoteIssueDraftScope,
  conversationId: string,
) {
  return {
    id: conversationId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    ownerUserId: scope.actorUserId,
    purpose: "GENERAL" as const,
    status: "ACTIVE" as const,
  }
}
function proposalWhere(
  scope: GeneralQuoteIssueDraftScope,
  request: Pick<Request, "conversationId" | "draftRef">,
) {
  return {
    id: request.draftRef,
    conversationId: request.conversationId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    actorUserId: scope.actorUserId,
    conversation: conversationWhere(scope, request.conversationId),
  }
}
async function owned(
  tx: Prisma.TransactionClient,
  scope: GeneralQuoteIssueDraftScope,
  request: Request,
) {
  const conversation = await tx.assistantConversation.findFirst({
    where: conversationWhere(scope, request.conversationId),
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      ownerUserId: true,
      purpose: true,
      status: true,
    },
  })
  if (
    !conversation ||
    conversation.id !== request.conversationId ||
    conversation.tenantId !== scope.tenantId ||
    conversation.storeId !== scope.storeId ||
    conversation.ownerUserId !== scope.actorUserId ||
    conversation.purpose !== "GENERAL" ||
    conversation.status !== "ACTIVE"
  )
    refuse("unavailable")
  const found = await tx.assistantActionProposal.findFirst({
    where: proposalWhere(scope, request),
  })
  if (!found) refuse("unavailable")
  // Retain private data snapshots only, never this transaction or its delegates.
  assertCommerceQuoteReviewBudget(found)
  const row = structuredClone(found)
  if (
    row.id !== request.draftRef ||
    row.conversationId !== request.conversationId ||
    row.tenantId !== scope.tenantId ||
    row.storeId !== scope.storeId ||
    row.actorUserId !== scope.actorUserId ||
    row.revision !== request.revision ||
    !revision.safeParse(row.revision).success
  )
    refuse("stale")
  if (
    row.actionVersion !== 1 ||
    !id.safeParse(row.idempotencyKey).success ||
    !id.safeParse(row.roleSnapshot).success ||
    !hash.safeParse(row.payloadHash).success ||
    !hash.safeParse(row.approvalTokenHash).success ||
    !hash.safeParse(row.targetRevision).success ||
    iso(row.expiresAt) === null ||
    iso(row.createdAt) === null ||
    iso(row.updatedAt) === null
  )
    refuse("unavailable")
  const payload = generalQuoteIssueDraftPayload.safeParse(row.payload)
  if (
    !payload.success ||
    row.action !== payload.data.action ||
    row.targetRecordId !== payload.data.intent.source.id ||
    proposalDigest(row.payload) !== row.payloadHash ||
    proposalDigest(payload.data) !== row.payloadHash
  )
    refuse("unavailable")
  if (row.errorCode !== null) refuse("unavailable")
  return { row, payload: payload.data }
}
function assertApproval(
  row: AssistantActionProposal,
  request: Request,
  key: string,
) {
  if (
    typeof key !== "string" ||
    key.length < 32 ||
    !isProposalApprovalValid(
      row,
      request.approvalToken ?? "",
      key,
      new Date(Date.now()),
    )
  )
    refuse("approval_unavailable")
}
function sameState(
  state: State,
  scope: GeneralQuoteIssueDraftScope,
  request: Request,
) {
  return (
    state.scope.actorUserId === scope.actorUserId &&
    state.scope.tenantId === scope.tenantId &&
    state.scope.storeId === scope.storeId &&
    state.request.conversationId === request.conversationId &&
    state.request.draftRef === request.draftRef &&
    state.request.revision === request.revision
  )
}
function casWhere(
  scope: GeneralQuoteIssueDraftScope,
  request: Request,
  row: AssistantActionProposal,
) {
  return {
    ...proposalWhere(scope, request),
    action: row.action,
    actionVersion: row.actionVersion,
    revision: row.revision,
    payloadHash: row.payloadHash,
    idempotencyKey: row.idempotencyKey,
    roleSnapshot: row.roleSnapshot,
    targetRecordId: row.targetRecordId,
    targetRevision: row.targetRevision,
    approvalTokenHash: row.approvalTokenHash,
    updatedAt: row.updatedAt,
  }
}

const savedSelect = {
  id: true,
  quoteId: true,
  clientVersionId: true,
  payloadHash: true,
  version: true,
  status: true,
  currencyCode: true,
  createdByUserId: true,
  createdAt: true,
  issuedAt: true,
  expiresAt: true,
  quote: {
    select: {
      id: true,
      tenantId: true,
      storeId: true,
      sourceType: true,
      sourceId: true,
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

async function recoveryAuthority(
  tx: Prisma.TransactionClient,
  scope: GeneralQuoteIssueDraftScope,
  payload: z.infer<typeof generalQuoteIssueDraftPayload>,
) {
  const source = payload.intent.source
  const authority = await readCommerceQuoteIssueRecoveryAuthorityInTransaction(
    tx,
    { ...scope, sourceType: source.kind, vertical: "SERVICE" },
  )
  if (source.kind === "service_request") {
    const saved = await tx.serviceRequest.findFirst({
      where: {
        id: source.id,
        tenantId: scope.tenantId,
        storeId: scope.storeId,
      },
      select: { id: true, tenantId: true, storeId: true },
    })
    if (
      !saved ||
      saved.id !== source.id ||
      saved.tenantId !== scope.tenantId ||
      saved.storeId !== scope.storeId
    )
      refuse("unavailable")
  } else {
    const saved = await tx.commerceInquiry.findFirst({
      where: {
        id: source.id,
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        vertical: "SERVICE",
      },
      select: { id: true, tenantId: true, storeId: true, vertical: true },
    })
    if (
      !saved ||
      saved.id !== source.id ||
      saved.tenantId !== scope.tenantId ||
      saved.storeId !== scope.storeId ||
      saved.vertical !== "SERVICE"
    )
      refuse("unavailable")
  }
  return authority
}
async function recover(
  tx: Prisma.TransactionClient,
  scope: GeneralQuoteIssueDraftScope,
  request: Request,
  saved: Awaited<ReturnType<typeof owned>>,
): Promise<GeneralQuoteIssueConfirmationResult | null> {
  const { row, payload } = saved
  if (!["COMPLETED", "CANCELLED"].includes(row.status)) return null
  if (iso(row.decidedAt) === null) refuse("saved_result_unavailable")
  const authority = await recoveryAuthority(tx, scope, payload)
  if (row.status === "CANCELLED") {
    if (row.executedResult !== null || request.decision !== "cancel")
      refuse("unavailable")
    return { kind: "cancelled", draftRef: row.id, revision: row.revision }
  }
  if (request.decision !== "confirm") refuse("unavailable")
  const parsed = receiptSchema.safeParse(row.executedResult)
  if (!parsed.success) refuse("saved_result_unavailable")
  const receipt = parsed.data
  const source = payload.intent.source
  if (
    receipt.operation !== payload.intent.operation.kind ||
    receipt.sourceType !== source.kind ||
    receipt.sourceId !== source.id ||
    receipt.origin.tenantId !== scope.tenantId ||
    receipt.origin.storeId !== scope.storeId
  )
    refuse("saved_result_unavailable")
  const expectedSourceType =
    source.kind === "service_request" ? "SERVICE_REQUEST" : "COMMERCE_INQUIRY"
  const native = await tx.commerceQuoteVersion.findFirst({
    where: {
      id: receipt.quoteVersionId,
      quoteId: receipt.quoteId,
      quote: {
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        sourceType: expectedSourceType,
        sourceId: source.id,
      },
    },
    select: savedSelect,
  })
  if (
    !native ||
    native.id !== receipt.quoteVersionId ||
    native.quoteId !== receipt.quoteId ||
    native.quote.id !== receipt.quoteId ||
    native.quote.tenantId !== scope.tenantId ||
    native.quote.storeId !== scope.storeId ||
    native.quote.sourceId !== source.id ||
    native.quote.sourceType !== expectedSourceType ||
    native.createdByUserId !== scope.actorUserId
  )
    refuse("saved_result_unavailable")
  const nativeInput = generalQuoteIssueNativeInput(payload.intent, scope, {
    clientOperationId: row.idempotencyKey,
    ...(payload.intent.operation.kind === "revise"
      ? { existingClientQuoteId: native.quote.clientQuoteId }
      : {}),
  })
  if (
    native.quote.clientQuoteId !== nativeInput.clientQuoteId ||
    native.clientVersionId !== nativeInput.clientVersionId ||
    native.payloadHash !== commerceQuoteIssuePayloadHash(nativeInput) ||
    native.version !== receipt.version ||
    native.currencyCode !== receipt.currencyCode ||
    native._count.options !== receipt.optionCount ||
    receipt.optionCount !== payload.intent.options.length ||
    iso(native.createdAt) !== receipt.createdAt ||
    iso(native.expiresAt) !== receipt.expiresAt ||
    receipt.expiresAt !== (nativeInput.expiresAt?.toISOString() ?? null) ||
    ![
      "DRAFT",
      "ISSUED",
      "ACCEPTED",
      "DECLINED",
      "EXPIRED",
      "SUPERSEDED",
      "REVOKED",
    ].includes(native.status)
  )
    refuse("saved_result_unavailable")
  if (payload.intent.operation.kind === "issue" && receipt.version !== 1)
    refuse("saved_result_unavailable")
  if (payload.intent.operation.kind === "revise") {
    if (
      payload.intent.operation.quoteId !== receipt.quoteId ||
      receipt.version < 2
    )
      refuse("saved_result_unavailable")
    const previous = await tx.commerceQuoteVersion.findFirst({
      where: {
        id: payload.intent.operation.quoteVersionId,
        quoteId: receipt.quoteId,
        quote: {
          tenantId: scope.tenantId,
          storeId: scope.storeId,
          sourceType: expectedSourceType,
          sourceId: source.id,
        },
      },
      select: { id: true, quoteId: true, version: true },
    })
    if (
      !previous ||
      previous.id !== payload.intent.operation.quoteVersionId ||
      previous.quoteId !== receipt.quoteId ||
      previous.version >= receipt.version
    )
      refuse("saved_result_unavailable")
  }
  const approval = native.quoteApproval
  if (receipt.releaseState === "released") {
    if (
      receipt.status !== "ISSUED" ||
      receipt.approvalId !== null ||
      receipt.policyRevision !== null ||
      approval !== null ||
      receipt.issuedAt === null ||
      iso(native.issuedAt) !== receipt.issuedAt ||
      native.status === "DRAFT"
    )
      refuse("saved_result_unavailable")
  } else {
    if (
      receipt.status !== "DRAFT" ||
      receipt.issuedAt !== null ||
      receipt.approvalId === null ||
      receipt.policyRevision === null ||
      !approval ||
      approval.id !== receipt.approvalId ||
      approval.tenantId !== scope.tenantId ||
      approval.storeId !== scope.storeId ||
      approval.quoteId !== receipt.quoteId ||
      approval.quoteVersionId !== receipt.quoteVersionId ||
      approval.sourceType !== expectedSourceType ||
      approval.sourceId !== source.id ||
      approval.requesterMembershipId !== authority.actor.membershipId ||
      approval.policyRevision !== receipt.policyRevision ||
      !["PENDING", "APPROVED", "REJECTED", "SUPERSEDED"].includes(
        approval.status,
      ) ||
      (approval.status === "APPROVED"
        ? native.status === "DRAFT" || iso(native.issuedAt) === null
        : native.issuedAt !== null ||
          !["DRAFT", "SUPERSEDED", "REVOKED"].includes(native.status)) ||
      (approval.status === "PENDING" && native.status !== "DRAFT")
    )
      refuse("saved_result_unavailable")
  }
  // Return the historical issued/prepared receipt, not inferred current release,
  // currentVersion, eligibility, bearer capability or an unverified saved success.
  return {
    kind: "completed",
    draftRef: row.id,
    revision: row.revision,
    receipt,
  }
}
async function cancel(
  tx: Prisma.TransactionClient,
  scope: GeneralQuoteIssueDraftScope,
  request: Request,
  saved: Awaited<ReturnType<typeof owned>>,
): Promise<GeneralQuoteIssueConfirmationResult> {
  if (
    saved.row.status !== "PENDING" ||
    saved.row.executedResult !== null ||
    saved.row.decidedAt !== null
  )
    refuse("unavailable")
  await recoveryAuthority(tx, scope, saved.payload)
  const changed = await tx.assistantActionProposal.updateMany({
    where: { ...casWhere(scope, request, saved.row), status: "PENDING" },
    data: { status: "CANCELLED", decidedAt: new Date(Date.now()) },
  })
  if (changed.count !== 1) refuse("stale")
  const current = await owned(tx, scope, request)
  const result = await recover(tx, scope, request, current)
  if (!result || result.kind !== "cancelled") refuse("saved_result_unavailable")
  return result
}

/**
 * UNEXPOSED composition: caller owns fresh GENERAL Session/account/privacy/legal,
 * client/action/domain authority and Serializable TX. Public/channel inspection,
 * renderer/history and rollout registration remain required. Terminal reads never
 * run new-issuance gates, moderation, expiry/new approval or command execution.
 */
export async function inspectGeneralQuoteIssueConfirmationInTransaction(
  tx: Prisma.TransactionClient,
  serverScope: GeneralQuoteIssueDraftScope,
  raw: unknown,
  signingKey: string,
): Promise<
  | GeneralQuoteIssueConfirmationResult
  | { kind: "pending"; plan: GeneralQuoteIssueConfirmationPlan }
> {
  const { scope, request } = inputs(serverScope, raw)
  const saved = await owned(tx, scope, request)
  const terminal = await recover(tx, scope, request, saved)
  if (terminal) return terminal
  if (request.decision === "cancel") return cancel(tx, scope, request, saved)
  if (
    saved.row.status !== "PENDING" ||
    saved.row.executedResult !== null ||
    saved.row.decidedAt !== null
  )
    refuse("unavailable")
  assertApproval(saved.row, request, signingKey)
  const fresh = await readGeneralQuoteIssueDraftInTransaction(
    tx,
    {
      ...scope,
      conversationId: request.conversationId,
      draftRef: request.draftRef,
    },
    signingKey,
  )
  if (fingerprint(saved.row) !== fingerprint(fresh.row)) refuse("stale")
  const state: State = {
    scope,
    request: {
      conversationId: request.conversationId,
      draftRef: request.draftRef,
      revision: request.revision,
    },
    rowBinding: fingerprint(fresh.row),
    input: structuredClone(fresh.nativeInput),
    targetRevision: fresh.review.target.revision,
    publication: structuredClone(
      fresh.review.review.authority.legal.publication,
    ),
  }
  assertApproval(fresh.row, request, signingKey)
  const plan = Object.freeze({}) as GeneralQuoteIssueConfirmationPlan
  plans.set(plan, state)
  return { kind: "pending", plan }
}

/** MUST run after inspection TX has closed. No TX/delegate is retained in a plan. */
export async function prepareGeneralQuoteIssueConfirmation(
  plan: GeneralQuoteIssueConfirmationPlan,
): Promise<PreparedGeneralQuoteIssueConfirmation> {
  const state = plans.get(plan)
  if (!state) refuse("preparation_required")
  const existing = preparing.get(plan)
  if (existing) return existing
  const work = (async () => {
    const native = await prepareReviewedCommerceQuoteIssue(
      state.input,
      state.targetRevision,
      state.publication,
    )
    const handle = Object.freeze({}) as PreparedGeneralQuoteIssueConfirmation
    prepared.set(handle, { state, native })
    return handle
  })()
  preparing.set(plan, work)
  try {
    return await work
  } catch (error) {
    preparing.delete(plan)
    throw error
  }
}

/**
 * Caller owns one fresh authorized Serializable TX for claim + native issuer +
 * receipt. Any throw MUST roll that whole TX back. Retain the same opaque handle
 * for rollback retry; never persist/serialize it or invent another command ID.
 */
export async function confirmGeneralQuoteIssueInTransaction(
  tx: Prisma.TransactionClient,
  serverScope: GeneralQuoteIssueDraftScope,
  raw: unknown,
  signingKey: string,
  handle?: PreparedGeneralQuoteIssueConfirmation,
): Promise<GeneralQuoteIssueConfirmationResult> {
  const { scope, request } = inputs(serverScope, raw)
  const saved = await owned(tx, scope, request)
  const terminal = await recover(tx, scope, request, saved)
  if (terminal) return terminal
  if (request.decision === "cancel") return cancel(tx, scope, request, saved)
  const proof = handle ? prepared.get(handle) : undefined
  if (!proof || !sameState(proof.state, scope, request))
    refuse("preparation_required")
  if (
    saved.row.status !== "PENDING" ||
    saved.row.executedResult !== null ||
    saved.row.decidedAt !== null
  )
    refuse("unavailable")
  assertApproval(saved.row, request, signingKey)
  if (fingerprint(saved.row) !== proof.state.rowBinding) refuse("stale")
  const fresh = await readGeneralQuoteIssueDraftInTransaction(
    tx,
    {
      ...scope,
      conversationId: request.conversationId,
      draftRef: request.draftRef,
    },
    signingKey,
  )
  if (
    fingerprint(fresh.row) !== proof.state.rowBinding ||
    fresh.review.target.revision !== proof.state.targetRevision
  )
    refuse("stale")
  assertApproval(fresh.row, request, signingKey)
  const changed = await tx.assistantActionProposal.updateMany({
    where: {
      ...casWhere(scope, request, fresh.row),
      status: "PENDING",
      expiresAt: { equals: fresh.row.expiresAt, gt: new Date(Date.now()) },
    },
    data: { status: "EXECUTING" },
  })
  if (changed.count !== 1) refuse("stale")
  const executing = await owned(tx, scope, request)
  if (
    executing.row.status !== "EXECUTING" ||
    fingerprint({
      ...executing.row,
      status: "PENDING",
      updatedAt: fresh.row.updatedAt,
    }) !== fingerprint(fresh.row)
  )
    refuse("stale")
  const receipt = receiptSchema.parse(
    await issueReviewedCommerceQuoteInTransaction(tx, proof.native),
  )
  const completed = await tx.assistantActionProposal.updateMany({
    where: { ...casWhere(scope, request, executing.row), status: "EXECUTING" },
    data: {
      status: "COMPLETED",
      executedResult: receipt,
      decidedAt: new Date(Date.now()),
    },
  })
  if (completed.count !== 1) refuse("stale")
  const current = await owned(tx, scope, request)
  const result = await recover(tx, scope, request, current)
  if (
    !result ||
    result.kind !== "completed" ||
    proposalDigest(result.receipt) !== proposalDigest(receipt)
  )
    refuse("saved_result_unavailable")
  return result
}

import { quoteIssueIntent } from "@ewatrade/assistant/general/quote-issue-intent"
import type { AssistantActionProposal } from "@ewatrade/db/browser"
import { reviewCommerceQuoteIssueReadOnlyInTransaction } from "@ewatrade/db/commerce-quote-issue-review"
import { assertCommerceQuoteReviewBudget } from "@ewatrade/db/commerce-quote-review-budget"
import type { Prisma } from "@ewatrade/db/types"
import { z } from "zod"
import {
  applyGeneralQuoteIssueDraftEdit,
  parseGeneralQuoteIssueDraftEditRequest,
} from "./general-quote-issue-draft-edit"
import { generalQuoteIssueNativeInput } from "./general-quote-issue-intent"
import { proposalApprovalToken, proposalDigest } from "./proposal-security"

const MAX_REVISION = 2_147_483_647
const identity = z
  .string()
  .min(1)
  .max(191)
  .refine((value) => value.trim() === value)
const scopeIdentity = identity.max(128)
const scopeSchema = z
  .object({
    actorUserId: scopeIdentity,
    tenantId: scopeIdentity,
    storeId: scopeIdentity,
  })
  .strict()
const serverIdsSchema = z
  .object({ proposalId: identity, idempotencyKey: identity })
  .strict()
const hash = /^[a-f0-9]{64}$/

/** Internal payload only; deliberately absent from GENERAL public action/history. */
export const generalQuoteIssueDraftPayload = z
  .object({
    action: z.enum(["commerce_quote_issue", "commerce_quote_revise"]),
    intent: quoteIssueIntent,
  })
  .strict()
  .superRefine((payload, context) => {
    if (payload.action !== `commerce_quote_${payload.intent.operation.kind}`)
      context.addIssue({
        code: "custom",
        message: "Keep the exact quotation operation.",
      })
  })
export type GeneralQuoteIssueDraftPayload = z.infer<
  typeof generalQuoteIssueDraftPayload
>
export type GeneralQuoteIssueDraftScope = z.infer<typeof scopeSchema>
type ConversationScope = GeneralQuoteIssueDraftScope & {
  conversationId: string
}

export class GeneralQuoteIssueDraftStoreError extends Error {
  constructor(
    readonly reason:
      | "invalid_input"
      | "unavailable"
      | "invalid_binding"
      | "terminal"
      | "expired"
      | "stale_review"
      | "stale_draft"
      | "idempotency_conflict"
      | "signing_unavailable",
  ) {
    super(
      "The quotation draft is unavailable. Keep it unchanged and review it again.",
    )
    this.name = "GeneralQuoteIssueDraftStoreError"
  }
}
function refuse(reason: GeneralQuoteIssueDraftStoreError["reason"]): never {
  throw new GeneralQuoteIssueDraftStoreError(reason)
}
function scopeSnapshot(input: ConversationScope): ConversationScope {
  const scope = scopeSchema.safeParse({
    actorUserId: input.actorUserId,
    tenantId: input.tenantId,
    storeId: input.storeId,
  })
  const conversation = identity.safeParse(input.conversationId)
  if (!scope.success || !conversation.success) refuse("invalid_input")
  return { ...scope.data, conversationId: conversation.data }
}
function signingKey(secret: string) {
  if (typeof secret !== "string" || secret.length < 32)
    refuse("signing_unavailable")
  return secret
}
function parsePayload(raw: unknown): GeneralQuoteIssueDraftPayload {
  // Bound before recursive digest allocation. Clone before Zod so ignored hidden
  // properties/getters cannot be read by schema traversal; no provider callbacks.
  assertCommerceQuoteReviewBudget(raw)
  let snapshot: unknown
  try {
    snapshot = structuredClone(raw)
  } catch {
    refuse("invalid_input")
  }
  const parsed = generalQuoteIssueDraftPayload.safeParse(snapshot)
  if (!parsed.success) refuse("invalid_input")
  return parsed.data
}
function conversationWhere(scope: ConversationScope) {
  return {
    id: scope.conversationId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    ownerUserId: scope.actorUserId,
    purpose: "GENERAL" as const,
    status: "ACTIVE" as const,
  }
}
function proposalWhere(scope: ConversationScope, draftRef: string) {
  return {
    id: draftRef,
    conversationId: scope.conversationId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    actorUserId: scope.actorUserId,
    conversation: conversationWhere(scope),
  }
}
async function requireConversation(
  tx: Prisma.TransactionClient,
  scope: ConversationScope,
) {
  const row = await tx.assistantConversation.findFirst({
    where: conversationWhere(scope),
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
    !row ||
    row.id !== scope.conversationId ||
    row.tenantId !== scope.tenantId ||
    row.storeId !== scope.storeId ||
    row.ownerUserId !== scope.actorUserId ||
    row.purpose !== "GENERAL" ||
    row.status !== "ACTIVE"
  )
    refuse("unavailable")
}
function intact(
  row: AssistantActionProposal,
  scope: ConversationScope,
  secret: string,
) {
  if (
    !identity.safeParse(row.id).success ||
    row.conversationId !== scope.conversationId ||
    row.tenantId !== scope.tenantId ||
    row.storeId !== scope.storeId ||
    row.actorUserId !== scope.actorUserId
  )
    refuse("invalid_binding")
  if (row.status !== "PENDING") refuse("terminal")
  if (
    row.actionVersion !== 1 ||
    !Number.isSafeInteger(row.revision) ||
    row.revision < 1 ||
    row.revision > MAX_REVISION ||
    !identity.safeParse(row.idempotencyKey).success ||
    !identity.safeParse(row.roleSnapshot).success ||
    !(row.expiresAt instanceof Date) ||
    !Number.isFinite(row.expiresAt.getTime()) ||
    row.executedResult !== null ||
    row.errorCode !== null ||
    row.decidedAt !== null ||
    !hash.test(row.payloadHash) ||
    !hash.test(row.approvalTokenHash) ||
    !row.targetRevision ||
    !hash.test(row.targetRevision)
  )
    refuse("invalid_binding")
  const payload = parsePayload(row.payload)
  if (
    row.action !== payload.action ||
    row.targetRecordId !== payload.intent.source.id ||
    proposalDigest(row.payload) !== row.payloadHash ||
    proposalDigest(payload) !== row.payloadHash ||
    proposalDigest(proposalApprovalToken(row, secret)) !== row.approvalTokenHash
  )
    refuse("invalid_binding")
  return payload
}
function requireUnexpired(row: AssistantActionProposal) {
  if (row.expiresAt.getTime() <= Date.now()) refuse("expired")
}
async function load(
  tx: Prisma.TransactionClient,
  scope: ConversationScope,
  draftRef: string,
  secret: string,
) {
  if (!identity.safeParse(draftRef).success) refuse("invalid_input")
  await requireConversation(tx, scope)
  const row = await tx.assistantActionProposal.findFirst({
    where: proposalWhere(scope, draftRef),
  })
  if (!row || row.id !== draftRef) refuse("unavailable")
  return { row, payload: intact(row, scope, secret) }
}
async function reviewed(
  tx: Prisma.TransactionClient,
  scope: ConversationScope,
  payload: GeneralQuoteIssueDraftPayload,
  idempotencyKey: string,
) {
  let existingClientQuoteId: string | undefined
  if (payload.intent.operation.kind === "revise") {
    const operation = payload.intent.operation
    const source = payload.intent.source
    const quote = await tx.commerceQuote.findFirst({
      where: {
        id: operation.quoteId,
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        sourceId: source.id,
        sourceType:
          source.kind === "service_request"
            ? "SERVICE_REQUEST"
            : "COMMERCE_INQUIRY",
      },
      select: {
        id: true,
        tenantId: true,
        storeId: true,
        sourceId: true,
        sourceType: true,
        clientQuoteId: true,
        currentVersionId: true,
      },
    })
    if (
      !quote ||
      quote.id !== operation.quoteId ||
      quote.tenantId !== scope.tenantId ||
      quote.storeId !== scope.storeId ||
      quote.sourceId !== source.id ||
      quote.sourceType !==
        (source.kind === "service_request"
          ? "SERVICE_REQUEST"
          : "COMMERCE_INQUIRY") ||
      quote.currentVersionId !== operation.quoteVersionId ||
      !identity.safeParse(quote.clientQuoteId).success
    )
      refuse("stale_review")
    existingClientQuoteId = quote.clientQuoteId
  }
  const nativeInput = generalQuoteIssueNativeInput(payload.intent, scope, {
    clientOperationId: idempotencyKey,
    ...(existingClientQuoteId ? { existingClientQuoteId } : {}),
  })
  const review = await reviewCommerceQuoteIssueReadOnlyInTransaction(
    tx,
    nativeInput,
  )
  if (
    review.target.id !== payload.intent.source.id ||
    !hash.test(review.target.revision) ||
    review.review.authority.actor.userId !== scope.actorUserId ||
    review.review.authority.store.id !== scope.storeId ||
    review.review.authority.store.tenantId !== scope.tenantId
  )
    refuse("invalid_binding")
  return { nativeInput, review }
}
function requireSameReview(
  row: AssistantActionProposal,
  review: Awaited<ReturnType<typeof reviewed>>["review"],
) {
  if (
    row.targetRecordId !== review.target.id ||
    row.targetRevision !== review.target.revision ||
    row.roleSnapshot !== review.review.authority.actor.role
  )
    refuse("stale_review")
}
function compact(row: AssistantActionProposal) {
  return {
    draftRef: row.id,
    revision: row.revision,
    status: "PENDING" as const,
    expiresAt: row.expiresAt.toISOString(),
  }
}
type ExpectedBinding = Pick<
  AssistantActionProposal,
  | "id"
  | "action"
  | "revision"
  | "payloadHash"
  | "idempotencyKey"
  | "roleSnapshot"
  | "targetRecordId"
  | "targetRevision"
  | "expiresAt"
  | "approvalTokenHash"
>
async function readBack(
  tx: Prisma.TransactionClient,
  scope: ConversationScope,
  expected: ExpectedBinding,
  secret: string,
) {
  const saved = await load(tx, scope, expected.id, secret)
  for (const field of [
    "id",
    "action",
    "revision",
    "payloadHash",
    "idempotencyKey",
    "roleSnapshot",
    "targetRecordId",
    "targetRevision",
    "approvalTokenHash",
  ] as const)
    if (saved.row[field] !== expected[field]) refuse("invalid_binding")
  if (saved.row.expiresAt.getTime() !== expected.expiresAt.getTime())
    refuse("invalid_binding")
  requireUnexpired(saved.row)
  return compact(saved.row)
}

/**
 * Caller owns fresh authenticated/authorized Serializable transaction and rollout.
 * Compose the existing fresh GENERAL account/session/privacy guards and client/
 * capability gates first; this internal composer does not replace those entrypoints.
 * Server IDs must be allocated once OUTSIDE transaction retry. Internal only: this
 * unregistered payload stays unavailable in ordinary GENERAL history. No execution,
 * screening, token return, nested transaction, receipt or domain write occurs here.
 */
export async function createGeneralQuoteIssueDraftInTransaction(
  tx: Prisma.TransactionClient,
  input: ConversationScope & { payload: unknown },
  serverIds: { proposalId: string; idempotencyKey: string },
  secret: string,
) {
  const scope = scopeSnapshot(input)
  const key = signingKey(secret)
  const ids = serverIdsSchema.safeParse(serverIds)
  if (!ids.success) refuse("invalid_input")
  const payload = parsePayload(input.payload)
  await requireConversation(tx, scope)
  const byId = await tx.assistantActionProposal.findUnique({
    where: { id: ids.data.proposalId },
  })
  const byKey = await tx.assistantActionProposal.findUnique({
    where: {
      tenantId_actorUserId_idempotencyKey: {
        tenantId: scope.tenantId,
        actorUserId: scope.actorUserId,
        idempotencyKey: ids.data.idempotencyKey,
      },
    },
  })
  if (byId || byKey) {
    if (
      !byId ||
      !byKey ||
      byId.id !== byKey.id ||
      byId.id !== ids.data.proposalId ||
      byId.idempotencyKey !== ids.data.idempotencyKey
    )
      refuse("idempotency_conflict")
    const saved = intact(byId, scope, key)
    if (proposalDigest(saved) !== proposalDigest(payload))
      refuse("idempotency_conflict")
    requireUnexpired(byId)
    const fresh = await reviewed(tx, scope, saved, byId.idempotencyKey)
    requireSameReview(byId, fresh.review)
    requireUnexpired(byId)
    return compact(byId)
  }
  const fresh = await reviewed(tx, scope, payload, ids.data.idempotencyKey)
  const binding = {
    id: ids.data.proposalId,
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    actorUserId: scope.actorUserId,
    action: payload.action,
    revision: 1,
    payloadHash: proposalDigest(payload),
    idempotencyKey: ids.data.idempotencyKey,
    roleSnapshot: fresh.review.review.authority.actor.role,
    targetRecordId: fresh.review.target.id,
    targetRevision: fresh.review.target.revision,
    expiresAt: new Date(Date.now() + 15 * 60_000),
  }
  const approvalTokenHash = proposalDigest(proposalApprovalToken(binding, key))
  await tx.assistantActionProposal.create({
    data: {
      ...binding,
      conversationId: scope.conversationId,
      actionVersion: 1,
      status: "PENDING",
      payload,
      approvalTokenHash,
    },
  })
  return readBack(tx, scope, { ...binding, approvalTokenHash }, key)
}

/** SERVER ONLY: full saved row/native input/canonical review; never model/app DTO. */
export async function readGeneralQuoteIssueDraftInTransaction(
  tx: Prisma.TransactionClient,
  input: ConversationScope & { draftRef: string },
  secret: string,
) {
  const scope = scopeSnapshot(input)
  const key = signingKey(secret)
  const draftRef = identity.safeParse(input.draftRef)
  if (!draftRef.success) refuse("invalid_input")
  const saved = await load(tx, scope, draftRef.data, key)
  requireUnexpired(saved.row)
  const fresh = await reviewed(
    tx,
    scope,
    saved.payload,
    saved.row.idempotencyKey,
  )
  requireSameReview(saved.row, fresh.review)
  requireUnexpired(saved.row)
  return { ...saved, ...fresh }
}

/** Explicit edit may renew expired PENDING drafts; every old approval is replaced. */
export async function editGeneralQuoteIssueDraftInTransaction(
  tx: Prisma.TransactionClient,
  input: ConversationScope & { request: unknown },
  secret: string,
) {
  const scope = scopeSnapshot(input)
  const key = signingKey(secret)
  const request = parseGeneralQuoteIssueDraftEditRequest(input.request)
  const saved = await load(tx, scope, request.draftRef, key)
  const next = applyGeneralQuoteIssueDraftEdit(
    {
      draftRef: saved.row.id,
      revision: saved.row.revision,
      intent: saved.payload.intent,
    },
    request,
  )
  const payload = parsePayload({
    action: saved.payload.action,
    intent: next.intent,
  })
  const fresh = await reviewed(tx, scope, payload, saved.row.idempotencyKey)
  const binding = {
    ...saved.row,
    payloadHash: proposalDigest(payload),
    revision: next.revision,
    roleSnapshot: fresh.review.review.authority.actor.role,
    targetRecordId: fresh.review.target.id,
    targetRevision: fresh.review.target.revision,
    expiresAt: new Date(Date.now() + 15 * 60_000),
  }
  const approvalTokenHash = proposalDigest(proposalApprovalToken(binding, key))
  const changed = await tx.assistantActionProposal.updateMany({
    where: {
      ...proposalWhere(scope, saved.row.id),
      status: "PENDING",
      action: saved.row.action,
      actionVersion: 1,
      revision: saved.row.revision,
      payloadHash: saved.row.payloadHash,
      idempotencyKey: saved.row.idempotencyKey,
    },
    data: {
      payload,
      payloadHash: binding.payloadHash,
      revision: binding.revision,
      roleSnapshot: binding.roleSnapshot,
      targetRecordId: binding.targetRecordId,
      targetRevision: binding.targetRevision,
      expiresAt: binding.expiresAt,
      approvalTokenHash,
    },
  })
  if (changed.count !== 1) refuse("stale_draft")
  return readBack(tx, scope, { ...binding, approvalTokenHash }, key)
}

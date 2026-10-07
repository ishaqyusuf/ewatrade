import { createHash, randomUUID } from "node:crypto"
import {
  type AssistantConversationStatus,
  Prisma,
  type SetupDraftEntityKind,
  type SetupDraftEntityState,
} from "../../generated/prisma/client"
import { claimAssistantAttachmentsForMessage } from "./assistant-attachments"
import type { DbClient } from "./types"

export type AssistantScope = {
  tenantId: string
  storeId: string
  userId: string
}

export type AssistantStoredMessage = {
  id: string
  role: "assistant" | "system" | "user"
  parts: Prisma.InputJsonValue
}

export type SetupDraftEntityInput = {
  key: string
  kind: SetupDraftEntityKind
  payload: Prisma.InputJsonValue
  source?: Prisma.InputJsonValue | null
  openQuestions?: Prisma.InputJsonValue | null
  state: Extract<SetupDraftEntityState, "NEEDS_INPUT" | "PROPOSED">
}

export class AssistantRecordError extends Error {
  constructor(
    readonly code:
      | "BUDGET_EXHAUSTED"
      | "CONVERSATION_CLOSED"
      | "CONVERSATION_NOT_FOUND"
      | "ENTITY_COMMITTED"
      | "ENTITY_NOT_FOUND",
    message: string,
  ) {
    super(message)
    this.name = "AssistantRecordError"
  }
}

const transactionOptions = { maxWait: 10_000, timeout: 30_000 }
const hash = (value: string) => createHash("sha256").update(value).digest("hex")

const conversationSelect = {
  id: true,
  status: true,
  ownerUserId: true,
  tenantId: true,
  storeId: true,
  title: true,
  setupDraft: { select: { id: true, revision: true } },
} satisfies Prisma.AssistantConversationSelect

/** One Setup conversation per Store: owners and admins share its draft. */
export async function findSetupConversation(
  db: DbClient,
  scope: Pick<AssistantScope, "storeId" | "tenantId">,
) {
  return db.assistantConversation.findFirst({
    where: {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      purpose: "SETUP",
      status: { not: "ARCHIVED" },
    },
    orderBy: { createdAt: "desc" },
    select: conversationSelect,
  })
}

export async function createSetupConversation(
  db: DbClient,
  scope: AssistantScope,
  initialMessages: AssistantStoredMessage[],
) {
  const create = async (tx: Prisma.TransactionClient) => {
    const existing = await findSetupConversation(tx, scope)
    if (existing) return existing
    const conversation = await tx.assistantConversation.create({
      data: {
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        ownerUserId: scope.userId,
        purpose: "SETUP",
        status: "OFFERED",
        title: "Business setup",
        lastSequence: initialMessages.length,
        setupDraft: {
          create: { tenantId: scope.tenantId, storeId: scope.storeId },
        },
        messages: {
          create: initialMessages.map((message, index) => ({
            id: message.id,
            role: message.role,
            parts: message.parts,
            sequence: index + 1,
          })),
        },
      },
      select: conversationSelect,
    })
    return conversation
  }
  return "$transaction" in db
    ? db.$transaction(create, transactionOptions)
    : create(db)
}

export async function readAssistantConversation(
  db: DbClient,
  scope: Pick<AssistantScope, "storeId" | "tenantId">,
  conversationId: string,
) {
  const conversation = await db.assistantConversation.findFirst({
    where: {
      id: conversationId,
      tenantId: scope.tenantId,
      storeId: scope.storeId,
    },
    select: conversationSelect,
  })
  if (!conversation)
    throw new AssistantRecordError(
      "CONVERSATION_NOT_FOUND",
      "This conversation is not available.",
    )
  return conversation
}

export async function listAssistantMessages(
  db: DbClient,
  conversationId: string,
  options: { limit?: number } = {},
) {
  const rows = await db.assistantMessage.findMany({
    where: { conversationId },
    orderBy: { sequence: "desc" },
    take: options.limit ?? 200,
    select: { id: true, role: true, parts: true, sequence: true },
  })
  return rows.reverse()
}

export async function setAssistantConversationStatus(
  db: DbClient,
  input: {
    conversationId: string
    from: AssistantConversationStatus[]
    to: AssistantConversationStatus
    appendMessages?: AssistantStoredMessage[]
  },
) {
  const update = async (tx: Prisma.TransactionClient) => {
    const result = await tx.assistantConversation.updateMany({
      where: { id: input.conversationId, status: { in: input.from } },
      data: { status: input.to },
    })
    if (result.count === 0) return false
    for (const message of input.appendMessages ?? [])
      await appendAssistantMessage(tx, {
        conversationId: input.conversationId,
        message,
      })
    return true
  }
  return "$transaction" in db
    ? db.$transaction(update, transactionOptions)
    : update(db)
}

/** Sequence allocation and insert share one statement order; replays are no-ops. */
export async function appendAssistantMessage(
  db: DbClient,
  input: {
    conversationId: string
    message: AssistantStoredMessage
    clientRequestId?: string
  },
) {
  const existing = await db.assistantMessage.findUnique({
    where: { id: input.message.id },
    select: { id: true, conversationId: true },
  })
  if (existing) return existing.conversationId === input.conversationId
  const { lastSequence } = await db.assistantConversation.update({
    where: { id: input.conversationId },
    data: { lastSequence: { increment: 1 } },
    select: { lastSequence: true },
  })
  await db.assistantMessage.create({
    data: {
      id: input.message.id,
      conversationId: input.conversationId,
      role: input.message.role,
      parts: input.message.parts,
      sequence: lastSequence,
      clientRequestId: input.clientRequestId,
    },
  })
  return true
}

export function newAssistantMessageId() {
  return `msg_${randomUUID()}`
}

/** Idempotent per actor/request: a replayed request never runs the model twice. */
export async function beginAssistantRun(
  db: DbClient,
  input: {
    actorUserId: string
    conversationId: string
    model: string
    promptVersion: string
    provider: string
    requestId: string
    userMessage: AssistantStoredMessage
    /** READY attachments sent with this message; bound in the same transaction. */
    attachmentIds?: string[]
  },
) {
  const begin = async (tx: Prisma.TransactionClient) => {
    const prior = await tx.assistantRun.findUnique({
      where: {
        actorUserId_requestId: {
          actorUserId: input.actorUserId,
          requestId: input.requestId,
        },
      },
      select: { id: true, conversationId: true, status: true },
    })
    if (prior) return { replay: true as const, run: prior }
    await claimAssistantAttachmentsForMessage(tx, {
      conversationId: input.conversationId,
      actorUserId: input.actorUserId,
      messageId: input.userMessage.id,
      attachmentIds: input.attachmentIds ?? [],
    })
    await appendAssistantMessage(tx, {
      conversationId: input.conversationId,
      message: input.userMessage,
      clientRequestId: input.requestId,
    })
    const run = await tx.assistantRun.create({
      data: {
        actorUserId: input.actorUserId,
        conversationId: input.conversationId,
        model: input.model,
        promptVersion: input.promptVersion,
        provider: input.provider,
        requestId: input.requestId,
      },
      select: { id: true, conversationId: true, status: true },
    })
    return { replay: false as const, run }
  }
  return "$transaction" in db
    ? db.$transaction(begin, transactionOptions)
    : begin(db)
}

/** Run status for reconnecting after a dropped stream; only the actor's own runs. */
export async function readAssistantRun(
  db: DbClient,
  scope: AssistantScope,
  runId: string,
) {
  return db.assistantRun.findFirst({
    where: {
      id: runId,
      actorUserId: scope.userId,
      conversation: { tenantId: scope.tenantId, storeId: scope.storeId },
    },
    select: {
      id: true,
      conversationId: true,
      status: true,
      errorCode: true,
      startedAt: true,
      completedAt: true,
    },
  })
}

/**
 * Cheap re-check before each draft write inside a turn: the actor is still an
 * active owner/admin of the Tenant and this Store's setup is still open.
 */
export async function isSetupActorStillAuthorized(
  db: DbClient,
  scope: AssistantScope,
  conversationId: string,
) {
  const [membership, conversation] = await Promise.all([
    db.membership.findFirst({
      where: {
        tenantId: scope.tenantId,
        userId: scope.userId,
        status: "ACTIVE",
        role: { in: ["OWNER", "ADMIN"] },
        tenant: { isActive: true },
      },
      select: { id: true },
    }),
    db.assistantConversation.findFirst({
      where: {
        id: conversationId,
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        status: "ACTIVE",
      },
      select: { id: true },
    }),
  ])
  return Boolean(membership && conversation)
}

export type AssistantUsage = {
  cachedInputTokens?: number
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export async function completeAssistantRun(
  db: DbClient,
  input: {
    runId: string
    tenantId: string
    actorUserId: string
    provider: string
    model: string
    status: "COMPLETED" | "FAILED"
    errorCode?: string
    usage?: AssistantUsage
    stepCount?: number
    durationMs?: number
    assistantMessage?: AssistantStoredMessage
    budgetScopeKey?: string
  },
) {
  const complete = async (tx: Prisma.TransactionClient) => {
    const run = await tx.assistantRun.update({
      where: { id: input.runId },
      data: {
        status: input.status,
        errorCode: input.errorCode,
        completedAt: new Date(),
      },
      select: { conversationId: true },
    })
    if (input.assistantMessage)
      await appendAssistantMessage(tx, {
        conversationId: run.conversationId,
        message: input.assistantMessage,
      })
    await tx.assistantUsageEvent.create({
      data: {
        runId: input.runId,
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        provider: input.provider,
        model: input.model,
        inputTokens: input.usage?.inputTokens,
        cachedInputTokens: input.usage?.cachedInputTokens,
        outputTokens: input.usage?.outputTokens,
        totalTokens: input.usage?.totalTokens,
        stepCount: input.stepCount ?? 0,
        durationMs: input.durationMs,
        outcome: input.status === "COMPLETED" ? "success" : "failed",
      },
    })
    if (input.budgetScopeKey && input.usage?.totalTokens)
      await tx.assistantBudget.update({
        where: { scopeKey: input.budgetScopeKey },
        data: { tokens: { increment: input.usage.totalTokens } },
      })
  }
  return "$transaction" in db
    ? db.$transaction(complete, transactionOptions)
    : complete(db)
}

export type AssistantBudgetLimits = {
  maxRequests: number
  maxTokens: number
  windowMs: number
}

export function assistantBudgetScopeKey(tenantId: string, purpose: string) {
  return hash(`assistant:${purpose}:${tenantId}`)
}

/** Row-locked rolling budget; exhaustion blocks new model calls, never drafts. */
export async function reserveAssistantBudget(
  db: DbClient,
  input: { scopeKey: string; limits: AssistantBudgetLimits },
) {
  const reserve = async (tx: Prisma.TransactionClient) => {
    const now = new Date()
    await tx.assistantBudget.upsert({
      where: { scopeKey: input.scopeKey },
      create: { scopeKey: input.scopeKey, windowStartedAt: now },
      update: {},
    })
    const [budget] = await tx.$queryRaw<
      Array<{ requests: number; tokens: number; windowStartedAt: Date }>
    >(Prisma.sql`
      SELECT "requests", "tokens", "windowStartedAt" FROM "AssistantBudget"
      WHERE "scopeKey" = ${input.scopeKey} FOR UPDATE
    `)
    if (!budget) return { allowed: false as const, remainingRequests: 0 }
    const reset =
      now.getTime() - budget.windowStartedAt.getTime() >= input.limits.windowMs
    const requests = reset ? 0 : budget.requests
    const tokens = reset ? 0 : budget.tokens
    if (
      requests >= input.limits.maxRequests ||
      tokens >= input.limits.maxTokens
    )
      return { allowed: false as const, remainingRequests: 0 }
    await tx.assistantBudget.update({
      where: { scopeKey: input.scopeKey },
      data: reset
        ? {
            windowStartedAt: now,
            requests: 1,
            tokens: 0,
            audioSeconds: 0,
            visionImages: 0,
          }
        : { requests: { increment: 1 } },
    })
    return {
      allowed: true as const,
      remainingRequests: input.limits.maxRequests - requests - 1,
    }
  }
  return "$transaction" in db
    ? db.$transaction(reserve, transactionOptions)
    : reserve(db)
}

export type AssistantMediaBudgetLimits = {
  maxAudioSeconds: number
  maxVisionImages: number
  windowMs: number
}

/**
 * Reserves transcription seconds or vision images against the same rolling
 * window as chat turns. Exhaustion refuses the media step, never the draft.
 */
export async function reserveAssistantMediaBudget(
  db: DbClient,
  input: {
    scopeKey: string
    limits: AssistantMediaBudgetLimits
    audioSeconds?: number
    images?: number
  },
) {
  const audioSeconds = Math.max(0, Math.ceil(input.audioSeconds ?? 0))
  const images = Math.max(0, Math.ceil(input.images ?? 0))
  const reserve = async (tx: Prisma.TransactionClient) => {
    const now = new Date()
    await tx.assistantBudget.upsert({
      where: { scopeKey: input.scopeKey },
      create: { scopeKey: input.scopeKey, windowStartedAt: now },
      update: {},
    })
    const [budget] = await tx.$queryRaw<
      Array<{
        audioSeconds: number
        visionImages: number
        windowStartedAt: Date
      }>
    >(Prisma.sql`
      SELECT "audioSeconds", "visionImages", "windowStartedAt" FROM "AssistantBudget"
      WHERE "scopeKey" = ${input.scopeKey} FOR UPDATE
    `)
    if (!budget) return { allowed: false as const }
    const reset =
      now.getTime() - budget.windowStartedAt.getTime() >= input.limits.windowMs
    const usedAudio = reset ? 0 : budget.audioSeconds
    const usedImages = reset ? 0 : budget.visionImages
    if (
      usedAudio + audioSeconds > input.limits.maxAudioSeconds ||
      usedImages + images > input.limits.maxVisionImages
    )
      return { allowed: false as const }
    await tx.assistantBudget.update({
      where: { scopeKey: input.scopeKey },
      data: reset
        ? {
            windowStartedAt: now,
            requests: 0,
            tokens: 0,
            audioSeconds,
            visionImages: images,
          }
        : {
            audioSeconds: { increment: audioSeconds },
            visionImages: { increment: images },
          },
    })
    return { allowed: true as const }
  }
  return "$transaction" in db
    ? db.$transaction(reserve, transactionOptions)
    : reserve(db)
}

/** Usage for attachment work (transcription, vision, parsing) outside a run. */
export async function recordAssistantAttachmentUsage(
  db: DbClient,
  input: {
    attachmentId: string
    tenantId: string
    actorUserId: string
    provider: string
    model: string
    requestClass: "transcribe" | "vision" | "extract"
    outcome: "success" | "failed"
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    audioSeconds?: number
    imageCount?: number
    durationMs?: number
    budgetScopeKey?: string
  },
) {
  const record = async (tx: Prisma.TransactionClient) => {
    await tx.assistantUsageEvent.create({
      data: {
        attachmentId: input.attachmentId,
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        provider: input.provider,
        model: input.model,
        requestClass: input.requestClass,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        totalTokens: input.totalTokens,
        audioSeconds: input.audioSeconds,
        imageCount: input.imageCount,
        durationMs: input.durationMs,
        outcome: input.outcome,
      },
    })
    if (input.budgetScopeKey && input.totalTokens)
      await tx.assistantBudget.updateMany({
        where: { scopeKey: input.budgetScopeKey },
        data: { tokens: { increment: input.totalTokens } },
      })
  }
  return "$transaction" in db
    ? db.$transaction(record, transactionOptions)
    : record(db)
}

const entitySelect = {
  id: true,
  key: true,
  kind: true,
  state: true,
  payload: true,
  source: true,
  openQuestions: true,
  sortOrder: true,
  committedRecordId: true,
  errorCode: true,
  updatedAt: true,
} satisfies Prisma.SetupDraftEntitySelect

export async function readSetupDraft(db: DbClient, draftId: string) {
  return db.setupDraft.findUniqueOrThrow({
    where: { id: draftId },
    select: {
      id: true,
      revision: true,
      entities: { orderBy: { sortOrder: "asc" }, select: entitySelect },
    },
  })
}

/** Model and owner edits both reopen confirmation; committed records are immutable. */
export async function upsertSetupDraftEntities(
  db: DbClient,
  input: { draftId: string; entities: SetupDraftEntityInput[] },
) {
  const upsert = async (tx: Prisma.TransactionClient) => {
    const draft = await tx.setupDraft.update({
      where: { id: input.draftId },
      data: { revision: { increment: 1 } },
      select: { revision: true, _count: { select: { entities: true } } },
    })
    const existing = await tx.setupDraftEntity.findMany({
      where: {
        draftId: input.draftId,
        key: { in: input.entities.map((entity) => entity.key) },
      },
      select: { key: true, state: true },
    })
    const states = new Map(existing.map((row) => [row.key, row.state]))
    const changed: string[] = []
    const rejected: string[] = []
    let sortOrder = draft._count.entities
    for (const entity of input.entities) {
      if (states.get(entity.key) === "COMMITTED") {
        rejected.push(entity.key)
        continue
      }
      const data = {
        kind: entity.kind,
        state: entity.state,
        payload: entity.payload,
        source: entity.source ?? Prisma.DbNull,
        openQuestions: entity.openQuestions ?? Prisma.DbNull,
        errorCode: null,
      }
      await tx.setupDraftEntity.upsert({
        where: { draftId_key: { draftId: input.draftId, key: entity.key } },
        create: {
          ...data,
          draftId: input.draftId,
          key: entity.key,
          sortOrder: sortOrder++,
        },
        update: data,
      })
      changed.push(entity.key)
    }
    return { revision: draft.revision, changed, rejected }
  }
  return "$transaction" in db
    ? db.$transaction(upsert, transactionOptions)
    : upsert(db)
}

export async function setSetupDraftEntityStates(
  db: DbClient,
  input: {
    draftId: string
    keys: string[]
    state: Extract<
      SetupDraftEntityState,
      "CONFIRMED" | "NEEDS_INPUT" | "PROPOSED" | "SKIPPED"
    >
  },
) {
  const apply = async (tx: Prisma.TransactionClient) => {
    const result = await tx.setupDraftEntity.updateMany({
      where: {
        draftId: input.draftId,
        key: { in: input.keys },
        // Confirmation requires every required fact (PROPOSED) or a retry of a
        // failed commit; committed records never change state here.
        state:
          input.state === "CONFIRMED"
            ? { in: ["PROPOSED", "FAILED"] }
            : { notIn: ["COMMITTED"] },
      },
      data: { state: input.state },
    })
    const draft = await tx.setupDraft.update({
      where: { id: input.draftId },
      data: { revision: { increment: 1 } },
      select: { revision: true },
    })
    return { revision: draft.revision, updated: result.count }
  }
  return "$transaction" in db
    ? db.$transaction(apply, transactionOptions)
    : apply(db)
}

export async function removeSetupDraftEntities(
  db: DbClient,
  input: { draftId: string; keys: string[] },
) {
  const remove = async (tx: Prisma.TransactionClient) => {
    const result = await tx.setupDraftEntity.deleteMany({
      where: {
        draftId: input.draftId,
        key: { in: input.keys },
        state: { not: "COMMITTED" },
      },
    })
    const draft = await tx.setupDraft.update({
      where: { id: input.draftId },
      data: { revision: { increment: 1 } },
      select: { revision: true },
    })
    return { revision: draft.revision, removed: result.count }
  }
  return "$transaction" in db
    ? db.$transaction(remove, transactionOptions)
    : remove(db)
}

/** Facts the Setup Assistant may state; everything else comes from the owner. */
export async function readSetupBusinessFacts(
  db: DbClient,
  scope: AssistantScope,
) {
  const [store, user, catalogItems, customers] = await Promise.all([
    db.store.findFirstOrThrow({
      where: { id: scope.storeId, tenantId: scope.tenantId },
      select: {
        name: true,
        metadata: true,
        countryCode: true,
        currencyCode: true,
        tenant: { select: { name: true, countryCode: true } },
      },
    }),
    db.user.findUnique({
      where: { id: scope.userId },
      select: { firstName: true, displayName: true },
    }),
    db.catalogItem.count({ where: { tenantId: scope.tenantId } }),
    db.customer.count({ where: { tenantId: scope.tenantId } }),
  ])
  return {
    businessName: store.tenant.name,
    storeName: store.name,
    storeMetadata: store.metadata,
    countryCode: store.countryCode ?? store.tenant.countryCode,
    currencyCode: store.currencyCode,
    firstName: user?.firstName ?? user?.displayName ?? null,
    existing: { catalogItems, customers },
  }
}

/** Records the outcome of one commit attempt; committed records stay immutable. */
export async function recordSetupDraftCommitOutcome(
  db: DbClient,
  input: {
    draftId: string
    key: string
    outcome:
      | { state: "COMMITTED"; recordId: string; errorCode?: string | null }
      | { state: "FAILED"; errorCode: string }
  },
) {
  const apply = async (tx: Prisma.TransactionClient) => {
    await tx.setupDraftEntity.updateMany({
      where: {
        draftId: input.draftId,
        key: input.key,
        ...(input.outcome.state === "FAILED"
          ? { state: { not: "COMMITTED" } }
          : {}),
      },
      data:
        input.outcome.state === "COMMITTED"
          ? {
              state: "COMMITTED",
              committedRecordId: input.outcome.recordId,
              errorCode: input.outcome.errorCode ?? null,
            }
          : { state: "FAILED", errorCode: input.outcome.errorCode },
    })
    const draft = await tx.setupDraft.update({
      where: { id: input.draftId },
      data: { revision: { increment: 1 } },
      select: { revision: true },
    })
    return draft.revision
  }
  return "$transaction" in db
    ? db.$transaction(apply, transactionOptions)
    : apply(db)
}

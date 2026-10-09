import { createHash, randomUUID } from "node:crypto"
import {
  type AssistantConversationStatus,
  Prisma,
  type PrismaClient,
  type SetupDraftEntityKind,
  type SetupDraftEntityState,
} from "../../generated/prisma/client"
import { claimAssistantAttachmentsForMessage } from "./assistant-attachments"
import {
  type CreateCatalogItemInput,
  createCatalogItemInTransaction,
} from "./catalog"
import { type ArgsAfterClient, runInOwnTransaction } from "./own-transaction"
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

const hash = (value: string) => createHash("sha256").update(value).digest("hex")
function sortedJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedJson)
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sortedJson(entry)]),
    )
  return value
}

const conversationSelect = {
  id: true,
  status: true,
  ownerUserId: true,
  tenantId: true,
  storeId: true,
  title: true,
  purpose: true,
  workflowContext: true,
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

export async function createSetupConversationInTransaction(
  db: Prisma.TransactionClient,
  scope: AssistantScope,
  initialMessages: AssistantStoredMessage[],
  options: {
    status?: Extract<AssistantConversationStatus, "ACTIVE" | "OFFERED">
  } = {},
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
        status: options.status ?? "OFFERED",
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
  return create(db)
}

/** Opens its own transaction; inside one, use createSetupConversationInTransaction. */
export async function createSetupConversation(
  db: PrismaClient,
  ...args: ArgsAfterClient<typeof createSetupConversationInTransaction>
) {
  return runInOwnTransaction(db, (tx) =>
    createSetupConversationInTransaction(tx, ...args),
  )
}

export async function readAssistantConversation(
  db: DbClient,
  scope: Pick<AssistantScope, "storeId" | "tenantId"> &
    Partial<Pick<AssistantScope, "userId">>,
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
  if (
    conversation.purpose === "PRODUCT_CREATE" &&
    conversation.ownerUserId !== scope.userId
  )
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

export async function setAssistantConversationStatusInTransaction(
  db: Prisma.TransactionClient,
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
  return update(db)
}

/** Opens its own transaction; inside one, use setAssistantConversationStatusInTransaction. */
export async function setAssistantConversationStatus(
  db: PrismaClient,
  ...args: ArgsAfterClient<typeof setAssistantConversationStatusInTransaction>
) {
  return runInOwnTransaction(db, (tx) =>
    setAssistantConversationStatusInTransaction(tx, ...args),
  )
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
export async function beginAssistantRunInTransaction(
  db: Prisma.TransactionClient,
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
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "AssistantConversation" WHERE "id" = ${input.conversationId} FOR UPDATE`,
    )
    const current = await tx.assistantConversation.findUnique({
      where: { id: input.conversationId },
      select: { status: true, purpose: true, ownerUserId: true },
    })
    if (current?.status !== "ACTIVE")
      throw new AssistantRecordError(
        "CONVERSATION_CLOSED",
        "This conversation has finished.",
      )
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
    if (
      current.purpose === "PRODUCT_CREATE" &&
      (current.ownerUserId !== input.actorUserId ||
        (await productConversationHasRunningTurn(tx, input.conversationId)))
    )
      throw new AssistantRecordError(
        "CONVERSATION_CLOSED",
        "Wait for the current reply before sending another message.",
      )
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
  return begin(db)
}

/** Opens its own transaction; inside one, use beginAssistantRunInTransaction. */
export async function beginAssistantRun(
  db: PrismaClient,
  ...args: ArgsAfterClient<typeof beginAssistantRunInTransaction>
) {
  return runInOwnTransaction(db, (tx) =>
    beginAssistantRunInTransaction(tx, ...args),
  )
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
      select: { id: true, purpose: true, ownerUserId: true },
    }),
  ])
  return Boolean(
    membership &&
      conversation &&
      (conversation.purpose !== "PRODUCT_CREATE" ||
        conversation.ownerUserId === scope.userId),
  )
}

export type AssistantUsage = {
  cachedInputTokens?: number
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export async function completeAssistantRunInTransaction(
  db: Prisma.TransactionClient,
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
    const candidate = await tx.assistantRun.findUnique({
      where: { id: input.runId },
      select: {
        conversationId: true,
        conversation: { select: { purpose: true } },
      },
    })
    if (!candidate) return
    if (candidate.conversation.purpose === "PRODUCT_CREATE")
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "AssistantConversation" WHERE "id" = ${candidate.conversationId} FOR UPDATE`,
      )
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "AssistantRun" WHERE "id" = ${input.runId} FOR UPDATE`,
    )
    const current = await tx.assistantRun.findUnique({
      where: { id: input.runId },
      select: { status: true, errorCode: true },
    })
    const settled = await tx.assistantRun.updateMany({
      where: { id: input.runId, status: "RUNNING" },
      data: {
        status: input.status,
        errorCode: input.errorCode,
        completedAt: new Date(),
      },
    })
    if (!settled.count) {
      if (
        current?.status !== "FAILED" ||
        current.errorCode !== "TURN_INTERRUPTED" ||
        (await tx.assistantUsageEvent.findFirst({
          where: { runId: input.runId },
          select: { id: true },
        }))
      )
        return
    }
    if (settled.count && input.assistantMessage)
      await appendAssistantMessage(tx, {
        conversationId: candidate.conversationId,
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
        outcome:
          settled.count && input.status === "COMPLETED" ? "success" : "failed",
      },
    })
    if (input.budgetScopeKey && input.usage?.totalTokens)
      await tx.assistantBudget.update({
        where: { scopeKey: input.budgetScopeKey },
        data: { tokens: { increment: input.usage.totalTokens } },
      })
  }
  return complete(db)
}

/** Opens its own transaction; inside one, use completeAssistantRunInTransaction. */
export async function completeAssistantRun(
  db: PrismaClient,
  ...args: ArgsAfterClient<typeof completeAssistantRunInTransaction>
) {
  return runInOwnTransaction(db, (tx) =>
    completeAssistantRunInTransaction(tx, ...args),
  )
}

export type AssistantBudgetLimits = {
  maxRequests: number
  maxTokens: number
  windowMs: number
}

export function assistantBudgetScopeKey(tenantId: string, purpose: string) {
  return hash(`assistant:${purpose}:${tenantId}`)
}

/** Read only; display expiry without creating or resetting the quota row. */
export function readAssistantBudget(db: DbClient, tenantId: string) {
  return db.assistantBudget.findUnique({
    where: { scopeKey: assistantBudgetScopeKey(tenantId, "SETUP") },
    select: { tokens: true, requests: true, windowStartedAt: true },
  })
}

export async function createProductConversation(
  db: PrismaClient,
  scope: AssistantScope,
  input: {
    id: string
    snapshot: Prisma.InputJsonValue
    seed: SetupDraftEntityInput | null
    opening: string
  },
) {
  return runInOwnTransaction(db, async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`product-handoff:${input.id}`}, 0))`,
    )
    const handoffDigest = hash(JSON.stringify(sortedJson(input.snapshot)))
    const conversation = await tx.assistantConversation.upsert({
      where: { id: input.id },
      update: {},
      create: {
        id: input.id,
        tenantId: scope.tenantId,
        storeId: scope.storeId,
        ownerUserId: scope.userId,
        purpose: "PRODUCT_CREATE",
        status: "ACTIVE",
        title: "Add product",
        workflowContext: { snapshot: input.snapshot, handoffDigest },
        lastSequence: 1,
        setupDraft: {
          create: {
            tenantId: scope.tenantId,
            storeId: scope.storeId,
            entities: input.seed
              ? {
                  create: {
                    ...input.seed,
                    source: input.seed.source ?? Prisma.DbNull,
                    openQuestions: input.seed.openQuestions ?? Prisma.DbNull,
                    sortOrder: 0,
                  },
                }
              : undefined,
          },
        },
        messages: {
          create: {
            id: newAssistantMessageId(),
            role: "assistant",
            sequence: 1,
            parts: [{ type: "text", text: input.opening }],
          },
        },
      },
      select: conversationSelect,
    })
    if (
      conversation.tenantId !== scope.tenantId ||
      conversation.storeId !== scope.storeId ||
      conversation.ownerUserId !== scope.userId ||
      conversation.purpose !== "PRODUCT_CREATE"
    )
      throw new AssistantRecordError(
        "CONVERSATION_NOT_FOUND",
        "This product draft is not available.",
      )
    if (
      (conversation.workflowContext as { handoffDigest?: string } | null)
        ?.handoffDigest !== handoffDigest
    )
      throw new AssistantRecordError(
        "CONVERSATION_CLOSED",
        "This handoff was already saved with different form details. Open a new product draft to keep your changes.",
      )
    return conversation
  })
}

export function listProductConversations(db: DbClient, scope: AssistantScope) {
  return db.assistantConversation.findMany({
    where: {
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      ownerUserId: scope.userId,
      purpose: "PRODUCT_CREATE",
      status: "ACTIVE",
    },
    orderBy: { updatedAt: "desc" },
    take: 10,
    select: { id: true, title: true, updatedAt: true },
  })
}

export function productConversationHasRunningTurn(
  db: DbClient,
  conversationId: string,
) {
  // Chat has a 45-second deadline. Leave a generous grace period for final
  // persistence, then release a run orphaned by a server restart/deployment.
  return db.assistantRun
    .updateMany({
      where: {
        conversationId,
        status: "RUNNING",
        startedAt: { lt: new Date(Date.now() - 120_000) },
      },
      data: {
        status: "FAILED",
        errorCode: "TURN_INTERRUPTED",
        completedAt: new Date(),
      },
    })
    .then(() =>
      db.assistantRun.count({ where: { conversationId, status: "RUNNING" } }),
    )
    .then((count) => count > 0)
}

export async function updateProductConversationSnapshot(
  db: PrismaClient,
  scope: AssistantScope,
  input: {
    conversationId: string
    expectedRevision: number
    snapshot: Prisma.InputJsonValue
    seed: SetupDraftEntityInput | null
  },
) {
  return runInOwnTransaction(db, async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "AssistantConversation" WHERE "id" = ${input.conversationId} FOR UPDATE`,
    )
    const conversation = await readAssistantConversation(
      tx,
      scope,
      input.conversationId,
    )
    if (
      conversation.purpose !== "PRODUCT_CREATE" ||
      conversation.status !== "ACTIVE" ||
      !conversation.setupDraft ||
      (await productConversationHasRunningTurn(tx, conversation.id))
    )
      throw new AssistantRecordError(
        "CONVERSATION_CLOSED",
        "Wait for the reply to finish before returning to chat.",
      )
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "SetupDraft" WHERE "id" = ${conversation.setupDraft.id} FOR UPDATE`,
    )
    const draft = await readSetupDraft(tx, conversation.setupDraft.id)
    if (draft.revision !== input.expectedRevision)
      throw new AssistantRecordError(
        "CONVERSATION_CLOSED",
        "The draft changed. Review it again before continuing.",
      )
    await tx.assistantConversation.update({
      where: { id: conversation.id },
      data: {
        workflowContext: {
          ...(conversation.workflowContext as { handoffDigest: string }),
          snapshot: input.snapshot,
        },
      },
    })
    if (input.seed)
      await upsertSetupDraftEntitiesInTransaction(tx, {
        draftId: draft.id,
        entities: [input.seed],
      })
    else {
      await tx.setupDraftEntity.deleteMany({
        where: { draftId: draft.id, state: { not: "COMMITTED" } },
      })
      await tx.setupDraft.update({
        where: { id: draft.id },
        data: { revision: { increment: 1 } },
      })
    }
    return { conversationId: conversation.id }
  })
}

/** Locks admission and draft together; domain write and receipt are atomic. */
export async function commitProductConversation(
  db: PrismaClient,
  scope: AssistantScope,
  input: {
    conversationId: string
    expectedRevision: number
    manualEntity?: SetupDraftEntityInput
  },
  prepare: (
    entity: Awaited<ReturnType<typeof readSetupDraft>>["entities"][number],
    context: unknown,
  ) => CreateCatalogItemInput,
) {
  return runInOwnTransaction(db, async (tx) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "AssistantConversation" WHERE "id" = ${input.conversationId} FOR UPDATE`,
    )
    const conversation = await readAssistantConversation(
      tx,
      scope,
      input.conversationId,
    )
    if (conversation.purpose !== "PRODUCT_CREATE" || !conversation.setupDraft)
      throw new AssistantRecordError(
        "CONVERSATION_NOT_FOUND",
        "This product draft is not available.",
      )
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "SetupDraft" WHERE "id" = ${conversation.setupDraft.id} FOR UPDATE`,
    )
    const draft = await readSetupDraft(tx, conversation.setupDraft.id)
    let entity = draft.entities.find((entity) => entity.key === "product")
    const membership = await tx.membership.findFirst({
      where: {
        tenantId: scope.tenantId,
        userId: scope.userId,
        status: "ACTIVE",
        role: { in: ["OWNER", "ADMIN"] },
        tenant: { isActive: true },
      },
      select: { id: true },
    })
    if (!membership)
      throw new AssistantRecordError(
        "CONVERSATION_NOT_FOUND",
        "You no longer have access to this product draft.",
      )
    if (entity?.state === "COMMITTED" && entity.committedRecordId)
      return {
        recordId: entity.committedRecordId,
        name: String((entity.payload as { name?: string }).name ?? "Product"),
      }
    if (
      conversation.status !== "ACTIVE" ||
      draft.revision !== input.expectedRevision ||
      (await productConversationHasRunningTurn(tx, conversation.id))
    )
      throw new AssistantRecordError(
        "CONVERSATION_CLOSED",
        "The product draft changed or a reply is still running. Review it again before creating.",
      )
    if (input.manualEntity) {
      await upsertSetupDraftEntitiesInTransaction(tx, {
        draftId: draft.id,
        entities: [input.manualEntity],
      })
      entity = (await readSetupDraft(tx, draft.id)).entities.find(
        (entity) => entity.key === "product",
      )
    }
    if (!entity || draft.entities.length > 1 || entity.kind !== "PRODUCT")
      throw new AssistantRecordError(
        "ENTITY_NOT_FOUND",
        "Describe one product before creating it.",
      )
    const command = prepare(entity, conversation.workflowContext)
    const item = await createCatalogItemInTransaction(tx, {
      ...command,
      clientOperationId: `product-${conversation.id}`,
    })
    await tx.setupDraftEntity.update({
      where: { id: entity.id },
      data: { state: "COMMITTED", committedRecordId: item.id, errorCode: null },
    })
    await tx.assistantConversation.update({
      where: { id: conversation.id },
      data: { status: "COMPLETED", title: item.name },
    })
    return { recordId: item.id, name: item.name }
  })
}

/** Row-locked rolling budget; exhaustion blocks new model calls, never drafts. */
export async function reserveAssistantBudgetInTransaction(
  db: Prisma.TransactionClient,
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
  return reserve(db)
}

/** Opens its own transaction; inside one, use reserveAssistantBudgetInTransaction. */
export async function reserveAssistantBudget(
  db: PrismaClient,
  ...args: ArgsAfterClient<typeof reserveAssistantBudgetInTransaction>
) {
  return runInOwnTransaction(db, (tx) =>
    reserveAssistantBudgetInTransaction(tx, ...args),
  )
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
export async function reserveAssistantMediaBudgetInTransaction(
  db: Prisma.TransactionClient,
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
  return reserve(db)
}

/** Opens its own transaction; inside one, use reserveAssistantMediaBudgetInTransaction. */
export async function reserveAssistantMediaBudget(
  db: PrismaClient,
  ...args: ArgsAfterClient<typeof reserveAssistantMediaBudgetInTransaction>
) {
  return runInOwnTransaction(db, (tx) =>
    reserveAssistantMediaBudgetInTransaction(tx, ...args),
  )
}

/** Usage for attachment work (transcription, vision, parsing) outside a run. */
export async function recordAssistantAttachmentUsageInTransaction(
  db: Prisma.TransactionClient,
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
  return record(db)
}

/** Opens its own transaction; inside one, use recordAssistantAttachmentUsageInTransaction. */
export async function recordAssistantAttachmentUsage(
  db: PrismaClient,
  ...args: ArgsAfterClient<typeof recordAssistantAttachmentUsageInTransaction>
) {
  return runInOwnTransaction(db, (tx) =>
    recordAssistantAttachmentUsageInTransaction(tx, ...args),
  )
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
      areas: true,
      entities: { orderBy: { sortOrder: "asc" }, select: entitySelect },
    },
  })
}

/**
 * Marks one setup area DONE or SKIPPED (null reopens it). Read-modify-write in
 * one transaction with the draft row locked, so concurrent marks never lose one.
 */
export async function markSetupDraftAreaInTransaction(
  db: Prisma.TransactionClient,
  input: { draftId: string; area: string; mark: "DONE" | "SKIPPED" | null },
) {
  const apply = async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "SetupDraft" WHERE "id" = ${input.draftId} FOR UPDATE`,
    )
    const draft = await tx.setupDraft.findUniqueOrThrow({
      where: { id: input.draftId },
      select: { areas: true },
    })
    const areas =
      draft.areas &&
      typeof draft.areas === "object" &&
      !Array.isArray(draft.areas)
        ? { ...(draft.areas as Record<string, unknown>) }
        : {}
    if (input.mark) areas[input.area] = input.mark
    else delete areas[input.area]
    const updated = await tx.setupDraft.update({
      where: { id: input.draftId },
      data: {
        areas: areas as Prisma.InputJsonValue,
        revision: { increment: 1 },
      },
      select: { revision: true, areas: true },
    })
    return updated
  }
  return apply(db)
}

/** Opens its own transaction; inside one, use markSetupDraftAreaInTransaction. */
export async function markSetupDraftArea(
  db: PrismaClient,
  ...args: ArgsAfterClient<typeof markSetupDraftAreaInTransaction>
) {
  return runInOwnTransaction(db, (tx) =>
    markSetupDraftAreaInTransaction(tx, ...args),
  )
}

/**
 * Appends only if `expectedLastMessageId` is still the newest message, with the
 * conversation row locked, so two concurrent visits greet the owner once.
 */
export async function appendAssistantMessageIfLatestInTransaction(
  db: Prisma.TransactionClient,
  input: {
    conversationId: string
    expectedLastMessageId: string
    message: AssistantStoredMessage
  },
) {
  const apply = async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw(
      Prisma.sql`SELECT "id" FROM "AssistantConversation" WHERE "id" = ${input.conversationId} FOR UPDATE`,
    )
    const latest = await tx.assistantMessage.findFirst({
      where: { conversationId: input.conversationId },
      orderBy: { sequence: "desc" },
      select: { id: true },
    })
    if (latest?.id !== input.expectedLastMessageId) return false
    await appendAssistantMessage(tx, {
      conversationId: input.conversationId,
      message: input.message,
    })
    return true
  }
  return apply(db)
}

/** Opens its own transaction; inside one, use appendAssistantMessageIfLatestInTransaction. */
export async function appendAssistantMessageIfLatest(
  db: PrismaClient,
  ...args: ArgsAfterClient<typeof appendAssistantMessageIfLatestInTransaction>
) {
  return runInOwnTransaction(db, (tx) =>
    appendAssistantMessageIfLatestInTransaction(tx, ...args),
  )
}

/** The newest message, to tell a new visit from a reload. */
export async function readLastAssistantMessage(
  db: DbClient,
  conversationId: string,
) {
  return db.assistantMessage.findFirst({
    where: { conversationId },
    orderBy: { sequence: "desc" },
    select: { id: true, role: true, createdAt: true },
  })
}

/** Usage for a model call that is not a chat turn or attachment (opening, welcome). */
export async function recordAssistantMessageUsage(
  db: DbClient,
  input: {
    tenantId: string
    actorUserId: string
    provider: string
    model: string
    requestClass: "opening" | "welcome"
    outcome: "success" | "failed" | "fallback"
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    durationMs?: number
    budgetScopeKey?: string
  },
) {
  await db.assistantUsageEvent.create({
    data: {
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      provider: input.provider,
      model: input.model,
      requestClass: input.requestClass,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      totalTokens: input.totalTokens,
      durationMs: input.durationMs,
      outcome: input.outcome,
    },
  })
  if (input.budgetScopeKey && input.totalTokens)
    await db.assistantBudget.updateMany({
      where: { scopeKey: input.budgetScopeKey },
      data: { tokens: { increment: input.totalTokens } },
    })
}

/** Model and owner edits both reopen confirmation; committed records are immutable. */
export async function upsertSetupDraftEntitiesInTransaction(
  db: Prisma.TransactionClient,
  input: {
    draftId: string
    entities: SetupDraftEntityInput[]
    productRun?: { runId: string; scope: AssistantScope }
  },
) {
  const upsert = async (tx: Prisma.TransactionClient) => {
    if (input.productRun) {
      const { runId, scope } = input.productRun
      const run = await readAssistantRun(tx, scope, runId)
      if (!run)
        throw new AssistantRecordError(
          "CONVERSATION_CLOSED",
          "This reply is no longer active.",
        )
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "AssistantConversation" WHERE "id" = ${run.conversationId} FOR UPDATE`,
      )
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "AssistantRun" WHERE "id" = ${runId} FOR UPDATE`,
      )
      const conversation = await readAssistantConversation(
        tx,
        scope,
        run.conversationId,
      )
      if (
        conversation.purpose !== "PRODUCT_CREATE" ||
        conversation.setupDraft?.id !== input.draftId ||
        (await readAssistantRun(tx, scope, runId))?.status !== "RUNNING" ||
        !(await isSetupActorStillAuthorized(tx, scope, run.conversationId))
      )
        throw new AssistantRecordError(
          "CONVERSATION_CLOSED",
          "This reply is no longer active.",
        )
    }
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
  return upsert(db)
}

/** Opens its own transaction; inside one, use upsertSetupDraftEntitiesInTransaction. */
export async function upsertSetupDraftEntities(
  db: PrismaClient,
  ...args: ArgsAfterClient<typeof upsertSetupDraftEntitiesInTransaction>
) {
  return runInOwnTransaction(db, (tx) =>
    upsertSetupDraftEntitiesInTransaction(tx, ...args),
  )
}

export async function setSetupDraftEntityStatesInTransaction(
  db: Prisma.TransactionClient,
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
  return apply(db)
}

/** Opens its own transaction; inside one, use setSetupDraftEntityStatesInTransaction. */
export async function setSetupDraftEntityStates(
  db: PrismaClient,
  ...args: ArgsAfterClient<typeof setSetupDraftEntityStatesInTransaction>
) {
  return runInOwnTransaction(db, (tx) =>
    setSetupDraftEntityStatesInTransaction(tx, ...args),
  )
}

export async function removeSetupDraftEntitiesInTransaction(
  db: Prisma.TransactionClient,
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
  return remove(db)
}

/** Opens its own transaction; inside one, use removeSetupDraftEntitiesInTransaction. */
export async function removeSetupDraftEntities(
  db: PrismaClient,
  ...args: ArgsAfterClient<typeof removeSetupDraftEntitiesInTransaction>
) {
  return runInOwnTransaction(db, (tx) =>
    removeSetupDraftEntitiesInTransaction(tx, ...args),
  )
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
type SetupDraftCommitOutcomeInput = {
  draftId: string
  key: string
  outcome:
    | { state: "COMMITTED"; recordId: string; errorCode?: string | null }
    | { state: "FAILED"; errorCode: string }
}

/**
 * Writes a record's add outcome inside a transaction the caller already holds.
 * Never starts a nested transaction: Prisma's interactive-transaction client
 * also exposes `$transaction`, and nesting one there leaves the connection in a
 * state where every later transaction in the process fails with P2028.
 */
export async function recordSetupDraftCommitOutcomeInTransaction(
  tx: Prisma.TransactionClient,
  input: SetupDraftCommitOutcomeInput,
) {
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

/** Opens its own transaction; inside one, use recordSetupDraftCommitOutcomeInTransaction. */
export async function recordSetupDraftCommitOutcome(
  db: PrismaClient,
  input: SetupDraftCommitOutcomeInput,
) {
  return runInOwnTransaction(db, (tx) =>
    recordSetupDraftCommitOutcomeInTransaction(tx, input),
  )
}

import {
  type WhatsAppWorkflowActionSource,
  whatsAppWorkflowActionSourceSchema,
} from "@ewatrade/assistant/channels/workflow-action-review"
import {
  productRequiresForm,
  productWorkflowContextSchema,
} from "@ewatrade/assistant/product/contracts"
import {
  deriveSetupEntityState,
  setupEntityPayloadSchema,
  setupOpenQuestionSchema,
} from "@ewatrade/assistant/setup/contracts"
import {
  type AssistantScope,
  commitProductConversationInTransaction,
  readAssistantConversation,
  readSetupDraft,
  recordSetupDraftCommitOutcomeInTransaction,
  setSetupDraftEntityStatesInTransaction,
} from "@ewatrade/db/assistant"
import {
  assistantWhatsAppActionPayloadDigest,
  assistantWhatsAppWorkflowWritesEnabled,
} from "@ewatrade/db/assistant-whatsapp"
import {
  type CreateCatalogItemInput,
  createCatalogItemInTransaction,
  createCustomerInTransaction,
} from "@ewatrade/db/queries"
import type { Prisma } from "@ewatrade/db/types"
import { isExactDecimal } from "@ewatrade/utils/exact-decimal"
import { z } from "zod"
import { isLinkedAssistantIdentity } from "./channel-principal"
import type { GeneralTransactionContext } from "./general-actions"
import { catalogCommandForProductConversation } from "./product-command"
import { catalogCommandForSetupEntity } from "./setup-commit"
import { requireSetupAssistantScope } from "./setup-context"
import { WorkflowTurnError } from "./workflow-turn-contract"

type Entity = Awaited<ReturnType<typeof readSetupDraft>>["entities"][number]
type Draft = Awaited<ReturnType<typeof readSetupDraft>>
type Conversation = Awaited<ReturnType<typeof readAssistantConversation>>
export type WorkflowCommandProjectionInput = {
  source: WhatsAppWorkflowActionSource
  entity: Entity
  workflowContext: unknown
  scope: AssistantScope
}
type CustomerCommand = Parameters<typeof createCustomerInTransaction>[1]
export type PreparedReviewedWorkflowCommand =
  | { kind: "catalog"; command: CreateCatalogItemInput; categoryLabel?: string }
  | { kind: "customer"; command: CustomerCommand }
type ReviewedProductMatchQuery = {
  where: {
    tenantId: string
    kind: "PRODUCT"
    status: "ACTIVE"
    systemRole: null
    name: { contains: string; mode: "insensitive" }
  }
}
const digest = assistantWhatsAppActionPayloadDigest
const refuse = (): never => {
  throw new WorkflowTurnError(
    409,
    "WORKFLOW_REVIEW_CHANGED",
    "This exact saved workflow changed or needs review in EwaTrade. Nothing from this selection was added.",
  )
}

/** Preparation is deterministic and side-effect free; the mutation boundary repeats these checks. */
export function prepareReviewedWorkflowCommand(
  input: WorkflowCommandProjectionInput,
): PreparedReviewedWorkflowCommand {
  const { source, entity, scope } = input
  if (
    source.origin.tenantId !== scope.tenantId ||
    source.origin.storeId !== scope.storeId ||
    !["PROPOSED", "CONFIRMED"].includes(entity.state) ||
    entity.committedRecordId ||
    entity.errorCode
  )
    return refuse()
  const payload = setupEntityPayloadSchema.safeParse(entity.payload)
  const questions = z
    .array(setupOpenQuestionSchema)
    .max(40)
    .safeParse(entity.openQuestions ?? [])
  if (
    !payload.success ||
    !questions.success ||
    entity.kind !== payload.data.kind.toUpperCase() ||
    questions.data.some((question) => question.required) ||
    deriveSetupEntityState(payload.data, questions.data).state !== "PROPOSED"
  )
    return refuse()
  const value = payload.data
  if (
    value.kind === "money_account" ||
    (value.kind === "customer" && value.opening)
  )
    return refuse()
  if (value.kind === "customer") {
    if (source.purpose !== "SETUP") return refuse()
    return {
      kind: "customer",
      command: {
        tenantId: scope.tenantId,
        name: value.name,
        phone: value.phone,
        email: value.email,
      },
    }
  }
  if (
    value.illustrationId ||
    (value.kind === "service" &&
      value.pricing === "quote" &&
      value.priceMinor !== undefined)
  )
    return refuse()
  if (
    value.kind === "product" &&
    (value.photoAttachmentId ||
      value.options?.length ||
      value.variants?.length ||
      value.sellingUnits?.length ||
      (value.openingStock !== undefined &&
        (!isExactDecimal(value.openingStock, { maxScale: 2 }) ||
          value.openingStock.startsWith("-"))))
  )
    return refuse()
  let command: CreateCatalogItemInput
  if (source.purpose === "PRODUCT_CREATE") {
    if (entity.key !== "product" || value.kind !== "product") return refuse()
    const context = productWorkflowContextSchema.safeParse(
      input.workflowContext,
    )
    if (
      !context.success ||
      context.data.snapshot.storeId !== scope.storeId ||
      productRequiresForm(context.data.snapshot) ||
      context.data.snapshot.photoAssetIds.length ||
      context.data.snapshot.illustrationId
    )
      return refuse()
    command = {
      ...catalogCommandForProductConversation(
        scope,
        entity,
        input.workflowContext,
      ),
      // The canonical Product repository overrides this identity at execution too.
      clientOperationId: `product-${source.conversationId}`,
    }
  } else
    command = catalogCommandForSetupEntity(entity.id, value, {
      actorUserId: scope.userId,
      storeId: scope.storeId,
      tenantId: scope.tenantId,
    })
  if (value.categoryKey && !command.category) return refuse()
  return {
    kind: "catalog",
    command,
    ...(command.category ? { categoryLabel: command.category } : {}),
  }
}

/** The app requires a separate explicit choice for similar products; WhatsApp cannot invent it. */
export async function assertReviewedWorkflowProductHasNoMatches(
  source: WhatsAppWorkflowActionSource,
  prepared: PreparedReviewedWorkflowCommand,
  countMatches: (query: ReviewedProductMatchQuery) => Promise<number>,
) {
  if (source.purpose !== "PRODUCT_CREATE") return
  if (prepared.kind !== "catalog" || prepared.command.kind !== "product")
    return refuse()
  const name = prepared.command.name.trim()
  if (!name) return refuse()
  const matches = await countMatches({
    where: {
      tenantId: source.origin.tenantId,
      kind: "PRODUCT",
      status: "ACTIVE",
      systemRole: null,
      name: { contains: name, mode: "insensitive" },
    },
  })
  if (!Number.isSafeInteger(matches) || matches < 0) return refuse()
  if (matches > 0)
    throw new WorkflowTurnError(
      409,
      "WORKFLOW_APP_REVIEW_REQUIRED",
      "A similar active product exists. Open this exact saved Product workflow in EwaTrade to review the matches and explicitly choose whether to create a separate product. Nothing was added by this selection.",
    )
}

/** DB review repository receives only a digest of the actual canonical command, never an executable payload. */
export async function projectCommand(
  tx: Prisma.TransactionClient,
  input: WorkflowCommandProjectionInput,
) {
  const prepared = prepareReviewedWorkflowCommand(input)
  await assertReviewedWorkflowProductHasNoMatches(
    input.source,
    prepared,
    (query) => tx.catalogItem.count(query),
  )
  return {
    commandHash: digest(prepared.command),
    ...(prepared.kind === "catalog" && prepared.categoryLabel
      ? { categoryLabel: prepared.categoryLabel }
      : {}),
  }
}

/** Pure exact comparison before any selected record is confirmed or any domain command runs. */
export function prepareReviewedWorkflowSelection(input: {
  source: WhatsAppWorkflowActionSource
  scope: AssistantScope
  conversation: Conversation
  draft: Draft
}) {
  const source = whatsAppWorkflowActionSourceSchema.parse(input.source)
  const { scope, conversation, draft } = input
  if (
    source.origin.tenantId !== scope.tenantId ||
    source.origin.storeId !== scope.storeId ||
    conversation.id !== source.conversationId ||
    conversation.purpose !== source.purpose ||
    conversation.status !== "ACTIVE" ||
    conversation.ownerUserId !== scope.userId ||
    conversation.tenantId !== scope.tenantId ||
    conversation.storeId !== scope.storeId ||
    conversation.setupDraft?.id !== source.draftId ||
    conversation.setupDraft?.revision !== source.draftRevision ||
    draft.id !== source.draftId ||
    draft.revision !== source.draftRevision ||
    (source.purpose === "PRODUCT_CREATE" &&
      (draft.entities.length !== 1 ||
        digest(conversation.workflowContext) !== source.workflowContextHash))
  )
    return refuse()
  return source.selection.map((selected) => {
    const entity = draft.entities.find(
      (row) => row.id === selected.entityId && row.key === selected.key,
    )
    if (!entity || entity.state !== selected.state) return refuse()
    const payload = setupEntityPayloadSchema.safeParse(entity.payload)
    if (!payload.success || digest(payload.data) !== selected.payloadHash)
      return refuse()
    const prepared = prepareReviewedWorkflowCommand({
      source,
      entity,
      workflowContext: conversation.workflowContext,
      scope,
    })
    if (digest(prepared.command) !== selected.commandHash) return refuse()
    return { entity, prepared }
  })
}

export type ReviewedWorkflowSelectionResult = {
  purpose: WhatsAppWorkflowActionSource["purpose"]
  conversationId: string
  draftId: string
  records: Array<{
    entityId: string
    key: string
    kind: "PRODUCT" | "SERVICE" | "CUSTOMER"
    recordId: string
    name: string
  }>
}

/** Caller consumes exact Confirm proof in this same fresh transaction before calling. */
export async function executeReviewedWorkflowSelectionInTransaction(
  fresh: GeneralTransactionContext,
  input: WhatsAppWorkflowActionSource,
): Promise<ReviewedWorkflowSelectionResult> {
  const source = whatsAppWorkflowActionSourceSchema.parse(input)
  const identity = fresh.session
  if (
    !isLinkedAssistantIdentity(identity) ||
    !identity.inboxLease ||
    identity.purpose !== source.purpose ||
    fresh.assistantConversationId !== source.conversationId ||
    !assistantWhatsAppWorkflowWritesEnabled(source.purpose)
  )
    return refuse()
  const scope = requireSetupAssistantScope(fresh)
  const tx = fresh.db
  const review = await tx.assistantWhatsAppWorkflowReview.findFirst({
    where: {
      bindingId: identity.principal.bindingId,
      identityGeneration: identity.principal.identityGeneration,
      grantGeneration: identity.principal.grantGeneration,
      selectionGeneration: identity.principal.selectionGeneration,
      sourceDigest: digest(source),
      consumedByIngressId: identity.inboxLease.inboxId,
      state: "CONSUMED",
      decision: "confirm",
      expiresAt: { gt: new Date() },
    },
  })
  if (!review || review.completedAt || review.resultRef !== null)
    return refuse()
  // Same already-held conversation/draft locks as review consumption; reread canonical state.
  await tx.$queryRaw`SELECT id FROM "AssistantConversation" WHERE id=${source.conversationId} FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM "SetupDraft" WHERE id=${source.draftId} FOR UPDATE`
  const conversation = await readAssistantConversation(
    tx,
    scope,
    source.conversationId,
  )
  const draft = await readSetupDraft(tx, source.draftId)
  const selected = prepareReviewedWorkflowSelection({
    source,
    scope,
    conversation,
    draft,
  })
  if (source.purpose === "PRODUCT_CREATE") {
    const item = selected[0]
    if (
      !item ||
      item.prepared.kind !== "catalog" ||
      item.entity.kind !== "PRODUCT"
    )
      return refuse()
    await assertReviewedWorkflowProductHasNoMatches(
      source,
      item.prepared,
      (query) => tx.catalogItem.count(query),
    )
    const result = await commitProductConversationInTransaction(
      tx,
      scope,
      {
        conversationId: source.conversationId,
        expectedRevision: source.draftRevision,
      },
      (entity, workflowContext) => {
        const command = prepareReviewedWorkflowCommand({
          source,
          entity,
          workflowContext,
          scope,
        })
        if (
          command.kind !== "catalog" ||
          digest(command.command) !== source.selection[0]?.commandHash
        )
          return refuse()
        return command.command
      },
    )
    return {
      purpose: source.purpose,
      conversationId: source.conversationId,
      draftId: source.draftId,
      records: [
        {
          entityId: item.entity.id,
          key: item.entity.key,
          kind: "PRODUCT",
          recordId: result.recordId,
          name: result.name,
        },
      ],
    }
  }
  const proposedKeys = selected
    .filter(({ entity }) => entity.state === "PROPOSED")
    .map(({ entity }) => entity.key)
  if (proposedKeys.length) {
    const confirmed = await setSetupDraftEntityStatesInTransaction(tx, {
      draftId: source.draftId,
      keys: proposedKeys,
      state: "CONFIRMED",
    })
    if (confirmed.updated !== proposedKeys.length) return refuse()
  }
  const records: ReviewedWorkflowSelectionResult["records"] = []
  for (const { entity, prepared } of selected) {
    const record =
      prepared.kind === "customer"
        ? await createCustomerInTransaction(tx, prepared.command)
        : await createCatalogItemInTransaction(tx, prepared.command)
    await recordSetupDraftCommitOutcomeInTransaction(tx, {
      draftId: source.draftId,
      key: entity.key,
      outcome: { state: "COMMITTED", recordId: record.id },
    })
    records.push({
      entityId: entity.id,
      key: entity.key,
      kind:
        prepared.kind === "customer"
          ? "CUSTOMER"
          : prepared.command.kind === "service"
            ? "SERVICE"
            : "PRODUCT",
      recordId: record.id,
      name: record.name,
    })
  }
  return {
    purpose: source.purpose,
    conversationId: source.conversationId,
    draftId: source.draftId,
    records,
  }
}

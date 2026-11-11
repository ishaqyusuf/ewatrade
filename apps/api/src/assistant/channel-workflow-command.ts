import { whatsAppProductChatShape } from "@ewatrade/assistant/channels/workflow"
import {
  type WhatsAppWorkflowActionSource,
  whatsAppWorkflowActionSourceSchema,
} from "@ewatrade/assistant/channels/workflow-action-review"
import {
  productRequiresForm,
  productWorkflowContextSchema,
} from "@ewatrade/assistant/product/contracts"
import {
  PRODUCT_WORKFLOW_DRAFT_KEYS,
  WHATSAPP_PRODUCT_WORKFLOW_LIMIT,
  deriveSetupEntityState,
  isProductWorkflowDraftKey,
  setupEntityPayloadSchema,
  setupOpenQuestionSchema,
} from "@ewatrade/assistant/setup/contracts"
import {
  type AssistantScope,
  commitProductConversationInTransaction,
  productClientOperationId,
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
import { isLinkedWhatsAppIdentity } from "./channel-principal"
import type { GeneralTransactionContext } from "./general-actions"
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
  /** The private Catalog copy of the photo this Product draft names, when it is ready. */
  photoAssetId?: string
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
    source.purpose === "SETUP" &&
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
    if (
      !isProductWorkflowDraftKey(entity.key) ||
      value.kind !== "product" ||
      !whatsAppProductChatShape(value) ||
      (input.photoAssetId !== undefined && !value.photoAttachmentId)
    )
      return refuse()
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
    // Same canonical Catalog command as Setup: options become variants, packs
    // become units, and the reviewed photo replaces any library picture.
    const { illustrationId: _picture, ...base } = catalogCommandForSetupEntity(
      entity.id,
      value,
      {
        actorUserId: scope.userId,
        storeId: scope.storeId,
        tenantId: scope.tenantId,
      },
    )
    command = {
      ...base,
      category: base.category ?? (context.data.snapshot.category || undefined),
      ...(input.photoAssetId ? { photoAssetIds: [input.photoAssetId] } : {}),
      // The canonical Product repository overrides this identity at execution too.
      clientOperationId: productClientOperationId(
        source.conversationId,
        entity.key,
      ),
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

/** One private Catalog copy per draft and sent photo; a changed photo gets its own. */
export function channelProductPhotoOperation(
  entityId: string,
  attachmentId: string,
) {
  return `${entityId}-${attachmentId}`
}
/**
 * The ready, unattached Catalog copy of the photo a reviewed Product draft names.
 * Review and execution both bind it into the command digest, so a photo that
 * appears or disappears in between refuses the stale confirmation.
 */
export async function readyChannelProductPhoto(
  tx: Prisma.TransactionClient,
  scope: AssistantScope,
  entity: Entity,
): Promise<string | undefined> {
  const payload = setupEntityPayloadSchema.safeParse(entity.payload)
  if (!payload.success || payload.data.kind !== "product") return undefined
  const attachmentId = payload.data.photoAttachmentId
  if (!attachmentId) return undefined
  const asset = await tx.catalogPhotoAsset.findFirst({
    where: {
      tenantId: scope.tenantId,
      clientOperationId: `setup-photo-${channelProductPhotoOperation(entity.id, attachmentId)}`,
      catalogItemId: null,
      uploadedAt: { not: null },
      storagePath: { not: null },
      state: { in: ["PENDING_REVIEW", "APPROVED"] },
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  })
  return asset?.id
}

/** DB review repository receives only a digest of the actual canonical command, never an executable payload. */
export async function projectCommand(
  tx: Prisma.TransactionClient,
  input: WorkflowCommandProjectionInput,
) {
  const photoAssetId =
    input.source.purpose === "PRODUCT_CREATE"
      ? await readyChannelProductPhoto(tx, input.scope, input.entity)
      : undefined
  const prepared = prepareReviewedWorkflowCommand({ ...input, photoAssetId })
  await assertReviewedWorkflowProductHasNoMatches(
    input.source,
    prepared,
    (query) => tx.catalogItem.count(query),
  )
  const payload = setupEntityPayloadSchema.safeParse(input.entity.payload)
  const sentPhoto =
    input.source.purpose === "PRODUCT_CREATE" &&
    payload.data?.kind === "product" &&
    Boolean(payload.data.photoAttachmentId)
  return {
    commandHash: digest(prepared.command),
    ...(prepared.kind === "catalog" && prepared.categoryLabel
      ? { categoryLabel: prepared.categoryLabel }
      : {}),
    ...(sentPhoto
      ? { photo: photoAssetId ? ("added" as const) : ("skipped" as const) }
      : {}),
  }
}

/** Pure exact comparison before any selected record is confirmed or any domain command runs. */
export function prepareReviewedWorkflowSelection(input: {
  source: WhatsAppWorkflowActionSource
  scope: AssistantScope
  conversation: Conversation
  draft: Draft
  /** Ready private photo copies by draft record id, read inside the same transaction. */
  photos?: ReadonlyMap<string, string>
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
      (draft.entities.length < 1 ||
        draft.entities.length > WHATSAPP_PRODUCT_WORKFLOW_LIMIT ||
        draft.entities.some(
          (entity) => !isProductWorkflowDraftKey(entity.key),
        ) ||
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
    const photoAssetId = input.photos?.get(entity.id)
    const prepared = prepareReviewedWorkflowCommand({
      source,
      entity,
      workflowContext: conversation.workflowContext,
      scope,
      ...(photoAssetId ? { photoAssetId } : {}),
    })
    if (digest(prepared.command) !== selected.commandHash) return refuse()
    return { entity, prepared, photoAssetId }
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
    /** Catalog photo attached in this transaction; queued for review after commit. */
    photoAssetId?: string
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
    !isLinkedWhatsAppIdentity(identity) ||
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
  const photos = new Map<string, string>()
  if (source.purpose === "PRODUCT_CREATE")
    for (const selection of source.selection) {
      const entity = draft.entities.find((row) => row.id === selection.entityId)
      const assetId = entity
        ? await readyChannelProductPhoto(tx, scope, entity)
        : undefined
      if (assetId) photos.set(selection.entityId, assetId)
    }
  const selected = prepareReviewedWorkflowSelection({
    source,
    scope,
    conversation,
    draft,
    photos,
  })
  if (source.purpose === "PRODUCT_CREATE") {
    // All-or-nothing: each reviewed product goes through the canonical Product
    // commit in this one transaction; any refusal rolls every product back.
    for (const item of selected) {
      if (item.prepared.kind !== "catalog" || item.entity.kind !== "PRODUCT")
        return refuse()
      await assertReviewedWorkflowProductHasNoMatches(
        source,
        item.prepared,
        (query) => tx.catalogItem.count(query),
      )
    }
    const records: ReviewedWorkflowSelectionResult["records"] = []
    for (const [index, item] of selected.entries()) {
      const expectedHash = source.selection[index]?.commandHash
      const result = await commitProductConversationInTransaction(
        tx,
        scope,
        {
          conversationId: source.conversationId,
          expectedRevision: source.draftRevision,
          channelEntity: {
            key: item.entity.key,
            allowedKeys: PRODUCT_WORKFLOW_DRAFT_KEYS,
          },
        },
        (entity, workflowContext) => {
          if (entity.id !== item.entity.id) return refuse()
          const command = prepareReviewedWorkflowCommand({
            source,
            entity,
            workflowContext,
            scope,
            ...(item.photoAssetId ? { photoAssetId: item.photoAssetId } : {}),
          })
          if (
            command.kind !== "catalog" ||
            digest(command.command) !== expectedHash
          )
            return refuse()
          return command.command
        },
      )
      records.push({
        entityId: item.entity.id,
        key: item.entity.key,
        kind: "PRODUCT",
        recordId: result.recordId,
        name: result.name,
        ...(item.photoAssetId ? { photoAssetId: item.photoAssetId } : {}),
      })
    }
    return {
      purpose: source.purpose,
      conversationId: source.conversationId,
      draftId: source.draftId,
      records,
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

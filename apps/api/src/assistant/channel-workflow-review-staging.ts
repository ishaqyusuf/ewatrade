import {
  parseWhatsAppWorkflowReviewSelection,
  renderWhatsAppWorkflowActionReviewBody,
  whatsAppProductPhotoCards,
  whatsAppWorkflowActionSourceSchema,
  whatsAppWorkflowReviewAppOnly,
} from "@ewatrade/assistant/channels/workflow-action-review"
import { productWorkflowContextSchema } from "@ewatrade/assistant/product/contracts"
import {
  setupEntityPayloadSchema,
  setupOpenQuestionSchema,
} from "@ewatrade/assistant/setup/contracts"
import {
  readAssistantConversation,
  readSetupDraft,
} from "@ewatrade/db/assistant"
import {
  type WhatsAppInboxLease,
  assistantWhatsAppActionPayloadDigest,
  assistantWhatsAppWorkflowRequestText,
  assistantWhatsAppWorkflowWritesEnabled,
  workflowTrustedAppOrigin,
} from "@ewatrade/db/assistant-whatsapp"
import type { PrismaClient } from "@ewatrade/db/types"
import { z } from "zod"
import { createLinkedAssistantContext } from "./channel-principal"
import {
  channelProductPhotoOperation,
  projectCommand,
} from "./channel-workflow-command"
import { requireSetupAssistantScope } from "./setup-context"
import { prepareSetupProductPhoto } from "./setup-photo"

/** Only exact user-selected keys from the original committed turn become a native workflow review. */
export async function prepareAssistantWhatsAppWorkflowReview(
  db: PrismaClient,
  lease: WhatsAppInboxLease,
  now = new Date(),
) {
  const inbox = await db.assistantWhatsAppInbox.findFirst({
    where: {
      id: lease.inboxId,
      bindingId: lease.bindingId,
      kind: "TURN",
      identityId: null,
      state: "PROCESSING",
      leaseOwner: lease.owner,
      leaseGeneration: lease.generation,
      leaseExpiresAt: { gt: now },
      expiresAt: { gt: now },
    },
    include: { binding: { include: { identity: true } } },
  })
  const binding = inbox?.binding
  if (
    !inbox ||
    !binding ||
    !inbox.executionAuthorityDigest ||
    !assistantWhatsAppWorkflowWritesEnabled(binding.purpose)
  )
    return undefined
  // A tapped suggestion uses the exact command its turn persisted, like typed text.
  const requestText = await assistantWhatsAppWorkflowRequestText(
    db,
    inbox,
    binding.conversationId,
  )
  const selection = requestText
    ? parseWhatsAppWorkflowReviewSelection(requestText)
    : null
  if (selection?.kind !== "review_selection") return undefined
  const run = await db.assistantRun.findFirst({
    where: {
      requestId: inbox.requestId,
      conversationId: binding.conversationId,
      actorUserId: binding.identity.userId,
      status: "COMPLETED",
      assistantMessage: {
        conversationId: binding.conversationId,
        role: "assistant",
      },
    },
    select: { completedAt: true, startedAt: true },
  })
  if (!run) return undefined
  const ctx = await createLinkedAssistantContext(
    db,
    {
      kind: "linked_whatsapp",
      phoneNumberId: binding.identity.phoneNumberId,
      senderId: binding.identity.senderId,
      bindingId: binding.id,
      grantId: binding.grantId,
      identityGeneration: binding.identityGeneration,
      grantGeneration: binding.grantGeneration,
      selectionGeneration: binding.selectionGeneration,
    },
    inbox.requestId,
    lease,
  )
  const scope = requireSetupAssistantScope(ctx)
  const conversation = await readAssistantConversation(
    db,
    scope,
    binding.conversationId,
  )
  if (
    !conversation.setupDraft ||
    conversation.ownerUserId !== scope.userId ||
    (conversation.purpose !== "SETUP" &&
      conversation.purpose !== "PRODUCT_CREATE")
  )
    return undefined
  const draft = await readSetupDraft(db, conversation.setupDraft.id)
  const entities = selection.keys.map((key) =>
    draft.entities.find((entity) => entity.key === key),
  )
  if (entities.some((entity) => !entity)) return undefined
  const product =
    conversation.purpose === "PRODUCT_CREATE"
      ? productWorkflowContextSchema.parse(conversation.workflowContext)
      : null
  const source = whatsAppWorkflowActionSourceSchema.parse({
    version: "workflow-action-v1",
    purpose: conversation.purpose,
    conversationId: conversation.id,
    draftId: draft.id,
    draftRevision: draft.revision,
    origin: { tenantId: scope.tenantId, storeId: scope.storeId },
    workflowContextHash: product
      ? assistantWhatsAppActionPayloadDigest(conversation.workflowContext)
      : null,
    selection: entities.map((entity) => {
      if (!entity) throw Error("Missing selected record")
      return {
        entityId: entity.id,
        key: entity.key,
        state: entity.state,
        payloadHash: assistantWhatsAppActionPayloadDigest(
          setupEntityPayloadSchema.parse(entity.payload),
        ),
        commandHash: "0".repeat(64),
      }
    }),
  })
  const records = []
  for (const selected of source.selection) {
    const entity = entities.find((row) => row?.id === selected.entityId)
    if (!entity) return undefined
    const payload = setupEntityPayloadSchema.parse(entity.payload)
    // A sent photo becomes a private, unattached Catalog copy before review, so
    // the review and the save bind the same copy. QA businesses skip photos.
    if (
      product &&
      payload.kind === "product" &&
      payload.photoAttachmentId &&
      !entity.committedRecordId
    )
      await prepareSetupProductPhoto(db, scope, {
        entityId: channelProductPhotoOperation(
          entity.id,
          payload.photoAttachmentId,
        ),
        conversationId: conversation.id,
        attachmentId: payload.photoAttachmentId,
      })
    const projection = await projectCommand(db, {
      source,
      entity,
      workflowContext: conversation.workflowContext,
      scope,
    })
    selected.commandHash = projection.commandHash
    records.push({
      ...selected,
      payload: setupEntityPayloadSchema.parse(entity.payload),
      openQuestions: z
        .array(setupOpenQuestionSchema)
        .parse(entity.openQuestions ?? []),
      errorCode: entity.errorCode,
      committedRecordId: entity.committedRecordId,
      ...(projection.categoryLabel
        ? { categoryLabel: projection.categoryLabel }
        : {}),
      ...(projection.photo ? { photo: projection.photo } : {}),
    })
  }
  const expiresAt = new Date(
    Math.min(
      inbox.expiresAt.getTime(),
      (run.completedAt ?? run.startedAt).getTime() + 5 * 60_000,
    ),
  )
  const appOnly = whatsAppWorkflowReviewAppOnly(
    {
      purpose: source.purpose,
      conversationId: source.conversationId,
      origin: source.origin,
      entities: draft.entities,
    },
    {
      trustedAppOrigin: workflowTrustedAppOrigin(),
      currentScope: { tenantId: scope.tenantId, storeId: scope.storeId },
    },
  )
  const reviewInput = {
    source,
    records,
    ...(appOnly ? { appOnly } : {}),
    businessName: ctx.tenantContext.tenant.name,
    storeName: ctx.tenantContext.activeStore?.name ?? "",
    currencyCode:
      ctx.tenantContext.activeStore?.currencyCode ??
      ctx.tenantContext.tenant.currencyCode,
    expiresAt: expiresAt.toISOString(),
    ...(product ? { productSnapshot: product.snapshot } : {}),
  }
  const rendered = renderWhatsAppWorkflowActionReviewBody(reviewInput, {
    now: now.getTime(),
  })
  return rendered.kind === "review"
    ? {
        source,
        body: rendered.body,
        expiresAt,
        projectCommand,
        photos: whatsAppProductPhotoCards(reviewInput),
      }
    : undefined
}

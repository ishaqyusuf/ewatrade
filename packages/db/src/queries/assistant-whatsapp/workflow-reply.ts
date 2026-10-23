import {
  type WHATSAPP_WORKFLOW_LEGACY_RENDER_VERSION,
  type WHATSAPP_WORKFLOW_RENDER_VERSION,
  renderWhatsAppWorkflowReply,
  whatsAppWorkflowEnabled,
  whatsAppWorkflowPurposeSchema,
} from "@ewatrade/assistant/channels/workflow"
import {
  productRequiresForm,
  productWorkflowContextSchema,
} from "@ewatrade/assistant/product/contracts"
import { z } from "zod"
import type { DbClient } from "../types"

const textContent = z
  .object({ type: z.literal("text"), text: z.string().min(1).max(8000) })
  .passthrough()

/** Owning settlement transaction supplies only exact persisted source IDs and freshly authorized scope. */
export async function renderAssistantWhatsAppWorkflowReply(
  db: DbClient,
  input: {
    inboxId: string
    runId: string
    actorUserId: string
    tenantId: string
    storeId: string
    purpose: "SETUP" | "PRODUCT_CREATE"
    trustedAppOrigin: string
    rendererVersion?:
      | typeof WHATSAPP_WORKFLOW_RENDER_VERSION
      | typeof WHATSAPP_WORKFLOW_LEGACY_RENDER_VERSION
  },
) {
  if (!whatsAppWorkflowEnabled(input.purpose)) return undefined
  const inbox = await db.assistantWhatsAppInbox.findFirst({
    where: { id: input.inboxId, kind: "TURN", identityId: null },
    select: {
      requestId: true,
      userMessageId: true,
      content: true,
      executionAuthorityDigest: true,
      binding: {
        select: {
          purpose: true,
          identity: { select: { userId: true } },
          conversation: {
            select: {
              id: true,
              purpose: true,
              ownerUserId: true,
              tenantId: true,
              storeId: true,
              workflowContext: true,
              tenant: { select: { name: true } },
              store: { select: { name: true, currencyCode: true } },
              setupDraft: {
                select: {
                  revision: true,
                  entities: {
                    orderBy: { sortOrder: "asc" },
                    take: 201,
                    select: {
                      key: true,
                      kind: true,
                      state: true,
                      payload: true,
                      openQuestions: true,
                      errorCode: true,
                      committedRecordId: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  const conversation = inbox?.binding?.conversation
  const request = textContent.safeParse(inbox?.content)
  if (
    !inbox?.binding ||
    !inbox.executionAuthorityDigest ||
    !conversation?.setupDraft ||
    !request.success ||
    !whatsAppWorkflowPurposeSchema.safeParse(conversation.purpose).success ||
    inbox.binding.purpose !== input.purpose ||
    conversation.purpose !== input.purpose ||
    conversation.ownerUserId !== input.actorUserId ||
    inbox.binding.identity.userId !== input.actorUserId ||
    conversation.tenantId !== input.tenantId ||
    conversation.storeId !== input.storeId ||
    conversation.setupDraft.entities.length > 200
  )
    return undefined
  const run = await db.assistantRun.findFirst({
    where: {
      id: input.runId,
      requestId: inbox.requestId,
      conversationId: conversation.id,
      actorUserId: input.actorUserId,
      status: "COMPLETED",
    },
    select: {
      assistantMessageId: true,
      assistantMessage: {
        select: { id: true, conversationId: true, role: true, parts: true },
      },
    },
  })
  if (
    !run?.assistantMessage ||
    run.assistantMessage.id !== run.assistantMessageId ||
    run.assistantMessage.conversationId !== conversation.id ||
    run.assistantMessage.role !== "assistant" ||
    !Array.isArray(run.assistantMessage.parts)
  )
    return undefined
  const product =
    input.purpose === "PRODUCT_CREATE"
      ? productWorkflowContextSchema.safeParse(conversation.workflowContext)
      : null
  if (product && !product.success) return undefined
  return renderWhatsAppWorkflowReply(
    {
      purpose: input.purpose,
      conversationId: conversation.id,
      ownerUserId: conversation.ownerUserId,
      origin: {
        tenantId: conversation.tenantId,
        storeId: conversation.storeId,
      },
      currencyCode: conversation.store.currencyCode,
      revision: conversation.setupDraft.revision,
      parts: run.assistantMessage.parts,
      requestText: request.data.text,
      requiresForm: product?.success
        ? productRequiresForm(product.data.snapshot)
        : false,
      entities: conversation.setupDraft.entities,
    },
    {
      actorUserId: input.actorUserId,
      currentScope: { tenantId: input.tenantId, storeId: input.storeId },
      scopeLabel: `${conversation.tenant.name} · ${conversation.store.name}`,
      trustedAppOrigin: input.trustedAppOrigin,
      rendererVersion: input.rendererVersion,
    },
  )
}

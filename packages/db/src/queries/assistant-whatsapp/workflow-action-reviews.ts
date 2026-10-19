import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto"
import { whatsAppChannelPolicy } from "@ewatrade/assistant/channels/policy"
import {
  whatsAppWorkflowEnabled,
  whatsAppWorkflowPolicy,
} from "@ewatrade/assistant/channels/workflow"
import {
  type WhatsAppWorkflowActionResult,
  whatsAppWorkflowActionResultSchema,
} from "@ewatrade/assistant/channels/workflow-action-result"
export {
  type WhatsAppWorkflowActionResult,
  whatsAppWorkflowActionResultSchema,
} from "@ewatrade/assistant/channels/workflow-action-result"
import {
  WHATSAPP_WORKFLOW_ACTION_REVIEW_VERSION,
  type WhatsAppWorkflowActionSource,
  appendWhatsAppWorkflowActionInstructions,
  parseWhatsAppWorkflowReviewSelection,
  renderWhatsAppWorkflowActionReviewBody,
  whatsAppWorkflowActionButtonId,
  whatsAppWorkflowActionSourceSchema,
} from "@ewatrade/assistant/channels/workflow-action-review"
import { productWorkflowContextSchema } from "@ewatrade/assistant/product/contracts"
import { setupEntityPayloadSchema } from "@ewatrade/assistant/setup/contracts"
import { z } from "zod"
import type { Prisma } from "../../../generated/prisma/client"
import { readSetupDraft } from "../assistant"
import { assistantWhatsAppActionPayloadDigest } from "./action-reviews"
import { AssistantWhatsAppError } from "./authority"
import {
  type WhatsAppConversationPrincipal,
  resolveAssistantWhatsAppConversation,
} from "./conversations"
import { assistantWhatsAppAuthorityDigest } from "./execution"
import { resolveAssistantWhatsAppGrant } from "./grants"

const id = z.string().min(1).max(128)
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const purpose = z.enum(["SETUP", "PRODUCT_CREATE"])
const decision = z.enum(["confirm", "cancel"])
const code = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex")
const equal = (left: string, right: string) =>
  Buffer.byteLength(left) === Buffer.byteLength(right) &&
  timingSafeEqual(Buffer.from(left), Buffer.from(right))
const digest = assistantWhatsAppActionPayloadDigest
export const whatsAppWorkflowActionIngressContentSchema = z
  .object({
    type: z.literal("workflow_action"),
    purpose,
    decision,
    decisionDigest: hash,
    replyToMessageId: z.string().min(1).max(256),
  })
  .strict()
export const whatsAppWorkflowReviewMaterialSchema = z
  .object({
    bindingId: id,
    purpose,
    conversationId: id,
    draftId: id,
    draftRevision: z.number().int().nonnegative(),
    sourceDigest: hash,
    reviewDigest: hash,
    authorityDigest: hash,
    identityGeneration: z.number().int().positive(),
    grantGeneration: z.number().int().positive(),
    selectionGeneration: z.number().int().positive(),
    reviewOutboxId: id,
    nonce: z.uuid(),
    keyVersion: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
    expiresAt: z.date(),
  })
  .strict()
export type WhatsAppWorkflowReviewMaterial = z.infer<
  typeof whatsAppWorkflowReviewMaterialSchema
>
export function assistantWhatsAppWorkflowSourceDigest(
  source: WhatsAppWorkflowActionSource,
) {
  return digest(whatsAppWorkflowActionSourceSchema.parse(source))
}
export function deriveAssistantWhatsAppWorkflowReviewCode(
  material: WhatsAppWorkflowReviewMaterial,
  action: "confirm" | "cancel",
  signingKey: string,
) {
  const parsed = whatsAppWorkflowReviewMaterialSchema.parse(material)
  decision.parse(action)
  if (Buffer.byteLength(signingKey, "utf8") < 32)
    throw Error("Assistant workflow signing key unavailable")
  return createHmac("sha256", signingKey)
    .update(
      digest({
        domain: "ewatrade.whatsapp.workflow-review.code.v1",
        ...parsed,
        expiresAt: parsed.expiresAt.toISOString(),
        decision: action,
      }),
    )
    .digest("base64url")
}
export function assistantWhatsAppWorkflowDecisionDigest(
  value: string,
  action: "confirm" | "cancel",
  workflowPurpose: "SETUP" | "PRODUCT_CREATE",
) {
  code.parse(value)
  decision.parse(action)
  purpose.parse(workflowPurpose)
  return sha256(
    `ewatrade.whatsapp.workflow-review.lookup.v1\n${workflowPurpose}\n${action}\n${value}`,
  )
}

/** Reject rotated pending proofs without preventing receipt-only replay of completed work. */
export function assistantWhatsAppWorkflowReviewMatchesCurrentKey(
  material: WhatsAppWorkflowReviewMaterial,
  saved: { confirmDigest: string; cancelDigest: string },
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  try {
    if (
      material.keyVersion !==
      (env.ASSISTANT_APPROVAL_SIGNING_KEY_VERSION ?? "v1")
    )
      return false
    return (["confirm", "cancel"] as const).every((action) => {
      const value = deriveAssistantWhatsAppWorkflowReviewCode(
        material,
        action,
        env.ASSISTANT_APPROVAL_SIGNING_KEY ?? "",
      )
      return equal(
        hash.parse(saved[`${action}Digest`]),
        assistantWhatsAppWorkflowDecisionDigest(
          value,
          action,
          material.purpose,
        ),
      )
    })
  } catch {
    return false
  }
}
export function assistantWhatsAppWorkflowWritesEnabled(
  workflowPurpose: string,
  env: Record<string, string | undefined> = process.env,
) {
  return (
    whatsAppWorkflowEnabled(workflowPurpose, env) &&
    whatsAppChannelPolicy(env).writes &&
    whatsAppWorkflowPolicy(env).nativeWrites
  )
}
type Entity = Awaited<ReturnType<typeof readSetupDraft>>["entities"][number]
/** API supplies the existing canonical prepared-command digest; DB never imports app adapters. */
export type WhatsAppWorkflowCommandProjector = (
  tx: Prisma.TransactionClient,
  input: {
    source: WhatsAppWorkflowActionSource
    entity: Entity
    workflowContext: unknown
    scope: { userId: string; tenantId: string; storeId: string }
  },
) => Promise<{ commandHash: string; categoryLabel?: string }>

async function lockIdentity(
  tx: Prisma.TransactionClient,
  principal: WhatsAppConversationPrincipal,
) {
  await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE "phoneNumberId"=${principal.phoneNumberId} AND "senderId"=${principal.senderId} FOR UPDATE`
}
function requireOwnerMode(resolved: {
  conversation: { purpose: string }
  tenantContext: { membership: { role: string } }
}) {
  if (
    !purpose.safeParse(resolved.conversation.purpose).success ||
    !["OWNER", "ADMIN"].includes(resolved.tenantContext.membership.role) ||
    !whatsAppWorkflowEnabled(resolved.conversation.purpose)
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
}
type Resolved = Awaited<ReturnType<typeof resolveAssistantWhatsAppConversation>>
async function currentSource(
  tx: Prisma.TransactionClient,
  resolved: Resolved,
  source: WhatsAppWorkflowActionSource,
  projectCommand?: WhatsAppWorkflowCommandProjector,
) {
  if (
    source.conversationId !== resolved.conversation.id ||
    source.purpose !== resolved.conversation.purpose ||
    source.origin.tenantId !== resolved.scope.tenantId ||
    source.origin.storeId !== resolved.scope.storeId
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  await tx.$queryRaw`SELECT id FROM "AssistantConversation" WHERE id=${source.conversationId} FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM "SetupDraft" WHERE id=${source.draftId} FOR UPDATE`
  const conversation = await tx.assistantConversation.findFirst({
    where: {
      id: source.conversationId,
      ownerUserId: resolved.scope.userId,
      tenantId: resolved.scope.tenantId,
      storeId: resolved.scope.storeId,
      purpose: source.purpose,
      status: "ACTIVE",
      setupDraft: { id: source.draftId },
    },
    select: {
      workflowContext: true,
      tenant: { select: { name: true } },
      store: { select: { name: true, currencyCode: true } },
    },
  })
  if (!conversation) throw new AssistantWhatsAppError("UNAUTHORIZED")
  const draft = await readSetupDraft(tx, source.draftId)
  if (
    await tx.assistantRun.count({
      where: { conversationId: source.conversationId, status: "RUNNING" },
    })
  )
    throw new AssistantWhatsAppError("CONFLICT")
  if (
    draft.revision !== source.draftRevision ||
    (source.purpose === "PRODUCT_CREATE" &&
      (draft.entities.length !== 1 ||
        source.workflowContextHash !== digest(conversation.workflowContext)))
  )
    throw new AssistantWhatsAppError("CONFLICT")
  const records = []
  for (const selected of source.selection) {
    const entity = draft.entities.find(
      (row) => row.id === selected.entityId && row.key === selected.key,
    )
    const parsed = setupEntityPayloadSchema.safeParse(entity?.payload)
    if (
      !entity ||
      !parsed.success ||
      entity.kind !== parsed.data.kind.toUpperCase() ||
      entity.state !== selected.state ||
      digest(parsed.data) !== selected.payloadHash ||
      entity.committedRecordId ||
      entity.errorCode
    )
      throw new AssistantWhatsAppError("CONFLICT")
    const projection = projectCommand
      ? await projectCommand(tx, {
          source,
          entity,
          workflowContext: conversation.workflowContext,
          scope: resolved.scope,
        })
      : undefined
    if (
      projection &&
      (!hash.safeParse(projection.commandHash).success ||
        !equal(projection.commandHash, selected.commandHash))
    )
      throw new AssistantWhatsAppError("CONFLICT")
    records.push({
      ...selected,
      payload: parsed.data,
      openQuestions: entity.openQuestions ?? [],
      errorCode: entity.errorCode,
      committedRecordId: entity.committedRecordId,
      ...(projection?.categoryLabel
        ? { categoryLabel: projection.categoryLabel }
        : {}),
    })
  }
  const product =
    source.purpose === "PRODUCT_CREATE"
      ? productWorkflowContextSchema.safeParse(conversation.workflowContext)
      : null
  if (product && !product.success) throw new AssistantWhatsAppError("CONFLICT")
  return {
    source,
    businessName: conversation.tenant.name,
    storeName: conversation.store.name,
    currencyCode: conversation.store.currencyCode,
    records,
    ...(product?.success ? { productSnapshot: product.data.snapshot } : {}),
  }
}
type IssueInput = {
  principal: WhatsAppConversationPrincipal
  source: WhatsAppWorkflowActionSource
  reviewOutboxId: string
  reviewDigest: string
  authorityDigest: string
  expiresAt: Date
  nonce?: string
  keyVersion: string
  signingKey: string
  projectCommand: WhatsAppWorkflowCommandProjector
}
/** Owning SERIALIZABLE transaction creates the outbox and exact proof together. */
export async function issueAssistantWhatsAppWorkflowReviewInTransaction(
  tx: Prisma.TransactionClient,
  input: IssueInput,
  now = new Date(),
) {
  const source = whatsAppWorkflowActionSourceSchema.parse(input.source)
  if (!assistantWhatsAppWorkflowWritesEnabled(source.purpose))
    throw new AssistantWhatsAppError("UNAVAILABLE")
  await lockIdentity(tx, input.principal)
  const resolved = await resolveAssistantWhatsAppConversation(
    tx,
    input.principal,
    now,
  )
  requireOwnerMode(resolved)
  const projection = await currentSource(
    tx,
    resolved,
    source,
    input.projectCommand,
  )
  const outbox = await tx.assistantWhatsAppOutbox.findFirst({
    where: { id: input.reviewOutboxId },
    include: { inbox: true },
  })
  const request =
    outbox?.inbox.content &&
    typeof outbox.inbox.content === "object" &&
    !Array.isArray(outbox.inbox.content) &&
    "text" in outbox.inbox.content
      ? parseWhatsAppWorkflowReviewSelection(
          typeof outbox.inbox.content.text === "string"
            ? outbox.inbox.content.text
            : undefined,
        )
      : null
  const rendered = renderWhatsAppWorkflowActionReviewBody(
    { ...projection, expiresAt: input.expiresAt.toISOString() },
    { now: now.getTime() },
  )
  if (
    !outbox ||
    outbox.state !== "PENDING" ||
    outbox.inbox.kind !== "TURN" ||
    outbox.inbox.bindingId !== resolved.binding.id ||
    outbox.phoneNumberId !== input.principal.phoneNumberId ||
    outbox.renderKind !== "workflow_action_review" ||
    outbox.rendererVersion !== WHATSAPP_WORKFLOW_ACTION_REVIEW_VERSION ||
    outbox.chunkCount !== 1 ||
    outbox.chunkIndex !== 0 ||
    !outbox.content ||
    !request ||
    request.kind !== "review_selection" ||
    request.keys.length !== source.selection.length ||
    request.keys.some(
      (entry, index) => entry !== source.selection[index]?.key,
    ) ||
    rendered.kind !== "review" ||
    rendered.body !== outbox.content ||
    sha256(outbox.content) !== input.reviewDigest ||
    outbox.contentDigest !== input.reviewDigest ||
    outbox.authorityDigest !== input.authorityDigest ||
    outbox.inbox.executionAuthorityDigest !== input.authorityDigest ||
    input.authorityDigest !==
      (await assistantWhatsAppAuthorityDigest(tx, resolved))
  )
    throw new AssistantWhatsAppError("CONFLICT")
  if (
    input.expiresAt <= now ||
    input.expiresAt.getTime() > now.getTime() + 5 * 60_000 ||
    input.expiresAt > outbox.expiresAt ||
    input.expiresAt > resolved.grant.expiresAt ||
    input.expiresAt > resolved.grant.idleExpiresAt
  )
    throw new AssistantWhatsAppError("EXPIRED")
  const material = whatsAppWorkflowReviewMaterialSchema.parse({
    bindingId: resolved.binding.id,
    purpose: source.purpose,
    conversationId: source.conversationId,
    draftId: source.draftId,
    draftRevision: source.draftRevision,
    sourceDigest: assistantWhatsAppWorkflowSourceDigest(source),
    reviewDigest: input.reviewDigest,
    authorityDigest: input.authorityDigest,
    identityGeneration: resolved.binding.identityGeneration,
    grantGeneration: resolved.binding.grantGeneration,
    selectionGeneration: resolved.binding.selectionGeneration,
    reviewOutboxId: outbox.id,
    nonce: input.nonce ?? randomUUID(),
    keyVersion: input.keyVersion,
    expiresAt: input.expiresAt,
  })
  const prior = await tx.assistantWhatsAppWorkflowReview.findUnique({
    where: { reviewOutboxId: outbox.id },
  })
  const issued = prior ? { ...material, nonce: prior.nonce } : material
  const confirmCode = deriveAssistantWhatsAppWorkflowReviewCode(
    issued,
    "confirm",
    input.signingKey,
  )
  const cancelCode = deriveAssistantWhatsAppWorkflowReviewCode(
    issued,
    "cancel",
    input.signingKey,
  )
  const confirmDigest = assistantWhatsAppWorkflowDecisionDigest(
    confirmCode,
    "confirm",
    source.purpose,
  )
  const cancelDigest = assistantWhatsAppWorkflowDecisionDigest(
    cancelCode,
    "cancel",
    source.purpose,
  )
  if (
    outbox.content.includes(confirmCode) ||
    outbox.content.includes(cancelCode)
  )
    throw new AssistantWhatsAppError("CONFLICT")
  if (prior) {
    if (
      prior.state !== "PENDING" ||
      !equal(prior.confirmDigest, confirmDigest) ||
      !equal(prior.cancelDigest, cancelDigest)
    )
      throw new AssistantWhatsAppError("CONFLICT")
    return prior
  }
  const { purpose: _purpose, ...persisted } = material
  return tx.assistantWhatsAppWorkflowReview.create({
    data: { ...persisted, source, confirmDigest, cancelDigest },
  })
}

/** Closed Product scope is receipt-only and never grants a TURN or a fresh commit. */
async function resolveReceiptScope(
  tx: Prisma.TransactionClient,
  principal: WhatsAppConversationPrincipal,
  source: WhatsAppWorkflowActionSource,
  now: Date,
) {
  const resolved = await resolveAssistantWhatsAppGrant(tx, principal, now)
  const binding = await tx.assistantWhatsAppBinding.findFirst({
    where: {
      id: principal.bindingId,
      grantId: principal.grantId,
      identityGeneration: principal.identityGeneration,
      grantGeneration: principal.grantGeneration,
      selectionGeneration: principal.selectionGeneration,
      identity: {
        id: resolved.grant.identity.id,
        activeBindingId: principal.bindingId,
        selectionGeneration: principal.selectionGeneration,
      },
      conversation: {
        id: source.conversationId,
        ownerUserId: resolved.scope.userId,
        tenantId: resolved.scope.tenantId,
        storeId: resolved.scope.storeId,
        purpose: source.purpose,
        status:
          source.purpose === "PRODUCT_CREATE"
            ? { in: ["ACTIVE", "COMPLETED"] }
            : "ACTIVE",
        setupDraft: { id: source.draftId },
      },
    },
    include: { conversation: { select: { id: true, purpose: true } } },
  })
  if (
    !binding ||
    binding.purpose !== source.purpose ||
    source.origin.tenantId !== resolved.scope.tenantId ||
    source.origin.storeId !== resolved.scope.storeId
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const result = { ...resolved, binding, conversation: binding.conversation }
  requireOwnerMode(result)
  return result
}
export async function resolveAssistantWhatsAppWorkflowReceipt(
  tx: Prisma.TransactionClient,
  principal: WhatsAppConversationPrincipal,
  reviewId: string,
  now = new Date(),
) {
  await lockIdentity(tx, principal)
  const review = await tx.assistantWhatsAppWorkflowReview.findUnique({
    where: { id: reviewId },
  })
  if (
    !review ||
    review.state !== "CONSUMED" ||
    !review.completedAt ||
    !review.resultRef
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const source = whatsAppWorkflowActionSourceSchema.parse(review.source)
  if (
    assistantWhatsAppWorkflowSourceDigest(source) !== review.sourceDigest ||
    source.conversationId !== review.conversationId ||
    source.draftId !== review.draftId ||
    source.draftRevision !== review.draftRevision
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const resolved = await resolveReceiptScope(tx, principal, source, now)
  if (
    review.bindingId !== resolved.binding.id ||
    review.identityGeneration !== resolved.binding.identityGeneration ||
    review.grantGeneration !== resolved.binding.grantGeneration ||
    review.selectionGeneration !== resolved.binding.selectionGeneration ||
    review.authorityDigest !==
      (await assistantWhatsAppAuthorityDigest(tx, resolved))
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  return {
    ...resolved,
    review,
    source,
    result: whatsAppWorkflowActionResultSchema.parse(review.resultRef),
  }
}

type ConsumeInput = {
  principal: WhatsAppConversationPrincipal
  purpose: "SETUP" | "PRODUCT_CREATE"
  decisionDigest: string
  decision: "confirm" | "cancel"
  quotedProviderMessageId: string
  ingressId: string
  projectCommand: WhatsAppWorkflowCommandProjector
}
/** Root canonical command and exact outcome must commit in this same transaction. */
export async function consumeAssistantWhatsAppWorkflowReviewInTransaction(
  tx: Prisma.TransactionClient,
  input: ConsumeInput,
  now = new Date(),
) {
  const lookup = hash.parse(input.decisionDigest)
  purpose.parse(input.purpose)
  decision.parse(input.decision)
  await lockIdentity(tx, input.principal)
  const review = await tx.assistantWhatsAppWorkflowReview.findFirst({
    where:
      input.decision === "confirm"
        ? { confirmDigest: lookup }
        : { cancelDigest: lookup },
  })
  if (!review) throw new AssistantWhatsAppError("UNAUTHORIZED")
  const source = whatsAppWorkflowActionSourceSchema.parse(review.source)
  if (
    source.purpose !== input.purpose ||
    assistantWhatsAppWorkflowSourceDigest(source) !== review.sourceDigest ||
    source.conversationId !== review.conversationId ||
    source.draftId !== review.draftId ||
    source.draftRevision !== review.draftRevision
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const resolved =
    review.state === "CONSUMED"
      ? await resolveReceiptScope(tx, input.principal, source, now)
      : await resolveAssistantWhatsAppConversation(tx, input.principal, now)
  requireOwnerMode(resolved)
  if (
    review.bindingId !== resolved.binding.id ||
    review.identityGeneration !== resolved.binding.identityGeneration ||
    review.grantGeneration !== resolved.binding.grantGeneration ||
    review.selectionGeneration !== resolved.binding.selectionGeneration
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  await tx.$queryRaw`SELECT id FROM "AssistantConversation" WHERE id=${source.conversationId} FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM "SetupDraft" WHERE id=${source.draftId} FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppWorkflowReview" WHERE id=${review.id} FOR UPDATE`
  const locked = await tx.assistantWhatsAppWorkflowReview.findUniqueOrThrow({
    where: { id: review.id },
  })
  const ingress = await tx.assistantWhatsAppInbox.findFirst({
    where: {
      id: input.ingressId,
      kind: "ACTION",
      bindingId: resolved.binding.id,
      phoneNumberId: input.principal.phoneNumberId,
      expiresAt: { gt: now },
      state: { in: ["PENDING", "PROCESSING"] },
    },
  })
  const content = whatsAppWorkflowActionIngressContentSchema.safeParse(
    ingress?.content,
  )
  const outbox = await tx.assistantWhatsAppOutbox.findFirst({
    where: {
      id: review.reviewOutboxId,
      phoneNumberId: input.principal.phoneNumberId,
      providerMessageId: input.quotedProviderMessageId,
      state: { in: ["SENT", "DELIVERED", "READ"] },
      deliveryAttempts: {
        some: {
          state: "ACCEPTED",
          providerMessageId: input.quotedProviderMessageId,
        },
      },
    },
    include: { inbox: true },
  })
  if (
    !ingress ||
    !content.success ||
    content.data.purpose !== input.purpose ||
    content.data.decision !== input.decision ||
    !equal(content.data.decisionDigest, lookup) ||
    content.data.replyToMessageId !== input.quotedProviderMessageId ||
    !outbox ||
    outbox.renderKind !== "workflow_action_review" ||
    outbox.inbox.bindingId !== resolved.binding.id ||
    !outbox.sentAt ||
    ingress.providerOccurredAt.getTime() <
      Math.floor(outbox.sentAt.getTime() / 1000) * 1000 ||
    !outbox.content ||
    outbox.contentDigest !== review.reviewDigest ||
    sha256(outbox.content) !== review.reviewDigest ||
    locked.sourceDigest !== review.sourceDigest ||
    locked.authorityDigest !==
      (await assistantWhatsAppAuthorityDigest(tx, resolved))
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const reference = {
    reviewId: locked.id,
    source,
    decision: input.decision,
    resultRef: locked.resultRef,
  }
  if (locked.state === "CONSUMED") {
    if (
      locked.decision !== input.decision ||
      !locked.completedAt ||
      !locked.resultRef ||
      !whatsAppWorkflowActionResultSchema.safeParse(locked.resultRef).success
    )
      throw new AssistantWhatsAppError("CONFLICT")
    return { ...reference, alreadyConsumed: true as const }
  }
  if (locked.state !== "PENDING") throw new AssistantWhatsAppError("CONFLICT")
  if (locked.expiresAt <= now || ingress.providerOccurredAt >= locked.expiresAt)
    throw new AssistantWhatsAppError("EXPIRED")
  if (
    !assistantWhatsAppWorkflowReviewMatchesCurrentKey(
      {
        bindingId: locked.bindingId,
        purpose: source.purpose,
        conversationId: locked.conversationId,
        draftId: locked.draftId,
        draftRevision: locked.draftRevision,
        sourceDigest: locked.sourceDigest,
        reviewDigest: locked.reviewDigest,
        authorityDigest: locked.authorityDigest,
        identityGeneration: locked.identityGeneration,
        grantGeneration: locked.grantGeneration,
        selectionGeneration: locked.selectionGeneration,
        reviewOutboxId: locked.reviewOutboxId,
        nonce: locked.nonce,
        keyVersion: locked.keyVersion,
        expiresAt: locked.expiresAt,
      },
      locked,
    )
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  if (
    input.decision === "confirm" &&
    !assistantWhatsAppWorkflowWritesEnabled(source.purpose)
  )
    throw new AssistantWhatsAppError("UNAVAILABLE")
  const projection = await currentSource(
    tx,
    resolved,
    source,
    input.projectCommand,
  )
  const rendered = renderWhatsAppWorkflowActionReviewBody(
    { ...projection, expiresAt: locked.expiresAt.toISOString() },
    { now: now.getTime() },
  )
  if (rendered.kind !== "review" || rendered.body !== outbox.content)
    throw new AssistantWhatsAppError("CONFLICT")
  const changed = await tx.assistantWhatsAppWorkflowReview.updateMany({
    where: { id: locked.id, state: "PENDING" },
    data: {
      state: "CONSUMED",
      decision: input.decision,
      consumedByIngressId: ingress.id,
    },
  })
  if (changed.count !== 1) throw new AssistantWhatsAppError("CONFLICT")
  return { ...reference, alreadyConsumed: false as const }
}

export async function completeAssistantWhatsAppWorkflowReviewInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    principal: WhatsAppConversationPrincipal
    reviewId: string
    ingressId: string
    resultRef: WhatsAppWorkflowActionResult
  },
  now = new Date(),
) {
  await lockIdentity(tx, input.principal)
  const review = await tx.assistantWhatsAppWorkflowReview.findFirst({
    where: {
      id: input.reviewId,
      state: "CONSUMED",
      consumedByIngressId: input.ingressId,
      completedAt: null,
    },
  })
  if (!review) throw new AssistantWhatsAppError("CONFLICT")
  const source = whatsAppWorkflowActionSourceSchema.parse(review.source)
  if (
    assistantWhatsAppWorkflowSourceDigest(source) !== review.sourceDigest ||
    source.conversationId !== review.conversationId ||
    source.draftId !== review.draftId ||
    source.draftRevision !== review.draftRevision
  )
    throw new AssistantWhatsAppError("CONFLICT")
  const result = whatsAppWorkflowActionResultSchema.parse(input.resultRef)
  const resolved = await resolveReceiptScope(tx, input.principal, source, now)
  const savedDraft = await readSetupDraft(tx, source.draftId)
  if (
    review.bindingId !== resolved.binding.id ||
    review.identityGeneration !== resolved.binding.identityGeneration ||
    review.grantGeneration !== resolved.binding.grantGeneration ||
    review.selectionGeneration !== resolved.binding.selectionGeneration ||
    review.authorityDigest !==
      (await assistantWhatsAppAuthorityDigest(tx, resolved)) ||
    result.purpose !== source.purpose ||
    result.conversationId !== source.conversationId ||
    result.draftId !== source.draftId ||
    result.results.length !== source.selection.length ||
    result.results.some(
      (entry, index) =>
        entry.entityId !== source.selection[index]?.entityId ||
        entry.key !== source.selection[index]?.key ||
        (entry.state === "COMMITTED" && !entry.recordId) ||
        (entry.state !== "COMMITTED" && entry.recordId) ||
        (review.decision === "cancel" && entry.state !== "CANCELLED") ||
        (review.decision === "confirm" && entry.state === "CANCELLED"),
    )
  )
    throw new AssistantWhatsAppError("CONFLICT")
  for (const entry of result.results) {
    const selected = source.selection.find(
      (record) =>
        record.entityId === entry.entityId && record.key === entry.key,
    )
    const entity = savedDraft.entities.find(
      (record) => record.id === entry.entityId && record.key === entry.key,
    )
    const payload = setupEntityPayloadSchema.safeParse(entity?.payload)
    if (
      !selected ||
      !entity ||
      !payload.success ||
      digest(payload.data) !== selected.payloadHash ||
      (entry.state === "COMMITTED" &&
        (entity.state !== "COMMITTED" ||
          entity.committedRecordId !== entry.recordId)) ||
      (entry.state !== "COMMITTED" && entity.committedRecordId) ||
      (entry.kind && entry.kind !== entity.kind) ||
      (entry.name && entry.name !== payload.data.name)
    )
      throw new AssistantWhatsAppError("CONFLICT")
  }
  const changed = await tx.assistantWhatsAppWorkflowReview.updateMany({
    where: {
      id: review.id,
      state: "CONSUMED",
      consumedByIngressId: input.ingressId,
      completedAt: null,
    },
    data: { resultRef: result, completedAt: now },
  })
  if (changed.count !== 1) throw new AssistantWhatsAppError("CONFLICT")
}

/** Called under the existing delivery transaction before effect intent; no provider work here. */
export async function prepareAssistantWhatsAppWorkflowReviewDispatch(
  tx: Prisma.TransactionClient,
  input: {
    principal: WhatsAppConversationPrincipal
    reviewOutboxId: string
    signingKey: string
    keyVersion: string
  },
  now = new Date(),
) {
  await lockIdentity(tx, input.principal)
  const resolved = await resolveAssistantWhatsAppConversation(
    tx,
    input.principal,
    now,
  )
  requireOwnerMode(resolved)
  if (!assistantWhatsAppWorkflowWritesEnabled(resolved.conversation.purpose))
    throw new AssistantWhatsAppError("UNAVAILABLE")
  const review = await tx.assistantWhatsAppWorkflowReview.findUnique({
    where: { reviewOutboxId: input.reviewOutboxId },
  })
  const outbox = await tx.assistantWhatsAppOutbox.findUnique({
    where: { id: input.reviewOutboxId },
    include: { inbox: true },
  })
  if (
    !review ||
    !outbox ||
    !["PENDING", "SENDING"].includes(outbox.state) ||
    outbox.expiresAt <= now ||
    outbox.phoneNumberId !== input.principal.phoneNumberId ||
    outbox.inbox.kind !== "TURN" ||
    outbox.inbox.bindingId !== resolved.binding.id ||
    outbox.inbox.executionAuthorityDigest !== review.authorityDigest ||
    review.state !== "PENDING" ||
    review.expiresAt <= now ||
    review.keyVersion !== input.keyVersion ||
    !outbox.content ||
    outbox.renderKind !== "workflow_action_review" ||
    outbox.rendererVersion !== WHATSAPP_WORKFLOW_ACTION_REVIEW_VERSION ||
    outbox.chunkCount !== 1 ||
    outbox.chunkIndex !== 0 ||
    sha256(outbox.content) !== review.reviewDigest ||
    outbox.contentDigest !== review.reviewDigest ||
    review.bindingId !== resolved.binding.id ||
    review.identityGeneration !== resolved.binding.identityGeneration ||
    review.grantGeneration !== resolved.binding.grantGeneration ||
    review.selectionGeneration !== resolved.binding.selectionGeneration ||
    review.authorityDigest !== outbox.authorityDigest ||
    review.authorityDigest !==
      (await assistantWhatsAppAuthorityDigest(tx, resolved))
  )
    throw new AssistantWhatsAppError("CONFLICT")
  const source = whatsAppWorkflowActionSourceSchema.parse(review.source)
  if (
    assistantWhatsAppWorkflowSourceDigest(source) !== review.sourceDigest ||
    source.conversationId !== review.conversationId ||
    source.draftId !== review.draftId ||
    source.draftRevision !== review.draftRevision
  )
    throw new AssistantWhatsAppError("CONFLICT")
  await currentSource(tx, resolved, source)
  const material: WhatsAppWorkflowReviewMaterial = {
    bindingId: review.bindingId,
    purpose: source.purpose,
    conversationId: review.conversationId,
    draftId: review.draftId,
    draftRevision: review.draftRevision,
    sourceDigest: review.sourceDigest,
    reviewDigest: review.reviewDigest,
    authorityDigest: review.authorityDigest,
    identityGeneration: review.identityGeneration,
    grantGeneration: review.grantGeneration,
    selectionGeneration: review.selectionGeneration,
    reviewOutboxId: review.reviewOutboxId,
    nonce: review.nonce,
    keyVersion: review.keyVersion,
    expiresAt: review.expiresAt,
  }
  const confirmCode = deriveAssistantWhatsAppWorkflowReviewCode(
    material,
    "confirm",
    input.signingKey,
  )
  const cancelCode = deriveAssistantWhatsAppWorkflowReviewCode(
    material,
    "cancel",
    input.signingKey,
  )
  if (
    !equal(
      review.confirmDigest,
      assistantWhatsAppWorkflowDecisionDigest(
        confirmCode,
        "confirm",
        source.purpose,
      ),
    ) ||
    !equal(
      review.cancelDigest,
      assistantWhatsAppWorkflowDecisionDigest(
        cancelCode,
        "cancel",
        source.purpose,
      ),
    )
  )
    throw new AssistantWhatsAppError("CONFLICT")
  const rendered = appendWhatsAppWorkflowActionInstructions(
    {
      kind: "review",
      version: WHATSAPP_WORKFLOW_ACTION_REVIEW_VERSION,
      source,
      body: outbox.content,
    },
    { confirmCode, cancelCode },
  )
  if (rendered.kind !== "review") throw new AssistantWhatsAppError("CONFLICT")
  return {
    body: rendered.body,
    buttons:
      rendered.body.length <= 1024
        ? [
            {
              id: whatsAppWorkflowActionButtonId(
                source.purpose,
                confirmCode,
                "confirm",
              ),
              title: "Confirm",
            },
            {
              id: whatsAppWorkflowActionButtonId(
                source.purpose,
                cancelCode,
                "cancel",
              ),
              title: "Cancel",
            },
          ]
        : undefined,
  }
}

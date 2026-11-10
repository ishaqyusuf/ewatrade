import { createHash } from "node:crypto"
import { whatsAppProposalSourceSchema } from "@ewatrade/assistant/channels/action-review"
import {
  WHATSAPP_ORDER_REVIEW_VERSION,
  orderReviewPageCommandSchema,
} from "@ewatrade/assistant/channels/order-review"
import { z } from "zod"
import type {
  AssistantActionProposal,
  AssistantWhatsAppActionReview,
  Prisma,
} from "../../../generated/prisma/client"
import { AssistantWhatsAppError } from "./authority"
import type { resolveAssistantWhatsAppConversation } from "./conversations"
import { assistantWhatsAppAuthorityDigest } from "./execution"

type Resolved = Awaited<ReturnType<typeof resolveAssistantWhatsAppConversation>>
const digest = (x: string) => createHash("sha256").update(x).digest("hex")
const id = z.string().min(1).max(128)
const stateSchema = z
  .object({
    kind: z.literal(WHATSAPP_ORDER_REVIEW_VERSION),
    source: whatsAppProposalSourceSchema,
    targetRevision: z.string().max(512).nullable(),
    authorityDigest: z.string().length(64),
    bindingId: id,
    identityGeneration: z.number().int().positive(),
    grantGeneration: z.number().int().positive(),
    selectionGeneration: z.number().int().positive(),
    pages: z.array(z.string().min(1).max(680)).min(1).max(61),
    issued: z
      .array(
        z
          .object({ outboxId: id, index: z.number().int().min(0).max(60) })
          .strict(),
      )
      .max(128),
    acknowledgments: z
      .array(z.object({ outboxId: id, ingressId: id }).strict())
      .max(60),
  })
  .strict()
export type NativeOrderReviewPageState = z.infer<typeof stateSchema>
export function nativeOrderReviewSessionToken(
  bindingId: string,
  proposalId: string,
  revision: number,
) {
  return `wa-proof_order-review_${digest(JSON.stringify([bindingId, proposalId, revision]))}`
}
async function readState(
  tx: Prisma.TransactionClient,
  resolved: Resolved,
  proposal: Pick<
    AssistantActionProposal,
    "id" | "revision" | "payloadHash" | "targetRevision"
  >,
  now: Date,
) {
  const token = nativeOrderReviewSessionToken(
    resolved.binding.id,
    proposal.id,
    proposal.revision,
  )
  const row = await tx.onboardingSession.findUnique({ where: { token } })
  const parsed = stateSchema.safeParse(row?.formData)
  if (
    !row ||
    row.completed ||
    row.expiresAt <= now ||
    row.userId !== resolved.scope.userId ||
    row.tenantId !== resolved.scope.tenantId ||
    !parsed.success
  )
    throw new AssistantWhatsAppError("CONFLICT")
  const s = parsed.data
  if (
    s.source.proposalId !== proposal.id ||
    s.source.revision !== proposal.revision ||
    s.source.payloadHash !== proposal.payloadHash ||
    s.targetRevision !== proposal.targetRevision ||
    s.bindingId !== resolved.binding.id ||
    s.identityGeneration !== resolved.binding.identityGeneration ||
    s.grantGeneration !== resolved.binding.grantGeneration ||
    s.selectionGeneration !== resolved.binding.selectionGeneration ||
    s.authorityDigest !== (await assistantWhatsAppAuthorityDigest(tx, resolved))
  )
    throw new AssistantWhatsAppError("CONFLICT")
  return { row, state: s }
}
/** Existing bounded private proof storage; no schema or business writes. Caller owns root transaction. */
export async function stageNativeOrderReviewPage(
  tx: Prisma.TransactionClient,
  input: {
    resolved: Resolved
    proposal: AssistantActionProposal
    outboxId: string
    pages: string[]
    index: number
    expiresAt: Date
    authorityDigest: string
  },
  now = new Date(),
) {
  const { resolved, proposal, pages, index, outboxId } = input
  const token = nativeOrderReviewSessionToken(
    resolved.binding.id,
    proposal.id,
    proposal.revision,
  )
  let row = await tx.onboardingSession.findUnique({ where: { token } })
  if (!row) {
    if (
      index !== 0 ||
      proposal.action !== "order_create" ||
      proposal.status !== "PENDING" ||
      input.expiresAt <= now ||
      input.expiresAt > proposal.expiresAt
    )
      throw new AssistantWhatsAppError("CONFLICT")
    const state = stateSchema.parse({
      kind: WHATSAPP_ORDER_REVIEW_VERSION,
      source: {
        proposalId: proposal.id,
        revision: proposal.revision,
        payloadHash: proposal.payloadHash,
      },
      targetRevision: proposal.targetRevision,
      authorityDigest: input.authorityDigest,
      bindingId: resolved.binding.id,
      identityGeneration: resolved.binding.identityGeneration,
      grantGeneration: resolved.binding.grantGeneration,
      selectionGeneration: resolved.binding.selectionGeneration,
      pages,
      issued: [],
      acknowledgments: [],
    })
    row = await tx.onboardingSession.create({
      data: {
        token,
        tenantId: resolved.scope.tenantId,
        userId: resolved.scope.userId,
        expiresAt: input.expiresAt,
        formData: state,
      },
    })
  }
  const current = await readState(tx, resolved, proposal, now)
  const s = current.state
  if (
    JSON.stringify(s.pages) !== JSON.stringify(pages) ||
    !pages[index] ||
    index > s.acknowledgments.length ||
    input.expiresAt > current.row.expiresAt
  )
    throw new AssistantWhatsAppError("CONFLICT")
  if (!s.issued.some((x) => x.outboxId === outboxId && x.index === index)) {
    s.issued.push({ outboxId, index })
    stateSchema.parse(s)
    await tx.onboardingSession.update({
      where: { id: row.id },
      data: { formData: s },
    })
  }
}
export async function nativeOrderReviewPageInfo(
  tx: Prisma.TransactionClient,
  resolved: Resolved,
  proposal: AssistantActionProposal,
  outboxId: string,
  now = new Date(),
) {
  if (
    proposal.action !== "order_create" ||
    proposal.status !== "PENDING" ||
    proposal.expiresAt <= now ||
    proposal.tenantId !== resolved.scope.tenantId ||
    proposal.storeId !== resolved.scope.storeId ||
    proposal.actorUserId !== resolved.scope.userId ||
    proposal.conversationId !== resolved.conversation.id
  )
    throw new AssistantWhatsAppError("CONFLICT")
  const current = await readState(tx, resolved, proposal, now)
  const page = current.state.issued.find((x) => x.outboxId === outboxId)
  if (!page || page.index > current.state.acknowledgments.length)
    throw new AssistantWhatsAppError("CONFLICT")
  return { ...current, index: page.index, count: current.state.pages.length }
}
async function acceptedPage(
  tx: Prisma.TransactionClient,
  outboxId: string,
  index: number,
  s: NativeOrderReviewPageState,
  now: Date,
) {
  const outbox = await tx.assistantWhatsAppOutbox.findFirst({
    where: {
      id: outboxId,
      state: { in: ["SENT", "DELIVERED", "READ"] },
      renderKind: "action_review",
      expiresAt: { gt: now },
      inbox: { bindingId: s.bindingId, kind: "TURN" },
    },
    include: { deliveryAttempts: true, inbox: true },
  })
  if (
    !outbox?.content ||
    !outbox.sentAt ||
    !outbox.providerMessageId ||
    outbox.content !== s.pages[index] ||
    outbox.contentDigest !== digest(outbox.content) ||
    outbox.authorityDigest !== s.authorityDigest ||
    !outbox.deliveryAttempts.some(
      (x) =>
        x.state === "ACCEPTED" &&
        x.providerMessageId === outbox.providerMessageId,
    )
  )
    throw new AssistantWhatsAppError("CONFLICT")
  return {
    ...outbox,
    sentAt: outbox.sentAt,
    providerMessageId: outbox.providerMessageId,
  }
}
/** Exact delivered page + fresh bound TURN. Next/Previous never authorizes the sale. */
export async function advanceNativeOrderReviewPage(
  tx: Prisma.TransactionClient,
  resolved: Resolved,
  raw: unknown,
  ingressId: string,
  now = new Date(),
) {
  const command = orderReviewPageCommandSchema.parse(raw)
  const review = await tx.assistantWhatsAppActionReview.findUnique({
    where: { reviewOutboxId: command.sourceOutboxId },
    include: { proposal: true },
  })
  if (
    !review ||
    review.bindingId !== resolved.binding.id ||
    review.state !== "PENDING" ||
    review.proposal.status !== "PENDING" ||
    review.proposal.expiresAt <= now ||
    review.proposal.action !== "order_create"
  )
    throw new AssistantWhatsAppError("CONFLICT")
  const current = await nativeOrderReviewPageInfo(
    tx,
    resolved,
    review.proposal,
    command.sourceOutboxId,
    now,
  )
  const { state: s, index } = current
  const page = await acceptedPage(tx, command.sourceOutboxId, index, s, now)
  const ingress = await tx.assistantWhatsAppInbox.findFirst({
    where: {
      id: ingressId,
      bindingId: resolved.binding.id,
      kind: "TURN",
      state: "PROCESSING",
      expiresAt: { gt: now },
    },
  })
  const saved = orderReviewPageCommandSchema.safeParse(ingress?.content)
  if (
    !ingress ||
    !saved.success ||
    saved.data.sourceOutboxId !== command.sourceOutboxId ||
    saved.data.direction !== command.direction ||
    saved.data.replyToMessageId !== command.replyToMessageId ||
    ingress.phoneNumberId !== page.phoneNumberId ||
    ingress.sequence <= page.inbox.sequence ||
    ingress.providerOccurredAt.getTime() <
      Math.floor(page.sentAt.getTime() / 1000) * 1000 ||
    command.replyToMessageId !== page.providerMessageId
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  let next = index
  if (command.direction === "next") {
    if (index >= s.pages.length - 1)
      throw new AssistantWhatsAppError("CONFLICT")
    if (index === s.acknowledgments.length)
      s.acknowledgments.push({ outboxId: page.id, ingressId: ingress.id })
    if (index > s.acknowledgments.length - 1)
      throw new AssistantWhatsAppError("CONFLICT")
    next = index + 1
  } else next = Math.max(0, index - 1)
  stateSchema.parse(s)
  await tx.onboardingSession.update({
    where: { id: current.row.id },
    data: { formData: s },
  })
  return { source: s.source, index: next }
}
/** Called again in the canonical confirmation transaction, not just at dispatch. */
export async function assertCompleteNativeOrderReview(
  tx: Prisma.TransactionClient,
  resolved: Resolved,
  proposal: AssistantActionProposal,
  review: AssistantWhatsAppActionReview,
  now = new Date(),
) {
  const current = await nativeOrderReviewPageInfo(
    tx,
    resolved,
    proposal,
    review.reviewOutboxId,
    now,
  )
  const s = current.state
  if (
    current.index !== s.pages.length - 1 ||
    s.acknowledgments.length !== s.pages.length - 1
  )
    throw new AssistantWhatsAppError("CONFLICT")
  for (const [index, ack] of s.acknowledgments.entries()) {
    const page = await acceptedPage(tx, ack.outboxId, index, s, now)
    const ingress = await tx.assistantWhatsAppInbox.findUnique({
      where: { id: ack.ingressId },
    })
    const parsed = orderReviewPageCommandSchema.safeParse(ingress?.content)
    // A completed deterministic run may replace its content with a receipt; retain
    // acknowledgment source in the original immutable content until TTL expiry.
    if (
      !ingress ||
      !parsed.success ||
      parsed.data.direction !== "next" ||
      parsed.data.sourceOutboxId !== page.id ||
      parsed.data.replyToMessageId !== page.providerMessageId ||
      ingress.bindingId !== resolved.binding.id ||
      ingress.state !== "COMPLETED" ||
      ingress.executionAuthorityDigest !== s.authorityDigest ||
      ingress.phoneNumberId !== page.phoneNumberId ||
      ingress.sequence <= page.inbox.sequence ||
      ingress.providerOccurredAt.getTime() <
        Math.floor(page.sentAt.getTime() / 1000) * 1000
    )
      throw new AssistantWhatsAppError("CONFLICT")
  }
}

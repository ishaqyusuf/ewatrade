import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto"
import { z } from "zod"
import type { Prisma } from "../../../generated/prisma/client"
import { AssistantWhatsAppError } from "./authority"
import {
  type WhatsAppConversationPrincipal,
  resolveAssistantWhatsAppConversation,
} from "./conversations"
import { assistantWhatsAppAuthorityDigest } from "./execution"

const identity = z.string().min(1).max(128)
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/)
const generation = z.number().int().positive()
const materialSchema = z
  .object({
    bindingId: identity,
    proposalId: identity,
    proposalRevision: generation,
    payloadHash: hashSchema,
    targetRevision: z.string().max(512).nullable(),
    reviewDigest: hashSchema,
    authorityDigest: hashSchema,
    identityGeneration: generation,
    grantGeneration: generation,
    selectionGeneration: generation,
    reviewOutboxId: identity,
    nonce: z.uuid(),
    keyVersion: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
    expiresAt: z.date(),
  })
  .strict()
export type WhatsAppActionReviewMaterial = z.infer<typeof materialSchema>
export type WhatsAppActionReviewDecision = "confirm" | "cancel"
const decisionSchema = z.enum(["confirm", "cancel"])
const codeSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)
export const whatsAppActionReviewIngressContentSchema = z
  .object({
    type: z.literal("action"),
    decision: decisionSchema,
    decisionDigest: hashSchema,
    replyToMessageId: z.string().min(1).max(256),
  })
  .strict()
const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex")

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`
  return JSON.stringify(value)
}
/** Matches the canonical proposal payload digest, independent of JSONB key ordering. */
export const assistantWhatsAppActionPayloadDigest = (payload: unknown) =>
  sha256(canonical(payload))

/** Derive only in trusted issue hashing/dispatch memory. Never save or log the returned code. */
export function deriveAssistantWhatsAppActionReviewCode(
  material: WhatsAppActionReviewMaterial,
  decision: WhatsAppActionReviewDecision,
  signingKey: string,
) {
  const parsed = materialSchema.parse(material)
  decisionSchema.parse(decision)
  if (Buffer.byteLength(signingKey, "utf8") < 32)
    throw Error("Assistant action signing key unavailable")
  return createHmac("sha256", signingKey)
    .update(
      canonical({
        domain: "ewatrade.whatsapp.action-review.code.v1",
        ...parsed,
        expiresAt: parsed.expiresAt.toISOString(),
        decision,
      }),
    )
    .digest("base64url")
}
/** Decision-domain separated lookup digest; a confirm code never cancels a review. */
export function assistantWhatsAppActionDecisionDigest(
  code: string,
  decision: WhatsAppActionReviewDecision,
) {
  codeSchema.parse(code)
  decisionSchema.parse(decision)
  return sha256(
    `ewatrade.whatsapp.action-review.lookup.v1\n${decision}\n${code}`,
  )
}
const equal = (first: string, second: string) => {
  const a = Buffer.from(first)
  const b = Buffer.from(second)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Pending proofs must still belong to the current key; completed receipts do not execute again. */
export function assistantWhatsAppActionReviewMatchesCurrentKey(
  material: WhatsAppActionReviewMaterial,
  saved: { confirmDigest: string; cancelDigest: string },
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  try {
    if (
      material.keyVersion !==
      (env.ASSISTANT_APPROVAL_SIGNING_KEY_VERSION ?? "v1")
    )
      return false
    return (["confirm", "cancel"] as const).every((decision) => {
      const code = deriveAssistantWhatsAppActionReviewCode(
        material,
        decision,
        env.ASSISTANT_APPROVAL_SIGNING_KEY ?? "",
      )
      return equal(
        hashSchema.parse(saved[`${decision}Digest`]),
        assistantWhatsAppActionDecisionDigest(code, decision),
      )
    })
  } catch {
    return false
  }
}

type ProposalProof = {
  id: string
  revision: number
  payloadHash: string
  targetRevision: string | null
}
type IssueInput = {
  principal: WhatsAppConversationPrincipal
  proposal: ProposalProof
  reviewOutboxId: string
  reviewDigest: string
  authorityDigest: string
  expiresAt: Date
  nonce?: string
  keyVersion: string
  signingKey: string
}

/** Root owns the SERIALIZABLE transaction and canonical review. No autonomous transaction or Session. */
export async function issueAssistantWhatsAppActionReviewInTransaction(
  tx: Prisma.TransactionClient,
  input: IssueInput,
  now = new Date(),
) {
  await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE "phoneNumberId"=${input.principal.phoneNumberId} AND "senderId"=${input.principal.senderId} FOR UPDATE`
  const resolved = await resolveAssistantWhatsAppConversation(
    tx,
    input.principal,
    now,
  )
  if (resolved.conversation.purpose !== "GENERAL")
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  await tx.$queryRaw`SELECT id FROM "AssistantActionProposal" WHERE id=${input.proposal.id} FOR UPDATE`
  const proposal = await tx.assistantActionProposal.findFirst({
    where: {
      id: input.proposal.id,
      conversationId: resolved.conversation.id,
      tenantId: resolved.scope.tenantId,
      storeId: resolved.scope.storeId,
      actorUserId: resolved.scope.userId,
    },
  })
  const outbox = await tx.assistantWhatsAppOutbox.findFirst({
    where: { id: input.reviewOutboxId },
    include: { inbox: true },
  })
  if (
    !proposal ||
    proposal.status !== "PENDING" ||
    proposal.expiresAt <= now ||
    proposal.revision !== input.proposal.revision ||
    proposal.payloadHash !== input.proposal.payloadHash ||
    assistantWhatsAppActionPayloadDigest(proposal.payload) !==
      input.proposal.payloadHash ||
    proposal.targetRevision !== input.proposal.targetRevision ||
    !outbox ||
    outbox.state !== "PENDING" ||
    outbox.inbox.kind !== "TURN" ||
    outbox.inbox.bindingId !== resolved.binding.id ||
    outbox.phoneNumberId !== input.principal.phoneNumberId ||
    outbox.renderKind !== "action_review" ||
    outbox.chunkCount !== 1 ||
    outbox.chunkIndex !== 0 ||
    !outbox.content ||
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
    input.expiresAt > proposal.expiresAt ||
    input.expiresAt > outbox.expiresAt ||
    input.expiresAt > resolved.grant.expiresAt ||
    input.expiresAt > resolved.grant.idleExpiresAt
  )
    throw new AssistantWhatsAppError("EXPIRED")
  const material = materialSchema.parse({
    bindingId: resolved.binding.id,
    proposalId: proposal.id,
    proposalRevision: proposal.revision,
    payloadHash: proposal.payloadHash,
    targetRevision: proposal.targetRevision,
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
  const confirm = deriveAssistantWhatsAppActionReviewCode(
    material,
    "confirm",
    input.signingKey,
  )
  const cancel = deriveAssistantWhatsAppActionReviewCode(
    material,
    "cancel",
    input.signingKey,
  )
  if (outbox.content.includes(confirm) || outbox.content.includes(cancel))
    throw new AssistantWhatsAppError("CONFLICT")
  const prior = await tx.assistantWhatsAppActionReview.findUnique({
    where: { reviewOutboxId: outbox.id },
  })
  if (prior) {
    // Retry uses the original public nonce, not newly issued decision proofs.
    const priorMaterial = materialSchema.parse({
      ...material,
      nonce: prior.nonce,
    })
    if (
      prior.state !== "PENDING" ||
      !equal(
        prior.confirmDigest,
        assistantWhatsAppActionDecisionDigest(
          deriveAssistantWhatsAppActionReviewCode(
            priorMaterial,
            "confirm",
            input.signingKey,
          ),
          "confirm",
        ),
      ) ||
      !equal(
        prior.cancelDigest,
        assistantWhatsAppActionDecisionDigest(
          deriveAssistantWhatsAppActionReviewCode(
            priorMaterial,
            "cancel",
            input.signingKey,
          ),
          "cancel",
        ),
      )
    )
      throw new AssistantWhatsAppError("CONFLICT")
    return prior
  }
  return tx.assistantWhatsAppActionReview.create({
    data: {
      ...material,
      confirmDigest: assistantWhatsAppActionDecisionDigest(confirm, "confirm"),
      cancelDigest: assistantWhatsAppActionDecisionDigest(cancel, "cancel"),
    },
  })
}

type ConsumeInput = {
  principal: WhatsAppConversationPrincipal
  decisionDigest: string
  decision: WhatsAppActionReviewDecision
  quotedProviderMessageId: string
  ingressId: string
}

/** Claim proof atomically with the root's canonical decision; duplicates return receipt-only references. */
export async function consumeAssistantWhatsAppActionReviewInTransaction(
  tx: Prisma.TransactionClient,
  input: ConsumeInput,
  now = new Date(),
) {
  const digest = hashSchema.parse(input.decisionDigest)
  decisionSchema.parse(input.decision)
  await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppIdentity" WHERE "phoneNumberId"=${input.principal.phoneNumberId} AND "senderId"=${input.principal.senderId} FOR UPDATE`
  const resolved = await resolveAssistantWhatsAppConversation(
    tx,
    input.principal,
    now,
  )
  const review = await tx.assistantWhatsAppActionReview.findFirst({
    where:
      input.decision === "confirm"
        ? { confirmDigest: digest }
        : { cancelDigest: digest },
  })
  if (
    !review ||
    resolved.conversation.purpose !== "GENERAL" ||
    review.bindingId !== resolved.binding.id ||
    review.identityGeneration !== resolved.binding.identityGeneration ||
    review.grantGeneration !== resolved.binding.grantGeneration ||
    review.selectionGeneration !== resolved.binding.selectionGeneration
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  await tx.$queryRaw`SELECT id FROM "AssistantActionProposal" WHERE id=${review.proposalId} FOR UPDATE`
  await tx.$queryRaw`SELECT id FROM "AssistantWhatsAppActionReview" WHERE id=${review.id} FOR UPDATE`
  const locked = await tx.assistantWhatsAppActionReview.findUniqueOrThrow({
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
  const acceptedContent = whatsAppActionReviewIngressContentSchema.safeParse(
    ingress?.content,
  )
  if (
    !ingress ||
    !acceptedContent.success ||
    acceptedContent.data.decision !== input.decision ||
    !equal(acceptedContent.data.decisionDigest, digest) ||
    acceptedContent.data.replyToMessageId !== input.quotedProviderMessageId ||
    !outbox ||
    outbox.renderKind !== "action_review" ||
    outbox.inbox.bindingId !== resolved.binding.id ||
    !outbox.sentAt ||
    ingress.providerOccurredAt.getTime() <
      Math.floor(outbox.sentAt.getTime() / 1000) * 1000 ||
    outbox.contentDigest !== review.reviewDigest ||
    !outbox.content ||
    sha256(outbox.content) !== review.reviewDigest
  )
    throw new AssistantWhatsAppError("UNAUTHORIZED")
  const reference = {
    reviewId: locked.id,
    proposalId: locked.proposalId,
    revision: locked.proposalRevision,
    decision: input.decision,
    resultRef: locked.resultRef,
  }
  if (locked.state === "CONSUMED") {
    if (locked.decision !== input.decision)
      throw new AssistantWhatsAppError("CONFLICT")
    return { ...reference, alreadyConsumed: true as const }
  }
  if (locked.state !== "PENDING") throw new AssistantWhatsAppError("CONFLICT")
  if (locked.expiresAt <= now || ingress.providerOccurredAt >= locked.expiresAt)
    throw new AssistantWhatsAppError("EXPIRED")
  if (
    !assistantWhatsAppActionReviewMatchesCurrentKey(
      {
        bindingId: locked.bindingId,
        proposalId: locked.proposalId,
        proposalRevision: locked.proposalRevision,
        payloadHash: locked.payloadHash,
        targetRevision: locked.targetRevision,
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
  const proposal = await tx.assistantActionProposal.findFirst({
    where: {
      id: locked.proposalId,
      conversationId: resolved.conversation.id,
      tenantId: resolved.scope.tenantId,
      storeId: resolved.scope.storeId,
      actorUserId: resolved.scope.userId,
    },
  })
  if (
    !proposal ||
    proposal.status !== "PENDING" ||
    proposal.expiresAt <= now ||
    proposal.revision !== locked.proposalRevision ||
    proposal.payloadHash !== locked.payloadHash ||
    assistantWhatsAppActionPayloadDigest(proposal.payload) !==
      locked.payloadHash ||
    proposal.targetRevision !== locked.targetRevision ||
    locked.authorityDigest !==
      (await assistantWhatsAppAuthorityDigest(tx, resolved))
  )
    throw new AssistantWhatsAppError("CONFLICT")
  const claimed = await tx.assistantWhatsAppActionReview.updateMany({
    where: { id: locked.id, state: "PENDING" },
    data: {
      state: "CONSUMED",
      decision: input.decision,
      consumedByIngressId: ingress.id,
    },
  })
  if (claimed.count !== 1) throw new AssistantWhatsAppError("CONFLICT")
  return { ...reference, alreadyConsumed: false as const }
}

/** Same root-owned transaction records exact canonical outcome; it stores no provider or approval token. */
export async function completeAssistantWhatsAppActionReviewInTransaction(
  tx: Prisma.TransactionClient,
  reviewId: string,
  ingressId: string,
  resultRef: Prisma.InputJsonValue,
  now = new Date(),
) {
  const changed = await tx.assistantWhatsAppActionReview.updateMany({
    where: {
      id: reviewId,
      state: "CONSUMED",
      consumedByIngressId: ingressId,
      completedAt: null,
    },
    data: { resultRef, completedAt: now },
  })
  if (changed.count !== 1) throw new AssistantWhatsAppError("CONFLICT")
}

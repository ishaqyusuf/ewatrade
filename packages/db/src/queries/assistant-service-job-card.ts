import { createHash } from "node:crypto"
import {
  type ServiceJobCreated,
  serviceJobCreatedSchema,
  serviceJobDraftSchema,
  serviceNameKey,
} from "@ewatrade/assistant/general/contracts"
import { parseExactDecimal } from "@ewatrade/utils/exact-decimal"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import { generalConversationWhere } from "./assistant-general"
import { CatalogError } from "./catalog-errors"
import { runInOwnTransaction } from "./own-transaction"
import {
  confirmServiceIntakeInTransaction,
  createAndConfirmServiceIntakeInTransaction,
} from "./service-work"

type Scope = {
  actorUserId: string
  tenantId: string
  storeId: string
  sourceAnswerId: string
  sourceMessageId: string
}
type Reader = Pick<
  Prisma.TransactionClient,
  "assistantMessage" | "serviceIntake"
>
type IntakeInput = Parameters<
  typeof createAndConfirmServiceIntakeInTransaction
>[1]

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

async function readCard(db: Reader, scope: Scope) {
  const rows = await db.assistantMessage.findMany({
    where: {
      id: scope.sourceMessageId,
      role: "assistant",
      conversation: generalConversationWhere({
        userId: scope.actorUserId,
        tenantId: scope.tenantId,
        storeId: scope.storeId,
      }),
      parts: {
        array_contains: [
          { type: "data-general-answer", data: { id: scope.sourceAnswerId } },
        ],
      },
    },
    select: { id: true, parts: true },
    take: 2,
  })
  const row = rows.length === 1 ? rows[0] : undefined
  if (!row || !Array.isArray(row.parts))
    throw new CatalogError(
      "SERVICE_INTAKE_NOT_FOUND",
      "This job card is not available in the original business and Store.",
    )
  const parts: unknown[] = row.parts
  const index = parts.findIndex(
    (part) =>
      object(part) &&
      part.type === "data-general-answer" &&
      object(part.data) &&
      part.data.id === scope.sourceAnswerId,
  )
  const part = parts[index]
  const data = object(part) && object(part.data) ? part.data : null
  const parsed = serviceJobDraftSchema.safeParse(data?.serviceDraft)
  if (
    !data ||
    !parsed.success ||
    parsed.data.origin.tenantId !== scope.tenantId ||
    parsed.data.origin.storeId !== scope.storeId
  )
    throw new CatalogError(
      "INVALID_SERVICE_TRANSITION",
      "The original job card could not be verified.",
    )
  return { row, parts, index, data, draft: parsed.data }
}

async function lockCard(tx: Prisma.TransactionClient, scope: Scope) {
  const card = await readCard(tx, scope)
  await tx.$queryRaw`SELECT id FROM "AssistantMessage" WHERE id = ${card.row.id} FOR UPDATE`
  // Re-read after the message lock: two cards in one message must preserve each other's receipts.
  return readCard(tx, scope)
}

async function readCreated(
  db: Reader,
  scope: Scope,
  intakeId: string,
): Promise<ServiceJobCreated> {
  const intake = await db.serviceIntake.findFirst({
    where: {
      id: intakeId,
      tenantId: scope.tenantId,
      storeId: scope.storeId,
      createdByUserId: scope.actorUserId,
      status: "CONFIRMED",
    },
    select: {
      id: true,
      confirmedAt: true,
      createdAt: true,
      jobs: { select: { id: true }, orderBy: { createdAt: "asc" } },
      commercialOrder: {
        select: {
          id: true,
          orderNumber: true,
          currencyCode: true,
          totalMinor: true,
          customerName: true,
          lines: {
            where: { kind: "SERVICE" },
            select: {
              offeringId: true,
              quantity: true,
              unitPriceMinor: true,
              totalMinor: true,
              snapshot: { select: { offeringName: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  })
  if (!intake?.commercialOrder)
    throw new CatalogError(
      "SERVICE_INTAKE_NOT_FOUND",
      "The saved job for this card is not available.",
    )
  const order = intake.commercialOrder
  return serviceJobCreatedSchema.parse({
    intakeId: intake.id,
    jobId: intake.jobs[0]?.id ?? null,
    orderId: order.id,
    orderNumber: order.orderNumber,
    currencyCode: order.currencyCode,
    totalMinor: order.totalMinor,
    customerName: order.customerName,
    createdAt: (intake.confirmedAt ?? intake.createdAt).toISOString(),
    lines: order.lines.map((line) => ({
      name: line.snapshot?.offeringName ?? "Service",
      offeringId: line.offeringId,
      quantity: line.quantity.toString(),
      unitPriceMinor: line.unitPriceMinor,
      totalMinor: line.totalMinor,
    })),
  })
}

async function saveReceipt(
  tx: Prisma.TransactionClient,
  card: Awaited<ReturnType<typeof readCard>>,
  receipt: ServiceJobCreated,
) {
  const parts = card.parts.map((part, index) =>
    index === card.index && object(part)
      ? {
          ...part,
          data: {
            ...card.data,
            serviceDraft: { ...card.draft, created: receipt },
          },
        }
      : part,
  )
  await tx.assistantMessage.update({
    where: { id: card.row.id },
    data: { parts: JSON.parse(JSON.stringify(parts)) as Prisma.InputJsonValue },
  })
}

export async function getAssistantServiceJobCard(db: Reader, scope: Scope) {
  const card = await readCard(db, scope)
  return card.draft.created
    ? readCreated(db, scope, card.draft.created.intakeId)
    : null
}

const commands = {
  create: createAndConfirmServiceIntakeInTransaction,
  replay: confirmServiceIntakeInTransaction,
}

/** One message lock and owning transaction bind the native save and durable same-card result. */
export async function completeAssistantServiceJobCardInTransaction(
  tx: Prisma.TransactionClient,
  input: IntakeInput & { sourceAnswerId: string; sourceMessageId: string },
  domain = commands,
) {
  const card = await lockCard(tx, input)
  const { sourceAnswerId, sourceMessageId, ...intakeInput } = input
  if (card.draft.created) {
    const receipt = await readCreated(tx, input, card.draft.created.intakeId)
    const result = await domain.replay(tx, {
      intakeId: receipt.intakeId,
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      schemaVersion: 1,
    })
    return { ...result, assistantCard: receipt }
  }
  const clientIntakeId = `assistant-card:${createHash("sha256")
    .update(
      JSON.stringify([
        input.tenantId,
        input.storeId,
        input.actorUserId,
        sourceAnswerId,
        sourceMessageId,
      ]),
    )
    .digest("hex")}`
  const result = await domain.create(tx, { ...intakeInput, clientIntakeId })
  const receipt = await readCreated(tx, input, result.intakeId)
  await saveReceipt(tx, card, receipt)
  return { ...result, assistantCard: receipt }
}

export function completeAssistantServiceJobCard(
  db: PrismaClient,
  input: IntakeInput & { sourceAnswerId: string; sourceMessageId: string },
) {
  return runInOwnTransaction(db, (tx) =>
    completeAssistantServiceJobCardInTransaction(tx, input),
  )
}

/** Internal repair for an owner-identified job created before card receipts existed; never exposed as a merchant mutation. */
export async function linkExistingAssistantServiceJobCardInTransaction(
  tx: Prisma.TransactionClient,
  scope: Scope & { intakeId: string },
) {
  const card = await lockCard(tx, scope)
  if (card.draft.created && card.draft.created.intakeId !== scope.intakeId)
    throw new CatalogError(
      "IDEMPOTENCY_MISMATCH",
      "This card already belongs to another job.",
    )
  const receipt = await readCreated(tx, scope, scope.intakeId)
  const signature = (
    lines: Array<{ name: string; quantity: string; unitPriceMinor?: number }>,
  ) =>
    lines
      .map((line) =>
        JSON.stringify([
          serviceNameKey(line.name),
          parseExactDecimal(line.quantity, { allowZero: false, maxScale: 6 }),
          line.unitPriceMinor,
        ]),
      )
      .sort()
      .join("|")
  if (
    card.draft.totalMinor === undefined ||
    receipt.currencyCode !== card.draft.currencyCode ||
    receipt.totalMinor !== card.draft.totalMinor ||
    (receipt.customerName ?? "").trim().toLowerCase() !==
      (card.draft.customer?.name ?? "").trim().toLowerCase() ||
    signature(receipt.lines) !== signature(card.draft.lines)
  )
    throw new CatalogError(
      "INVALID_SERVICE_TRANSITION",
      "The saved job does not exactly match this card.",
    )
  await saveReceipt(tx, card, receipt)
  return receipt
}

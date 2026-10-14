import { createHash } from "node:crypto"
import {
  businessActivityOriginSchema,
  businessEventTypeSchema,
  hasBusinessEventHandler,
  implementedBusinessEventHandlers,
  parseBusinessEventPayload,
  presentBusinessEventPayload,
} from "@ewatrade/notifications/business-events"
import { z } from "zod"
import type { Prisma } from "../../../generated/prisma/client"
import { BusinessActivityError } from "./errors"

const id = z.string().trim().min(1).max(160)
const actorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("staff"), userId: id }).strict(),
  z.object({ kind: z.literal("system") }).strict(),
])
export const recordBusinessActivityInput = z
  .object({
    tenantId: id,
    storeId: id.optional(),
    storeIds: z.array(id).max(100).default([]),
    financeBookId: id.optional(),
    type: businessEventTypeSchema,
    schemaVersion: z.literal(1).default(1),
    source: z
      .object({ kind: id, id, action: id, version: id.optional() })
      .strict(),
    actor: actorSchema,
    origin: businessActivityOriginSchema.default({ channel: "unknown" }),
    subjectMembershipId: id.optional(),
    subjectUserId: id.optional(),
    occurredAt: z.iso.datetime({ offset: true }),
    correlationKey: id.optional(),
    correctionOfEventKey: id.optional(),
    payload: z.unknown(),
  })
  .strict()
export type RecordBusinessActivityInput = z.input<
  typeof recordBusinessActivityInput
>

export function prepareBusinessActivity(input: RecordBusinessActivityInput) {
  const parsed = recordBusinessActivityInput.parse(input)
  if (parsed.origin.channel === "assistant" && parsed.actor.kind !== "staff")
    throw new BusinessActivityError(
      "BAD_REQUEST",
      "Assistant activity requires a recorded confirming staff member.",
    )
  if (!hasBusinessEventHandler(parsed.type))
    throw new BusinessActivityError(
      "BAD_REQUEST",
      "This activity type is not implemented yet.",
    )
  const payload = parseBusinessEventPayload(parsed.type, parsed.payload)
  const presentation = presentBusinessEventPayload(
    parsed.type,
    payload,
    "Recorded actor",
  )
  if (presentation.target && "bookId" in presentation.target) {
    if (
      parsed.financeBookId &&
      parsed.financeBookId !== presentation.target.bookId
    )
      throw new BusinessActivityError(
        "BAD_REQUEST",
        "Activity Finance Book does not match the original record.",
      )
    parsed.financeBookId = presentation.target.bookId
  }
  if (presentation.subject?.kind === "staff_member") {
    if (
      parsed.subjectMembershipId &&
      parsed.subjectMembershipId !== presentation.subject.id
    )
      throw new BusinessActivityError(
        "BAD_REQUEST",
        "Activity subject does not match the original record.",
      )
    parsed.subjectMembershipId = presentation.subject.id
  }
  const storeIds = [
    ...new Set([
      ...parsed.storeIds,
      ...(parsed.storeId ? [parsed.storeId] : []),
    ]),
  ].sort()
  const occurredAt = new Date(parsed.occurredAt)
  const businessEventKey = createHash("sha256")
    .update(
      JSON.stringify([
        parsed.tenantId,
        parsed.type,
        parsed.source.kind,
        parsed.source.id,
        parsed.source.action,
        parsed.source.version ?? null,
      ]),
    )
    .digest("hex")
  const payloadHash = createHash("sha256")
    .update(
      JSON.stringify({
        schemaVersion: parsed.schemaVersion,
        payload,
        actor: parsed.actor,
        origin: parsed.origin,
        subjectMembershipId: parsed.subjectMembershipId ?? null,
        subjectUserId: parsed.subjectUserId ?? null,
        storeId: parsed.storeId ?? null,
        storeIds,
        financeBookId: parsed.financeBookId ?? null,
        occurredAt: occurredAt.toISOString(),
        correlationKey: parsed.correlationKey ?? null,
        correctionOfEventKey: parsed.correctionOfEventKey ?? null,
      }),
    )
    .digest("hex")
  if (JSON.stringify(payload).length > 16_384)
    throw new BusinessActivityError(
      "BAD_REQUEST",
      "The activity payload is too large.",
    )
  return {
    category: implementedBusinessEventHandlers[parsed.type].category,
    parsed,
    payload,
    presentation,
    storeIds,
    occurredAt,
    businessEventKey,
    payloadHash,
  }
}

/** Only a canonical domain command holding its own authority/source locks may call this. */
export async function recordBusinessActivityInTransaction(
  tx: Prisma.TransactionClient,
  input: RecordBusinessActivityInput,
) {
  const prepared = prepareBusinessActivity(input)
  const {
    parsed,
    payload,
    presentation,
    storeIds,
    occurredAt,
    businessEventKey,
    payloadHash,
  } = prepared
  const tenants = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Tenant" WHERE "id"=${parsed.tenantId} AND "isActive"=true FOR SHARE`
  if (!tenants.length)
    throw new BusinessActivityError("FORBIDDEN", "The Business is unavailable.")

  let actorMembershipId: string | null = null
  if (parsed.actor.kind === "staff") {
    const memberships = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Membership"
      WHERE "tenantId"=${parsed.tenantId} AND "userId"=${parsed.actor.userId} AND "status"='ACTIVE'
      FOR SHARE`
    actorMembershipId = memberships[0]?.id ?? null
    if (!actorMembershipId)
      throw new BusinessActivityError(
        "FORBIDDEN",
        "Current Business membership is required.",
      )
  }
  if (storeIds.length) {
    const stores = await tx.store.findMany({
      where: { tenantId: parsed.tenantId, id: { in: storeIds } },
      select: { id: true },
    })
    if (stores.length !== storeIds.length)
      throw new BusinessActivityError(
        "NOT_FOUND",
        "An activity Store is outside this Business.",
      )
  }
  if (parsed.financeBookId) {
    const book = await tx.financeBook.findFirst({
      where: { id: parsed.financeBookId, tenantId: parsed.tenantId },
      select: { id: true, currencyCode: true },
    })
    if (
      !book ||
      (presentation.amount &&
        presentation.amount.currencyCode !== book.currencyCode)
    )
      throw new BusinessActivityError(
        "NOT_FOUND",
        "The activity Finance Book is unavailable or has another currency.",
      )
  }
  if (parsed.subjectMembershipId) {
    const subject = await tx.membership.findFirst({
      where: { id: parsed.subjectMembershipId, tenantId: parsed.tenantId },
      select: { userId: true },
    })
    if (
      !subject ||
      (parsed.subjectUserId && parsed.subjectUserId !== subject.userId)
    )
      throw new BusinessActivityError(
        "NOT_FOUND",
        "The activity subject is outside this Business.",
      )
  }

  const created = await tx.businessActivityEvent.createMany({
    skipDuplicates: true,
    data: [
      {
        tenantId: parsed.tenantId,
        storeId: parsed.storeId ?? null,
        financeBookId: parsed.financeBookId ?? null,
        type: parsed.type,
        category: prepared.category,
        schemaVersion: parsed.schemaVersion,
        businessEventKey,
        payloadHash,
        sourceKind: parsed.source.kind,
        sourceId: parsed.source.id,
        sourceAction: parsed.source.action,
        actorKind: parsed.actor.kind,
        originChannel: parsed.origin.channel,
        actorUserId: parsed.actor.kind === "staff" ? parsed.actor.userId : null,
        actorMembershipId,
        subjectUserId: parsed.subjectUserId ?? null,
        subjectMembershipId: parsed.subjectMembershipId ?? null,
        occurredAt,
        payload: payload as Prisma.InputJsonValue,
        amountMinor: presentation.amount
          ? BigInt(presentation.amount.minor)
          : null,
        currencyCode: presentation.amount?.currencyCode ?? null,
        correlationKey: parsed.correlationKey ?? null,
        correctionOfEventKey: parsed.correctionOfEventKey ?? null,
      },
    ],
  })
  const event = await tx.businessActivityEvent.findUniqueOrThrow({
    where: {
      tenantId_businessEventKey: {
        tenantId: parsed.tenantId,
        businessEventKey,
      },
    },
    select: { id: true, payloadHash: true },
  })
  if (event.payloadHash !== payloadHash)
    throw new BusinessActivityError(
      "CONFLICT",
      "An existing activity has different source facts.",
    )
  if (created.count && storeIds.length)
    await tx.businessActivityStoreScope.createMany({
      data: storeIds.map((storeId) => ({
        tenantId: parsed.tenantId,
        eventId: event.id,
        storeId,
      })),
    })
  // Replays do not enqueue again or manufacture a missing fanout marker.
  if (created.count)
    await tx.businessActivityOutbox.create({
      data: {
        tenantId: parsed.tenantId,
        eventId: event.id,
        consumer: "in_app",
      },
    })
  return { id: event.id, businessEventKey, replay: created.count === 0 }
}

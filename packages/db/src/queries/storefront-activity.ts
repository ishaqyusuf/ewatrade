import { z } from "zod"
import type { Prisma } from "../../generated/prisma/client"
import {
  prepareBusinessActivity,
  recordBusinessActivityInTransaction,
} from "./business-activity/record"
import { type SiteScope, siteContentHash } from "./storefront-sites"

type Actor = { tenantId: string; actorUserId: string }
type Action =
  | "initialized"
  | "saved"
  | "published"
  | "rolled_back"
  | "generation_requested"
  | "generation_cancelled"
  | "design_accepted"
type Facts = {
  action: Action
  draftRevision: number
  releaseId: string | null
  baseReleaseId: string | null
}

// An audit source key identifies the intent; its payload hash binds the exact
// actor/base/candidate. Publish and rollback deliberately share a key namespace.
export function storefrontActivity(
  actor: Actor,
  scope: SiteScope,
  key: string,
  facts: Facts,
  request: unknown,
) {
  return {
    tenantId: scope.tenantId,
    storeId: scope.storeId,
    type: "settings.storefront_changed" as const,
    source: {
      kind: "storefront_site",
      id: scope.siteId,
      action: "change",
      version: key,
    },
    actor: { kind: "staff" as const, userId: actor.actorUserId },
    origin: { channel: "dashboard" as const },
    occurredAt: new Date().toISOString(),
    payload: {
      siteId: scope.siteId,
      ...facts,
      requestHash: siteContentHash({ actor, request }),
    },
  }
}

const replayFacts = z.object({
  siteId: z.string(),
  action: z.string(),
  requestHash: z.string(),
  releaseId: z.string().nullable(),
})

export async function findStorefrontReplay(
  tx: Prisma.TransactionClient,
  activity: ReturnType<typeof storefrontActivity>,
) {
  const { businessEventKey } = prepareBusinessActivity(activity)
  const event = await tx.businessActivityEvent.findUnique({
    where: {
      tenantId_businessEventKey: {
        tenantId: activity.tenantId,
        businessEventKey,
      },
    },
    select: { storeId: true, actorUserId: true, payload: true },
  })
  if (!event) return null
  const facts = replayFacts.safeParse(event.payload)
  const same =
    facts.success &&
    event.storeId === activity.storeId &&
    event.actorUserId === activity.actor.userId &&
    facts.data.siteId === activity.payload.siteId &&
    facts.data.action === activity.payload.action &&
    facts.data.requestHash === activity.payload.requestHash
  return same && facts.success
    ? { ok: true as const, releaseId: facts.data.releaseId }
    : { ok: false as const }
}

/** Audit and its recovery work commit with the design mutation, never after it. */
export async function recordStorefrontActivity(
  tx: Prisma.TransactionClient,
  activity: ReturnType<typeof storefrontActivity>,
  checkRelease = false,
) {
  const event = await recordBusinessActivityInTransaction(tx, activity)
  if (checkRelease && !event.replay)
    await tx.businessActivityOutbox.create({
      data: {
        tenantId: activity.tenantId,
        eventId: event.id,
        consumer: "storefront_release",
      },
    })
  return event
}

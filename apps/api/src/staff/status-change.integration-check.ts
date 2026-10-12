import { randomBytes } from "node:crypto"
import type { PrismaClient } from "@ewatrade/db"
import {
  listStaffHistoryPageInTransaction,
  reviewStaffStatusChangeInTransaction,
  updateRetailOpsStaffStatusInTransaction,
} from "@ewatrade/db/queries"
import { staffInvitationRollbackFacts } from "../assistant/staff-invitation-rollback-facts"
import { seedStaffInvitationRollbackFixture } from "../assistant/staff-invitation-rollback-fixture"

/** No ACTIVE staff grant, mail, saved fixture or live assistant proposal is created. */
export async function verifyStaffStatusChangeRollback(
  db: PrismaClient,
  scope: { tenantId: string; actorUserId: string; storeId: string },
) {
  if (
    process.env.RUN_STAFF_INVITATION_SIGNED_ROLLBACK !== "1" ||
    process.env.APP_ENV !== "local" ||
    process.env.NODE_ENV !== "development"
  )
    throw Error("Explicit local rollback required")
  const [database] = await db.$queryRaw<
    Array<{ database: string }>
  >`SELECT current_database() AS database`
  if (
    database?.database !== "ewatrade_qa_v1" ||
    scope.tenantId !== "cmuzedcda000hbw9kd6e50z8u" ||
    scope.actorUserId !== "cmuzedc7e000gbw9ky1dioc9f" ||
    scope.storeId !== "cmuzedcow000jbw9kluarpxfs"
  )
    throw Error("Exact owned QA required")
  const nonce = `qa-s03-status-${randomBytes(8).toString("hex")}`
  const email = `${nonce}@ishaq.qa.test`
  const before = await staffInvitationRollbackFacts(db, scope.tenantId, email)
  const rollback = Error("S03 status forced rollback")
  const started = performance.now()
  let verified = false
  let review:
    | Awaited<ReturnType<typeof reviewStaffStatusChangeInTransaction>>
    | undefined
  let originalReceipt:
    | Awaited<ReturnType<typeof updateRetailOpsStaffStatusInTransaction>>
    | undefined
  let history:
    | Awaited<ReturnType<typeof listStaffHistoryPageInTransaction>>
    | undefined
  const refused: string[] = []
  try {
    await db.$transaction(
      async (tx) => {
        const seeded = await seedStaffInvitationRollbackFixture(tx, {
          ...scope,
          email,
          nonce,
        })
        const input = {
          tenantId: scope.tenantId,
          actorUserId: scope.actorUserId,
          membershipId: seeded.membershipId,
          status: "suspended" as const,
          expectedRevision: 1,
          reason: "QA review of unaccepted staff invitation",
        }
        const grantsBefore = await tx.staffStoreAssignment.findMany({
          where: { membershipId: seeded.membershipId },
          orderBy: { id: "asc" },
        })
        const factsBeforeReview = await staffInvitationRollbackFacts(
          tx,
          scope.tenantId,
          email,
        )
        review = await reviewStaffStatusChangeInTransaction(tx, input)
        if (
          review.membershipId !== seeded.membershipId ||
          review.previousStatus !== "INVITED" ||
          review.nextStatus !== "SUSPENDED" ||
          review.acceptedAt !== null ||
          review.expectedRevision !== 1 ||
          review.scope !== "business_membership" ||
          review.assignments[0]?.storeId !== scope.storeId
        )
          throw Error("Original status review mismatch")
        if (
          (await staffInvitationRollbackFacts(tx, scope.tenantId, email)) !==
          factsBeforeReview
        )
          throw Error("Status review wrote facts")
        originalReceipt = await updateRetailOpsStaffStatusInTransaction(tx, {
          tenantId: scope.tenantId,
          actorUserId: scope.actorUserId,
          staffUserId: seeded.userId,
          status: input.status,
          expectedRevision: input.expectedRevision,
          reason: input.reason,
        })
        if (
          originalReceipt.status !== "SUSPENDED" ||
          originalReceipt.previousStatus !== "INVITED" ||
          originalReceipt.acceptedAt !== null ||
          originalReceipt.staffAccessRevision !== 2 ||
          !originalReceipt.lifecycleEventId
        )
          throw Error("Status receipt mismatch")
        const event = await tx.retailOpsStaffLifecycleEvent.findUniqueOrThrow({
          where: { id: originalReceipt.lifecycleEventId },
        })
        if (
          event.reason !== input.reason ||
          event.actorUserId !== scope.actorUserId ||
          event.membershipId !== seeded.membershipId ||
          event.fromStatus !== "INVITED" ||
          event.toStatus !== "SUSPENDED" ||
          event.type !== "SUSPENDED"
        )
          throw Error("Original durable status history mismatch")
        if (
          JSON.stringify(
            await tx.staffStoreAssignment.findMany({
              where: { membershipId: seeded.membershipId },
              orderBy: { id: "asc" },
            }),
          ) !== JSON.stringify(grantsBefore)
        )
          throw Error("Suspension changed Store grants")
        const suspendedFacts = await staffInvitationRollbackFacts(
          tx,
          scope.tenantId,
          email,
        )
        for (const request of [
          {
            name: "unaccepted-reactivation",
            status: "active" as const,
            expectedRevision: 2,
          },
          {
            name: "stale-status-revision",
            status: "active" as const,
            expectedRevision: 1,
          },
          {
            name: "already-suspended",
            status: "suspended" as const,
            expectedRevision: 2,
          },
        ]) {
          let rejected = false
          try {
            await updateRetailOpsStaffStatusInTransaction(tx, {
              tenantId: scope.tenantId,
              actorUserId: scope.actorUserId,
              staffUserId: seeded.userId,
              reason: input.reason,
              status: request.status,
              expectedRevision: request.expectedRevision,
            })
          } catch (error) {
            const expected =
              request.name === "unaccepted-reactivation"
                ? "completed onboarding"
                : request.name === "stale-status-revision"
                  ? "changed"
                  : "already has"
            if (!(error instanceof Error) || !error.message.includes(expected))
              throw error
            rejected = true
          }
          if (
            !rejected ||
            (await staffInvitationRollbackFacts(tx, scope.tenantId, email)) !==
              suspendedFacts
          )
            throw Error("Status refusal changed facts")
          refused.push(request.name)
        }
        history = await listStaffHistoryPageInTransaction(tx, {
          tenantId: scope.tenantId,
          actorUserId: scope.actorUserId,
          membershipId: seeded.membershipId,
          stream: "LIFECYCLE",
          eventType: "SUSPENDED",
          limit: 10,
        })
        const original = history.data[0]
        if (
          history.total !== 1 ||
          original?.id !== originalReceipt.lifecycleEventId ||
          original.stream !== "LIFECYCLE" ||
          original.reason !== input.reason ||
          original.before.status !== "INVITED" ||
          original.after.status !== "SUSPENDED"
        )
          throw Error("Canonical original history projection mismatch")
        if (
          (await staffInvitationRollbackFacts(tx, scope.tenantId, email)) !==
          suspendedFacts
        )
          throw Error("History read changed facts")
        verified = true
        throw rollback
      },
      { maxWait: 10_000, timeout: 30_000 },
    )
  } catch (error) {
    if (error !== rollback) throw error
  }
  const unchanged =
    before === (await staffInvitationRollbackFacts(db, scope.tenantId, email))
  if (!verified || !unchanged || !review || !originalReceipt)
    throw Error("Status rollback verification failed")
  return {
    database: "ewatrade_qa_v1",
    elapsedMs: performance.now() - started,
    unchanged,
    refused,
    review,
    originalReceipt,
    history,
    activeStaffGrants: 0,
    providerCalls: 0,
  }
}

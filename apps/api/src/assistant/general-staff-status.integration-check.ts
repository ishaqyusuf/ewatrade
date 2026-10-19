import { randomUUID } from "node:crypto"
import type { Prisma } from "@ewatrade/db"
import { reviewStaffStatusChangeInTransaction } from "@ewatrade/db/queries"
import { getStaffStatusReceiptInTransaction } from "@ewatrade/db/staff-status-receipt"
import { requireBrowserIdentity } from "./channel-principal"
import type { GeneralContext } from "./general-context"
import { decideGeneralProposal } from "./general-proposals"
import { proposalApprovalToken, proposalDigest } from "./proposal-security"
import { staffInvitationRollbackFacts } from "./staff-invitation-rollback-facts"
import { seedStaffInvitationRollbackFixture } from "./staff-invitation-rollback-fixture"

function check(value: unknown, message: string): asserts value {
  if (!value) throw Error(message)
}

/** Exercises the real signed dispatcher. Fixtures never acquire ACTIVE membership. */
export async function verifyStaffStatusProposalRollback(
  ctx: GeneralContext,
  conversationId: string,
) {
  check(
    process.env.RUN_STAFF_STATUS_SIGNED_ROLLBACK === "1" &&
      process.env.RUN_STAFF_INVITATION_SIGNED_ROLLBACK === "1" &&
      process.env.APP_ENV === "local" &&
      process.env.NODE_ENV === "development",
    "Explicit local staff-status rollback required",
  )
  const db = ctx.db
  const tenantId = ctx.tenantContext.tenant.id
  const actorUserId = ctx.session.user.id
  const storeId = ctx.tenantContext.activeStore?.id
  check(
    tenantId === "cmuzedcda000hbw9kd6e50z8u" &&
      actorUserId === "cmuzedc7e000gbw9ky1dioc9f" &&
      storeId === "cmuzedcow000jbw9kluarpxfs" &&
      conversationId === "cmv4i45w70000eb9kl7jkfa3e",
    "Exact owned saved QA scope required",
  )
  check(
    (
      await db.$queryRaw<
        Array<{ database: string }>
      >`SELECT current_database() AS database`
    )[0]?.database === "ewatrade_qa_v1",
    "Exact QA database required",
  )
  await db.membership.findFirstOrThrow({
    where: {
      tenantId,
      userId: actorUserId,
      role: "OWNER",
      status: "ACTIVE",
      user: { email: "video.20261008-video-v1.web.bakery@ishaq.qa.test" },
      tenant: { dataClassification: "QA", isActive: true },
    },
  })
  await db.store.findFirstOrThrow({
    where: { id: storeId, tenantId, status: "ACTIVE" },
  })
  check(
    process.env.S03_QA_SESSION_ID ===
      requireBrowserIdentity(ctx.session).session.id,
    "Explicit session pin required",
  )
  await db.session.findFirstOrThrow({
    where: {
      id: requireBrowserIdentity(ctx.session).session.id,
      userId: actorUserId,
      expiresAt: { gt: new Date() },
    },
  })
  await db.assistantConversation.findFirstOrThrow({
    where: {
      id: conversationId,
      tenantId,
      storeId,
      ownerUserId: actorUserId,
      purpose: "GENERAL",
    },
  })
  const signingKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
  check(
    signingKey && signingKey.length >= 32,
    "Process-only approval key required",
  )
  const email = `staff-status.${randomUUID()}@ishaq.qa.test`
  const before = await staffInvitationRollbackFacts(db, tenantId, email)
  const results: Array<{ case: string; elapsedMs: number }> = []
  for (const mode of [
    "completion-and-replay",
    "cancel-and-replay",
    "changed-token",
    "stale-revision",
  ] as const) {
    const nonce = randomUUID()
    const id = randomUUID()
    const payload = {
      action: "staff_status" as const,
      membershipId: `${nonce}-member`,
      status: "suspended" as const,
      expectedRevision: 1,
      reason: "QA signed suspension after original staff review",
    }
    const binding = {
      id,
      expiresAt: new Date(Date.now() + 900_000),
      payloadHash: proposalDigest(payload),
      tenantId,
      storeId,
      actorUserId,
      revision: 1,
    }
    const token = proposalApprovalToken(binding, signingKey)
    const sentinel = Error("S03_SIGNED_FORCED_ROLLBACK")
    const started = performance.now()
    let proved = false
    const scopedDb = new Proxy(db, {
      get(owner, key) {
        if (key !== "$transaction") {
          const value = Reflect.get(owner, key)
          return typeof value === "function" ? value.bind(owner) : value
        }
        return (
          operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options: {
            maxWait?: number
            timeout?: number
            isolationLevel?: Prisma.TransactionIsolationLevel
          },
        ) => {
          check(
            options.maxWait === 10_000 &&
              options.timeout === 30_000 &&
              options.isolationLevel === "Serializable",
            "Signed transaction bounds must remain unchanged",
          )
          return db.$transaction(async (tx) => {
            const fixture = await seedStaffInvitationRollbackFixture(tx, {
              tenantId,
              actorUserId,
              storeId,
              email,
              nonce,
            })
            check(
              fixture.membershipId === payload.membershipId,
              "Fixture identity mismatch",
            )
            const review = await reviewStaffStatusChangeInTransaction(
              tx,
              { ...payload, tenantId, actorUserId },
              { administrativeOnly: true },
            )
            check(
              review.previousStatus === "INVITED" &&
                review.nextStatus === "SUSPENDED" &&
                review.acceptedAt === null,
              "Only unaccepted fixture suspension is allowed",
            )
            const grants = await tx.staffStoreAssignment.findMany({
              where: { membershipId: fixture.membershipId },
              orderBy: { id: "asc" },
            })
            await tx.assistantActionProposal.create({
              data: {
                ...binding,
                conversationId,
                action: payload.action,
                payload,
                roleSnapshot: "OWNER",
                approvalTokenHash: proposalDigest(token),
                idempotencyKey: `assistant_${id}`,
                targetRecordId: fixture.membershipId,
                targetRevision: review.reviewHash,
              },
            })
            if (mode === "stale-revision")
              await tx.membership.update({
                where: { id: fixture.membershipId, tenantId },
                data: { staffAccessRevision: 2 },
              })
            const refusalFacts = await staffInvitationRollbackFacts(
              tx,
              tenantId,
              email,
            )
            if (mode === "changed-token" || mode === "stale-revision") {
              let rejected = false
              try {
                await operation(tx)
              } catch (error) {
                if (
                  !(
                    error &&
                    typeof error === "object" &&
                    "code" in error &&
                    error.code === "CONFLICT"
                  )
                )
                  throw error
                rejected = true
              }
              check(
                rejected &&
                  (await staffInvitationRollbackFacts(tx, tenantId, email)) ===
                    refusalFacts,
                "Invalid approval must refuse without transactional writes",
              )
            } else {
              const app = await operation(tx)
              const proposal =
                await tx.assistantActionProposal.findUniqueOrThrow({
                  where: { id },
                })
              const member = await tx.membership.findUniqueOrThrow({
                where: { id: fixture.membershipId },
              })
              if (mode === "cancel-and-replay") {
                check(
                  proposal.status === "CANCELLED" &&
                    proposal.executedResult === null &&
                    member.status === "INVITED" &&
                    member.staffAccessRevision === 1,
                  "Cancellation must preserve original membership",
                )
                check(
                  (await tx.retailOpsStaffLifecycleEvent.count({
                    where: {
                      membershipId: fixture.membershipId,
                      type: "SUSPENDED",
                    },
                  })) === 0,
                  "Cancellation must not produce a suspension receipt",
                )
              } else {
                check(
                  proposal.status === "COMPLETED" &&
                    member.status === "SUSPENDED" &&
                    member.staffAccessRevision === 2 &&
                    member.acceptedAt === null,
                  "Signed suspension must complete atomically",
                )
                const receipt = proposal.executedResult
                check(
                  receipt &&
                    typeof receipt === "object" &&
                    !Array.isArray(receipt) &&
                    receipt.kind === "staff_status" &&
                    typeof receipt.recordId === "string",
                  "Atomic original event receipt required",
                )
                const original = await getStaffStatusReceiptInTransaction(tx, {
                  tenantId,
                  actorUserId,
                  eventId: receipt.recordId,
                })
                check(
                  original.membershipId === fixture.membershipId &&
                    original.before.status === "INVITED" &&
                    original.after.status === "SUSPENDED" &&
                    original.reason === payload.reason &&
                    original.originalActorUserId === actorUserId,
                  "Original receipt must match signed intent",
                )
                check(
                  (await tx.retailOpsStaffLifecycleEvent.count({
                    where: {
                      membershipId: fixture.membershipId,
                      type: "SUSPENDED",
                    },
                  })) === 1,
                  "Exactly one suspension event required",
                )
              }
              check(
                JSON.stringify(
                  await tx.staffStoreAssignment.findMany({
                    where: { membershipId: fixture.membershipId },
                    orderBy: { id: "asc" },
                  }),
                ) === JSON.stringify(grants),
                "Signed decision must preserve Store grants",
              )
              const replayFacts = await staffInvitationRollbackFacts(
                tx,
                tenantId,
                email,
              )
              check(
                JSON.stringify(await operation(tx)) === JSON.stringify(app) &&
                  (await staffInvitationRollbackFacts(tx, tenantId, email)) ===
                    replayFacts,
                "Completed/cancelled replay must not duplicate effects",
              )
            }
            proved = true
            throw sentinel
          }, options)
        }
      },
    })
    let failed = false
    let failure: unknown
    try {
      await decideGeneralProposal(
        { ...ctx, db: scopedDb },
        {
          proposalId: id,
          revision: 1,
          decision: mode === "cancel-and-replay" ? "cancel" : "confirm",
          approvalToken:
            mode === "changed-token" ? `${token.slice(0, -1)}!` : token,
        },
      )
      throw Error("Signed transaction unexpectedly committed")
    } catch (error) {
      if (error !== sentinel) {
        failed = true
        failure = error
      }
    }
    check(
      (await staffInvitationRollbackFacts(db, tenantId, email)) === before,
      "Saved staff/auth/chat/budget facts changed after forced rollback",
    )
    if (failed) throw failure
    check(proved, "Signed case did not prove its expected outcome")
    results.push({
      case: mode,
      elapsedMs: Math.round(performance.now() - started),
    })
  }
  return {
    verified: true,
    results,
    savedStaffAuthChatBudgetFactsUnchanged: true,
    providerCalls: 0,
    activeFixtureMembershipsCreated: 0,
    committedFixtures: false,
    replayScope: "same transaction; not persisted or concurrent HTTP recovery",
  }
}

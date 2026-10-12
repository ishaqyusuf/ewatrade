import { createHash, createHmac, randomBytes } from "node:crypto"
import type { PrismaClient } from "@ewatrade/db"
import {
  claimStaffInvitationNotificationInTransaction,
  finishStaffInvitationNotificationInTransaction,
  getStaffInvitationCommandInTransaction,
  reconcileStaffInvitationProviderEventInTransaction,
  startStaffInvitationNotificationInTransaction,
} from "@ewatrade/db/queries"
import { OpenAPIHono } from "@hono/zod-openapi"
import { staffInvitationRollbackFacts } from "../assistant/staff-invitation-rollback-facts"
import { seedStaffInvitationRollbackFixture } from "../assistant/staff-invitation-rollback-fixture"
import { registerStaffInvitationResendWebhook } from "./resend-webhook"

/** Explicit exact-QA entrypoint; all synthetic staff/notification writes roll back. */
export async function verifyStaffInvitationProviderRollback(
  db: PrismaClient,
  scope: { tenantId: string; actorUserId: string; storeId: string },
) {
  if (
    process.env.RUN_STAFF_INVITATION_SIGNED_ROLLBACK !== "1" ||
    process.env.APP_ENV !== "local" ||
    process.env.NODE_ENV !== "development"
  )
    throw Error("Explicit local rollback required.")
  const database = await db.$queryRaw<
    Array<{ database: string }>
  >`SELECT current_database() AS database`
  if (
    database[0]?.database !== "ewatrade_qa_v1" ||
    scope.tenantId !== "cmuzedcda000hbw9kd6e50z8u" ||
    scope.actorUserId !== "cmuzedc7e000gbw9ky1dioc9f" ||
    scope.storeId !== "cmuzedcow000jbw9kluarpxfs"
  )
    throw Error("Exact owned QA required.")
  const email = `s02-reconciliation-${randomBytes(8).toString("hex")}@ishaq.qa.test`
  const before = await staffInvitationRollbackFacts(db, scope.tenantId, email)
  const results: Array<{ case: string; elapsedMs: number; verified: boolean }> =
    []
  const commands: Awaited<
    ReturnType<typeof getStaffInvitationCommandInTransaction>
  >[] = []
  for (const mode of [
    "unknown-delivery-replay",
    "worker-timestamp-and-failure",
    "unsent-and-conflict-refusal",
  ] as const) {
    const start = performance.now()
    const rollback = Error(`rollback-${mode}`)
    let verified = false
    try {
      await db.$transaction(
        async (tx) => {
          const seeded = await seedStaffInvitationRollbackFixture(tx, {
            ...scope,
            email,
            nonce: `qa-s02-event-${randomBytes(8).toString("hex")}`,
          })
          const identity = {
            tenantId: scope.tenantId,
            notificationId: seeded.notificationId,
          }
          const key = randomBytes(32)
          const now = new Date()
          const hash = (
            await tx.staffInvitationNotification.findUniqueOrThrow({
              where: { id: seeded.notificationId },
              select: { payloadHash: true },
            })
          ).payloadHash
          const app = new OpenAPIHono()
          registerStaffInvitationResendWebhook(app, {
            config: {
              STAFF_INVITATION_RECONCILIATION_ENABLED: "true",
              STAFF_INVITATION_RESEND_WEBHOOK_SECRET: `whsec_${key.toString("base64")}`,
            },
            reconcile: (input) =>
              reconcileStaffInvitationProviderEventInTransaction(tx, input),
          })
          function event(type: string) {
            return {
              type,
              created_at: new Date(now.getTime() + 1000).toISOString(),
              data: {
                email_id: `resend-${seeded.notificationId}`,
                created_at: now.toISOString(),
                to: ["tester@example.com"],
                subject: "Discard private content",
                tags: {
                  category: "staff_invitation",
                  tenant_id: scope.tenantId,
                  notification_id: seeded.notificationId,
                  payload_hash: hash,
                  destination_digest: createHash("sha256")
                    .update("tester@example.com")
                    .digest("hex"),
                },
              },
            }
          }
          async function post(
            value: ReturnType<typeof event>,
            expected: number,
          ) {
            const payload = JSON.stringify(value)
            const id = `msg_${randomBytes(8).toString("hex")}`
            const timestamp = String(Math.floor(Date.now() / 1000))
            const signature = createHmac("sha256", key)
              .update(`${id}.${timestamp}.${payload}`)
              .digest("base64")
            const response = await app.request(
              "http://localhost/api/staff/invitations/webhooks/resend",
              {
                method: "POST",
                body: payload,
                headers: {
                  "svix-id": id,
                  "svix-timestamp": timestamp,
                  "svix-signature": `v1,${signature}`,
                },
              },
            )
            if (response.status !== expected)
              throw Error(
                `Verified callback ${mode} expected ${expected}, received ${response.status}`,
              )
            return response.json() as Promise<{ replay?: boolean }>
          }
          const pendingFacts = await staffInvitationRollbackFacts(
            tx,
            scope.tenantId,
            email,
          )
          await post(event("email.delivered"), 409)
          if (
            (await staffInvitationRollbackFacts(tx, scope.tenantId, email)) !==
            pendingFacts
          )
            throw Error("Unsent callback changed facts")
          const claim = await claimStaffInvitationNotificationInTransaction(
            tx,
            { ...identity, now },
          )
          if (
            !claim ||
            !(await startStaffInvitationNotificationInTransaction(tx, {
              ...identity,
              claimId: claim.claimId,
              expectedAccessRevision: 1,
              now,
            }))
          )
            throw Error("Original send fence unavailable")
          const completion = {
            ...identity,
            claimId: claim.claimId,
            payloadHash: hash,
          }
          if (mode === "unsent-and-conflict-refusal") {
            const sendingFacts = await staffInvitationRollbackFacts(
              tx,
              scope.tenantId,
              email,
            )
            const changed = event("email.delivered")
            changed.data.tags.payload_hash = "b".repeat(64)
            await post(changed, 409)
            const foreign = event("email.delivered")
            foreign.data.tags.tenant_id = "foreign-tenant"
            await post(foreign, 409)
            const older = event("email.delivered")
            older.data.created_at = new Date(
              now.getTime() - 600000,
            ).toISOString()
            await post(older, 409)
            if (
              (await staffInvitationRollbackFacts(
                tx,
                scope.tenantId,
                email,
              )) !== sendingFacts
            )
              throw Error("Refusal changed facts")
          } else {
            if (
              !(await finishStaffInvitationNotificationInTransaction(
                tx,
                mode === "unknown-delivery-replay"
                  ? {
                      ...completion,
                      outcome: "OUTCOME_UNKNOWN",
                      failureCode: "PROVIDER_OUTCOME_UNKNOWN",
                      now,
                    }
                  : {
                      ...completion,
                      outcome: "SENT",
                      providerKey: "resend",
                      providerMessageId: event("email.sent").data.email_id,
                      now: new Date(now.getTime() + 2000),
                    },
              ))
            )
              throw Error("Original outcome not recorded")
            // A previously accepted send remains a fact even if the link is now revoked.
            if (mode === "unknown-delivery-replay")
              await tx.retailOpsStaffInviteToken.update({
                where: { id: seeded.invitationId },
                data: { status: "REVOKED", revokedAt: now },
              })
            await post(event("email.delivered"), 200)
            const delivered = await getStaffInvitationCommandInTransaction(tx, {
              ...scope,
              commandId: seeded.commandId,
            })
            if (
              delivered.notification?.status !== "DELIVERED" ||
              delivered.notification.sentAt?.getTime() !== now.getTime() ||
              delivered.notification.deliveredAt?.getTime() !==
                now.getTime() + 1000 ||
              delivered.membership.status !== "INVITED"
            )
              throw Error("Original delivery projection mismatch")
            commands.push(delivered)
            const deliveredFacts = await staffInvitationRollbackFacts(
              tx,
              scope.tenantId,
              email,
            )
            if (
              !(await post(event("email.delivered"), 200)).replay ||
              (await staffInvitationRollbackFacts(
                tx,
                scope.tenantId,
                email,
              )) !== deliveredFacts
            )
              throw Error("Delivery replay wrote facts")
            if (mode === "worker-timestamp-and-failure") {
              await post(event("email.complained"), 200)
              await post(event("email.sent"), 200)
              const failure = await getStaffInvitationCommandInTransaction(tx, {
                ...scope,
                commandId: seeded.commandId,
              })
              if (
                failure.notification?.status !== "DELIVERED" ||
                failure.notification.failureCode !== "PROVIDER_COMPLAINED" ||
                failure.notification.attemptCount !== 1
              )
                throw Error("Late send lost delivery issue")
              commands.push(failure)
            }
            const receiptFacts = await staffInvitationRollbackFacts(
              tx,
              scope.tenantId,
              email,
            )
            const conflicting = event("email.delivered")
            conflicting.data.email_id = "different-provider-receipt"
            await post(conflicting, 409)
            if (
              (await staffInvitationRollbackFacts(
                tx,
                scope.tenantId,
                email,
              )) !== receiptFacts
            )
              throw Error("Conflicting provider receipt changed facts")
            if (
              !(await finishStaffInvitationNotificationInTransaction(tx, {
                ...completion,
                outcome: "SENT",
                providerKey: "resend",
                providerMessageId: event("email.sent").data.email_id,
                now: new Date(now.getTime() + 3000),
              }))
            )
              throw Error("Late original worker receipt refused")
            const outbox =
              await tx.staffInvitationNotification.findUniqueOrThrow({
                where: { id: seeded.notificationId },
                select: { payloadCiphertext: true, attemptCount: true },
              })
            if (outbox.payloadCiphertext !== null || outbox.attemptCount !== 1)
              throw Error("Custody or attempt changed")
          }
          verified = true
          throw rollback
        },
        { maxWait: 10000, timeout: 30000 },
      )
    } catch (error) {
      if (error !== rollback) throw error
    }
    if (
      !verified ||
      (await staffInvitationRollbackFacts(db, scope.tenantId, email)) !== before
    )
      throw Error("Saved staff/auth/chat/budget facts changed")
    results.push({ case: mode, elapsedMs: performance.now() - start, verified })
  }
  return {
    verified: true,
    results,
    commands,
    savedStaffAuthChatBudgetFactsUnchanged: true,
    providerCalls: 0,
  }
}

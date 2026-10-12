import { randomUUID } from "node:crypto"
import type { Prisma } from "@ewatrade/db"
import {
  type StaffInvitationCommandReceipt,
  getStaffInvitationCommandInTransaction,
  listStaffInvitationsInTransaction,
  reviewStaffInvitationCommandInTransaction,
} from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import { decideGeneralProposal } from "./general-proposals"
import { staffInvitationReviewLines } from "./general-staff-invitation"
import { proposalApprovalToken, proposalDigest } from "./proposal-security"
import { staffInvitationRollbackFacts } from "./staff-invitation-rollback-facts"
import { seedStaffInvitationRollbackFixture } from "./staff-invitation-rollback-fixture"

function check(value: unknown, message: string): asserts value {
  if (!value) throw Error(message)
}

type LifecycleProof = {
  result: StaffInvitationCommandReceipt
  member: {
    status: string
    role: string
    staffAccessRevision: number
    catalogEditor: boolean
    acceptedAt: string | null
  }
  profile: { defaultStoreId: string }
  assignments: Array<{
    storeId: string
    role: string
    revision: number
    status: string
  }>
  oldInvitation: {
    status: string
    revokedAt: string | null
    acceptedAt: string | null
  }
  oldWork: { status: string; custodyErased: boolean; attemptCount: number }
  newWork: {
    status: string
    attemptCount: number
    custodyPresent: boolean
    sentAt: string | null
    deliveredAt: string | null
  } | null
  newInvitation: {
    id: string
    status: string
    acceptedAt: string | null
    expiresAt: string
  }
  credentials: number
  sessions: number
  revocationEvents: number
  commandCount: number
}

/** Real signed lifecycle and completed replay; all seeded and executed facts roll back. */
export async function verifyStaffInvitationLifecycleProposalRollback(
  ctx: GeneralContext,
  conversationId: string,
) {
  check(
    process.env.RUN_STAFF_INVITATION_SIGNED_ROLLBACK === "1" &&
      process.env.APP_ENV === "local" &&
      process.env.NODE_ENV === "development",
    "Explicit local lifecycle rollback required",
  )
  const db = ctx.db
  const tenantId = ctx.tenantContext.tenant.id
  const userId = ctx.session.user.id
  const storeId = ctx.tenantContext.activeStore?.id
  check(
    storeId === "cmuzedcow000jbw9kluarpxfs" &&
      tenantId === "cmuzedcda000hbw9kd6e50z8u" &&
      userId === "cmuzedc7e000gbw9ky1dioc9f",
    "Exact owned scope required",
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
      userId,
      role: "OWNER",
      status: "ACTIVE",
      tenant: { dataClassification: "QA", isActive: true },
      user: { email: "video.20261008-video-v1.web.bakery@ishaq.qa.test" },
    },
  })
  await db.assistantConversation.findFirstOrThrow({
    where: {
      id: conversationId,
      tenantId,
      ownerUserId: userId,
      storeId,
      purpose: "GENERAL",
    },
  })
  const email = `staff-lifecycle.${randomUUID()}@ishaq.qa.test`
  const facts = () => staffInvitationRollbackFacts(db, tenantId, email)
  const before = await facts()
  const results: Array<{ case: string; elapsedMs: number }> = []
  const originalCommands: unknown[] = []
  const signingKey = process.env.ASSISTANT_APPROVAL_SIGNING_KEY
  check(
    signingKey && signingKey.length >= 32,
    "Ephemeral signed approval key required",
  )
  for (const kind of ["RESEND", "REVOKE"] as const) {
    for (const mode of [
      "completion-and-replay",
      "changed-token",
      "changed-access-revision",
      "accepted-invitation",
    ] as const) {
      const nonce = randomUUID()
      const id = randomUUID()
      const invitationId = `${nonce}-invite`
      const payload = {
        action: "staff_invitation" as const,
        intent: {
          kind,
          invitationId,
          reason: "QA signed lifecycle rollback after original review",
        },
      }
      const binding = {
        id,
        expiresAt: new Date(Date.now() + 900_000),
        payloadHash: proposalDigest(payload),
        tenantId,
        storeId,
        actorUserId: userId,
        revision: 1,
      }
      const approvalToken = proposalApprovalToken(binding, signingKey)
      const rollback = new Error("STAFF_LIFECYCLE_SIGNED_ROLLBACK")
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
            options: object,
          ) =>
            db.$transaction(async (tx) => {
              const original = await seedStaffInvitationRollbackFixture(tx, {
                tenantId,
                actorUserId: userId,
                storeId,
                email,
                nonce,
              })
              const review = await reviewStaffInvitationCommandInTransaction(
                tx,
                { ...payload.intent, tenantId, actorUserId: userId },
              )
              check(
                !review.blockers.length && review.kind === kind,
                "Original lifecycle review unexpectedly blocked",
              )
              await tx.assistantActionProposal.create({
                data: {
                  ...binding,
                  conversationId,
                  action: payload.action,
                  payload,
                  roleSnapshot: "OWNER",
                  approvalTokenHash: proposalDigest(approvalToken),
                  idempotencyKey: `assistant_${id}`,
                  targetRecordId: invitationId,
                  targetRevision: review.reviewHash,
                },
              })
              if (mode === "changed-access-revision")
                await tx.membership.update({
                  where: { id: original.membershipId, tenantId },
                  data: { staffAccessRevision: 2 },
                })
              if (mode === "accepted-invitation")
                await tx.retailOpsStaffInviteToken.update({
                  where: { id: invitationId, tenantId },
                  data: { status: "ACCEPTED", acceptedAt: new Date() },
                })
              const beforeDecision = await staffInvitationRollbackFacts(
                tx,
                tenantId,
                email,
              )
              try {
                const app = await operation(tx)
                check(
                  mode === "completion-and-replay",
                  "Stale or invalid lifecycle approval executed",
                )
                check(
                  app &&
                    typeof app === "object" &&
                    "status" in app &&
                    app.status === "COMPLETED" &&
                    "receipt" in app,
                  "Signed lifecycle did not complete",
                )
                const receipt = app.receipt as {
                  kind: string
                  recordId: string
                }
                check(
                  receipt.kind === "staff_invitation" && receipt.recordId,
                  "Owning lifecycle receipt missing",
                )
                const [row] = await tx.$queryRaw<
                  Array<{ proof: LifecycleProof }>
                >`SELECT jsonb_build_object(
                'result',c.result,'member',to_jsonb(m),'profile',(SELECT to_jsonb(p) FROM "RetailOpsStaffProfile" p WHERE p."membershipId"=m.id),
                'assignments',(SELECT jsonb_agg(jsonb_build_object('storeId',a."storeId",'role',a.role,'revision',a.revision,'status',a.status)) FROM "StaffStoreAssignment" a WHERE a."membershipId"=m.id),
                'oldInvitation',jsonb_build_object('status',i.status,'revokedAt',i."revokedAt",'acceptedAt',i."acceptedAt"),
                'oldWork',jsonb_build_object('status',o.status,'custodyErased',o."payloadCiphertext" IS NULL,'attemptCount',o."attemptCount"),
                'newWork',(SELECT jsonb_build_object('status',n.status,'attemptCount',n."attemptCount",'custodyPresent',n."payloadCiphertext" IS NOT NULL,'sentAt',n."sentAt",'deliveredAt',n."deliveredAt") FROM "StaffInvitationNotification" n WHERE n."commandId"=c.id),
                'newInvitation',(SELECT jsonb_build_object('id',n.id,'status',n.status,'acceptedAt',n."acceptedAt",'expiresAt',n."expiresAt") FROM "RetailOpsStaffInviteToken" n WHERE n.id=c."invitationId"),
                'credentials',(SELECT count(*) FROM "Account" a WHERE a."userId"=m."userId"),'sessions',(SELECT count(*) FROM "Session" s WHERE s."userId"=m."userId"),
                'revocationEvents',(SELECT count(*) FROM "RetailOpsStaffLifecycleEvent" e WHERE e."membershipId"=m.id AND e.type='INVITE_REVOKED'),
                'commandCount',(SELECT count(*) FROM "StaffInvitationCommand" x WHERE x."tenantId"=${tenantId} AND x."clientCommandId"=${`assistant_${id}`})
              ) AS proof FROM "StaffInvitationCommand" c JOIN "Membership" m ON m.id=c."membershipId" JOIN "RetailOpsStaffInviteToken" i ON i.id=${invitationId} JOIN "StaffInvitationNotification" o ON o.id=${original.notificationId} WHERE c.id=${receipt.recordId} AND c."tenantId"=${tenantId}`
                const p = row?.proof
                check(
                  p?.member.status === "INVITED" &&
                    p.member.role === "CASHIER" &&
                    p.member.staffAccessRevision === 1 &&
                    !p.member.catalogEditor &&
                    !p.member.acceptedAt &&
                    p.profile.defaultStoreId === storeId &&
                    p.assignments.length === 1 &&
                    p.assignments[0]?.storeId === storeId &&
                    p.assignments[0]?.role === "CASHIER" &&
                    p.assignments[0]?.revision === 1 &&
                    p.assignments[0]?.status === "ACTIVE",
                  "Lifecycle changed original staff grants or activated staff",
                )
                check(
                  p.oldInvitation.status === "REVOKED" &&
                    p.oldInvitation.revokedAt &&
                    !p.oldInvitation.acceptedAt &&
                    p.oldWork.status === "CANCELLED" &&
                    p.oldWork.custodyErased &&
                    p.oldWork.attemptCount === 0 &&
                    p.credentials === 0 &&
                    p.sessions === 0 &&
                    p.commandCount === 1,
                  "Superseded link/custody or credential effects differ",
                )
                check(
                  p.result.kind === kind &&
                    p.result.details?.recipient.email === email &&
                    p.result.details.reviewHash === review.reviewHash &&
                    p.result.details.reason === payload.intent.reason &&
                    p.result.details.grants.assignments[0]?.storeId === storeId,
                  "Original lifecycle review receipt differs",
                )
                if (kind === "RESEND")
                  check(
                    p.newWork &&
                      p.newInvitation.id !== invitationId &&
                      p.newInvitation.status === "ACTIVE" &&
                      !p.newInvitation.acceptedAt &&
                      p.newWork.status === "PENDING" &&
                      p.newWork.custodyPresent &&
                      p.newWork.attemptCount === 0 &&
                      !p.newWork.sentAt &&
                      !p.newWork.deliveredAt,
                    "Replacement invitation/outbox differs",
                  )
                else
                  check(
                    p.result.invitationId === invitationId &&
                      p.result.notificationId === null &&
                      !p.newWork &&
                      p.revocationEvents === 1,
                    "Revocation queued email or lost lifecycle audit",
                  )
                const saved = await staffInvitationRollbackFacts(
                  tx,
                  tenantId,
                  email,
                )
                const replay = await operation(tx)
                check(
                  JSON.stringify(replay) === JSON.stringify(app) &&
                    (await staffInvitationRollbackFacts(
                      tx,
                      tenantId,
                      email,
                    )) === saved,
                  "Completed signed replay duplicated or changed facts",
                )
                const command = await getStaffInvitationCommandInTransaction(
                  tx,
                  {
                    tenantId,
                    actorUserId: userId,
                    commandId: receipt.recordId,
                  },
                )
                const invitations = await listStaffInvitationsInTransaction(
                  tx,
                  {
                    tenantId,
                    actorUserId: userId,
                    membershipId: original.membershipId,
                  },
                )
                check(
                  invitations.total === (kind === "RESEND" ? 2 : 1),
                  "Lifecycle invitation discovery total differs",
                )
                check(
                  !/tokenHash|payloadCiphertext|acceptanceToken|providerMessageId/.test(
                    JSON.stringify({ command, invitations }),
                  ),
                  "Lifecycle receipt/discovery leaked private custody",
                )
                originalCommands.push({
                  kind,
                  command,
                  invitations,
                  payload,
                  reviewLines: staffInvitationReviewLines(review),
                })
                proved = true
              } catch (error) {
                if (
                  mode === "completion-and-replay" ||
                  !(
                    error &&
                    typeof error === "object" &&
                    "code" in error &&
                    error.code === "CONFLICT"
                  )
                )
                  throw error
                check(
                  (await staffInvitationRollbackFacts(tx, tenantId, email)) ===
                    beforeDecision,
                  "Refused signed lifecycle changed transactional facts",
                )
                proved = true
              }
              throw rollback
            }, options)
        },
      })
      try {
        await decideGeneralProposal(
          { ...ctx, db: scopedDb },
          {
            proposalId: id,
            revision: 1,
            decision: "confirm",
            approvalToken:
              mode === "changed-token"
                ? `${approvalToken.slice(0, -1)}!`
                : approvalToken,
          },
        )
      } catch (error) {
        if (error !== rollback) throw error
      }
      check(
        proved && (await facts()) === before,
        `${kind} ${mode} failed or changed saved staff/auth/chat/budget facts`,
      )
      results.push({
        case: `${kind.toLowerCase()}-${mode}`,
        elapsedMs: Math.round(performance.now() - started),
      })
    }
  }
  return {
    verified: true,
    results,
    originalCommands,
    savedStaffAuthChatBudgetFactsUnchanged: true,
    providerCalls: false,
    committedFixtures: false,
  }
}

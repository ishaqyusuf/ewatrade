import { randomUUID } from "node:crypto"
import type { Prisma } from "@ewatrade/db"
import {
  getStaffInvitationCommandInTransaction,
  listStaffInvitationsInTransaction,
  reviewStaffInvitationCommand,
} from "@ewatrade/db/queries"
import type { GeneralContext } from "./general-context"
import { decideGeneralProposal } from "./general-proposals"
import { staffInvitationReviewLines } from "./general-staff-invitation"
import { proposalApprovalToken, proposalDigest } from "./proposal-security"
import { staffInvitationRollbackFacts } from "./staff-invitation-rollback-facts"

function check(value: unknown, message: string): asserts value {
  if (!value) throw Error(message)
}

/** Real signed confirmation with transaction-local drafts; no committed staff or provider calls. */
export async function verifyStaffInvitationProposalRollback(
  ctx: GeneralContext,
  conversationId: string,
) {
  check(
    process.env.RUN_STAFF_INVITATION_SIGNED_ROLLBACK === "1" &&
      process.env.APP_ENV === "local" &&
      process.env.NODE_ENV === "development",
    "Explicit local rollback run required",
  )
  const db = ctx.db,
    tenantId = ctx.tenantContext.tenant.id,
    userId = ctx.session.user.id,
    storeId = ctx.tenantContext.activeStore!.id
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
  const email = `staff-signed.${randomUUID()}@ishaq.qa.test`
  const payload = {
    action: "staff_invitation" as const,
    intent: {
      kind: "INVITE" as const,
      invite: {
        email,
        name: "QA reviewed invitation",
        assignments: [{ storeId, role: "CASHIER" as const }],
        defaultStoreId: storeId,
        catalogEditor: false,
      },
    },
  }
  const review = await reviewStaffInvitationCommand(db, {
    tenantId,
    actorUserId: userId,
    ...payload.intent,
  })
  check(
    review.blockers.length === 0 && review.kind === "INVITE",
    "Original QA review unexpectedly blocked",
  )
  const facts = () => staffInvitationRollbackFacts(db, tenantId, email)
  const before = await facts(),
    results: Array<{ case: string; elapsedMs: number }> = []
  let originalCommand: unknown
  for (const mode of [
    "completion",
    "changed-token",
    "changed-store-label",
  ] as const) {
    const id = randomUUID(),
      expiresAt = new Date(Date.now() + 900_000),
      payloadHash = proposalDigest(payload)
    const binding = {
      id,
      expiresAt,
      payloadHash,
      tenantId,
      storeId,
      actorUserId: userId,
      revision: 1,
    }
    const approvalToken = proposalApprovalToken(
      binding,
      process.env.ASSISTANT_APPROVAL_SIGNING_KEY!,
    )
    const rollback = new Error("STAFF_SIGNED_ROLLBACK"),
      started = performance.now()
    let proved = false
    const scopedDb = new Proxy(db, {
      get(owner, key) {
        if (key !== "$transaction") {
          const v = Reflect.get(owner, key)
          return typeof v === "function" ? v.bind(owner) : v
        }
        return (
          operation: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options: object,
        ) =>
          db.$transaction(async (tx) => {
            await tx.assistantActionProposal.create({
              data: {
                ...binding,
                conversationId,
                action: payload.action,
                payload,
                roleSnapshot: "OWNER",
                approvalTokenHash: proposalDigest(approvalToken),
                idempotencyKey: `assistant_${id}`,
                targetRecordId: `staff-email:${email}`,
                targetRevision: review.reviewHash,
              },
            })
            if (mode === "changed-store-label")
              await tx.store.update({
                where: { id: storeId, tenantId },
                data: {
                  name: `${ctx.tenantContext.activeStore!.name} QA stale label`,
                },
              })
            try {
              const app = await operation(tx)
              check(
                mode === "completion",
                "Invalid approval or changed review executed",
              )
              check(
                app &&
                  typeof app === "object" &&
                  "status" in app &&
                  app.status === "COMPLETED" &&
                  "receipt" in app,
                "Real signed command did not complete",
              )
              const receipt = app.receipt as { kind: string; recordId: string }
              check(
                receipt.kind === "staff_invitation" &&
                  Boolean(receipt.recordId),
                "Owning safe receipt missing",
              )
              const [row] = await tx.$queryRaw<
                Array<{ proof: any }>
              >`SELECT jsonb_build_object(
            'receipt', c.result, 'savedAt', c."createdAt",
            'membership', jsonb_build_object('id',m.id,'role',m.role,'status',m.status,'staffAccessRevision',m."staffAccessRevision",'catalogEditor',m."catalogEditor"),
            'invitation', jsonb_build_object('status',i.status,'expiresAt',i."expiresAt",'acceptedAt',i."acceptedAt",'revokedAt',i."revokedAt"),
            'notification', jsonb_build_object('id',n.id,'status',n.status,'attemptCount',n."attemptCount",'failureCode',n."failureCode",'sentAt',n."sentAt",'deliveredAt',n."deliveredAt",'cancelledAt',n."cancelledAt"),
            'custodyPresent', n."payloadCiphertext" IS NOT NULL,
            'tokenHashPresent', length(i."tokenHash")=64,
            'assignments', (SELECT jsonb_agg(jsonb_build_object('storeId',a."storeId",'role',a.role) ORDER BY a."storeId") FROM "StaffStoreAssignment" a WHERE a."membershipId"=m.id AND a.status='ACTIVE'),
            'profile', (SELECT jsonb_build_object('defaultStoreId',p."defaultStoreId") FROM "RetailOpsStaffProfile" p WHERE p."membershipId"=m.id),
            'attempts', (SELECT count(*) FROM "StaffInvitationNotificationAttempt" a WHERE a."notificationId"=n.id),
            'credentials', (SELECT count(*) FROM "Account" a WHERE a."userId"=m."userId"),
            'sessions', (SELECT count(*) FROM "Session" s WHERE s."userId"=m."userId"),
            'proposalStatus', (SELECT p.status FROM "AssistantActionProposal" p WHERE p.id=${id})
          ) AS proof FROM "StaffInvitationCommand" c JOIN "Membership" m ON m.id=c."membershipId" JOIN "RetailOpsStaffInviteToken" i ON i.id=c."invitationId" JOIN "StaffInvitationNotification" n ON n."commandId"=c.id WHERE c.id=${receipt.recordId} AND c."tenantId"=${tenantId}`
              const p = row?.proof
              check(
                p?.membership.status === "INVITED" &&
                  p.membership.role === "CASHIER" &&
                  p.membership.catalogEditor === false &&
                  p.profile.defaultStoreId === storeId &&
                  p.assignments.length === 1 &&
                  p.assignments[0].storeId === storeId &&
                  p.assignments[0].role === "CASHIER",
                "Saved reviewed grants differ",
              )
              check(
                p.receipt.details.recipient.email === email &&
                  p.receipt.details.reviewHash === review.reviewHash &&
                  p.receipt.details.grants.assignments[0].storeName ===
                    review.proposed.assignments[0]!.storeName,
                "Original receipt review differs",
              )
              check(
                p.notification.status === "PENDING" &&
                  p.notification.attemptCount === 0 &&
                  !p.notification.sentAt &&
                  !p.notification.deliveredAt &&
                  p.custodyPresent &&
                  p.tokenHashPresent &&
                  p.attempts === 0 &&
                  p.credentials === 0 &&
                  p.sessions === 0 &&
                  p.proposalStatus === "COMPLETED",
                "Unexpected notification/credential effects",
              )
              const {
                custodyPresent,
                tokenHashPresent,
                assignments,
                profile,
                attempts,
                credentials,
                sessions,
                proposalStatus,
                ...safe
              } = p
              check(
                !/tokenHash|payloadCiphertext|acceptanceToken|providerMessageId/.test(
                  JSON.stringify(safe),
                ),
                "Private custody leaked",
              )
              originalCommand = await getStaffInvitationCommandInTransaction(
                tx,
                { tenantId, actorUserId: userId, commandId: receipt.recordId },
              )
              const invitations = await listStaffInvitationsInTransaction(tx, {
                tenantId,
                actorUserId: userId,
                membershipId: p.membership.id,
              })
              check(
                invitations.total === 1 &&
                  invitations.data[0]?.commandId === receipt.recordId &&
                  invitations.data[0]?.notificationStatus === "PENDING",
                "Exact member invitation discovery differs",
              )
              check(
                !/tokenHash|payloadCiphertext|acceptanceToken|providerMessageId/.test(
                  JSON.stringify({ originalCommand, invitations }),
                ),
                "Protected native receipt/discovery leaked custody",
              )
              proved = true
            } catch (error) {
              if (
                mode === "completion" ||
                !(
                  error &&
                  typeof error === "object" &&
                  "code" in error &&
                  error.code === "CONFLICT"
                )
              )
                throw error
              check(
                (await tx.staffInvitationCommand.count({
                  where: { tenantId, clientCommandId: `assistant_${id}` },
                })) === 0,
                "Refused signed request created a command",
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
      `${mode} failed or changed saved staff/auth/chat/budget facts`,
    )
    results.push({
      case: mode,
      elapsedMs: Math.round(performance.now() - started),
    })
  }
  return {
    verified: true,
    results,
    originalCommand,
    reviewLines: staffInvitationReviewLines(review),
    payload,
    savedStaffAuthChatBudgetFactsUnchanged: true,
    providerCalls: false,
    committedFixtures: false,
  }
}

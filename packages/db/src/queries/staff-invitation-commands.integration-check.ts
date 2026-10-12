import { createHash, randomBytes, randomUUID } from "node:crypto"
import type { Prisma, PrismaClient } from "../../generated/prisma/client"
import {
  executeStaffInvitationCommandInTransaction,
  reviewStaffInvitationCommandInTransaction,
  getStaffInvitationCommandInTransaction,
} from "./staff-invitation-commands"
import {
  claimStaffInvitationNotificationInTransaction,
  startStaffInvitationNotificationInTransaction,
  finishStaffInvitationNotificationInTransaction,
  recordStaffInvitationDeliveredInTransaction,
} from "./staff-invitation-notifications"
import {
  sealStaffInvitationPayload,
  staffInvitationPayloadHash,
} from "../staff-invitation-custody"

const scope = {
  tenantId: "cmuzedcda000hbw9kd6e50z8u",
  actorUserId: "cmuzedc7e000gbw9ky1dioc9f",
}
const storeId = "cmuzedcow000jbw9kluarpxfs"
class Rollback extends Error {}
function check(value: unknown, message: string): asserts value {
  if (!value) throw Error(message)
}

/** Classified owned QA only. No provider, credentials, active staff or committed fixtures. */
export async function verifyStaffInvitationCommandsRollback(db: PrismaClient) {
  check(
    process.env.RUN_STAFF_INVITATION_ROLLBACK === "1",
    "Explicit staff rollback run required",
  )
  check(
    process.env.APP_ENV === "local" && process.env.NODE_ENV === "development",
    "Local QA readiness required",
  )
  const [identity] = await db.$queryRaw<
    Array<{ database: string }>
  >`SELECT current_database() AS database`
  check(
    identity?.database === "ewatrade_qa_v1",
    "Exact owned QA database required",
  )
  await db.membership.findFirstOrThrow({
    where: {
      ...{ tenantId: scope.tenantId, userId: scope.actorUserId },
      role: "OWNER",
      status: "ACTIVE",
      user: { email: "video.20261008-video-v1.web.bakery@ishaq.qa.test" },
      tenant: { dataClassification: "QA", isActive: true },
    },
  })
  await db.store.findFirstOrThrow({
    where: { id: storeId, tenantId: scope.tenantId, status: "ACTIVE" },
  })
  const nonce = randomUUID(),
    email = `staff-command.${nonce}@ishaq.qa.test`
  const config = {
    STAFF_INVITATION_ENCRYPTION_KEY_ID: "qa-ephemeral",
    STAFF_INVITATION_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    DASHBOARD_URL: "https://ewatrade-dashboard.localhost",
  }
  const facts = async () =>
    (
      await db.$queryRaw<Array<{ hash: string }>>`SELECT md5(jsonb_build_object(
    'tenant',(SELECT to_jsonb(t) FROM "Tenant" t WHERE t.id=${scope.tenantId}),
    'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM "Membership" m WHERE m."tenantId"=${scope.tenantId}),
    'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "RetailOpsStaffProfile" p WHERE p."tenantId"=${scope.tenantId}),
    'assignments',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "StaffStoreAssignment" a WHERE a."tenantId"=${scope.tenantId}),
    'invites',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM "RetailOpsStaffInviteToken" i WHERE i."tenantId"=${scope.tenantId}),
    'lifecycle',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "RetailOpsStaffLifecycleEvent" e WHERE e."tenantId"=${scope.tenantId}),
    'access',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM "StaffAccessAuditEvent" e WHERE e."tenantId"=${scope.tenantId}),
    'commands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "StaffInvitationCommand" c WHERE c."tenantId"=${scope.tenantId}),
    'notifications',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) FROM "StaffInvitationNotification" n WHERE n."tenantId"=${scope.tenantId}),
    'attempts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "StaffInvitationNotificationAttempt" a WHERE a."tenantId"=${scope.tenantId}),
    'users',(SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM "User" u WHERE u.email=${email} OR u.id IN (SELECT m."userId" FROM "Membership" m WHERE m."tenantId"=${scope.tenantId})),
    'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM "Session" s WHERE s."userId" IN (SELECT u.id FROM "User" u WHERE u.email=${email} OR u.id IN (SELECT m."userId" FROM "Membership" m WHERE m."tenantId"=${scope.tenantId}))),
    'accounts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM "Account" a WHERE a."userId" IN (SELECT u.id FROM "User" u WHERE u.email=${email} OR u.id IN (SELECT m."userId" FROM "Membership" m WHERE m."tenantId"=${scope.tenantId}))),
    'chats',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM "AssistantConversation" c WHERE c."tenantId"=${scope.tenantId}),
    'messages',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM "AssistantMessage" m WHERE m."conversationId" IN (SELECT c.id FROM "AssistantConversation" c WHERE c."tenantId"=${scope.tenantId})),
    'proposals',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "AssistantActionProposal" p WHERE p."tenantId"=${scope.tenantId}),
    'runs',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM "AssistantRun" r WHERE r."conversationId" IN (SELECT c.id FROM "AssistantConversation" c WHERE c."tenantId"=${scope.tenantId})),
    'budget',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b."scopeKey") FROM "AssistantBudget" b)
  )::text) AS hash`
    )[0]!.hash
  const before = await facts(),
    results: Array<{ case: string; elapsedMs: number }> = []
  async function rollback(
    name: string,
    run: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    const started = performance.now()
    let complete = false
    try {
      await db.$transaction(
        async (tx) => {
          await run(tx)
          complete = true
          throw new Rollback()
        },
        { maxWait: 10_000, timeout: 30_000 },
      )
    } catch (error) {
      if (!(error instanceof Rollback)) throw error
    }
    check(complete, `${name} did not reach rollback`)
    check((await facts()) === before, `${name} changed saved facts`)
    results.push({
      case: name,
      elapsedMs: Math.round(performance.now() - started),
    })
  }
  const invite = {
    email,
    name: "QA ephemeral invited staff",
    assignments: [{ storeId, role: "CASHIER" as const }],
    defaultStoreId: storeId,
    catalogEditor: false,
  }
  await rollback("canonical invite and durable replay", async (tx) => {
    const review = await reviewStaffInvitationCommandInTransaction(tx, {
      ...scope,
      kind: "INVITE",
      invite,
    })
    check(review.blockers.length === 0, "QA invitation unexpectedly blocked")
    const request = {
      ...scope,
      kind: "INVITE" as const,
      invite,
      clientCommandId: `${nonce}-invite`,
      expectedReviewHash: review.reviewHash,
    }
    const saved = await executeStaffInvitationCommandInTransaction(
        tx,
        request,
        config,
      ),
      replay = await executeStaffInvitationCommandInTransaction(tx, request, {})
    check(
      JSON.stringify(saved) === JSON.stringify(replay),
      "Durable replay changed receipt",
    )
    check(
      (await tx.staffInvitationCommand.count({
        where: {
          tenantId: scope.tenantId,
          clientCommandId: request.clientCommandId,
        },
      })) === 1,
      "Duplicate command",
    )
    check(
      (await tx.staffInvitationNotification.count({
        where: { commandId: saved.commandId, status: "PENDING" },
      })) === 1,
      "Missing atomic pending notification",
    )
    const member = await tx.membership.findUniqueOrThrow({
      where: { id: saved.membershipId },
    })
    check(
      member.status === "INVITED" && !member.acceptedAt,
      "Invitation activated staff",
    )
    const safe = await getStaffInvitationCommandInTransaction(tx, {
      ...scope,
      commandId: saved.commandId,
    })
    check(
      !JSON.stringify(safe).match(
        /acceptanceToken|tokenHash|payloadCiphertext/,
      ),
      "Public recovery leaked custody",
    )
  })
  async function seed(tx: Prisma.TransactionClient) {
    const userId = `${nonce}-user`,
      membershipId = `${nonce}-member`,
      invitationId = `${nonce}-invite`,
      notificationId = `${nonce}-notification`,
      commandId = `${nonce}-command`
    await tx.user.create({
      data: { id: userId, name: invite.name, email, emailVerified: false },
    })
    await tx.membership.create({
      data: {
        id: membershipId,
        tenantId: scope.tenantId,
        userId,
        role: "CASHIER",
        status: "INVITED",
        staffAccessMode: "SCOPED",
        staffAccessRevision: 1,
      },
    })
    await tx.retailOpsStaffProfile.create({
      data: {
        tenantId: scope.tenantId,
        userId,
        membershipId,
        displayName: invite.name,
        defaultStoreId: storeId,
        roleSnapshot: "CASHIER",
        statusSnapshot: "INVITED",
      },
    })
    await tx.staffStoreAssignment.create({
      data: {
        tenantId: scope.tenantId,
        membershipId,
        storeId,
        role: "CASHIER",
        updatedByUserId: scope.actorUserId,
      },
    })
    const token = randomBytes(32).toString("base64url"),
      now = new Date()
    await tx.retailOpsStaffInviteToken.create({
      data: {
        id: invitationId,
        tenantId: scope.tenantId,
        membershipId,
        invitedUserId: userId,
        email,
        role: "CASHIER",
        invitedByUserId: scope.actorUserId,
        tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(now.getTime() + 3600000),
      },
    })
    await tx.staffInvitationCommand.create({
      data: {
        id: commandId,
        tenantId: scope.tenantId,
        membershipId,
        invitationId,
        actorUserId: scope.actorUserId,
        kind: "INVITE",
        clientCommandId: `${nonce}-seed`,
        payloadHash: "0".repeat(64),
        result: {
          version: 1,
          commandId,
          kind: "INVITE",
          membershipId,
          invitationId,
          notificationId,
          status: "saved",
        },
      },
    })
    const payload = {
      version: 1 as const,
      appUrl: config.DASHBOARD_URL,
      inviteUrl: `${config.DASHBOARD_URL}/staff-onboarding?inviteToken=${token}`,
      businessName: "QA",
      invitedByName: "Owner",
      inviteeEmail: email,
      inviteeName: invite.name,
      membershipId,
      staffAccessRevision: 1,
      role: "CASHIER" as const,
    }
    const payloadHash = staffInvitationPayloadHash(payload),
      sealed = sealStaffInvitationPayload(
        payload,
        {
          tenantId: scope.tenantId,
          membershipId,
          invitationId,
          notificationId,
          payloadHash,
        },
        config,
      )
    await tx.staffInvitationNotification.create({
      data: {
        id: notificationId,
        tenantId: scope.tenantId,
        commandId,
        membershipId,
        invitationId,
        payloadHash,
        payloadCiphertext: sealed.envelope,
        encryptionKeyId: sealed.keyId,
      },
    })
    return { membershipId, invitationId, notificationId }
  }
  for (const kind of ["RESEND", "REVOKE"] as const)
    await rollback(`canonical ${kind.toLowerCase()} and replay`, async (tx) => {
      const original = await seed(tx),
        intent = {
          ...scope,
          kind,
          invitationId: original.invitationId,
          reason: "QA rollback lifecycle check",
        }
      const review = await reviewStaffInvitationCommandInTransaction(tx, intent)
      check(!review.blockers.length, "Lifecycle review blocked")
      const request = {
          ...intent,
          clientCommandId: `${nonce}-${kind}`,
          expectedReviewHash: review.reviewHash,
        },
        saved = await executeStaffInvitationCommandInTransaction(
          tx,
          request,
          config,
        )
      check(
        JSON.stringify(saved) ===
          JSON.stringify(
            await executeStaffInvitationCommandInTransaction(tx, request, {}),
          ),
        "Lifecycle replay duplicated",
      )
      const old = await tx.retailOpsStaffInviteToken.findUniqueOrThrow({
        where: { id: original.invitationId },
      })
      const oldWork = await tx.staffInvitationNotification.findUniqueOrThrow({
        where: { id: original.notificationId },
      })
      check(
        old.status === "REVOKED" &&
          oldWork.status === "CANCELLED" &&
          !oldWork.payloadCiphertext,
        "Old link/unsent work remains usable",
      )
      const member = await tx.membership.findUniqueOrThrow({
        where: { id: original.membershipId },
      })
      check(
        member.status === "INVITED" &&
          member.role === "CASHIER" &&
          member.staffAccessRevision === 1,
        "Lifecycle changed member grants",
      )
      if (kind === "RESEND")
        check(
          saved.invitationId !== original.invitationId &&
            saved.notificationId !== null,
          "Replacement missing",
        )
      else
        check(
          (await tx.retailOpsStaffLifecycleEvent.count({
            where: { membershipId: member.id, type: "INVITE_REVOKED" },
          })) === 1,
          "Revocation audit missing",
        )
    })
  await rollback(
    "notification claim, unknown send and late verified receipt",
    async (tx) => {
      const seeded = await seed(tx),
        identifier = {
          tenantId: scope.tenantId,
          notificationId: seeded.notificationId,
        },
        now = new Date()
      const claim = await claimStaffInvitationNotificationInTransaction(tx, {
        ...identifier,
        now,
      })
      check(claim, "Missing first claim")
      check(
        (await claimStaffInvitationNotificationInTransaction(tx, {
          ...identifier,
          now,
        })) === null,
        "Duplicate claimed",
      )
      check(
        await startStaffInvitationNotificationInTransaction(tx, {
          ...identifier,
          claimId: claim.claimId,
          expectedAccessRevision: 1,
          now,
        }),
        "Fresh send fence failed",
      )
      check(
        (await claimStaffInvitationNotificationInTransaction(tx, {
          ...identifier,
          now: new Date(now.getTime() + 301000),
        })) === null,
        "Uncertain send retried",
      )
      check(
        (
          await tx.staffInvitationNotification.findUniqueOrThrow({
            where: { id: seeded.notificationId },
          })
        ).status === "OUTCOME_UNKNOWN",
        "Unknown status missing",
      )
      const receipt = {
        ...identifier,
        claimId: claim.claimId,
        payloadHash: claim.payloadHash,
        outcome: "SENT" as const,
        providerKey: "qa-no-provider",
        providerMessageId: `${nonce}-simulated-receipt`,
        now,
      }
      check(
        await finishStaffInvitationNotificationInTransaction(tx, receipt),
        "Late receipt refused",
      )
      check(
        await recordStaffInvitationDeliveredInTransaction(tx, {
          ...identifier,
          payloadHash: claim.payloadHash,
          providerKey: receipt.providerKey,
          providerMessageId: receipt.providerMessageId,
          deliveredAt: new Date(now.getTime() + 1000),
        }),
        "Exact verified fixture receipt refused",
      )
      check(
        await finishStaffInvitationNotificationInTransaction(tx, receipt),
        "Completed replay refused",
      )
    },
  )
  return {
    verified: true,
    savedStaffAuthAndChatFactsUnchanged: true,
    providerCalls: 0,
    committedFixtures: 0,
    results,
  }
}

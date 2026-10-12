import { randomBytes } from "node:crypto"
import type { PrismaClient } from "@ewatrade/db"
import {
  claimStaffInvitationNotificationInTransaction,
  finishStaffInvitationNotificationInTransaction,
  getAccountPrivacyStaffInvitationInventory,
  startStaffInvitationNotificationInTransaction,
} from "@ewatrade/db/queries"
import { staffInvitationRollbackFacts } from "../assistant/staff-invitation-rollback-facts"
import { seedStaffInvitationRollbackFixture } from "../assistant/staff-invitation-rollback-fixture"

/** Count-only verifier: no privacy command, deletion or saved fixture is executed. */
export async function verifyStaffInvitationPrivacyInventoryRollback(
  db: PrismaClient,
  scope: { tenantId: string; actorUserId: string; storeId: string },
) {
  if (
    process.env.RUN_STAFF_INVITATION_SIGNED_ROLLBACK !== "1" ||
    process.env.APP_ENV !== "local" ||
    process.env.NODE_ENV !== "development"
  )
    throw Error("Explicit local rollback required")
  const database = await db.$queryRaw<
    Array<{ database: string }>
  >`SELECT current_database() AS database`
  if (
    database[0]?.database !== "ewatrade_qa_v1" ||
    scope.tenantId !== "cmuzedcda000hbw9kd6e50z8u" ||
    scope.actorUserId !== "cmuzedc7e000gbw9ky1dioc9f" ||
    scope.storeId !== "cmuzedcow000jbw9kluarpxfs"
  )
    throw Error("Exact owned QA required")
  const nonce = `qa-s02-privacy-${randomBytes(8).toString("hex")}`
  const email = `${nonce}@ishaq.qa.test`
  const foreign = `${nonce}-unmatched-subject`
  const before = await staffInvitationRollbackFacts(db, scope.tenantId, email)
  const actorBefore = await getAccountPrivacyStaffInvitationInventory(
    db,
    scope.actorUserId,
  )
  type Inventory = Awaited<
    ReturnType<typeof getAccountPrivacyStaffInvitationInventory>
  >
  const results: Array<{ stage: string; inventory: Inventory }> = []
  const rollback = Error("S02 privacy forced rollback")
  let verified = false
  const started = performance.now()
  try {
    await db.$transaction(
      async (tx) => {
        const seeded = await seedStaffInvitationRollbackFixture(tx, {
          ...scope,
          email,
          nonce,
        })
        const recipient = await getAccountPrivacyStaffInvitationInventory(
          tx,
          seeded.userId,
        )
        if (
          recipient.staffInvitationCommands !== 1 ||
          recipient.staffInvitationNotifications !== 1 ||
          recipient.staffInvitationEncryptedPayloads !== 1 ||
          recipient.staffInvitationQueuedNotifications !== 1 ||
          recipient.staffInvitationAttempts !== 0
        )
          throw Error("Recipient pending inventory mismatch")
        results.push({
          stage: "Recipient · queued encrypted invitation",
          inventory: recipient,
        })
        const actor = await getAccountPrivacyStaffInvitationInventory(
          tx,
          scope.actorUserId,
        )
        for (const field of [
          "staffInvitationCommands",
          "staffInvitationNotifications",
          "staffInvitationEncryptedPayloads",
          "staffInvitationQueuedNotifications",
        ] as const)
          if (actor[field] !== actorBefore[field] + 1)
            throw Error("Creator inventory omitted command")
        if (
          Object.values(
            await getAccountPrivacyStaffInvitationInventory(tx, foreign),
          ).some((count) => count !== 0)
        )
          throw Error("Foreign identity acquired invitation")
        const command = await tx.staffInvitationCommand.findUniqueOrThrow({
          where: { id: seeded.commandId },
          select: { result: true },
        })
        if (
          !command.result ||
          typeof command.result !== "object" ||
          Array.isArray(command.result)
        )
          throw Error("Fixture result unavailable")
        // Exact original recipient snapshot persists independently of later contact changes.
        await tx.staffInvitationCommand.update({
          where: { id: seeded.commandId },
          data: {
            result: {
              ...command.result,
              details: { recipient: { email: email.toUpperCase() } },
            },
          },
        })
        const candidate = await getAccountPrivacyStaffInvitationInventory(
          tx,
          foreign,
          ` ${email.toUpperCase()} `,
        )
        if (
          candidate.staffInvitationCommands !== 1 ||
          candidate.staffInvitationEncryptedPayloads !== 1
        )
          throw Error("Verified original contact candidate omitted")
        const unverified = await getAccountPrivacyStaffInvitationInventory(
          tx,
          foreign,
          null,
        )
        if (Object.values(unverified).some((count) => count !== 0))
          throw Error("Unverified contact created candidate")
        results.push({
          stage: "Verified original contact · review candidate only",
          inventory: candidate,
        })
        const identity = {
          tenantId: scope.tenantId,
          notificationId: seeded.notificationId,
        }
        const claim = await claimStaffInvitationNotificationInTransaction(
          tx,
          identity,
        )
        if (
          !claim ||
          !(await startStaffInvitationNotificationInTransaction(tx, {
            ...identity,
            claimId: claim.claimId,
            expectedAccessRevision: 1,
          }))
        )
          throw Error("Original send fence unavailable")
        const completion = {
          ...identity,
          claimId: claim.claimId,
          payloadHash: claim.payloadHash,
        }
        if (
          !(await finishStaffInvitationNotificationInTransaction(tx, {
            ...completion,
            outcome: "OUTCOME_UNKNOWN",
            failureCode: "PROVIDER_OUTCOME_UNKNOWN",
          }))
        )
          throw Error("Unknown send unavailable")
        const uncertain = await getAccountPrivacyStaffInvitationInventory(
          tx,
          seeded.userId,
        )
        if (
          uncertain.staffInvitationUncertainNotifications !== 1 ||
          uncertain.staffInvitationEncryptedPayloads !== 1 ||
          uncertain.staffInvitationAttempts !== 1 ||
          uncertain.staffInvitationQueuedNotifications !== 0
        )
          throw Error("Unknown retained custody omitted")
        results.push({
          stage: "Uncertain send · review required",
          inventory: uncertain,
        })
        if (
          !(await finishStaffInvitationNotificationInTransaction(tx, {
            ...completion,
            outcome: "SENT",
            providerKey: "resend",
            providerMessageId: `provider-free-${nonce}`,
          }))
        )
          throw Error("Simulated original receipt unavailable")
        await tx.membership.update({
          where: { id: seeded.membershipId },
          data: { status: "REMOVED" },
        })
        await tx.retailOpsStaffInviteToken.update({
          where: { id: seeded.invitationId },
          data: { status: "REVOKED", revokedAt: new Date() },
        })
        const history = await getAccountPrivacyStaffInvitationInventory(
          tx,
          seeded.userId,
        )
        if (
          history.staffInvitationCommands !== 1 ||
          history.staffInvitationNotifications !== 1 ||
          history.staffInvitationAttempts !== 1 ||
          history.staffInvitationProviderIdentifiers !== 1 ||
          history.staffInvitationEncryptedPayloads !== 0 ||
          history.staffInvitationUncertainNotifications !== 0 ||
          history.staffInvitationQueuedNotifications !== 0
        )
          throw Error("Removed/revoked retained history omitted")
        results.push({
          stage: "Removed member · revoked link · retained history",
          inventory: history,
        })
        const factsBefore = await staffInvitationRollbackFacts(
          tx,
          scope.tenantId,
          email,
        )
        await getAccountPrivacyStaffInvitationInventory(
          tx,
          seeded.userId,
          email,
        )
        if (
          (await staffInvitationRollbackFacts(tx, scope.tenantId, email)) !==
          factsBefore
        )
          throw Error("Inventory read changed facts")
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
  return {
    verified: true,
    results,
    elapsedMs: performance.now() - started,
    savedStaffAuthChatBudgetFactsUnchanged: true,
    providerCalls: 0,
    privacyCommands: 0,
  }
}

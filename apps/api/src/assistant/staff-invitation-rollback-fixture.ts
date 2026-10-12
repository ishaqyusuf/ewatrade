import { createHash, randomBytes } from "node:crypto"
import type { Prisma } from "@ewatrade/db"
import {
  sealStaffInvitationPayload,
  staffInvitationPayloadHash,
} from "@ewatrade/db/staff-invitation-custody"

/** Only called inside the exact QA verifier's forced rollback transaction. */
export async function seedStaffInvitationRollbackFixture(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string
    actorUserId: string
    storeId: string
    email: string
    nonce: string
  },
) {
  if (
    process.env.RUN_STAFF_INVITATION_SIGNED_ROLLBACK !== "1" ||
    process.env.APP_ENV !== "local" ||
    process.env.NODE_ENV !== "development"
  )
    throw Error("Explicit local staff invitation rollback required.")
  const { tenantId, actorUserId, storeId, email, nonce } = input
  const userId = `${nonce}-user`
  const membershipId = `${nonce}-member`
  const invitationId = `${nonce}-invite`
  const commandId = `${nonce}-command`
  const notificationId = `${nonce}-notification`
  const token = randomBytes(32).toString("base64url")
  const payload = {
    version: 1 as const,
    appUrl: "https://ewatrade-dashboard.localhost",
    inviteUrl: `https://ewatrade-dashboard.localhost/staff-onboarding?inviteToken=${token}`,
    businessName: "Owned QA rollback business",
    invitedByName: "Owner",
    inviteeEmail: email,
    inviteeName: "QA signed lifecycle",
    membershipId,
    staffAccessRevision: 1,
    role: "CASHIER" as const,
  }
  const payloadHash = staffInvitationPayloadHash(payload)
  const sealed = sealStaffInvitationPayload(payload, {
    tenantId,
    membershipId,
    invitationId,
    notificationId,
    payloadHash,
  })
  const result = JSON.stringify({
    version: 1,
    commandId,
    kind: "INVITE",
    membershipId,
    invitationId,
    notificationId,
    status: "saved",
  })
  // One parameterized statement, without credentials/ACTIVE membership or root/nested calls.
  const inserted = await tx.$executeRaw`WITH u AS (
    INSERT INTO "User" (id,name,email,"emailVerified","updatedAt")
    SELECT ${userId},${payload.inviteeName},${email},false,CURRENT_TIMESTAMP
    WHERE current_database()='ewatrade_qa_v1' AND ${tenantId}='cmuzedcda000hbw9kd6e50z8u' AND ${storeId}='cmuzedcow000jbw9kluarpxfs' AND ${actorUserId}='cmuzedc7e000gbw9ky1dioc9f'
      AND EXISTS (SELECT 1 FROM "Tenant" t JOIN "Membership" actor ON actor."tenantId"=t.id JOIN "User" owner ON owner.id=actor."userId" JOIN "Store" s ON s."tenantId"=t.id
        WHERE t.id=${tenantId} AND t."dataClassification"='QA' AND t."isActive"=true AND actor."userId"=${actorUserId} AND actor.role='OWNER' AND actor.status='ACTIVE' AND owner.email='video.20261008-video-v1.web.bakery@ishaq.qa.test' AND s.id=${storeId} AND s.status='ACTIVE') RETURNING id
  ), m AS (
    INSERT INTO "Membership" (id,"tenantId","userId",role,status,"staffAccessMode","staffAccessRevision","updatedAt")
    SELECT ${membershipId},${tenantId},u.id,'CASHIER'::"MembershipRole",'INVITED'::"MembershipStatus",'SCOPED'::"StaffAccessMode",1,CURRENT_TIMESTAMP FROM u RETURNING id,"userId"
  ), p AS (
    INSERT INTO "RetailOpsStaffProfile" (id,"tenantId","userId","membershipId","defaultStoreId","displayName","roleSnapshot","statusSnapshot","updatedAt")
    SELECT ${`${nonce}-profile`},${tenantId},m."userId",m.id,${storeId},${payload.inviteeName},'CASHIER'::"MembershipRole",'INVITED'::"MembershipStatus",CURRENT_TIMESTAMP FROM m RETURNING id
  ), a AS (
    INSERT INTO "StaffStoreAssignment" (id,"tenantId","membershipId","storeId",role,"updatedByUserId","updatedAt")
    SELECT ${`${nonce}-assignment`},${tenantId},m.id,${storeId},'CASHIER'::"StoreStaffRole",${actorUserId},CURRENT_TIMESTAMP FROM m RETURNING id
  ), i AS (
    INSERT INTO "RetailOpsStaffInviteToken" (id,"tenantId","membershipId","invitedUserId",email,role,"invitedByUserId","tokenHash","expiresAt","updatedAt")
    SELECT ${invitationId},${tenantId},m.id,m."userId",${email},'CASHIER'::"MembershipRole",${actorUserId},${createHash("sha256").update(token).digest("hex")},${new Date(Date.now() + 3_600_000)},CURRENT_TIMESTAMP FROM m RETURNING id,"membershipId"
  ), c AS (
    INSERT INTO "StaffInvitationCommand" (id,"tenantId","clientCommandId",kind,"payloadHash","actorUserId","membershipId","invitationId",result)
    SELECT ${commandId},${tenantId},${`${nonce}-seed`},'INVITE'::"StaffInvitationCommandKind",${"0".repeat(64)},${actorUserId},i."membershipId",i.id,${result}::jsonb FROM i RETURNING id,"membershipId","invitationId"
  ) INSERT INTO "StaffInvitationNotification" (id,"tenantId","commandId","membershipId","invitationId","payloadHash","payloadCiphertext","encryptionKeyId","updatedAt")
    SELECT ${notificationId},${tenantId},c.id,c."membershipId",c."invitationId",${payloadHash},${sealed.envelope},${sealed.keyId},CURRENT_TIMESTAMP FROM c`
  if (inserted !== 1) throw Error("Exact owned QA rollback fixture required.")
  return { userId, membershipId, invitationId, commandId, notificationId }
}

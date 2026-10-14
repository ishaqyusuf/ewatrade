import type { Prisma } from "../../../generated/prisma/client"

export type BusinessActivityPrivacyInventory = {
  recordedActorLinks: number
  recordedSubjectLinks: number
  policyAuthorLinks: number
  subscriptionAuthorLinks: number
  personalSubscriptions: number
  personalPreferences: number
  personalReceipts: number
}

/**
 * Internal privacy-processing inventory. Caller must already own and authorize
 * the deletion request; no public Activity procedure exposes this global scan.
 * Non-cascading attribution is counted independently of Membership existence.
 */
export async function getBusinessActivityPrivacyInventory(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  subjectUserId: string,
): Promise<BusinessActivityPrivacyInventory> {
  const rows = await tx.$queryRaw<
    Array<{
      recordedActorLinks: bigint
      recordedSubjectLinks: bigint
      policyAuthorLinks: bigint
      subscriptionAuthorLinks: bigint
      personalSubscriptions: bigint
      personalPreferences: bigint
      personalReceipts: bigint
    }>
  >`
    SELECT
      (SELECT count(*) FROM "BusinessActivityEvent" WHERE "actorUserId"=${subjectUserId}) AS "recordedActorLinks",
      (SELECT count(*) FROM "BusinessActivityEvent" WHERE "subjectUserId"=${subjectUserId}) AS "recordedSubjectLinks",
      (SELECT count(*) FROM "BusinessNotificationPolicy" WHERE "updatedByUserId"=${subjectUserId}) AS "policyAuthorLinks",
      (SELECT count(*) FROM "BusinessNotificationSubscription" WHERE "updatedByUserId"=${subjectUserId}) AS "subscriptionAuthorLinks",
      (SELECT count(*) FROM "BusinessNotificationSubscription" p JOIN "Membership" m ON m.id=p."membershipId" AND m."tenantId"=p."tenantId" WHERE m."userId"=${subjectUserId}) AS "personalSubscriptions",
      (SELECT count(*) FROM "BusinessNotificationPreference" p JOIN "Membership" m ON m.id=p."membershipId" AND m."tenantId"=p."tenantId" WHERE m."userId"=${subjectUserId}) AS "personalPreferences",
      (SELECT count(*) FROM "BusinessNotificationReceipt" p JOIN "Membership" m ON m.id=p."membershipId" AND m."tenantId"=p."tenantId" WHERE m."userId"=${subjectUserId}) AS "personalReceipts"`
  const row = rows[0]
  if (!row) throw Error("Business Activity privacy inventory unavailable")
  return {
    recordedActorLinks: Number(row.recordedActorLinks),
    recordedSubjectLinks: Number(row.recordedSubjectLinks),
    policyAuthorLinks: Number(row.policyAuthorLinks),
    subscriptionAuthorLinks: Number(row.subscriptionAuthorLinks),
    personalSubscriptions: Number(row.personalSubscriptions),
    personalPreferences: Number(row.personalPreferences),
    personalReceipts: Number(row.personalReceipts),
  }
}

export function businessActivityPrivacyNeedsDisposition(
  inventory: BusinessActivityPrivacyInventory,
) {
  return Object.values(inventory).some((count) => count > 0)
}

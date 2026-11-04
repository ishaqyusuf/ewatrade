import { managedQaIdentity } from "@ewatrade/utils/qa-policy-server"
import type { DbClient } from "./types"

/** The phone counterpart of assertQaTenantIdentity: QA and live numbers never mix. */
export async function assertQaTenantPhoneIdentity(
  db: DbClient,
  input: { phone: string; tenantId: string },
) {
  const tenant = await db.tenant.findUnique({
    where: { id: input.tenantId },
    select: { dataClassification: true, qaSourceDomain: true },
  })
  if (!tenant) throw new Error("Tenant not found.")
  const entry = await managedQaIdentity({ phone: input.phone })
  if (tenant.dataClassification === "QA" && entry?.qa !== tenant.qaSourceDomain)
    throw new Error("Normal identities cannot join a QA tenant.")
  if (tenant.dataClassification === "LIVE" && entry)
    throw new Error("QA identities cannot join a live tenant.")
}

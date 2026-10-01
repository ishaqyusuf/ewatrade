import { getAccountLegalStatus } from "@ewatrade/db/queries"
import { currentEffectiveLegalPublication } from "@ewatrade/utils/legal-approval"

type LegalDb = Parameters<typeof getAccountLegalStatus>[0]
type EffectivePublication = Parameters<typeof getAccountLegalStatus>[2]

export async function getStoreCheckoutLegalGate(
  db: LegalDb,
  userId: string,
  checkoutConfigured: boolean,
  publication: EffectivePublication = currentEffectiveLegalPublication(),
) {
  if (!checkoutConfigured)
    return { purchaseAvailable: false, legalAcceptanceRequired: false }

  const legalStatus = await getAccountLegalStatus(db, userId, publication)
  return {
    purchaseAvailable: legalStatus.accepted,
    legalAcceptanceRequired: legalStatus.effective && !legalStatus.accepted,
  }
}

import { accountPrivacyOutcome } from "../src/preview-fixtures"
import AccountPrivacyOutcomeEmail from "../templates/account-privacy-outcome"

export default function Preview() {
  return <AccountPrivacyOutcomeEmail input={accountPrivacyOutcome} />
}

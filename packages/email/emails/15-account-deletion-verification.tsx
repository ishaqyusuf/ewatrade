import { accountDeletionVerification } from "../src/preview-fixtures"
import AccountDeletionVerificationEmail from "../templates/account-deletion-verification"

export default function Preview() {
  return (
    <AccountDeletionVerificationEmail input={accountDeletionVerification} />
  )
}

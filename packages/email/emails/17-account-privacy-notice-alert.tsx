import { accountPrivacyNoticeAlert } from "../src/preview-fixtures"
import AccountPrivacyNoticeAlertEmail from "../templates/account-privacy-notice-alert"

export default function Preview() {
  return <AccountPrivacyNoticeAlertEmail input={accountPrivacyNoticeAlert} />
}

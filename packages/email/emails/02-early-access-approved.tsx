import { earlyAccessLead } from "../src/preview-fixtures"
import { MarketingEarlyAccessConfirmationEmail } from "../templates/marketing-early-access-confirmation"

export default function Preview() {
  return <MarketingEarlyAccessConfirmationEmail input={earlyAccessLead} />
}

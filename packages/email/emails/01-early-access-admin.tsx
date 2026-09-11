import { earlyAccessLead } from "../src/preview-fixtures"
import { MarketingEarlyAccessAdminEmail } from "../templates/marketing-early-access-admin"

export default function Preview() {
  return <MarketingEarlyAccessAdminEmail input={earlyAccessLead} />
}

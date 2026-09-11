import { waitlistLead } from "../src/preview-fixtures"
import { MarketingWaitlistAdminEmail } from "../templates/marketing-waitlist-admin"

export default function Preview() {
  return <MarketingWaitlistAdminEmail input={waitlistLead} />
}

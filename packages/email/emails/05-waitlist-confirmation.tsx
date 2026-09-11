import { waitlistLead } from "../src/preview-fixtures"
import { MarketingWaitlistConfirmationEmail } from "../templates/marketing-waitlist-confirmation"

export default function Preview() {
  return <MarketingWaitlistConfirmationEmail input={waitlistLead} />
}

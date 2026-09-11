import { staffInvite } from "../src/preview-fixtures"
import { RetailOpsStaffInviteEmail } from "../templates/retail-ops-staff-invite"

export default function Preview() {
  return <RetailOpsStaffInviteEmail input={staffInvite} />
}

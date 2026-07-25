export function defaultMarketingEarlyAccessAdminSubject() {
  return "New early access request for ewatrade"
}

export function defaultMarketingEarlyAccessConfirmationSubject() {
  return "We received your early access request"
}

export function defaultMarketingWaitlistAdminSubject() {
  return "New ewatrade waitlist signup"
}

export function defaultMarketingWaitlistConfirmationSubject() {
  return "You are on the ewatrade waitlist"
}

export function defaultRetailOpsStaffInviteSubject(input: {
  businessName: string
}) {
  return `You have been invited to ${input.businessName} on ewatrade`
}

export function defaultCommercialOrderFulfillmentReminderSubject(input: {
  orderNumber: string
  timing: "day_before" | "same_day"
}) {
  return input.timing === "same_day"
    ? `Order ${input.orderNumber} is due today`
    : `Order ${input.orderNumber} is due tomorrow`
}

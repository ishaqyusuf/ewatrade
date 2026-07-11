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

export function defaultRetailOpsSharedLinkOrderCustomerSubject(input: {
  orderNumber: string
}) {
  return `We received your order request ${input.orderNumber}`
}

export function defaultRetailOpsSharedLinkOrderMerchantSubject(input: {
  orderNumber: string
}) {
  return `New product-link order request ${input.orderNumber}`
}

export function defaultRetailOpsStaffInviteSubject(input: {
  businessName: string
}) {
  return `You have been invited to ${input.businessName} on ewatrade`
}

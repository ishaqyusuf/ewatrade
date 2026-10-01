export function canLoadCustomerAttachmentCapability(input: {
  accountAccess: boolean
  composerEnabled: boolean
  conversationId: string | null
  postingTermsAccepted: boolean
  publicToken: string | null
  targetSelected: boolean
}) {
  return Boolean(
    !input.accountAccess &&
      input.postingTermsAccepted &&
      input.conversationId &&
      input.publicToken &&
      input.targetSelected &&
      input.composerEnabled,
  )
}

export function canUseCustomerAttachmentCapability(input: {
  available: boolean
  postingTermsAccepted: boolean
}) {
  return input.postingTermsAccepted && input.available
}

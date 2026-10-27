/** In-memory privacy verifier rows only; never exported in the query barrel. */
export function staffInvitationPrivacyInventoryFixture(field?: string) {
  const counts = {
    manualPaymentLinks: 0,
    manualPaymentReviews: 0,
    manualPaymentReceiptAssets: 0,
    manualPaymentAlertSettings: 0,
    manualPaymentAlertIntents: 0,
    manualPaymentAlertNoticeReads: 0,
    assistantWhatsAppIdentities: 0,
    assistantWhatsAppLinks: 0,
    assistantWhatsAppGrants: 0,
    assistantWhatsAppBindings: 0,
    assistantWhatsAppInbox: 0,
    assistantWhatsAppOutbox: 0,
    assistantWhatsAppAttempts: 0,
    assistantWhatsAppReceipts: 0,
    assistantWhatsAppUsageBuckets: 0,
    assistantWhatsAppSelections: 0,
    assistantWhatsAppActionReviews: 0,
    assistantWhatsAppWorkflowReviews: 0,
    customerMessageTemplates: 0,
    staffInvitationCommands: 0,
    staffInvitationNotifications: 0,
    staffInvitationAttempts: 0,
    staffInvitationEncryptedPayloads: 0,
    staffInvitationQueuedNotifications: 0,
    staffInvitationUncertainNotifications: 0,
    staffInvitationProviderIdentifiers: 0,
  }
  if (field && Object.hasOwn(counts, field)) Reflect.set(counts, field, 1)
  return counts
}

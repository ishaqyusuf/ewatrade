/** In-memory privacy verifier rows only; never exported in the query barrel. */
export function staffInvitationPrivacyInventoryFixture(field?: string) {
  const counts = {
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

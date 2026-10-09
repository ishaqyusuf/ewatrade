import type { PrismaClient } from "../../generated/prisma/client"

type ConversationInventoryClient = Pick<
  PrismaClient,
  | "assistantActionProposal"
  | "storeConversationAccountLinkCommand"
  | "storeConversationAccountDeviceCommand"
  | "storeConversationAccountAuditEvent"
  | "storeConversationActionMessage"
  | "storeConversationAccountWatermark"
  | "storeConversationAccountNotificationPreference"
  | "storeConversationNotificationCommand"
  | "storeConversationNotificationIntent"
  | "storeConversationNotificationAuditEvent"
  | "storeConversationWhatsAppBridgeAuditEvent"
  | "storeConversationModerationCommand"
  | "storeConversationModerationAuditEvent"
  | "storeConversationSensitiveReadAuditEvent"
  | "storeConversationAvailabilityConfiguration"
  | "storeConversationAvailabilityAuditEvent"
  | "storeConversationChannelConfiguration"
  | "storeConversationChannelConfigurationAuditEvent"
  | "storeConversationPushEndpoint"
>

/** Counts direct User attribution only; no message, contact or device payload is read. */
export async function getAccountPrivacyConversationInventory(
  db: ConversationInventoryClient,
  verifiedSubjectUserId: string,
) {
  // Keep reads sequential for use inside the final serializable transaction.
  const assistantProposals = await db.assistantActionProposal.count({
    where: { actorUserId: verifiedSubjectUserId },
  })
  const linkCommands = await db.storeConversationAccountLinkCommand.count({
    where: { accountUserId: verifiedSubjectUserId },
  })
  const deviceCommands = await db.storeConversationAccountDeviceCommand.count({
    where: { accountUserId: verifiedSubjectUserId },
  })
  const accountAuditEvents = await db.storeConversationAccountAuditEvent.count({
    where: { actorAccountUserId: verifiedSubjectUserId },
  })
  const actionMessages = await db.storeConversationActionMessage.count({
    where: { createdByUserId: verifiedSubjectUserId },
  })
  const accountWatermarks = await db.storeConversationAccountWatermark.count({
    where: { accountUserId: verifiedSubjectUserId },
  })
  const notificationPreferences =
    await db.storeConversationAccountNotificationPreference.count({
      where: { accountUserId: verifiedSubjectUserId },
    })
  const notificationCommands =
    await db.storeConversationNotificationCommand.count({
      where: { accountUserId: verifiedSubjectUserId },
    })
  const notificationIntents =
    await db.storeConversationNotificationIntent.count({
      where: { accountUserId: verifiedSubjectUserId },
    })
  const notificationAuditEvents =
    await db.storeConversationNotificationAuditEvent.count({
      where: { actorAccountUserId: verifiedSubjectUserId },
    })
  const whatsAppBridgeAuditEvents =
    await db.storeConversationWhatsAppBridgeAuditEvent.count({
      where: { accountUserId: verifiedSubjectUserId },
    })
  const moderationCommands = await db.storeConversationModerationCommand.count({
    where: { actorUserId: verifiedSubjectUserId },
  })
  const moderationAuditEvents =
    await db.storeConversationModerationAuditEvent.count({
      where: { actorUserId: verifiedSubjectUserId },
    })
  const sensitiveReadAuditEvents =
    await db.storeConversationSensitiveReadAuditEvent.count({
      where: { actorUserId: verifiedSubjectUserId },
    })
  const availabilityConfigurations =
    await db.storeConversationAvailabilityConfiguration.count({
      where: {
        OR: [
          { pausedByUserId: verifiedSubjectUserId },
          { resumedByUserId: verifiedSubjectUserId },
        ],
      },
    })
  const availabilityAuditEvents =
    await db.storeConversationAvailabilityAuditEvent.count({
      where: { actorUserId: verifiedSubjectUserId },
    })
  const channelConfigurations =
    await db.storeConversationChannelConfiguration.count({
      where: { updatedByUserId: verifiedSubjectUserId },
    })
  const channelConfigurationAuditEvents =
    await db.storeConversationChannelConfigurationAuditEvent.count({
      where: { actorUserId: verifiedSubjectUserId },
    })
  const pushEndpoints = await db.storeConversationPushEndpoint.count({
    where: { accountUserId: verifiedSubjectUserId },
  })
  return {
    assistantProposals,
    linkCommands,
    deviceCommands,
    accountAuditEvents,
    actionMessages,
    accountWatermarks,
    notificationPreferences,
    notificationCommands,
    notificationIntents,
    notificationAuditEvents,
    whatsAppBridgeAuditEvents,
    moderationCommands,
    moderationAuditEvents,
    sensitiveReadAuditEvents,
    availabilityConfigurations,
    availabilityAuditEvents,
    channelConfigurations,
    channelConfigurationAuditEvents,
    pushEndpoints,
  }
}

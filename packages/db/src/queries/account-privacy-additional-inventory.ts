import type { PrismaClient } from "../../generated/prisma/client"
import { getAccountPrivacyStaffInvitationInventory } from "./account-privacy-staff-invitation-inventory"
import { assistantWhatsAppPrivacyInventory } from "./assistant-whatsapp/privacy"
import { customerMessageTemplatePrivacyInventory } from "./customer-messages/privacy"
import { manualPaymentPrivacyInventory } from "./manual-payment-privacy"

export type AccountPrivacyAdditionalInventoryClient = Pick<
  PrismaClient,
  | "assistantConversation"
  | "assistantRun"
  | "assistantAttachment"
  | "assistantUsageEvent"
  | "message"
  | "automationEvent"
  | "productAnalyticsEvent"
  | "retailOpsStaffProfile"
  | "$queryRaw"
>

/** Unhandled direct attribution must not disappear behind an older domain ledger. */
export async function getAccountPrivacyAdditionalInventory(
  db: AccountPrivacyAdditionalInventoryClient,
  subjectId: string,
  verifiedContactEmail?: string | null,
) {
  // Sequential for the bounded single-connection processing transaction.
  const assistantConversations = await db.assistantConversation.count({
    where: { ownerUserId: subjectId },
  })
  const assistantRuns = await db.assistantRun.count({
    where: { actorUserId: subjectId },
  })
  // Attachment/usage rows can retain an actor without a linked run.
  const assistantAttachments = await db.assistantAttachment.count({
    where: { actorUserId: subjectId },
  })
  const assistantUsageEvents = await db.assistantUsageEvent.count({
    where: { actorUserId: subjectId },
  })
  const legacyMessages = await db.message.count({
    where: { senderUserId: subjectId },
  })
  const automationEvents = await db.automationEvent.count({
    where: { actorUserId: subjectId },
  })
  const analyticsEvents = await db.productAnalyticsEvent.count({
    where: { userId: subjectId },
  })
  // Removed staff access is not erasure of its optional directory/profile fields.
  // Staff records require a separate controller disposition; ordinary-chat clocks do not apply.
  const staffProfiles = await db.retailOpsStaffProfile.count({
    where: { userId: subjectId },
  })
  const staffInvitations = await getAccountPrivacyStaffInvitationInventory(
    db,
    subjectId,
    verifiedContactEmail,
  )
  const customerMessages = await customerMessageTemplatePrivacyInventory(
    db,
    subjectId,
  )
  const assistantWhatsApp = await assistantWhatsAppPrivacyInventory(
    db,
    subjectId,
  )
  const manualPayments = await manualPaymentPrivacyInventory(db, subjectId)
  return {
    assistantConversations,
    assistantRuns,
    assistantAttachments,
    assistantUsageEvents,
    legacyMessages,
    automationEvents,
    analyticsEvents,
    staffProfiles,
    ...staffInvitations,
    ...customerMessages,
    ...assistantWhatsApp,
    ...manualPayments,
  }
}

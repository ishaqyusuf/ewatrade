import {
  WhatsAppProviderSendError,
  createStaffInviteWhatsAppSender,
  readStaffInviteWhatsAppConfig,
} from "@ewatrade/communications"
import type { PrismaClient } from "@ewatrade/db"
import {
  type InvitedRetailOpsStaff,
  type StaffInviteWhatsAppStatus,
  isLocalPhoneAuth,
  recordStaffInviteWhatsAppDelivery,
} from "@ewatrade/db/queries"
import { buildStaffInvitationLinks } from "@ewatrade/utils/staff-invitation-links"

type Environment = Record<string, string | undefined>
type Sender = ReturnType<typeof createStaffInviteWhatsAppSender>

function roleLabel(role: string) {
  return role.toUpperCase() === "MANAGER" ? "manager" : "sales rep"
}

function maskPhone(phone: string) {
  return `${phone.slice(0, 4)}•••${phone.slice(-4)}`
}

/**
 * Sends the invite's WhatsApp message inline, once, after the invite
 * committed: no background run per invite. The outcome is kept on the open
 * invite for the owner; a failure never fails the invite itself.
 */
export async function sendStaffInviteWhatsApp(input: {
  db: Pick<PrismaClient, "retailOpsStaffInviteToken">
  businessName: string
  invitedStaff: InvitedRetailOpsStaff
  env?: Environment
  sender?: Sender
}): Promise<StaffInviteWhatsAppStatus | null> {
  const env = input.env ?? process.env
  const { invitedStaff } = input
  const phone = invitedStaff.contacts.phone
  const token = invitedStaff.invite.acceptanceToken
  if (!phone || !token || !invitedStaff.notification.shouldSend) return null

  let status: StaffInviteWhatsAppStatus
  let providerMessageId: string | null = null
  if (isLocalPhoneAuth(env)) {
    // Local profile never calls Meta; the link is printed so QA can open it.
    const { inviteUrl } = buildStaffInvitationLinks(env, token)
    console.info(
      `[staff] WhatsApp invite not sent (local) to ${maskPhone(phone)}: ${inviteUrl}`,
    )
    status = "LOCAL_ONLY"
  } else {
    let send = input.sender
    if (!send) {
      try {
        const config = readStaffInviteWhatsAppConfig(env)
        send = config ? createStaffInviteWhatsAppSender(config) : undefined
      } catch {
        console.error(
          "[staff] WhatsApp invite template configuration is invalid",
        )
      }
    }
    if (!send) status = "NOT_CONFIGURED"
    else {
      try {
        const result = await send({
          businessName: input.businessName,
          inviteToken: token,
          phone,
          roleLabel: roleLabel(invitedStaff.invite.role),
        })
        status = "SENT"
        providerMessageId = result.messageId
      } catch (error) {
        status =
          error instanceof WhatsAppProviderSendError &&
          error.outcome === "DEFINITE_FAILURE"
            ? "FAILED"
            : "UNCONFIRMED"
        console.error(`[staff] WhatsApp invite ${status.toLowerCase()}`)
      }
    }
  }

  try {
    await recordStaffInviteWhatsAppDelivery(input.db, {
      tenantId: invitedStaff.tenantId,
      membershipId: invitedStaff.invite.id,
      status,
      providerMessageId,
    })
  } catch {
    console.error("[staff] WhatsApp invite outcome could not be saved")
  }
  return status
}

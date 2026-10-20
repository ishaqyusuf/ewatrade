import { createHash } from "node:crypto"
import { assertStaffInvitationCustodyConfigured } from "@ewatrade/db/staff-invitation-custody"
import {
  type EmailMessage,
  type EmailTransport,
  createManagedQaEmailMessages,
  getTestEmailRouting,
  isValidEmailSender,
} from "@ewatrade/email"
import { getQaPolicyEnvironment } from "@ewatrade/utils/qa-policy-server"
import type { StaffInvitationDispatchDependencies } from "./staff-invitation-notification-dispatch"

/** Invitations are emailed whenever live email is set up. */
export function staffInvitationEmailConfigured(config: NodeJS.ProcessEnv) {
  return (
    config.EMAIL_DELIVERY_MODE?.trim().toLowerCase() === "live" &&
    Boolean(config.RESEND_API_KEY?.trim()) &&
    !config.EMAIL_CAPTURE_FILE?.trim() &&
    isValidEmailSender(config.EMAIL_FROM)
  )
}

export function staffInvitationDeliveryConfigured(config: NodeJS.ProcessEnv) {
  if (!staffInvitationEmailConfigured(config)) return false
  try {
    assertStaffInvitationCustodyConfigured(config)
    return true
  } catch {
    return false
  }
}

/** Explicit live transport only: never capture or log acceptance links. */
export function createStaffInvitationEmailAdapter(
  config: NodeJS.ProcessEnv,
  transport: EmailTransport,
  assertProviderAllowed: (input: {
    operation: "email"
    qaEmailRouted: boolean
    tenantId: string
  }) => Promise<unknown>,
): Pick<StaffInvitationDispatchDependencies, "assertProviderAllowed" | "send"> {
  function assertConfigured() {
    if (!staffInvitationEmailConfigured(config))
      throw Error("Staff invitation live email is not configured.")
  }

  return {
    async assertProviderAllowed({ tenantId, recipient }) {
      assertConfigured()
      const routing = getTestEmailRouting({
        to: recipient,
        env: await getQaPolicyEnvironment({ ...process.env, ...config }),
      })
      if (routing.recipients.length !== 1)
        throw Error("Staff invitation email requires one delivery destination.")
      await assertProviderAllowed({
        operation: "email",
        qaEmailRouted: routing.routed,
        tenantId,
      })
    },
    async send(message: EmailMessage) {
      assertConfigured()
      const messages = await createManagedQaEmailMessages(message, {
        env: config,
      })
      if (messages.length !== 1 || !message.idempotencyKey)
        throw Error("Staff invitation email delivery identity is unavailable.")
      const routed = messages[0]
      if (!routed)
        throw Error("Staff invitation delivery destination is missing.")
      const receipt = await transport.send({
        ...routed,
        tags: [
          ...(routed.tags ?? []).filter(
            (tag) => tag.name !== "destination_digest",
          ),
          {
            name: "destination_digest",
            value: createHash("sha256")
              .update(routed.to.trim().toLowerCase())
              .digest("hex"),
          },
        ],
      })
      if (receipt?.provider !== "resend" || !receipt.providerMessageId?.trim())
        throw Error("Staff invitation provider acceptance is unconfirmed.")
      return {
        providerKey: "resend",
        providerMessageId: receipt.providerMessageId,
      }
    },
  }
}

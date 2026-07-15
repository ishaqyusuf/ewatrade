import {
  type NotificationContact,
  createEmailNotificationContact,
} from "./contacts"
import { planNotificationDeliveries } from "./delivery"
import {
  createNotificationDispatchFromType,
  ewatradeNotificationTypes,
} from "./notification-types"
import type {
  MarketingEarlyAccessRequestedPayload,
  MarketingWaitlistJoinedPayload,
  NotificationDispatch,
  NotificationInput,
  RetailOpsSharedLinkOrderRequestedPayload,
  RetailOpsStaffInvitedPayload,
} from "./types"

export * from "./contacts"
export * from "./core-types"
export * from "./delivery"
export * from "./memory-store"
export * from "./notification-types"
export * from "./payload-utils/index"
export * from "./services/triggers"
export * from "./store"
export * from "./types"

function parseRecipientList(value: string | undefined) {
  if (!value) {
    return []
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

export function getMarketingNotificationInboxRecipients() {
  const configured = parseRecipientList(process.env.MARKETING_INBOX_EMAILS)

  if (configured.length > 0) {
    return configured.map<NotificationContact>((email) => ({
      deliveryRole: "admin",
      displayName: "ewatrade Team",
      email,
      kind: "email",
    }))
  }

  if (!process.env.EMAIL_REPLY_TO) {
    return [] satisfies NotificationContact[]
  }

  return [
    {
      deliveryRole: "admin",
      displayName: "ewatrade Team",
      email: process.env.EMAIL_REPLY_TO,
      kind: "email",
    },
  ] satisfies NotificationContact[]
}

export function getMarketingLeadRecipients(input: {
  email: string
  fullName: string
}) {
  return [
    ...getMarketingNotificationInboxRecipients(),
    createEmailNotificationContact({
      deliveryRole: "customer",
      displayName: input.fullName,
      email: input.email,
    }),
  ]
}

export function createMarketingLeadSubmittedNotification(input: {
  type: "EARLY_ACCESS" | "WAITLIST"
}) {
  return {
    channels: ["in_app"],
    description:
      input.type === "EARLY_ACCESS"
        ? "Your request is in. We will reach out when the next onboarding cohort opens."
        : "You are on the waitlist. We will notify you as ewatrade opens wider access.",
    notificationType:
      input.type === "EARLY_ACCESS"
        ? "marketing.early_access.submitted"
        : "marketing.waitlist.submitted",
    title:
      input.type === "EARLY_ACCESS"
        ? "Early access requested"
        : "Waitlist joined",
    variant: "success",
  } satisfies NotificationInput
}

export function createMarketingLeadSubmissionFailedNotification(input: {
  type: "EARLY_ACCESS" | "WAITLIST"
}) {
  return {
    channels: ["in_app"],
    description:
      input.type === "EARLY_ACCESS"
        ? "We could not save your early access request right now. Please try again."
        : "We could not add you to the waitlist right now. Please try again.",
    notificationType:
      input.type === "EARLY_ACCESS"
        ? "marketing.early_access.failed"
        : "marketing.waitlist.failed",
    title: "Submission failed",
    variant: "error",
  } satisfies NotificationInput
}

export function createMarketingEarlyAccessDispatch(
  payload: MarketingEarlyAccessRequestedPayload,
) {
  return createNotificationDispatchFromType(
    ewatradeNotificationTypes,
    "marketing_early_access_requested",
    payload,
    {
      recipients: getMarketingLeadRecipients({
        email: payload.email,
        fullName: payload.fullName,
      }),
    },
  )
}

export function createMarketingWaitlistDispatch(
  payload: MarketingWaitlistJoinedPayload,
) {
  return createNotificationDispatchFromType(
    ewatradeNotificationTypes,
    "marketing_waitlist_joined",
    payload,
    {
      recipients: getMarketingLeadRecipients({
        email: payload.email,
        fullName: payload.fullName,
      }),
    },
  )
}

function uniqueEmailRecipients(
  recipients: Array<{
    deliveryRole: "admin" | "customer"
    displayName?: string | null
    email: string
  }>,
) {
  const seen = new Set<string>()

  return recipients.flatMap<NotificationContact>((recipient) => {
    const key = `${recipient.deliveryRole}:${recipient.email.toLowerCase()}`

    if (seen.has(key)) {
      return []
    }

    seen.add(key)

    return [
      createEmailNotificationContact({
        deliveryRole: recipient.deliveryRole,
        displayName: recipient.displayName ?? undefined,
        email: recipient.email,
      }),
    ]
  })
}

export function getRetailOpsSharedLinkOrderRecipients(
  payload: RetailOpsSharedLinkOrderRequestedPayload,
) {
  return uniqueEmailRecipients([
    {
      deliveryRole: "customer",
      displayName: payload.customerName,
      email: payload.customerEmail,
    },
    ...payload.merchantRecipients.map((recipient) => ({
      deliveryRole: "admin" as const,
      displayName: recipient.displayName ?? undefined,
      email: recipient.email,
    })),
  ])
}

export function createRetailOpsSharedLinkOrderDispatch(
  payload: RetailOpsSharedLinkOrderRequestedPayload,
) {
  return createNotificationDispatchFromType(
    ewatradeNotificationTypes,
    "retail_ops_shared_link_order_requested",
    payload,
    {
      recipients: getRetailOpsSharedLinkOrderRecipients(payload),
    },
  )
}

export function createRetailOpsStaffInviteDispatch(
  payload: RetailOpsStaffInvitedPayload,
) {
  return createNotificationDispatchFromType(
    ewatradeNotificationTypes,
    "retail_ops_staff_invited",
    payload,
    {
      recipients: [
        createEmailNotificationContact({
          deliveryRole: "customer",
          displayName: payload.inviteeName ?? undefined,
          email: payload.inviteeEmail,
        }),
      ],
    },
  )
}

export function planMarketingEarlyAccessDeliveries(
  payload: MarketingEarlyAccessRequestedPayload,
) {
  return planNotificationDeliveries(createMarketingEarlyAccessDispatch(payload))
}

export function planMarketingWaitlistDeliveries(
  payload: MarketingWaitlistJoinedPayload,
) {
  return planNotificationDeliveries(createMarketingWaitlistDispatch(payload))
}

export function createMarketingLeadCapturedNotification(
  input:
    | {
        payload: MarketingEarlyAccessRequestedPayload
        type: "marketing_early_access_requested"
      }
    | {
        payload: MarketingWaitlistJoinedPayload
        type: "marketing_waitlist_joined"
      },
): NotificationDispatch {
  return input.type === "marketing_early_access_requested"
    ? createMarketingEarlyAccessDispatch(input.payload)
    : createMarketingWaitlistDispatch(input.payload)
}

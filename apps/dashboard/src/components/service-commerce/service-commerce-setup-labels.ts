import type {
  SERVICE_COMMERCE_CAPABILITIES,
  ServiceCommerceCapabilityReadiness,
  ServiceCommerceProfileConfiguration,
} from "@ewatrade/service-commerce"

/** Plain words for the Bookings and quotes settings page. */

export type ServiceCommerceCapability =
  (typeof SERVICE_COMMERCE_CAPABILITIES)[number]

export const SERVICE_COMMERCE_FEATURES: Array<{
  capability: ServiceCommerceCapability
  help: string
  label: string
}> = [
  {
    capability: "intake",
    help: "Customers can ask for a Service from your link, WhatsApp or in person.",
    label: "Customer requests",
  },
  {
    capability: "attachments",
    help: "Customers can add photos or documents to a request.",
    label: "Photos and files",
  },
  {
    capability: "quote",
    help: "You send a price for the customer to accept.",
    label: "Quotes",
  },
  {
    capability: "booking",
    help: "Customers pick a time from your open slots.",
    label: "Bookings",
  },
  {
    capability: "payment",
    help: "Customers pay the quote or booking online.",
    label: "Online payment",
  },
  {
    capability: "pickup",
    help: "Customers collect from the store.",
    label: "Pickup",
  },
  {
    capability: "delivery",
    help: "You deliver to the customer.",
    label: "Delivery",
  },
  {
    capability: "service_completion",
    help: "Staff mark a Service done so the customer is told.",
    label: "Mark the Service done",
  },
  {
    capability: "web",
    help: "Customers send requests from your store link or QR code.",
    label: "Requests from your link",
  },
  {
    capability: "staff",
    help: "Staff enter a request for a walk-in or phone customer.",
    label: "Requests entered by staff",
  },
  {
    capability: "whatsapp",
    help: "Customers send requests to your WhatsApp number.",
    label: "Requests from WhatsApp",
  },
  {
    capability: "progressive_catalog",
    help: "Staff can quote a Service that isn't in your catalog yet.",
    label: "Add Services as you go",
  },
]

/**
 * The tag beside a feature that is switched on but not ready. Store-wide
 * reasons (bookings and quotes off, store inactive) are shown once at the top
 * of the page instead, so they get no tag here.
 */
export function featureReadinessTag(
  enabled: boolean,
  readiness: ServiceCommerceCapabilityReadiness,
) {
  if (!enabled) return null
  if (readiness.readiness === "setup_required") return "Needs setup"
  if (readiness.blockers.includes("policy_restricted")) return "Not allowed"
  if (readiness.blockers.includes("provider_unavailable")) {
    return "Not working right now"
  }
  return null
}

/** One plain line for each reason the owner can't turn this on yet. */
export function activationBlockerLabel(
  blocker: string,
  configuration: Pick<ServiceCommerceProfileConfiguration, "capabilities">,
) {
  const { booking, quote } = configuration.capabilities
  switch (blocker) {
    case "store_inactive":
      return "Open this store again in Stores"
    case "profile_suspended":
      return "Bookings and quotes are on hold for this store. Contact support."
    case "intake_disabled":
      return "Turn on Customer requests"
    case "channel_missing":
      return "Turn on at least one way to get requests: from your link, by staff or from WhatsApp"
    case "channel_unavailable":
      return "Set up a way for customers to reach you in Customer channels"
    case "outcome_missing":
      return "Turn on Quotes or Bookings"
    case "outcome_unavailable":
      return quote && !booking
        ? "Finish setting up quotes"
        : booking && !quote
          ? "Finish setting up bookings"
          : "Finish setting up quotes or bookings"
    case "progressive_catalog_disabled":
      return "Turn on Add Services as you go, or choose Only from your catalog"
    default:
      return "Finish the setup below"
  }
}

/** Server messages that name internal codes, in plain words. */
export function plainSetupError(message: string) {
  if (message.startsWith("Active Service Commerce settings are not ready")) {
    return "This would stop bookings and quotes from working. Turn them off first, then change this."
  }
  if (message.includes("changed. Refresh")) {
    return "These settings changed somewhere else. Refresh and try again."
  }
  if (message.startsWith("Only a Tenant owner or admin")) {
    return "Only an owner or admin can change these settings."
  }
  return message
}

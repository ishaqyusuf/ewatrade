import type { ServiceCommerceSheetMode } from "@/hooks/use-service-commerce-params"

type ControllerDefinition = {
  description: string
  implemented: boolean
  requiredIds: Array<
    | "attachmentId"
    | "offeringId"
    | "quoteApprovalId"
    | "sourceId"
    | "sourceKind"
    | "sourceLineId"
  >
  title: string
}

const unavailable = (title: string): ControllerDefinition => ({
  description: "This workflow is not available in the current release.",
  implemented: false,
  requiredIds: [],
  title,
})

export const SERVICE_COMMERCE_CONTROLLERS = {
  availability: {
    description:
      "Configure when this Store accepts new Chat messages and pause or resume customer intake.",
    implemented: true,
    requiredIds: [],
    title: "Chat availability",
  },
  attachment_review: {
    description:
      "Review a safety-permitted attachment and record attributable customer-request meaning.",
    implemented: true,
    requiredIds: ["attachmentId"],
    title: "Review attachment",
  },
  booking: {
    description:
      "Configure Store-scoped availability and create an expiring customer booking capability.",
    implemented: true,
    requiredIds: ["offeringId"],
    title: "Booking and appointments",
  },
  catalog_draft: {
    description:
      "Match a verified customer request to an existing Offering or create a private draft.",
    implemented: true,
    requiredIds: ["sourceKind", "sourceId", "sourceLineId"],
    title: "Resolve Catalog item",
  },
  connection: {
    description:
      "Connect, configure and test one business-owned WhatsApp sender.",
    implemented: true,
    requiredIds: [],
    title: "Customer channel",
  },
  conversation_mode: {
    description:
      "Choose EwaTrade Chat, WhatsApp, or Both while keeping customer-visible readiness server-derived.",
    implemented: true,
    requiredIds: [],
    title: "Customer conversation mode",
  },
  entry_point: {
    description:
      "Publish or revoke this Store's stable customer link and QR code.",
    implemented: true,
    requiredIds: [],
    title: "Share customer entry point",
  },
  fulfillment: unavailable("Fulfilment"),
  intake: unavailable("New customer request"),
  inventory_graduation: {
    description:
      "Complete verified Product inventory or Service operating facts without publishing implicitly.",
    implemented: true,
    requiredIds: ["offeringId"],
    title: "Graduate Catalog offering",
  },
  media: {
    description:
      "Inspect private customer media through a short-lived authorized view.",
    implemented: true,
    requiredIds: ["attachmentId"],
    title: "Customer attachment",
  },
  quote: unavailable("Quotation"),
  quote_approval: {
    description:
      "Approve or reject the exact current Quote Version without replacing source-owned professional review.",
    implemented: true,
    requiredIds: ["quoteApprovalId"],
    title: "Quotation approval",
  },
  quote_policy: {
    description:
      "Trust assigned attendants to release quotations or require another selected team member.",
    implemented: true,
    requiredIds: [],
    title: "Quotation policy",
  },
  request: unavailable("Customer request"),
  setup: unavailable("Service Commerce setup"),
  success: unavailable("Completed"),
  team: {
    description:
      "Assign accepted active team memberships to customer requests for this Store.",
    implemented: true,
    requiredIds: [],
    title: "Channel attendants",
  },
} satisfies Record<ServiceCommerceSheetMode, ControllerDefinition>

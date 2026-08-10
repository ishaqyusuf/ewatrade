import type { ServiceCommerceSheetMode } from "@/hooks/use-service-commerce-params"

type ControllerDefinition = {
  description: string
  implemented: boolean
  requiredIds: Array<
    "attachmentId" | "sourceId" | "sourceKind" | "sourceLineId"
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
  attachment_review: {
    description:
      "Review a safety-permitted attachment and record attributable customer-request meaning.",
    implemented: true,
    requiredIds: ["attachmentId"],
    title: "Review attachment",
  },
  booking: unavailable("Booking"),
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
  entry_point: {
    description:
      "Publish or revoke this Store's stable customer link and QR code.",
    implemented: true,
    requiredIds: [],
    title: "Share customer entry point",
  },
  fulfillment: unavailable("Fulfilment"),
  intake: unavailable("New customer request"),
  inventory_graduation: unavailable("Graduate inventory"),
  media: {
    description:
      "Inspect private customer media through a short-lived authorized view.",
    implemented: true,
    requiredIds: ["attachmentId"],
    title: "Customer attachment",
  },
  quote: unavailable("Quotation"),
  quote_approval: unavailable("Quotation approval"),
  quote_policy: unavailable("Quotation policy"),
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

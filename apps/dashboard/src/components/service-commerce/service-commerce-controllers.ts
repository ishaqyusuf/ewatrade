import type { ServiceCommerceSheetMode } from "@/hooks/use-service-commerce-params"

type ControllerDefinition = {
  description: string
  implemented: boolean
  requiredIds: Array<"sourceId" | "sourceKind" | "sourceLineId">
  title: string
}

const unavailable = (title: string): ControllerDefinition => ({
  description: "This workflow is not available in the current release.",
  implemented: false,
  requiredIds: [],
  title,
})

export const SERVICE_COMMERCE_CONTROLLERS = {
  attachment_review: unavailable("Review attachment"),
  booking: unavailable("Booking"),
  catalog_draft: {
    description:
      "Match a verified customer request to an existing Offering or create a private draft.",
    implemented: true,
    requiredIds: ["sourceKind", "sourceId", "sourceLineId"],
    title: "Resolve Catalog item",
  },
  connection: unavailable("Customer channel"),
  entry_point: unavailable("Share customer entry point"),
  fulfillment: unavailable("Fulfilment"),
  intake: unavailable("New customer request"),
  inventory_graduation: unavailable("Graduate inventory"),
  media: unavailable("Customer media"),
  quote: unavailable("Quotation"),
  quote_approval: unavailable("Quotation approval"),
  quote_policy: unavailable("Quotation policy"),
  request: unavailable("Customer request"),
  setup: unavailable("Service Commerce setup"),
  success: unavailable("Completed"),
  team: unavailable("Channel attendants"),
} satisfies Record<ServiceCommerceSheetMode, ControllerDefinition>

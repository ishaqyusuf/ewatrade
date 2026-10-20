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
    description: "Set when customers can start new chats, or pause chat.",
    implemented: true,
    requiredIds: [],
    title: "Chat hours",
  },
  attachment_review: {
    description:
      "Review a safety-permitted attachment and record attributable customer-request meaning.",
    implemented: true,
    requiredIds: ["attachmentId"],
    title: "Review attachment",
  },
  booking: {
    description: "Set open times, or create a booking link for one customer.",
    implemented: true,
    requiredIds: ["offeringId"],
    title: "Appointments",
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
      "Connect a WhatsApp number your business owns, choose its stores and test it.",
    implemented: true,
    requiredIds: [],
    title: "WhatsApp number",
  },
  conversation_mode: {
    description: "Choose where customers can message you.",
    implemented: true,
    requiredIds: [],
    title: "How customers reach you",
  },
  entry_point: {
    description: "Create or turn off your store's customer link and QR code.",
    implemented: true,
    requiredIds: [],
    title: "Customer link and QR code",
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
    description: "Approve to send this quote to the customer, or reject it.",
    implemented: true,
    requiredIds: ["quoteApprovalId"],
    title: "Review quote",
  },
  quote_policy: {
    description:
      "Choose whether another person must approve each quote before the customer sees it.",
    implemented: true,
    requiredIds: [],
    title: "Quotes need approval",
  },
  request: unavailable("Customer request"),
  setup: unavailable("Service Commerce setup"),
  success: unavailable("Completed"),
  team: {
    description:
      "Choose which team members answer customer chats for this store.",
    implemented: true,
    requiredIds: [],
    title: "Team members replying",
  },
} satisfies Record<ServiceCommerceSheetMode, ControllerDefinition>

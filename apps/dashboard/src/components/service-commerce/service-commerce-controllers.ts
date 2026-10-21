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
      "Note what the customer’s photo or file shows, then match it to your catalog.",
    implemented: true,
    requiredIds: ["attachmentId"],
    title: "Customer photo",
  },
  booking: {
    description: "Set open times, or create a booking link for one customer.",
    implemented: true,
    requiredIds: ["offeringId"],
    title: "Appointments",
  },
  catalog_draft: {
    description:
      "Link what the customer asked for to a service you sell, or add it as a draft.",
    implemented: true,
    requiredIds: ["sourceKind", "sourceId", "sourceLineId"],
    title: "Match to your catalog",
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
      "Add what’s missing so you can sell it. It stays hidden until you make it available.",
    implemented: true,
    requiredIds: ["offeringId"],
    title: "Finish setting up",
  },
  media: {
    description:
      "A private photo or file a customer sent. Opening it is recorded.",
    implemented: true,
    requiredIds: ["attachmentId"],
    title: "Customer photo",
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

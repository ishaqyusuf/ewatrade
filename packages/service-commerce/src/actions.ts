import type {
  ServiceCommerceAction,
  ServiceCommerceCustomerActionCandidate,
  ServiceCommerceReadinessState,
  ServiceCommerceRequestState,
} from "./schemas"

type ActionDefinition = {
  confirmation: "none" | "required"
  consequence: string
  label: string
}

export const SERVICE_COMMERCE_ACTION_REGISTRY = {
  request_quote: {
    confirmation: "required",
    consequence: "Ask the business to prepare or update a quotation.",
    label: "Request quote",
  },
  view_quote: {
    confirmation: "none",
    consequence: "Review the current released quotation and its choices.",
    label: "View quote",
  },
  choose_quote_option: {
    confirmation: "required",
    consequence: "Select this exact quotation option before acceptance.",
    label: "Choose option",
  },
  book: {
    confirmation: "required",
    consequence: "Choose and confirm an available appointment time.",
    label: "Book",
  },
  pay_now: {
    confirmation: "required",
    consequence:
      "Open the current payable checkout before payment confirmation.",
    label: "Pay now",
  },
  pick_up: {
    confirmation: "required",
    consequence: "Choose pickup and review its current fulfilment promise.",
    label: "Pick up",
  },
  delivery: {
    confirmation: "required",
    consequence: "Choose delivery and review its current fee and promise.",
    label: "Delivery",
  },
  talk_to_staff: {
    confirmation: "none",
    consequence: "Open the business's current human-support channel.",
    label: "Talk to staff",
  },
  reschedule: {
    confirmation: "required",
    consequence: "Choose a replacement time before changing the appointment.",
    label: "Reschedule",
  },
  cancel: {
    confirmation: "required",
    consequence:
      "Review the cancellation and refund consequence before confirming.",
    label: "Cancel",
  },
} as const satisfies Record<ServiceCommerceAction, ActionDefinition>

type QuoteFacts = {
  currencyCode: string
  fulfilmentChoices: Array<"delivery" | "pickup">
  options: Array<{
    key: string
    label: string
    selected: boolean
    totalMinor: number
  }>
  paymentOutstanding: boolean
  released: boolean
}

type BookingFacts = {
  canCreate?: boolean
  nextOperations: Array<"cancel" | "reschedule">
}

export type ServiceCommerceCustomerActionFacts = {
  booking: BookingFacts | null
  channel: "staff" | "web" | "whatsapp"
  quote: QuoteFacts | null
  readiness: Partial<Record<string, ServiceCommerceReadinessState>>
  state: ServiceCommerceRequestState
}

function candidate(
  action: ServiceCommerceAction,
  overrides: Partial<ServiceCommerceCustomerActionCandidate> = {},
): ServiceCommerceCustomerActionCandidate {
  return { action, ...SERVICE_COMMERCE_ACTION_REGISTRY[action], ...overrides }
}

function isAvailable(
  input: ServiceCommerceCustomerActionFacts,
  capability: string,
) {
  return input.readiness[capability] === "available"
}

export function projectServiceCommerceCustomerActions(
  input: ServiceCommerceCustomerActionFacts,
): ServiceCommerceCustomerActionCandidate[] {
  const actions: ServiceCommerceCustomerActionCandidate[] = []
  const channelAvailable = isAvailable(input, input.channel)
  const preQuote =
    input.state === "received" ||
    input.state === "needs_clarification" ||
    input.state === "ready_to_quote"

  if (preQuote && isAvailable(input, "quote") && channelAvailable) {
    actions.push(candidate("request_quote"))
  }

  if (
    channelAvailable &&
    input.quote?.released &&
    (input.state === "quoted" || input.state === "converted")
  ) {
    actions.push(candidate("view_quote"))
    const selected = input.quote.options.find((option) => option.selected)
    if (!selected && input.quote.options.length > 1) {
      actions.push(
        ...input.quote.options.map((option) =>
          candidate("choose_quote_option", {
            amountMinor: option.totalMinor,
            currencyCode: input.quote?.currencyCode,
            label: `Choose ${option.label}`,
            targetKey: option.key,
          }),
        ),
      )
    }
    if (
      selected &&
      input.quote.paymentOutstanding &&
      isAvailable(input, "payment")
    ) {
      actions.push(
        candidate("pay_now", {
          amountMinor: selected.totalMinor,
          currencyCode: input.quote.currencyCode,
        }),
      )
    }
    if (
      input.quote.fulfilmentChoices.includes("pickup") &&
      isAvailable(input, "pickup")
    ) {
      actions.push(candidate("pick_up"))
    }
    if (
      input.quote.fulfilmentChoices.includes("delivery") &&
      isAvailable(input, "delivery")
    ) {
      actions.push(candidate("delivery"))
    }
  }

  if (
    channelAvailable &&
    input.booking?.canCreate &&
    isAvailable(input, "booking")
  ) {
    actions.push(candidate("book"))
  }
  if (
    channelAvailable &&
    input.booking?.nextOperations.includes("reschedule")
  ) {
    actions.push(candidate("reschedule"))
  }
  if (channelAvailable && input.booking?.nextOperations.includes("cancel")) {
    actions.push(candidate("cancel"))
  }
  if (channelAvailable) actions.push(candidate("talk_to_staff"))

  return actions
}

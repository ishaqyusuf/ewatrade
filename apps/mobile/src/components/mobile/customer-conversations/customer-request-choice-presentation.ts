import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

import type { CustomerRequestTarget } from "./use-customer-conversation-detail"

type Timeline =
  RouterOutputs["serviceCommerce"]["mobileStoreConversationTimeline"]

export type CustomerRequestChoiceOption = {
  description: string
  key: string
  label: string
  primary: boolean
  target: CustomerRequestTarget
}

export function resolveCustomerRequestChoicePresentation(input: {
  requestKinds: Timeline["availableRequestKinds"]
  requests: Array<
    Pick<Timeline["requests"][number], "id" | "kind" | "label" | "lifecycle">
  >
}) {
  const options: CustomerRequestChoiceOption[] = input.requests
    .filter((request) => request.lifecycle === "active")
    .map((request) => ({
      description: "Continue the active request",
      key: `${request.kind}:${request.id}`,
      label: request.label,
      primary: false,
      target: {
        kind: "existing_request",
        requestId: request.id,
        requestKind: request.kind,
      },
    }))

  if (input.requestKinds.includes("product_inquiry")) {
    options.push({
      description: "Start a separate request",
      key: "new_commerce_inquiry",
      label: "New product request",
      primary: true,
      target: { kind: "new_commerce_inquiry" },
    })
  }

  return {
    heading: "Choose where this message belongs",
    lead:
      options.length > 0
        ? "ẸwáTrade will not guess."
        : "Start a new request from the Store link.",
    options,
  }
}

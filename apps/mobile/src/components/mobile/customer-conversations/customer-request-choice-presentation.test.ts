import { describe, expect, test } from "bun:test"

import { resolveCustomerRequestChoicePresentation } from "./customer-request-choice-presentation"

describe("resolveCustomerRequestChoicePresentation", () => {
  test("builds truthful full-row choices from active server options", () => {
    expect(
      resolveCustomerRequestChoicePresentation({
        requestKinds: ["product_inquiry", "service", "prescription"],
        requests: [
          {
            id: "active-prescription",
            kind: "prescription_request",
            label: "Prescription refill",
            lifecycle: "active",
          },
          {
            id: "completed-product",
            kind: "commerce_inquiry",
            label: "Blood pressure monitor",
            lifecycle: "terminal",
          },
        ],
      }),
    ).toEqual({
      heading: "Choose where this message belongs",
      lead: "ẸwáTrade will not guess.",
      options: [
        {
          description: "Continue the active request",
          key: "prescription_request:active-prescription",
          label: "Prescription refill",
          primary: false,
          target: {
            kind: "existing_request",
            requestId: "active-prescription",
            requestKind: "prescription_request",
          },
        },
        {
          description: "Start a separate request",
          key: "new_commerce_inquiry",
          label: "New product request",
          primary: true,
          target: { kind: "new_commerce_inquiry" },
        },
      ],
    })
  })

  test("does not invent a mobile action for unsupported new Request kinds", () => {
    expect(
      resolveCustomerRequestChoicePresentation({
        requestKinds: ["service", "prescription"],
        requests: [],
      }).options,
    ).toEqual([])
  })
})

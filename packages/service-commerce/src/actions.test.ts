import { describe, expect, test } from "bun:test"

import {
  SERVICE_COMMERCE_ACTION_REGISTRY,
  projectServiceCommerceCustomerActions,
  resolveServiceCommerceCustomerActionHandoffPath,
} from "./actions"

const available = {
  booking: "available",
  delivery: "available",
  payment: "available",
  pickup: "available",
  quote: "available",
  staff: "available",
  web: "available",
  whatsapp: "available",
} as const

describe("Service Commerce customer actions", () => {
  test("routes only to established public systems of action", () => {
    const capabilityToken = "opaque/action token"
    expect(
      resolveServiceCommerceCustomerActionHandoffPath({
        capabilityToken,
        result: {
          kind: "booking",
          replayed: false,
          sourceKind: "service",
        },
      }),
    ).toBe("/booking/opaque%2Faction%20token")
    expect(
      resolveServiceCommerceCustomerActionHandoffPath({
        capabilityToken,
        result: {
          checkoutUrl: "https://checkout.paystack.com/qa-session",
          kind: "checkout",
          replayed: false,
          sourceKind: "prescription",
        },
      }),
    ).toBe("https://checkout.paystack.com/qa-session")
    expect(
      resolveServiceCommerceCustomerActionHandoffPath({
        capabilityToken,
        result: {
          kind: "checkout",
          replayed: false,
          sourceKind: "service",
        },
      }),
    ).toBeNull()
    expect(
      resolveServiceCommerceCustomerActionHandoffPath({
        capabilityToken,
        result: {
          kind: "quote_option_selected",
          replayed: false,
          sourceKind: "commerce_inquiry",
        },
      }),
    ).toBeNull()
  })

  test("keeps one exhaustive registry for every action kind", () => {
    expect(Object.keys(SERVICE_COMMERCE_ACTION_REGISTRY).sort()).toEqual([
      "book",
      "cancel",
      "choose_quote_option",
      "delivery",
      "pay_now",
      "pick_up",
      "request_quote",
      "reschedule",
      "talk_to_staff",
      "view_quote",
    ])
  })

  test("projects only released current-version Quote actions and exact options", () => {
    expect(
      projectServiceCommerceCustomerActions({
        booking: null,
        channel: "web",
        quote: {
          currencyCode: "NGN",
          fulfilmentChoices: ["pickup", "delivery"],
          options: [
            {
              key: "red",
              label: "Red small",
              selected: false,
              totalMinor: 20_000,
            },
            {
              key: "black",
              label: "Black large",
              selected: false,
              totalMinor: 30_000,
            },
          ],
          paymentOutstanding: true,
          released: true,
        },
        readiness: available,
        state: "quoted",
      }),
    ).toEqual([
      expect.objectContaining({ action: "view_quote" }),
      expect.objectContaining({
        action: "choose_quote_option",
        amountMinor: 20_000,
        label: "Choose Red small",
        targetKey: "red",
      }),
      expect.objectContaining({
        action: "choose_quote_option",
        amountMinor: 30_000,
        label: "Choose Black large",
        targetKey: "black",
      }),
      expect.objectContaining({ action: "pick_up" }),
      expect.objectContaining({ action: "delivery" }),
      expect.objectContaining({ action: "talk_to_staff" }),
    ])
  })

  test("never exposes Quote, option, payment or fulfilment actions before release", () => {
    const actions = projectServiceCommerceCustomerActions({
      booking: null,
      channel: "whatsapp",
      quote: {
        currencyCode: "NGN",
        fulfilmentChoices: ["pickup"],
        options: [
          {
            key: "default",
            label: "Standard",
            selected: true,
            totalMinor: 10_000,
          },
        ],
        paymentOutstanding: true,
        released: false,
      },
      readiness: available,
      state: "quoted",
    })

    expect(actions).toEqual([
      expect.objectContaining({ action: "talk_to_staff" }),
    ])
  })

  test("projects booking management only from current allowed operations", () => {
    const actions = projectServiceCommerceCustomerActions({
      booking: { nextOperations: ["reschedule", "cancel"] },
      channel: "web",
      quote: null,
      readiness: available,
      state: "converted",
    })

    expect(actions.map((action) => action.action)).toEqual([
      "reschedule",
      "cancel",
      "talk_to_staff",
    ])
  })

  test("fails unavailable capability and channel combinations closed", () => {
    const actions = projectServiceCommerceCustomerActions({
      booking: null,
      channel: "whatsapp",
      quote: null,
      readiness: {
        ...available,
        quote: "restricted",
        whatsapp: "unavailable",
      },
      state: "ready_to_quote",
    })

    expect(actions).toEqual([])
  })

  test("does not project quote or booking actions through an unavailable channel", () => {
    const actions = projectServiceCommerceCustomerActions({
      booking: { nextOperations: ["reschedule", "cancel"] },
      channel: "web",
      quote: {
        currencyCode: "NGN",
        fulfilmentChoices: ["pickup"],
        options: [
          {
            key: "default",
            label: "Standard",
            selected: true,
            totalMinor: 10_000,
          },
        ],
        paymentOutstanding: true,
        released: true,
      },
      readiness: { ...available, web: "unavailable" },
      state: "quoted",
    })

    expect(actions).toEqual([])
  })
})

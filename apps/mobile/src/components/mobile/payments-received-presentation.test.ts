import { describe, expect, test } from "bun:test"

import { buildPaymentsReceivedPresentation } from "./payments-received-presentation"

describe("payments received presentation", () => {
  test("keeps an empty directory compact and removes its useless search", () => {
    expect(
      buildPaymentsReceivedPresentation({
        currencyTotals: [],
        defaultCurrencyCode: "NGN",
        isPending: false,
        query: "",
        totalCount: 0,
      }),
    ).toMatchObject({
      amountLabel: "₦0.00",
      currencyAmountRows: [],
      emptyMessage:
        "Payments you record against orders will appear here with the order, method, time, and team member.",
      emptyTitle: "No payments yet",
      showSearch: false,
    })
  })

  test("keeps search available for an existing directory and its empty results", () => {
    expect(
      buildPaymentsReceivedPresentation({
        currencyTotals: [{ currencyCode: "NGN", totalAmountMinor: 25_000 }],
        defaultCurrencyCode: "NGN",
        isPending: false,
        query: "ada",
        totalCount: 3,
      }),
    ).toMatchObject({
      emptyTitle: "No matching payments",
      showSearch: true,
    })
  })

  test("keeps different Store currencies separate", () => {
    expect(
      buildPaymentsReceivedPresentation({
        currencyTotals: [
          { currencyCode: "NGN", totalAmountMinor: 100_000 },
          { currencyCode: "USD", totalAmountMinor: 2_500 },
        ],
        defaultCurrencyCode: "NGN",
        isPending: false,
        query: "",
        totalCount: 3,
      }),
    ).toMatchObject({
      amountLabel: "2 currencies",
      currencyAmountRows: ["₦1,000.00", "$25.00"],
    })
  })
})

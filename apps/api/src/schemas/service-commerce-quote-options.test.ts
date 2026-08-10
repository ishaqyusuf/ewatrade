import { describe, expect, test } from "bun:test"

import {
  commerceInquiryQuoteIssueSchema,
  publicCommerceInquiryQuoteOptionSelectSchema,
} from "./service-commerce-inquiries"
import {
  publicServiceQuoteOptionSelectSchema,
  serviceQuoteIssueSchema,
} from "./services"

const option = {
  availabilityOutcome: "full" as const,
  clientOptionId: "option-red",
  label: "Red small",
  lines: [
    {
      offeringId: "offering-red",
      outcome: "included" as const,
      quantity: "1",
      sourceLineId: "inquiry-line-1",
      unitPriceMinor: 20_000,
    },
  ],
}

describe("Service Commerce Quote Option API contracts", () => {
  test("accepts mutually exclusive Inquiry Offer Options", () => {
    expect(
      commerceInquiryQuoteIssueSchema.safeParse({
        clientQuoteId: "quote-command-1",
        clientVersionId: "version-command-1",
        inquiryId: "inquiry-1",
        options: [option],
      }).success,
    ).toBe(true)
  })

  test("rejects ambiguous legacy lines plus Offer Options", () => {
    expect(
      commerceInquiryQuoteIssueSchema.safeParse({
        availabilityOutcome: "full",
        clientQuoteId: "quote-command-1",
        clientVersionId: "version-command-1",
        inquiryId: "inquiry-1",
        lines: option.lines,
        options: [option],
      }).success,
    ).toBe(false)
    expect(
      serviceQuoteIssueSchema.safeParse({
        clientQuoteId: "quote-command-1",
        clientVersionId: "version-command-1",
        lines: option.lines.map(({ outcome: _outcome, ...line }) => line),
        options: [
          {
            ...option,
            lines: option.lines.map(({ outcome: _outcome, ...line }) => line),
          },
        ],
        requestId: "request-1",
      }).success,
    ).toBe(false)
  })

  test("requires opaque selection and option command identities", () => {
    const selection = {
      acceptanceToken: "opaque-quote-capability",
      clientSelectionId: "selection-command-1",
      optionId: "option-red",
    }
    expect(
      publicCommerceInquiryQuoteOptionSelectSchema.parse(selection),
    ).toEqual(selection)
    expect(publicServiceQuoteOptionSelectSchema.parse(selection)).toEqual(
      selection,
    )
  })
})

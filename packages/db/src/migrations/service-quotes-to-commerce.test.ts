import { describe, expect, test } from "bun:test"

import { validateLegacyServiceQuoteCandidate } from "./service-quotes-to-commerce"

describe("legacy Service Quote backfill", () => {
  test("requires an exact typed source and complete version history", () => {
    expect(() =>
      validateLegacyServiceQuoteCandidate({
        quoteId: "quote-1",
        requestId: null,
        versionCount: 1,
      }),
    ).toThrow("has no Service Request source")
    expect(() =>
      validateLegacyServiceQuoteCandidate({
        quoteId: "quote-1",
        requestId: "request-1",
        versionCount: 0,
      }),
    ).toThrow("has no version history")
    expect(() =>
      validateLegacyServiceQuoteCandidate({
        quoteId: "quote-1",
        requestId: "request-1",
        versionCount: 1,
      }),
    ).not.toThrow()
  })
})

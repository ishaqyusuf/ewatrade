import { describe, expect, test } from "bun:test"

import {
  assertCommerceQuoteSource,
  assertQuoteVersionAcceptable,
} from "./commerce-quotes"

describe("Commerce Quote invariants", () => {
  test("requires exactly one typed source", () => {
    expect(
      assertCommerceQuoteSource({
        sourceId: "service_request_1",
        sourceType: "service_request",
      }),
    ).toEqual({ sourceId: "service_request_1", sourceType: "service_request" })
    expect(() =>
      assertCommerceQuoteSource({ sourceId: "", sourceType: "service_request" }),
    ).toThrow("Quote source is required")
  })

  test("accepts only the current issued unexpired version", () => {
    const now = new Date("2026-08-08T12:00:00.000Z")
    expect(() =>
      assertQuoteVersionAcceptable({
        currentVersionId: "version_1",
        expiresAt: new Date("2026-08-08T12:01:00.000Z"),
        now,
        status: "issued",
        versionId: "version_1",
      }),
    ).not.toThrow()
    expect(() =>
      assertQuoteVersionAcceptable({
        currentVersionId: "version_2",
        expiresAt: null,
        now,
        status: "issued",
        versionId: "version_1",
      }),
    ).toThrow("Only the current unexpired Quote Version can be accepted")
    expect(() =>
      assertQuoteVersionAcceptable({
        currentVersionId: "version_1",
        expiresAt: new Date("2026-08-08T11:59:59.000Z"),
        now,
        status: "issued",
        versionId: "version_1",
      }),
    ).toThrow("Only the current unexpired Quote Version can be accepted")
  })
})

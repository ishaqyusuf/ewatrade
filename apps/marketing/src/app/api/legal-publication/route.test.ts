import { describe, expect, test } from "bun:test"
import { isSignupAvailableForLegalPublication } from "@ewatrade/utils/legal-approval"
import { GET } from "./route"

describe("public legal publication status", () => {
  test("draft publication exposes no effective version and is not cached", async () => {
    const response = GET()
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(await response.json()).toEqual({
      approved: false,
      signupAvailable: isSignupAvailableForLegalPublication(false),
      version: null,
      effectiveDate: null,
      documentHash: null,
    })
  })
})

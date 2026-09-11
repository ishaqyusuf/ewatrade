import { describe, expect, test } from "bun:test"

import { StoreConversationNotificationError } from "@ewatrade/db/queries"

import {
  customerCredential,
  customerInstallation,
  mapCustomerConversationError,
} from "./customer-conversation-auth"

describe("Customer conversation authorization boundary", () => {
  test("rejects malformed customer capabilities before repository access", () => {
    expect(() => customerCredential("short")).toThrow()
    expect(() => customerInstallation("short")).toThrow()
    expect(customerCredential(null, { optional: true })).toBeNull()
  })

  test("maps notification rate limits and readiness to safe tRPC codes", () => {
    for (const [domainCode, transportCode] of [
      ["RATE_LIMITED", "TOO_MANY_REQUESTS"],
      ["NOT_READY", "PRECONDITION_FAILED"],
    ] as const) {
      try {
        mapCustomerConversationError(
          new StoreConversationNotificationError(
            domainCode,
            "Safe customer recovery message.",
          ),
        )
      } catch (error) {
        expect(error).toMatchObject({
          code: transportCode,
          message: "Safe customer recovery message.",
        })
      }
    }
  })
})

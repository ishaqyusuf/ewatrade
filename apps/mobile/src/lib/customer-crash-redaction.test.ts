import { describe, expect, test } from "bun:test"

import { redactCustomerCapabilitiesFromCrashEvent } from "./customer-crash-redaction"

describe("customer capability crash redaction", () => {
  test("removes transfer capabilities from request and navigation evidence", () => {
    const secret = "transfer-secret-123456789012345678901234"
    const event = redactCustomerCapabilitiesFromCrashEvent({
      breadcrumbs: [
        {
          data: {
            to: `ewatrade://r/public#transfer=${secret}`,
            url: `ewatrade://r/public#transfer=${secret}`,
          },
          message: `Opening /r/public?transfer=${secret}`,
        },
      ],
      request: {
        headers: {
          "X-Store-Conversation-Credential": secret,
          "x-store-conversation-installation": secret,
        },
        url: `https://chat.ewatrade.com/r/public#transfer=${secret}`,
      },
    })

    expect(JSON.stringify(event)).not.toContain(secret)
    expect(event.request.headers).toEqual({})
    expect(JSON.stringify(event)).toContain("[Filtered]")
  })
})

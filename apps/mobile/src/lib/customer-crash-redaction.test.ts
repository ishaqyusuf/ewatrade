import { describe, expect, test } from "bun:test"

import { redactCustomerCapabilitiesFromCrashEvent } from "./customer-crash-redaction"

describe("customer capability crash redaction", () => {
  test("filters setup and email-verification tokens from navigation breadcrumbs", () => {
    const secret = `ea_${"a".repeat(43)}`
    const verification = `ear_${"v".repeat(43)}`
    const event = redactCustomerCapabilitiesFromCrashEvent({
      breadcrumbs: [
        {
          message: `Opening /signup?access_token=${secret}`,
          data: { to: `/api/early-access/verify?token=${verification}` },
        },
      ],
      request: {
        url: `https://dash.ewatrade.com/signup?access_token=${secret}`,
      },
    })
    expect(JSON.stringify(event)).not.toContain(secret)
    expect(JSON.stringify(event)).not.toContain(verification)
  })
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

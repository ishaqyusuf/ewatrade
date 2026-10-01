import { expect, test } from "bun:test"
import { NextRequest } from "next/server"
import { POST } from "./route"

test("production customer account signup stops before auth while legal publication is draft", async () => {
  const previousAppEnv = process.env.APP_ENV
  process.env.APP_ENV = "production"
  try {
    const request = new NextRequest(
      "https://shop.ewatrade.com/api/store-conversations/account/auth",
      {
        method: "POST",
        headers: {
          origin: "https://shop.ewatrade.com",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "customer@example.test",
          mode: "sign_up",
          name: "Customer",
          password: "long-test-password",
        }),
      },
    )
    const response = await POST(request)
    expect(response.status).toBe(412)
    expect(await response.json()).toMatchObject({
      code: "LEGAL_PUBLICATION_UNAVAILABLE",
    })
  } finally {
    process.env.APP_ENV = previousAppEnv ?? ""
  }
})

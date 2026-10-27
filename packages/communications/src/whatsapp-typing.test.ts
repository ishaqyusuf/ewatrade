import { expect, test } from "bun:test"
import {
  DirectMetaWhatsAppProvider,
  WHATSAPP_TYPING_REQUEST_MS,
  WhatsAppTypingError,
} from "./whatsapp"

const credentials = {
  accessToken: "synthetic",
  phoneNumberId: "123456789",
  messageId: "wamid.test_123=",
}
test("native typing sends only bounded read+typing on its dedicated transport", async () => {
  const requests: Array<{ url: string; init: RequestInit }> = []
  const provider = new DirectMetaWhatsAppProvider({
    fetch: Object.assign(
      async (url: string | URL | Request, init?: RequestInit) => {
        if (!init) throw new Error("Missing request")
        requests.push({ url: String(url), init })
        return Response.json({ success: true })
      },
      { preconnect: () => undefined },
    ),
  })
  expect(await provider.sendTyping(credentials)).toEqual({
    outcome: "accepted",
    httpStatus: 200,
  })
  expect(requests).toHaveLength(1)
  const request = requests[0]
  if (!request) throw new Error("Missing request")
  expect(request.url).toBe(
    "https://graph.facebook.com/v25.0/123456789/messages",
  )
  expect(JSON.parse(String(request.init.body))).toEqual({
    messaging_product: "whatsapp",
    status: "read",
    message_id: credentials.messageId,
    typing_indicator: { type: "text" },
  })
  expect(request.init.method).toBe("POST")
  expect(request.init.redirect).toBe("error")
  expect(request.init.signal).toBeInstanceOf(AbortSignal)
  expect(WHATSAPP_TYPING_REQUEST_MS).toBe(1500)
  // The new method must not move existing outbound/OTP messages to another Graph version.
  const sendProvider = new DirectMetaWhatsAppProvider({
    fetch: Object.assign(
      async (url: string | URL | Request) => {
        expect(String(url)).toBe(
          "https://graph.facebook.com/v21.0/123456789/messages",
        )
        return Response.json({ messages: [{ id: "wamid.outbound" }] })
      },
      { preconnect: () => undefined },
    ),
  })
  await sendProvider.sendText({
    ...credentials,
    to: "2348000000000",
    body: "synthetic",
  })
})

test("typing rejects invalid inbound identities before HTTP and hides provider details", async () => {
  let calls = 0
  const provider = new DirectMetaWhatsAppProvider({
    fetch: Object.assign(
      async () => {
        calls++
        return Response.json(
          {
            error: {
              code: 131000,
              error_subcode: 2494055,
              message: "private provider detail",
              fbtrace_id: "private trace",
            },
          },
          { status: 400 },
        )
      },
      { preconnect: () => undefined },
    ),
  })
  await expect(
    provider.sendTyping({ ...credentials, messageId: "not-a-wamid" }),
  ).rejects.toThrow("source is invalid")
  await expect(
    provider.sendTyping({ ...credentials, phoneNumberId: "../elsewhere" }),
  ).rejects.toThrow("source is invalid")
  expect(calls).toBe(0)
  const rejected = await typingFailure(provider)
  expect(rejected.reason).toBe("rejected")
  expect(rejected.httpStatus).toBe(400)
  expect(rejected.metaCode).toBe(131000)
  expect(rejected.metaSubcode).toBe(2494055)
  expect(String(rejected)).toBe(
    "WhatsAppTypingError: WhatsApp typing is unavailable.",
  )
  expect(JSON.stringify(rejected)).not.toContain("private")
  expect(rejected.stack).not.toContain("private provider detail")
  expect("cause" in rejected).toBe(false)
  expect(calls).toBe(1)
  const malformed = new DirectMetaWhatsAppProvider({
    fetch: Object.assign(
      async () => Response.json({ messages: [{ id: "not-a-read-receipt" }] }),
      { preconnect: () => undefined },
    ),
  })
  const invalid = await typingFailure(malformed)
  expect(invalid.reason).toBe("invalid_success")
  expect(invalid.httpStatus).toBe(200)
  expect(invalid.metaCode).toBeUndefined()
})

async function typingFailure(provider: DirectMetaWhatsAppProvider) {
  try {
    await provider.sendTyping(credentials)
  } catch (error) {
    if (error instanceof WhatsAppTypingError) return error
    throw error
  }
  throw new Error("Expected a sanitized typing failure")
}

test("typing distinguishes timeout from network without retaining raw errors", async () => {
  for (const [raw, reason] of [
    [new DOMException("private timeout token", "TimeoutError"), "timeout"],
    [new Error("private network token"), "network"],
    [new DOMException("private generic abort", "AbortError"), "network"],
  ] as const) {
    const provider = new DirectMetaWhatsAppProvider({
      fetch: Object.assign(
        async () => {
          throw raw
        },
        { preconnect: () => undefined },
      ),
    })
    const error = await typingFailure(provider)
    expect(error.reason).toBe(reason)
    expect(error.httpStatus).toBeUndefined()
    expect(JSON.stringify(error)).not.toContain("private")
    expect(String(error)).not.toContain("private")
    expect(error.stack).not.toContain("private")
    expect("cause" in error).toBe(false)
  }
})

test("typing bounds response parsing and accepts only numeric diagnostic codes", async () => {
  const oversized = new DirectMetaWhatsAppProvider({
    fetch: Object.assign(
      async () => Response.json({ success: true, private: "x".repeat(4096) }),
      { preconnect: () => undefined },
    ),
  })
  expect((await typingFailure(oversized)).reason).toBe("invalid_success")
  const rejected = new DirectMetaWhatsAppProvider({
    fetch: Object.assign(
      async () =>
        Response.json(
          {
            error: {
              code: "private-token",
              error_subcode: -1,
              message: "private message",
            },
          },
          { status: 401 },
        ),
      { preconnect: () => undefined },
    ),
  })
  const error = await typingFailure(rejected)
  expect(error.reason).toBe("rejected")
  expect(error.httpStatus).toBe(401)
  expect(error.metaCode).toBeUndefined()
  expect(error.metaSubcode).toBeUndefined()
  expect(JSON.stringify(error)).not.toContain("private")
})

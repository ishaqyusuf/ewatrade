import { expect, test } from "bun:test"
import {
  DirectMetaWhatsAppProvider,
  WHATSAPP_TYPING_REQUEST_MS,
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
  await provider.sendTyping(credentials)
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
          { error: { message: "private provider detail" } },
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
  await expect(provider.sendTyping(credentials)).rejects.toThrow(
    "WhatsApp typing is unavailable.",
  )
  expect(calls).toBe(1)
  const malformed = new DirectMetaWhatsAppProvider({
    fetch: Object.assign(
      async () => Response.json({ messages: [{ id: "not-a-read-receipt" }] }),
      { preconnect: () => undefined },
    ),
  })
  await expect(malformed.sendTyping(credentials)).rejects.toThrow(
    "WhatsApp typing is unavailable.",
  )
})

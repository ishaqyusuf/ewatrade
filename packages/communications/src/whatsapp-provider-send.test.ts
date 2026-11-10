import { describe, expect, test } from "bun:test"

import {
  DirectMetaWhatsAppProvider,
  WhatsAppProviderSendError,
} from "./whatsapp"

function sendWith(response: Response) {
  const mockedFetch: typeof fetch = Object.assign(async () => response, {
    preconnect: () => undefined,
  })
  return new DirectMetaWhatsAppProvider({
    fetch: mockedFetch,
  }).sendButtons({
    accessToken: "private-access-token",
    body: "Choose how to continue.",
    buttons: [{ id: "safe-choice", title: "Continue" }],
    phoneNumberId: "phone_1",
    to: "2348000000000",
  })
}

describe("Meta WhatsApp send outcome classification", () => {
  test("classifies explicit provider rejection as a definite failure", async () => {
    await expect(
      sendWith(
        new Response(JSON.stringify({ error: "private" }), { status: 400 }),
      ),
    ).rejects.toMatchObject({
      code: "PROVIDER_REJECTED",
      outcome: "DEFINITE_FAILURE",
    })
  })

  test("keeps retryable HTTP and malformed success outcomes unknown", async () => {
    for (const response of [
      new Response("{}", { status: 503 }),
      new Response("{}", { status: 429 }),
      new Response("{}", { status: 200 }),
    ]) {
      const error = await sendWith(response).catch((reason: unknown) => reason)
      expect(error).toBeInstanceOf(WhatsAppProviderSendError)
      expect(error).toMatchObject({ outcome: "OUTCOME_UNKNOWN" })
    }
  })
})

test("assistant text carries only bounded opaque correlation and parser preserves it for signed status routing", async () => {
  const { parseMetaWhatsAppEvents } = await import("./whatsapp")
  const requests: Record<string, unknown>[] = []
  const callbackData = "ewa-wa-v1:00000000-0000-4000-8000-000000000000"
  const provider = new DirectMetaWhatsAppProvider({
    fetch: Object.assign(
      async (_url: unknown, init?: RequestInit) => {
        requests.push(JSON.parse(String(init?.body)))
        return Response.json({ messages: [{ id: "wamid.test" }] })
      },
      { preconnect: () => undefined },
    ),
  })
  await provider.sendText({
    accessToken: "synthetic",
    phoneNumberId: "123456789",
    to: "2348000000000",
    body: "saved",
    callbackData,
  })
  expect(requests[0]).toMatchObject({
    type: "text",
    text: { body: "saved", preview_url: false },
    biz_opaque_callback_data: callbackData,
  })
  await expect(
    provider.sendText({
      accessToken: "synthetic",
      phoneNumberId: "123456789",
      to: "2348000000000",
      body: "saved",
      callbackData: "bad\ncallback",
    }),
  ).rejects.toMatchObject({ outcome: "DEFINITE_FAILURE" })
  expect(requests).toHaveLength(1)
  const events = parseMetaWhatsAppEvents({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: "123456789" },
              statuses: [
                {
                  id: "wamid.test",
                  status: "delivered",
                  timestamp: "1792050000",
                  biz_opaque_callback_data: callbackData,
                },
              ],
            },
          },
        ],
      },
    ],
  })
  expect(events[0]).toMatchObject({
    kind: "status",
    callbackData,
    messageId: "wamid.test",
    status: "delivered",
  })
})
test("empty or non-string success identities remain unknown rather than evidence of delivery", async () => {
  for (const id of ["", null, 42, "undefined\nprivate"]) {
    await expect(
      sendWith(Response.json({ messages: [{ id }] })),
    ).rejects.toMatchObject({
      code: "PROVIDER_RESULT_INVALID",
      outcome: "OUTCOME_UNKNOWN",
    })
  }
})

test("a product photo is uploaded privately first, then sent by media id with its caption", async () => {
  const calls: Array<{ url: string; body: unknown }> = []
  const mockedFetch: typeof fetch = Object.assign(
    async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: init?.body })
      return String(url).endsWith("/media")
        ? new Response(JSON.stringify({ id: "media-1" }), { status: 200 })
        : new Response(JSON.stringify({ messages: [{ id: "wamid.photo" }] }), {
            status: 200,
          })
    },
    { preconnect: () => undefined },
  )
  const provider = new DirectMetaWhatsAppProvider({ fetch: mockedFetch })
  const sent = await provider.sendImage({
    accessToken: "private-access-token",
    phoneNumberId: "123",
    to: "2348000000000",
    bytes: new Uint8Array([1, 2, 3]),
    contentType: "image/jpeg",
    caption: "*1. Oud Royal*",
  })
  expect(sent).toEqual({ messageId: "wamid.photo" })
  expect(calls.map((call) => call.url)).toEqual([
    "https://graph.facebook.com/v21.0/123/media",
    "https://graph.facebook.com/v21.0/123/messages",
  ])
  expect(calls[0]?.body).toBeInstanceOf(FormData)
  expect(JSON.parse(String(calls[1]?.body))).toMatchObject({
    type: "image",
    image: { id: "media-1", caption: "*1. Oud Royal*" },
  })
  // A failed upload sends nothing to the chat.
  const refused = new DirectMetaWhatsAppProvider({
    fetch: Object.assign(async () => new Response("{}", { status: 400 }), {
      preconnect: () => undefined,
    }),
  })
  await expect(
    refused.sendImage({
      accessToken: "private-access-token",
      phoneNumberId: "123",
      to: "2348000000000",
      bytes: new Uint8Array([1]),
      contentType: "image/png",
      caption: "x",
    }),
  ).rejects.toMatchObject({ outcome: "DEFINITE_FAILURE" })
})

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

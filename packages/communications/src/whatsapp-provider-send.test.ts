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

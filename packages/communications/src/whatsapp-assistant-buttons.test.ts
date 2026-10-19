import { expect, test } from "bun:test"
import { DirectMetaWhatsAppProvider } from "./whatsapp"

test("interactive review keeps exact decision IDs and the durable callback in the same fake HTTP effect", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const transport = Object.assign(
    async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init })
      return Response.json({ messages: [{ id: "wamid.synthetic.review" }] })
    },
    { preconnect: fetch.preconnect },
  )
  const provider = new DirectMetaWhatsAppProvider({ fetch: transport })
  const callbackData = "ewa-wa-v1:00000000-0000-4000-8000-000000000000"
  const buttons = [
    { id: `ewa-wa-action-v1:${"a".repeat(43)}:confirm`, title: "Confirm" },
    { id: `ewa-wa-action-v1:${"b".repeat(43)}:cancel`, title: "Cancel" },
  ]
  expect(
    await provider.sendButtons({
      accessToken: "synthetic-never-sent",
      phoneNumberId: "123456789",
      to: "2348000000000",
      body: "Exact complete review",
      buttons,
      callbackData,
    }),
  ).toEqual({ messageId: "wamid.synthetic.review" })
  expect(requests).toHaveLength(1)
  expect(requests[0]?.url).toBe(
    "https://graph.facebook.com/v21.0/123456789/messages",
  )
  const request = requests[0]
  if (!request || typeof request.init?.body !== "string")
    throw Error("Missing synthetic Meta body")
  expect(JSON.parse(request.init.body)).toMatchObject({
    messaging_product: "whatsapp",
    to: "2348000000000",
    type: "interactive",
    biz_opaque_callback_data: callbackData,
    interactive: {
      type: "button",
      body: { text: "Exact complete review" },
      action: { buttons: buttons.map((reply) => ({ type: "reply", reply })) },
    },
  })
  expect(() =>
    provider.sendButtons({
      accessToken: "synthetic-never-sent",
      phoneNumberId: "123456789",
      to: "2348000000000",
      body: "Exact complete review",
      buttons,
      callbackData: "invalid callback data",
    }),
  ).toThrow()
  expect(requests).toHaveLength(1)
})

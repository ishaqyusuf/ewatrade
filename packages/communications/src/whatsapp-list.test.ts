import { expect, test } from "bun:test"
import { DirectMetaWhatsAppProvider } from "./whatsapp"

const credentials = {
  accessToken: "synthetic-never-sent",
  phoneNumberId: "123456789",
  to: "2348000000000",
}

function fakeProvider() {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const transport = Object.assign(
    async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), init })
      return Response.json({ messages: [{ id: "wamid.synthetic.list" }] })
    },
    { preconnect: fetch.preconnect },
  )
  return {
    requests,
    provider: new DirectMetaWhatsAppProvider({ fetch: transport }),
  }
}

test("a list message sends one section with exact row IDs and the callback", async () => {
  const { requests, provider } = fakeProvider()
  const rows = [
    { id: "row-ng", title: "Nigeria · NGN" },
    { id: "row-other", title: "Other · USD", description: "Any other country" },
  ]
  expect(
    await provider.sendList({
      ...credentials,
      body: "Where does it trade?",
      button: "Choose country",
      sectionTitle: "Country and currency",
      rows,
      callbackData: "wa-onboarding:abc",
    }),
  ).toEqual({ messageId: "wamid.synthetic.list" })
  const body = requests[0]?.init?.body
  if (typeof body !== "string") throw Error("Missing synthetic Meta body")
  expect(JSON.parse(body)).toMatchObject({
    messaging_product: "whatsapp",
    to: credentials.to,
    type: "interactive",
    biz_opaque_callback_data: "wa-onboarding:abc",
    interactive: {
      type: "list",
      body: { text: "Where does it trade?" },
      action: {
        button: "Choose country",
        sections: [{ title: "Country and currency", rows }],
      },
    },
  })
})

test("a list Meta would refuse is rejected before any request", () => {
  const { requests, provider } = fakeProvider()
  const base = {
    ...credentials,
    body: "Choose",
    button: "Choose",
    rows: [{ id: "a", title: "A" }],
  }
  for (const input of [
    { ...base, button: "x".repeat(21) },
    { ...base, rows: [] },
    {
      ...base,
      rows: Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, title: "R" })),
    },
    { ...base, rows: [{ id: "a", title: "x".repeat(25) }] },
    { ...base, rows: [{ id: "a", title: "A", description: "x".repeat(73) }] },
    {
      ...base,
      rows: [
        { id: "a", title: "A" },
        { id: "a", title: "B" },
      ],
    },
    { ...base, sectionTitle: "x".repeat(25) },
    { ...base, callbackData: "invalid callback data" },
  ])
    expect(() => provider.sendList(input)).toThrow()
  expect(requests).toHaveLength(0)
})

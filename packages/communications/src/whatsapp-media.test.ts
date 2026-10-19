import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { DirectMetaWhatsAppProvider, parseMetaWhatsAppEvents } from "./whatsapp"

const bytes = new TextEncoder().encode("original attachment")
const sha256 = createHash("sha256").update(bytes).digest("base64")
const request = {
  accessToken: "test-only-bearer",
  phoneNumberId: "123456789",
  mediaId: "12345",
}
const metadata = {
  id: request.mediaId,
  url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=12345",
  mime_type: "text/plain",
  file_size: bytes.length,
  sha256,
}

function provider(input?: {
  metadata?: Record<string, unknown>
  response?: () => Response
}) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fake = Object.assign(
    async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return calls.length === 1
        ? Response.json({ ...metadata, ...input?.metadata })
        : (input?.response?.() ??
            new Response(bytes, {
              headers: {
                "content-type": "text/plain",
                "content-length": String(bytes.length),
              },
            }))
    },
    { preconnect: fetch.preconnect },
  )
  return { client: new DirectMetaWhatsAppProvider({ fetch: fake }), calls }
}

test("downloads exact bounded media with the OTP number scope and credential-safe transport", async () => {
  const { client, calls } = provider()
  const result = await client.fetchMedia({
    ...request,
    expectedMediaType: "text/plain",
    expectedSha256: sha256,
    maxBytes: 100,
  })
  expect(result.bytes).toEqual(bytes)
  expect(result.contentDigest).toBe(
    createHash("sha256").update(bytes).digest("hex"),
  )
  expect(calls).toHaveLength(2)
  expect(calls[0]?.url).toContain("phone_number_id=123456789")
  for (const call of calls) {
    expect(call.init?.redirect).toBe("error")
    expect(new Headers(call.init?.headers).get("authorization")).toBe(
      "Bearer test-only-bearer",
    )
    expect(call.init?.signal).toBeInstanceOf(AbortSignal)
  }
})

test("never forwards bearer to arbitrary, credentialed, redirecting or deceptive URLs", async () => {
  for (const url of [
    "https://example.com/private",
    "https://lookaside.fbsbx.com.evil.test/whatsapp_business/attachments/x",
    "http://lookaside.fbsbx.com/whatsapp_business/attachments/x",
    "https://user:secret@lookaside.fbsbx.com/whatsapp_business/attachments/x",
    "https://lookaside.fbsbx.com:444/whatsapp_business/attachments/x",
    "https://lookaside.fbsbx.com/other/path",
    "https://127.0.0.1/whatsapp_business/attachments/x",
  ]) {
    const { client, calls } = provider({ metadata: { url } })
    await expect(client.fetchMedia(request)).rejects.toThrow(
      "could not be retrieved safely",
    )
    expect(calls).toHaveLength(1)
  }
})

test("rejects oversized metadata and stream, MIME mismatch, short body and wrong digest", async () => {
  const cases = [
    provider({ metadata: { file_size: 101 } }),
    provider({
      response: () =>
        new Response(new Uint8Array(101), {
          headers: { "content-type": "text/plain" },
        }),
    }),
    provider({
      response: () =>
        new Response(bytes, { headers: { "content-type": "image/jpeg" } }),
    }),
    provider({
      response: () =>
        new Response(bytes.slice(1), {
          headers: { "content-type": "text/plain" },
        }),
    }),
    provider({ metadata: { sha256: "0".repeat(64) } }),
    provider({ metadata: { id: "different" } }),
  ]
  for (const { client } of cases)
    await expect(
      client.fetchMedia({ ...request, maxBytes: 100 }),
    ).rejects.toThrow("could not be retrieved safely")
})

test("aborted reads and provider diagnostics never expose the access token or private URL", async () => {
  const { client, calls } = provider()
  const controller = new AbortController()
  controller.abort(new Error("sensitive provider diagnostic"))
  await expect(
    client.fetchMedia({ ...request, signal: controller.signal }),
  ).rejects.toThrow("could not be retrieved safely")
  expect(calls).toHaveLength(0)
  const fake = Object.assign(
    async () => {
      throw Error("test-only-bearer https://private.example/secret")
    },
    { preconnect: fetch.preconnect },
  )
  await expect(
    new DirectMetaWhatsAppProvider({ fetch: fake }).fetchMedia(request),
  ).rejects.toThrow("could not be retrieved safely")
})

test("audio retains only bounded provider metadata, unknown/malformed media remains unsupported", () => {
  const events = parseMetaWhatsAppEvents({
    entry: [
      {
        changes: [
          {
            value: {
              metadata: { phone_number_id: request.phoneNumberId },
              messages: [
                {
                  id: "voice",
                  from: "2348000000000",
                  type: "audio",
                  attachmentId: "external-pointer",
                  context: { id: "quoted" },
                  audio: {
                    id: "12345",
                    mime_type: "audio/ogg; codecs=opus",
                    sha256,
                    voice: true,
                    url: "https://never.persist",
                    attachmentId: "external-pointer",
                  },
                },
                {
                  id: "malformed",
                  from: "2348000000000",
                  type: "audio",
                  audio: { mime_type: "audio/ogg" },
                },
                {
                  id: "unknown",
                  from: "2348000000000",
                  type: "video",
                  image: { id: "12345", mime_type: "image/jpeg" },
                },
              ],
            },
          },
        ],
      },
    ],
  })
  expect(events[0]).toMatchObject({
    type: "media",
    replyToMessageId: "quoted",
    media: {
      id: "12345",
      sourceType: "audio",
      mediaType: "audio/ogg; codecs=opus",
      sha256,
      voice: true,
    },
  })
  expect(JSON.stringify(events[0])).not.toContain("never.persist")
  expect(JSON.stringify(events[0])).not.toContain("external-pointer")
  expect(events[1]).toMatchObject({ type: "unsupported" })
  expect(events[2]).toMatchObject({ type: "unsupported" })
})

test("interactive review buttons carry the same opaque attempt callback as text", async () => {
  let payload: unknown
  const fake = Object.assign(
    async (_url: string | URL | Request, init?: RequestInit) => {
      payload = JSON.parse(String(init?.body))
      return Response.json({ messages: [{ id: "accepted" }] })
    },
    { preconnect: fetch.preconnect },
  )
  const client = new DirectMetaWhatsAppProvider({ fetch: fake })
  await client.sendButtons({
    ...request,
    callbackData: "attempt:test_1",
    to: "2348000000000",
    body: "Review",
    buttons: [{ id: "opaque-confirm", title: "Confirm" }],
  })
  expect(payload).toMatchObject({
    biz_opaque_callback_data: "attempt:test_1",
    type: "interactive",
  })
  expect(() =>
    client.sendButtons({
      ...request,
      callbackData: "bad value",
      to: "2348000000000",
      body: "Review",
      buttons: [{ id: "a", title: "A" }],
    }),
  ).toThrow()
})

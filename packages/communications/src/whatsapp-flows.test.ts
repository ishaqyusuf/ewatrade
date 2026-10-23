import { describe, expect, test } from "bun:test"
import {
  constants,
  createCipheriv,
  createDecipheriv,
  generateKeyPairSync,
  publicEncrypt,
  randomBytes,
} from "node:crypto"
import { DirectMetaWhatsAppProvider, parseMetaWhatsAppEvents } from "./whatsapp"
import {
  decryptWhatsAppFlowRequest,
  encryptWhatsAppFlowResponse,
  parseWhatsAppFlowResponse,
  whatsAppFlowMessage,
} from "./whatsapp-flows"

describe("WhatsApp native Flow boundary", () => {
  test("native complete responses stay structured, including malformed replies", () => {
    for (const response of [
      JSON.stringify({
        flow_token: "wa-flow_opaque-token",
        form_kind: "customer",
        form_version: "1",
        name: "Buyer",
      }),
      "not JSON",
    ]) {
      const event = parseMetaWhatsAppEvents({
        entry: [
          {
            changes: [
              {
                value: {
                  metadata: { phone_number_id: "123" },
                  messages: [
                    {
                      from: "2348000000000",
                      id: "message",
                      type: "interactive",
                      text: { body: "ignore controls" },
                      interactive: {
                        type: "nfm_reply",
                        nfm_reply: { response_json: response },
                        button_reply: { id: "YES" },
                      },
                    },
                  ],
                },
              },
            ],
          },
        ],
      })[0]
      expect(event?.kind).toBe("message")
      if (event?.kind !== "message") throw new Error("Message expected")
      expect(event.flowResponse?.status).toBe(
        response === "not JSON" ? "invalid" : "valid",
      )
      expect(event.text).toBeUndefined()
      expect(event.quickActionId).toBeUndefined()
    }
    expect(
      parseWhatsAppFlowResponse(
        '{"flow_token":"wa-flow_opaque-token","__proto__":{}}',
      ),
    ).toEqual({ status: "invalid" })
    expect(
      parseWhatsAppFlowResponse(
        JSON.stringify({
          flow_token: "wa-flow_opaque-token",
          fields: "x".repeat(33000),
        }),
      ),
    ).toEqual({ status: "invalid" })
  })

  test("launch uses native Flow protocol and rejects absent/invented config before network", async () => {
    const launch = {
      to: "2348000000000",
      body: "Review a Customer draft",
      cta: "Open form",
      flowId: "123456",
      flowToken: "wa-flow_opaque-token",
      screen: "CUSTOMER",
      data: { scope_label: "QA scope" },
    }
    const requests: Record<string, unknown>[] = []
    const provider = new DirectMetaWhatsAppProvider({
      fetch: async (_url, options) => {
        requests.push(JSON.parse(String(options?.body)))
        return Response.json({ messages: [{ id: "wamid.local-check" }] })
      },
    })
    await provider.sendFlow({
      ...launch,
      accessToken: "local-test",
      phoneNumberId: "123",
    })
    expect(requests[0]).toMatchObject({
      messaging_product: "whatsapp",
      type: "interactive",
      interactive: {
        type: "flow",
        action: {
          name: "flow",
          parameters: {
            flow_message_version: "3",
            flow_action: "navigate",
            flow_id: "123456",
            flow_token: "wa-flow_opaque-token",
            flow_action_payload: { screen: "CUSTOMER" },
          },
        },
      },
    })
    expect(() => whatsAppFlowMessage({ ...launch, flowId: "" })).toThrow()
    expect(() =>
      whatsAppFlowMessage({ ...launch, flowId: "example" }),
    ).toThrow()
    expect(requests).toHaveLength(1)
  })

  test("official RSA-OAEP/GCM exchange uses authenticated payload and inverted response IV", () => {
    const keys = generateKeyPairSync("rsa", { modulusLength: 2048 })
    const privateKey = keys.privateKey
      .export({ format: "pem", type: "pkcs8" })
      .toString()
    const key = randomBytes(16)
    const iv = randomBytes(16)
    const cipher = createCipheriv("aes-128-gcm", key, iv)
    const body = { version: "3.0", action: "ping" }
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(body)),
      cipher.final(),
      cipher.getAuthTag(),
    ])
    const envelope = {
      encrypted_aes_key: publicEncrypt(
        {
          key: keys.publicKey,
          padding: constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: "sha256",
        },
        key,
      ).toString("base64"),
      encrypted_flow_data: encrypted.toString("base64"),
      initial_vector: iv.toString("base64"),
    }
    const result = decryptWhatsAppFlowRequest(envelope, privateKey)
    expect(result.body).toEqual(body)
    const encoded = Buffer.from(
      encryptWhatsAppFlowResponse(
        { version: "3.0", data: { status: "active" } },
        result.key,
        result.iv,
      ),
      "base64",
    )
    const decipher = createDecipheriv(
      "aes-128-gcm",
      key,
      Buffer.from(iv).map((v) => v ^ 255),
    )
    decipher.setAuthTag(encoded.subarray(-16))
    expect(
      JSON.parse(
        Buffer.concat([
          decipher.update(encoded.subarray(0, -16)),
          decipher.final(),
        ]).toString(),
      ),
    ).toEqual({ version: "3.0", data: { status: "active" } })
    encrypted[0] = (encrypted[0] ?? 0) ^ 1
    expect(() =>
      decryptWhatsAppFlowRequest(
        { ...envelope, encrypted_flow_data: encrypted.toString("base64") },
        privateKey,
      ),
    ).toThrow()
    expect(() =>
      decryptWhatsAppFlowRequest(
        { ...envelope, initial_vector: "not-base64" },
        privateKey,
      ),
    ).toThrow()
  })
})

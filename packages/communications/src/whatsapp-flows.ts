import {
  constants,
  createCipheriv,
  createDecipheriv,
  privateDecrypt,
} from "node:crypto"

export type WhatsAppFlowSendInput = {
  body: string
  cta: string
  flowId: string
  flowToken: string
  screen: string
  data?: Record<string, unknown>
  callbackData?: string
  to: string
}

export type WhatsAppFlowResponse =
  | { status: "valid"; flowToken: string; data: Record<string, unknown> }
  | { status: "invalid" }

const MAX_FLOW_BYTES = 32_768
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}
function boundedJson(value: unknown, depth = 0): boolean {
  if (depth > 5) return false
  if (value === null || typeof value === "boolean") return true
  if (typeof value === "string") return value.length <= 4096
  if (typeof value === "number") return Number.isFinite(value)
  if (Array.isArray(value))
    return value.length <= 100 && value.every((v) => boundedJson(v, depth + 1))
  if (!record(value)) return false
  const entries = Object.entries(value)
  return (
    entries.length <= 64 &&
    entries.every(
      ([key, v]) =>
        !["__proto__", "prototype", "constructor"].includes(key) &&
        key.length <= 128 &&
        boundedJson(v, depth + 1),
    )
  )
}

/** Always intercepted as structured control input, including malformed replies. */
export function parseWhatsAppFlowResponse(
  value: unknown,
): WhatsAppFlowResponse {
  if (typeof value !== "string" || Buffer.byteLength(value) > MAX_FLOW_BYTES)
    return { status: "invalid" }
  try {
    const parsed: unknown = JSON.parse(value)
    if (
      !record(parsed) ||
      !boundedJson(parsed) ||
      typeof parsed.flow_token !== "string" ||
      !/^[A-Za-z0-9:_-]{16,512}$/.test(parsed.flow_token)
    )
      return { status: "invalid" }
    const { flow_token, ...data } = parsed
    return { status: "valid", flowToken: flow_token, data }
  } catch {
    return { status: "invalid" }
  }
}

/** No default IDs: callers must supply their configured, published Meta Flow. */
export function whatsAppFlowMessage(input: WhatsAppFlowSendInput) {
  if (
    !/^\d{1,64}$/.test(input.flowId) ||
    !/^[A-Za-z0-9:_-]{16,512}$/.test(input.flowToken) ||
    !/^[A-Z][A-Z0-9_]{0,63}$/.test(input.screen) ||
    !input.body.trim() ||
    input.body.length > 1024 ||
    !input.cta.trim() ||
    input.cta.length > 20 ||
    !boundedJson(input.data ?? {}) ||
    Buffer.byteLength(JSON.stringify(input.data ?? {})) > MAX_FLOW_BYTES ||
    (input.callbackData !== undefined &&
      !/^[A-Za-z0-9:_-]{1,128}$/.test(input.callbackData))
  )
    throw new Error("Invalid WhatsApp Flow launch.")
  return {
    ...(input.callbackData
      ? { biz_opaque_callback_data: input.callbackData }
      : {}),
    to: input.to,
    type: "interactive",
    interactive: {
      type: "flow",
      body: { text: input.body },
      action: {
        name: "flow",
        parameters: {
          flow_message_version: "3",
          flow_token: input.flowToken,
          flow_id: input.flowId,
          flow_cta: input.cta,
          flow_action: "navigate",
          flow_action_payload: { screen: input.screen, data: input.data ?? {} },
        },
      },
    },
  }
}

export class WhatsAppFlowEncryptionError extends Error {
  readonly statusCode = 421
  constructor() {
    super("Unable to decrypt WhatsApp Flow request.")
    this.name = "WhatsAppFlowEncryptionError"
  }
}
function base64(value: unknown, min: number, max: number) {
  if (
    typeof value !== "string" ||
    value.length > Math.ceil(max / 3) * 4 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  )
    throw new WhatsAppFlowEncryptionError()
  const bytes = Buffer.from(value, "base64")
  if (bytes.length < min || bytes.length > max)
    throw new WhatsAppFlowEncryptionError()
  return bytes
}

/** Protocol from Meta's WhatsApp-Flows-Tools basic Node endpoint. No I/O. */
export function decryptWhatsAppFlowRequest(
  envelope: unknown,
  privateKey: string,
) {
  try {
    if (
      !record(envelope) ||
      Object.keys(envelope).some(
        (key) =>
          ![
            "encrypted_aes_key",
            "encrypted_flow_data",
            "initial_vector",
          ].includes(key),
      )
    )
      throw new WhatsAppFlowEncryptionError()
    const key = privateDecrypt(
      {
        key: privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      base64(envelope.encrypted_aes_key, 256, 1024),
    )
    if (key.length !== 16) throw new WhatsAppFlowEncryptionError()
    const iv = base64(envelope.initial_vector, 12, 16)
    const encrypted = base64(
      envelope.encrypted_flow_data,
      17,
      MAX_FLOW_BYTES + 16,
    )
    const decipher = createDecipheriv("aes-128-gcm", key, iv)
    decipher.setAuthTag(encrypted.subarray(-16))
    const bytes = Buffer.concat([
      decipher.update(encrypted.subarray(0, -16)),
      decipher.final(),
    ])
    const body: unknown = JSON.parse(bytes.toString("utf8"))
    if (!record(body) || !boundedJson(body))
      throw new WhatsAppFlowEncryptionError()
    return { body, key, iv }
  } catch {
    throw new WhatsAppFlowEncryptionError()
  }
}

export function encryptWhatsAppFlowResponse(
  response: Record<string, unknown>,
  key: Uint8Array,
  iv: Uint8Array,
) {
  if (
    key.length !== 16 ||
    ![12, 16].includes(iv.length) ||
    !boundedJson(response) ||
    Buffer.byteLength(JSON.stringify(response)) > MAX_FLOW_BYTES
  )
    throw new Error("Invalid WhatsApp Flow response.")
  const invertedIv = Buffer.from(iv).map((byte) => byte ^ 0xff)
  const cipher = createCipheriv("aes-128-gcm", key, invertedIv)
  return Buffer.concat([
    cipher.update(JSON.stringify(response), "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64")
}

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"
import { presentWhatsAppMessage } from "@ewatrade/assistant/channels/presentation"
import { type RedisClientType, createClient } from "redis"

import { SERVICE_COMMERCE_CUSTOMER_ACTION_TEMPLATE_KEY } from "./service-commerce-action-capability"
import {
  type WhatsAppFlowResponse,
  type WhatsAppFlowSendInput,
  parseWhatsAppFlowResponse,
  whatsAppFlowMessage,
} from "./whatsapp-flows"
import { type WhatsAppMediaRequest, fetchWhatsAppMedia } from "./whatsapp-media"

const META_GRAPH_URL = "https://graph.facebook.com/v21.0"
// Native typing uses the current supported transport separately; existing sends/OTP stay on v21.
const META_TYPING_GRAPH_URL = "https://graph.facebook.com/v25.0"
export const WHATSAPP_TYPING_REQUEST_MS = 1500
export function isWhatsAppInboundMessageId(value: string) {
  return /^wamid\.[A-Za-z0-9+/=_-]{1,506}$/.test(value)
}
export const WHATSAPP_SESSION_WINDOW_MS = 24 * 60 * 60_000

export type WhatsAppCredentials = {
  accessToken: string
  phoneNumberId: string
}

export type NormalizedWhatsAppMessageEvent = {
  externalCustomerId: string
  kind: "message"
  flowResponse?: WhatsAppFlowResponse
  media?: {
    id: string
    mediaType: string
    sourceType?: "image" | "document" | "audio"
    fileName?: string
    sha256?: string
    voice?: boolean
  }
  messageId: string
  phoneNumberId: string
  quickActionId?: string
  replyToMessageId?: string
  text?: string
  timestamp?: string
  type: "interactive" | "media" | "text" | "unsupported"
}

export type NormalizedWhatsAppStatusEvent = {
  failureCode?: string
  callbackData?: string
  recipientId?: string
  kind: "status"
  messageId: string
  phoneNumberId: string
  pricing?: {
    billable?: boolean
    messageCategory?: string
    recipientMarket?: string
  }
  status: "delivered" | "failed" | "read" | "sent"
  timestamp?: string
}

export type NormalizedWhatsAppEvent =
  | NormalizedWhatsAppMessageEvent
  | NormalizedWhatsAppStatusEvent

export type WhatsAppButton = { id: string; title: string }

export interface WhatsAppProvider {
  readonly key: string
  sendFlow?(
    input: WhatsAppCredentials & WhatsAppFlowSendInput,
  ): Promise<{ messageId: string }>
  /** Read receipt + transient native typing; no outbound message is created. */
  sendTyping?(
    input: WhatsAppCredentials & { messageId: string },
  ): Promise<WhatsAppTypingAccepted>
  discover(input: { accessToken: string }): Promise<
    Array<{
      businessDisplayName?: string
      displayNumber: string
      phoneNumberId: string
      wabaId: string
    }>
  >
  exchangeEmbeddedSignupCode(input: {
    appId: string
    appSecret: string
    code: string
    redirectUri: string
  }): Promise<{ accessToken: string }>
  fetchMedia(input: WhatsAppMediaRequest): Promise<{
    bytes: Uint8Array
    mediaType: string
    contentDigest?: string
    sizeBytes?: number
  }>
  sendButtons(
    input: WhatsAppCredentials & {
      callbackData?: string
      body: string
      buttons: WhatsAppButton[]
      to: string
    },
  ): Promise<{ messageId: string }>
  sendTemplate(
    input: WhatsAppCredentials & {
      components?: Array<Record<string, unknown>>
      language: string
      templateName: string
      to: string
    },
  ): Promise<{ messageId: string }>
  sendText(
    input: WhatsAppCredentials & {
      callbackData?: string
      body: string
      to: string
    },
  ): Promise<{ messageId: string }>
  testConnection(
    input: WhatsAppCredentials & { testRecipient?: string; wabaId: string },
  ): Promise<{
    businessVerified: boolean
    displayNumber: string
    numberVerified: boolean
    outboundVerified: boolean
    webhookSubscribed: boolean
    templatesReady: boolean
    templateConfiguration: Record<string, string>
  }>
}

async function json(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >
  if (!response.ok) {
    throw new Error(`Meta WhatsApp request failed (${response.status}).`)
  }
  return payload
}

function messageId(payload: Record<string, unknown>) {
  const messages = Array.isArray(payload.messages) ? payload.messages : []
  const first = messages[0]
  if (!first || typeof first !== "object" || !("id" in first)) {
    throw new Error("Meta WhatsApp returned no message identity.")
  }
  const id = (first as { id: unknown }).id
  if (
    typeof id !== "string" ||
    !id ||
    id.length > 512 ||
    [...id].some(
      (point) =>
        (point.codePointAt(0) ?? 0) <= 32 ||
        point === String.fromCharCode(127) ||
        /\s/u.test(point),
    )
  )
    throw new Error("Meta WhatsApp returned an invalid message identity.")
  return id
}

function providerFact(value: unknown) {
  if (typeof value !== "string") return undefined
  const normalized = value.trim().toLowerCase()
  return /^[a-z0-9][a-z0-9_.-]{0,79}$/.test(normalized) ? normalized : undefined
}

export type WhatsAppProviderSendOutcome = "DEFINITE_FAILURE" | "OUTCOME_UNKNOWN"

export class WhatsAppProviderSendError extends Error {
  constructor(
    readonly code: "PROVIDER_REJECTED" | "PROVIDER_RESULT_INVALID",
    readonly outcome: WhatsAppProviderSendOutcome,
  ) {
    super(
      outcome === "DEFINITE_FAILURE"
        ? "WhatsApp rejected the outbound message."
        : "The WhatsApp send outcome is unknown.",
    )
    this.name = "WhatsAppProviderSendError"
  }
}

function classifyWhatsAppSendStatus(
  status: number,
): WhatsAppProviderSendOutcome {
  if (status >= 400 && status < 500 && ![408, 409, 425, 429].includes(status)) {
    return "DEFINITE_FAILURE"
  }
  return "OUTCOME_UNKNOWN"
}

export type WhatsAppTypingAccepted = {
  outcome: "accepted"
  httpStatus: number
}
export type WhatsAppTypingFailureReason =
  | "timeout"
  | "network"
  | "rejected"
  | "invalid_success"

function typingNumericCode(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined
}

/** Only allowlisted numeric facts cross the transport error boundary. */
export class WhatsAppTypingError extends Error {
  readonly httpStatus?: number
  readonly metaCode?: number
  readonly metaSubcode?: number

  constructor(
    readonly reason: WhatsAppTypingFailureReason,
    facts: {
      httpStatus?: number
      metaCode?: number
      metaSubcode?: number
    } = {},
  ) {
    super("WhatsApp typing is unavailable.")
    this.name = "WhatsAppTypingError"
    this.httpStatus =
      Number.isInteger(facts.httpStatus) &&
      facts.httpStatus !== undefined &&
      facts.httpStatus >= 100 &&
      facts.httpStatus <= 599
        ? facts.httpStatus
        : undefined
    this.metaCode = typingNumericCode(facts.metaCode)
    this.metaSubcode = typingNumericCode(facts.metaSubcode)
  }
}

const WHATSAPP_TYPING_RESPONSE_MAX_BYTES = 4096

/** Discard oversized/malformed bodies; never retain the provider's message or trace. */
async function readTypingResponse(response: Response): Promise<unknown> {
  if (!response.body) return null
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ""
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > WHATSAPP_TYPING_RESPONSE_MAX_BYTES) {
        void reader.cancel().catch(() => {})
        return null
      }
      text += decoder.decode(next.value, { stream: true })
    }
    text += decoder.decode()
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  } finally {
    reader.releaseLock()
  }
}

function typingTransportError(error: unknown, signal: AbortSignal) {
  return new WhatsAppTypingError(
    signal.aborted || (error instanceof Error && error.name === "TimeoutError")
      ? "timeout"
      : "network",
  )
}

export class DirectMetaWhatsAppProvider implements WhatsAppProvider {
  readonly key = "meta-cloud-api"
  readonly #fetch: typeof fetch

  constructor(input: { fetch?: typeof fetch } = {}) {
    this.#fetch = input.fetch ?? fetch
  }

  async #send(credentials: WhatsAppCredentials, body: Record<string, unknown>) {
    const response = await this.#fetch(
      `${META_GRAPH_URL}/${credentials.phoneNumberId}/messages`,
      {
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          ...body,
        }),
        headers: {
          Authorization: `Bearer ${credentials.accessToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    )
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >
    if (!response.ok) {
      throw new WhatsAppProviderSendError(
        "PROVIDER_REJECTED",
        classifyWhatsAppSendStatus(response.status),
      )
    }
    try {
      return { messageId: messageId(payload) }
    } catch {
      throw new WhatsAppProviderSendError(
        "PROVIDER_RESULT_INVALID",
        "OUTCOME_UNKNOWN",
      )
    }
  }

  /** Best-effort caller; never changes the existing message/OTP transport. */
  async sendTyping(
    input: WhatsAppCredentials & { messageId: string },
  ): Promise<WhatsAppTypingAccepted> {
    if (
      !/^\d+$/.test(input.phoneNumberId) ||
      !isWhatsAppInboundMessageId(input.messageId)
    )
      throw new Error("WhatsApp typing source is invalid.")
    const signal = AbortSignal.timeout(WHATSAPP_TYPING_REQUEST_MS)
    let response: Response
    try {
      response = await this.#fetch(
        `${META_TYPING_GRAPH_URL}/${input.phoneNumberId}/messages`,
        {
          method: "POST",
          redirect: "error",
          signal,
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            status: "read",
            message_id: input.messageId,
            typing_indicator: { type: "text" },
          }),
        },
      )
    } catch (error) {
      throw typingTransportError(error, signal)
    }
    let result: unknown
    try {
      result = await readTypingResponse(response)
    } catch (error) {
      if (!response.ok)
        throw new WhatsAppTypingError("rejected", {
          httpStatus: response.status,
        })
      throw typingTransportError(error, signal)
    }
    // No provider text, trace, credentials or raw error/cause leaves this boundary.
    if (!response.ok) {
      const detail =
        result && typeof result === "object" && "error" in result
          ? result.error
          : null
      throw new WhatsAppTypingError("rejected", {
        httpStatus: response.status,
        metaCode:
          detail && typeof detail === "object" && "code" in detail
            ? typingNumericCode(detail.code)
            : undefined,
        metaSubcode:
          detail && typeof detail === "object" && "error_subcode" in detail
            ? typingNumericCode(detail.error_subcode)
            : undefined,
      })
    }
    if (
      !result ||
      typeof result !== "object" ||
      !("success" in result) ||
      result.success !== true
    )
      throw new WhatsAppTypingError("invalid_success", {
        httpStatus: response.status,
      })
    return { outcome: "accepted", httpStatus: response.status }
  }

  async sendText(
    input: WhatsAppCredentials & {
      body: string
      to: string
      callbackData?: string
    },
  ) {
    if (
      input.callbackData !== undefined &&
      !/^[a-zA-Z0-9:_-]{1,128}$/.test(input.callbackData)
    )
      throw new WhatsAppProviderSendError(
        "PROVIDER_REJECTED",
        "DEFINITE_FAILURE",
      )
    return this.#send(input, {
      ...(input.callbackData
        ? { biz_opaque_callback_data: input.callbackData }
        : {}),
      text: { body: input.body, preview_url: false },
      to: input.to,
      type: "text",
    })
  }

  sendFlow(input: WhatsAppCredentials & WhatsAppFlowSendInput) {
    let body: Record<string, unknown>
    try {
      body = whatsAppFlowMessage(input)
    } catch {
      throw new WhatsAppProviderSendError(
        "PROVIDER_REJECTED",
        "DEFINITE_FAILURE",
      )
    }
    return this.#send(input, body)
  }

  sendButtons(
    input: WhatsAppCredentials & {
      callbackData?: string
      body: string
      buttons: WhatsAppButton[]
      to: string
    },
  ) {
    if (
      input.callbackData !== undefined &&
      !/^[a-zA-Z0-9:_-]{1,128}$/.test(input.callbackData)
    )
      throw new WhatsAppProviderSendError(
        "PROVIDER_REJECTED",
        "DEFINITE_FAILURE",
      )
    if (input.buttons.length < 1 || input.buttons.length > 3) {
      throw new Error("WhatsApp supports one to three reply buttons.")
    }
    return this.#send(input, {
      ...(input.callbackData
        ? { biz_opaque_callback_data: input.callbackData }
        : {}),
      interactive: {
        action: {
          buttons: input.buttons.map((button) => ({
            reply: button,
            type: "reply",
          })),
        },
        body: { text: input.body },
        type: "button",
      },
      to: input.to,
      type: "interactive",
    })
  }

  sendTemplate(
    input: WhatsAppCredentials & {
      components?: Array<Record<string, unknown>>
      language: string
      templateName: string
      to: string
    },
  ) {
    return this.#send(input, {
      template: {
        components: input.components,
        language: { code: input.language },
        name: input.templateName,
      },
      to: input.to,
      type: "template",
    })
  }

  async fetchMedia(input: WhatsAppMediaRequest) {
    return fetchWhatsAppMedia(input, this.#fetch)
  }

  async testConnection(
    input: WhatsAppCredentials & { testRecipient?: string; wabaId: string },
  ) {
    const phone = await json(
      await this.#fetch(
        `${META_GRAPH_URL}/${input.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,
        { headers: { Authorization: `Bearer ${input.accessToken}` } },
      ),
    )
    const outboundVerified = input.testRecipient
      ? Boolean(
          await this.sendText({
            ...input,
            body: presentWhatsAppMessage(
              "EwaTrade connection test.\n\nNo customer information is included.",
              { family: "notice" },
            ),
            to: input.testRecipient,
          }),
        )
      : false
    const subscriptions = await json(
      await this.#fetch(`${META_GRAPH_URL}/${input.wabaId}/subscribed_apps`, {
        headers: { Authorization: `Bearer ${input.accessToken}` },
      }),
    )
    const templates = await json(
      await this.#fetch(
        `${META_GRAPH_URL}/${input.wabaId}/message_templates?fields=name,status,language`,
        { headers: { Authorization: `Bearer ${input.accessToken}` } },
      ),
    )
    const approved = new Set(
      (Array.isArray(templates.data) ? templates.data : [])
        .filter((template): template is Record<string, unknown> =>
          Boolean(template && typeof template === "object"),
        )
        .filter((template) => template.status === "APPROVED")
        .map((template) => String(template.name ?? "")),
    )
    const requiredTemplates = {
      clarification: "ewatrade_prescription_clarification",
      delivery_failed: "ewatrade_delivery_failed",
      delivery_progress: "ewatrade_delivery_progress",
      expiry: "ewatrade_prescription_expiry",
      payment_receipt: "ewatrade_payment_receipt",
      pickup_ready: "ewatrade_pickup_ready",
      quote_ready: "ewatrade_prescription_quote_ready",
    }
    const optionalTemplates = {
      customer_actions: SERVICE_COMMERCE_CUSTOMER_ACTION_TEMPLATE_KEY,
    }
    const expectedTemplates = { ...requiredTemplates, ...optionalTemplates }
    const templateConfiguration = Object.fromEntries(
      Object.entries(expectedTemplates).filter(([, name]) =>
        approved.has(name),
      ),
    )
    return {
      businessVerified: Boolean(phone.verified_name),
      displayNumber: String(phone.display_phone_number ?? ""),
      numberVerified: Boolean(phone.display_phone_number),
      outboundVerified,
      webhookSubscribed:
        Array.isArray(subscriptions.data) && subscriptions.data.length > 0,
      templatesReady: Object.values(requiredTemplates).every((name) =>
        approved.has(name),
      ),
      templateConfiguration: { ...templateConfiguration, language: "en" },
    }
  }

  async exchangeEmbeddedSignupCode(input: {
    appId: string
    appSecret: string
    code: string
    redirectUri: string
  }) {
    const url = new URL(`${META_GRAPH_URL}/oauth/access_token`)
    url.searchParams.set("client_id", input.appId)
    url.searchParams.set("client_secret", input.appSecret)
    url.searchParams.set("code", input.code)
    url.searchParams.set("redirect_uri", input.redirectUri)
    const payload = await json(await this.#fetch(url))
    const accessToken = String(payload.access_token ?? "")
    if (!accessToken) throw new Error("Meta returned no access token.")
    return { accessToken }
  }

  async discover(input: { accessToken: string }) {
    const businesses = await json(
      await this.#fetch(`${META_GRAPH_URL}/me/businesses`, {
        headers: { Authorization: `Bearer ${input.accessToken}` },
      }),
    )
    const results: Array<{
      businessDisplayName?: string
      displayNumber: string
      phoneNumberId: string
      wabaId: string
    }> = []
    for (const business of Array.isArray(businesses.data)
      ? businesses.data
      : []) {
      if (!business || typeof business !== "object") continue
      const businessId = String((business as { id?: unknown }).id ?? "")
      if (!businessId) continue
      const accounts = await json(
        await this.#fetch(
          `${META_GRAPH_URL}/${businessId}/owned_whatsapp_business_accounts`,
          { headers: { Authorization: `Bearer ${input.accessToken}` } },
        ),
      )
      for (const account of Array.isArray(accounts.data) ? accounts.data : []) {
        if (!account || typeof account !== "object") continue
        const wabaId = String((account as { id?: unknown }).id ?? "")
        const numbers = await json(
          await this.#fetch(`${META_GRAPH_URL}/${wabaId}/phone_numbers`, {
            headers: { Authorization: `Bearer ${input.accessToken}` },
          }),
        )
        for (const number of Array.isArray(numbers.data) ? numbers.data : []) {
          if (!number || typeof number !== "object") continue
          const record = number as Record<string, unknown>
          results.push({
            businessDisplayName:
              String(record.verified_name ?? "") || undefined,
            displayNumber: String(record.display_phone_number ?? ""),
            phoneNumberId: String(record.id ?? ""),
            wabaId,
          })
        }
      }
    }
    return results.filter((result) => result.phoneNumberId && result.wabaId)
  }
}

export function verifyMetaWebhookSignature(input: {
  appSecret: string
  body: string
  signature: string | null
}) {
  if (!input.signature?.startsWith("sha256=")) return false
  const expected = `sha256=${createHmac("sha256", input.appSecret)
    .update(input.body)
    .digest("hex")}`
  const expectedBytes = Buffer.from(expected)
  const actualBytes = Buffer.from(input.signature)
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  )
}

export function verifyMetaWebhookChallenge(input: {
  challenge: string | null
  mode: string | null
  token: string | null
  verifyToken: string
}) {
  return input.mode === "subscribe" && input.token === input.verifyToken
    ? input.challenge
    : null
}

export function parseMetaWhatsAppEvents(value: unknown) {
  const events: NormalizedWhatsAppEvent[] = []
  if (!value || typeof value !== "object") return events
  const entries = Array.isArray((value as { entry?: unknown }).entry)
    ? ((value as { entry: unknown[] }).entry ?? [])
    : []
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue
    const changes = Array.isArray((entry as { changes?: unknown }).changes)
      ? ((entry as { changes: unknown[] }).changes ?? [])
      : []
    for (const change of changes) {
      if (!change || typeof change !== "object") continue
      const payload = (change as { value?: unknown }).value
      if (!payload || typeof payload !== "object") continue
      const record = payload as Record<string, unknown>
      const metadata =
        record.metadata && typeof record.metadata === "object"
          ? (record.metadata as Record<string, unknown>)
          : {}
      const phoneNumberId = String(metadata.phone_number_id ?? "")
      const messages = Array.isArray(record.messages) ? record.messages : []
      for (const message of messages) {
        if (!message || typeof message !== "object") continue
        const item = message as Record<string, unknown>
        const type = String(item.type ?? "")
        const text =
          item.text && typeof item.text === "object"
            ? String((item.text as Record<string, unknown>).body ?? "")
            : undefined
        const interactive =
          item.interactive && typeof item.interactive === "object"
            ? (item.interactive as Record<string, unknown>)
            : {}
        const button =
          interactive.button_reply &&
          typeof interactive.button_reply === "object"
            ? (interactive.button_reply as Record<string, unknown>)
            : {}
        const nativeFlow =
          interactive.type === "nfm_reply" ||
          interactive.nfm_reply !== undefined
        const flowReply =
          nativeFlow &&
          interactive.nfm_reply &&
          typeof interactive.nfm_reply === "object"
            ? (interactive.nfm_reply as Record<string, unknown>)
            : {}
        const replyContext =
          item.context && typeof item.context === "object"
            ? (item.context as Record<string, unknown>)
            : {}
        const list =
          interactive.list_reply && typeof interactive.list_reply === "object"
            ? (interactive.list_reply as Record<string, unknown>)
            : {}
        const sourceType =
          type === "image" || type === "document" || type === "audio"
            ? type
            : undefined
        const candidate = sourceType ? item[sourceType] : undefined
        const mediaRecord =
          candidate &&
          typeof candidate === "object" &&
          !Array.isArray(candidate)
            ? (candidate as Record<string, unknown>)
            : null
        const validMedia =
          mediaRecord &&
          typeof mediaRecord.id === "string" &&
          mediaRecord.id.length > 0 &&
          mediaRecord.id.length <= 256 &&
          typeof mediaRecord.mime_type === "string" &&
          mediaRecord.mime_type.length > 0 &&
          mediaRecord.mime_type.length <= 128
            ? mediaRecord
            : null
        events.push({
          externalCustomerId: String(item.from ?? ""),
          kind: "message",
          ...(nativeFlow
            ? {
                flowResponse: parseWhatsAppFlowResponse(
                  flowReply.response_json,
                ),
              }
            : {}),
          media: validMedia
            ? {
                id: String(validMedia.id),
                mediaType: String(validMedia.mime_type),
                sourceType,
                ...(typeof validMedia.filename === "string"
                  ? { fileName: validMedia.filename.slice(0, 120) }
                  : {}),
                ...(typeof validMedia.sha256 === "string"
                  ? { sha256: validMedia.sha256.slice(0, 128) }
                  : {}),
                ...(sourceType === "audio" &&
                typeof validMedia.voice === "boolean"
                  ? { voice: validMedia.voice }
                  : {}),
              }
            : undefined,
          messageId: String(item.id ?? ""),
          phoneNumberId,
          quickActionId: nativeFlow
            ? undefined
            : String(button.id ?? list.id ?? "") || undefined,
          replyToMessageId: String(replyContext.id ?? "") || undefined,
          text: nativeFlow
            ? undefined
            : (text ??
              (validMedia?.caption !== undefined
                ? String(validMedia.caption)
                : undefined)),
          timestamp: String(item.timestamp ?? "") || undefined,
          type:
            type === "text"
              ? "text"
              : type === "interactive"
                ? "interactive"
                : validMedia
                  ? "media"
                  : "unsupported",
        })
      }
      const statuses = Array.isArray(record.statuses) ? record.statuses : []
      for (const status of statuses) {
        if (!status || typeof status !== "object") continue
        const item = status as Record<string, unknown>
        const statusValue = String(item.status ?? "")
        if (
          !(["delivered", "failed", "read", "sent"] as const).includes(
            statusValue as "delivered" | "failed" | "read" | "sent",
          )
        ) {
          continue
        }
        const errors = Array.isArray(item.errors) ? item.errors : []
        const firstError = errors[0]
        const pricing =
          item.pricing && typeof item.pricing === "object"
            ? (item.pricing as Record<string, unknown>)
            : null
        // Meta status callbacks do not include a monetary amount. Keep only
        // explicit, non-recipient pricing facts; a phone number is never used
        // to infer or persist a reporting market.
        const recipientMarket = pricing
          ? providerFact(
              pricing.recipient_market ??
                pricing.recipientMarket ??
                pricing.recipient_country ??
                pricing.recipientCountry ??
                pricing.market,
            )
          : undefined
        const normalizedPricing = pricing
          ? {
              billable:
                typeof pricing.billable === "boolean"
                  ? pricing.billable
                  : undefined,
              messageCategory: providerFact(pricing.category),
              recipientMarket,
            }
          : undefined
        events.push({
          failureCode:
            firstError && typeof firstError === "object"
              ? String((firstError as Record<string, unknown>).code ?? "") ||
                "provider_delivery_failed"
              : undefined,
          ...(typeof item.biz_opaque_callback_data === "string" &&
          /^[a-zA-Z0-9:_-]{1,128}$/.test(item.biz_opaque_callback_data)
            ? { callbackData: item.biz_opaque_callback_data }
            : {}),
          ...(typeof item.recipient_id === "string" &&
          /^[1-9]\d{7,14}$/.test(item.recipient_id)
            ? { recipientId: item.recipient_id }
            : {}),
          kind: "status",
          messageId: String(item.id ?? ""),
          phoneNumberId,
          ...(normalizedPricing &&
          Object.values(normalizedPricing).some((value) => value !== undefined)
            ? { pricing: normalizedPricing }
            : {}),
          status: statusValue as "delivered" | "failed" | "read" | "sent",
          timestamp: String(item.timestamp ?? "") || undefined,
        })
      }
    }
  }
  return events.filter(
    (event) =>
      event.phoneNumberId &&
      event.messageId &&
      (event.kind === "status" || event.externalCustomerId),
  )
}

export function extractWhatsAppChannelContext(text?: string) {
  const match = text?.match(
    /(?:^|\s)(?:ewastore|rxstore):([A-Za-z0-9_-]{16,128})(?:\s|$)/,
  )
  return match?.[1] ?? null
}

export function isWithinWhatsAppSessionWindow(
  lastSeenAt: Date | null,
  now = new Date(),
) {
  return Boolean(
    lastSeenAt &&
      now.getTime() - lastSeenAt.getTime() >= 0 &&
      now.getTime() - lastSeenAt.getTime() < WHATSAPP_SESSION_WINDOW_MS,
  )
}

export type ConversationState = {
  contextId: string
  intakeKind?: "commerce_inquiry"
  lastSeenAt: string
  requestId?: string
  storeId: string
  tenantId: string
}

export function extractCustomerChannelIntakeSelection(text?: string | null) {
  if (!text) return null
  return /(?:^|\s)intent:product(?:\s|$)/i.test(text)
    ? ("commerce_inquiry" as const)
    : null
}

export interface ConversationStateStore {
  get(input: {
    connectionId: string
    contextId: string
    externalCustomerId: string
  }): Promise<ConversationState | null>
  set(input: {
    connectionId: string
    contextId: string
    externalCustomerId: string
    state: ConversationState
  }): Promise<void>
  getRoutingSelection(input: {
    connectionId: string
    externalCustomerId: string
  }): Promise<{ storeId: string; tenantId: string } | null>
  setRoutingSelection(input: {
    connectionId: string
    externalCustomerId: string
    storeId: string
    tenantId: string
  }): Promise<void>
}

export function conversationStateKey(input: {
  connectionId: string
  contextId: string
  externalCustomerId: string
}) {
  return `rxwa:${input.connectionId}:${input.externalCustomerId}:${input.contextId}`
}

export function prescriptionConversationContextId(storeId: string) {
  if (!storeId.trim()) {
    throw new Error("Store id is required for conversation state.")
  }
  return `prescription-store:${storeId}`
}

export function customerChannelConversationContextId(storeId: string) {
  if (!storeId.trim()) {
    throw new Error("Store id is required for conversation state.")
  }
  return `customer-channel-store:${storeId}`
}

function conversationRoutingSelectionKey(input: {
  connectionId: string
  externalCustomerId: string
}) {
  return `rxwa-route:${input.connectionId}:${input.externalCustomerId}`
}

export class RedisConversationStateStore implements ConversationStateStore {
  readonly #client: RedisClientType
  readonly #ready: Promise<unknown>
  readonly #ttlSeconds: number

  constructor(input: { redisUrl: string; ttlSeconds?: number }) {
    this.#client = createClient({ url: input.redisUrl })
    this.#ready = this.#client.connect()
    this.#ttlSeconds = input.ttlSeconds ?? 24 * 60 * 60
  }

  async get(input: {
    connectionId: string
    contextId: string
    externalCustomerId: string
  }) {
    await this.#ready
    const raw = await this.#client.get(conversationStateKey(input))
    return raw ? (JSON.parse(raw) as ConversationState) : null
  }

  async set(input: {
    connectionId: string
    contextId: string
    externalCustomerId: string
    state: ConversationState
  }) {
    await this.#ready
    await this.#client.setEx(
      conversationStateKey(input),
      this.#ttlSeconds,
      JSON.stringify(input.state),
    )
  }

  async getRoutingSelection(input: {
    connectionId: string
    externalCustomerId: string
  }) {
    await this.#ready
    const raw = await this.#client.get(conversationRoutingSelectionKey(input))
    return raw
      ? (JSON.parse(raw) as { storeId: string; tenantId: string })
      : null
  }

  async setRoutingSelection(input: {
    connectionId: string
    externalCustomerId: string
    storeId: string
    tenantId: string
  }) {
    await this.#ready
    await this.#client.setEx(
      conversationRoutingSelectionKey(input),
      this.#ttlSeconds,
      JSON.stringify({ storeId: input.storeId, tenantId: input.tenantId }),
    )
  }
}

export class InMemoryConversationStateStore implements ConversationStateStore {
  readonly #values = new Map<string, ConversationState>()
  readonly #routingSelections = new Map<
    string,
    { storeId: string; tenantId: string }
  >()
  async get(input: {
    connectionId: string
    contextId: string
    externalCustomerId: string
  }) {
    return this.#values.get(conversationStateKey(input)) ?? null
  }
  async set(input: {
    connectionId: string
    contextId: string
    externalCustomerId: string
    state: ConversationState
  }) {
    this.#values.set(conversationStateKey(input), input.state)
  }
  async getRoutingSelection(input: {
    connectionId: string
    externalCustomerId: string
  }) {
    return (
      this.#routingSelections.get(conversationRoutingSelectionKey(input)) ??
      null
    )
  }
  async setRoutingSelection(input: {
    connectionId: string
    externalCustomerId: string
    storeId: string
    tenantId: string
  }) {
    this.#routingSelections.set(conversationRoutingSelectionKey(input), {
      storeId: input.storeId,
      tenantId: input.tenantId,
    })
  }
}

export function getConfiguredConversationStateStore(): ConversationStateStore {
  const redisUrl = process.env.REDIS_URL?.trim()
  if (redisUrl) return new RedisConversationStateStore({ redisUrl })
  if (process.env.NODE_ENV !== "production") {
    return new InMemoryConversationStateStore()
  }
  throw new Error(
    "Redis is required for production WhatsApp conversation state.",
  )
}

function credentialKey() {
  const configured =
    process.env.COMMUNICATIONS_CREDENTIAL_ENCRYPTION_KEY?.trim()
  if (configured) {
    const bytes = Buffer.from(configured, "base64")
    if (bytes.length !== 32) {
      throw new Error("Communications credential key must be 32 bytes.")
    }
    return bytes
  }
  if (process.env.NODE_ENV !== "production") {
    return createHash("sha256").update("ewatrade-local-communications").digest()
  }
  throw new Error(
    "Communications credential encryption is not configured; setup fails closed.",
  )
}

export function protectCommunicationsCredential(accessToken: string) {
  if (!accessToken.trim()) throw new Error("An access token is required.")
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", credentialKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(accessToken, "utf8"),
    cipher.final(),
  ])
  return [
    "enc",
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":")
}

export function resolveCommunicationsCredential(reference: string) {
  const [prefix, version, iv, tag, encrypted] = reference.split(":")
  if (prefix !== "enc" || version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Communications credential reference is invalid.")
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    credentialKey(),
    Buffer.from(iv, "base64url"),
  )
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}

export function protectCommunicationsRecipient(value: string) {
  const normalized = value.trim()
  if (!normalized || normalized.length > 320) {
    throw new Error("A bounded Communications recipient is required.")
  }
  return protectCommunicationsCredential(normalized)
}

export function resolveCommunicationsRecipient(reference: string) {
  const value = resolveCommunicationsCredential(reference).trim()
  if (!value || value.length > 320) {
    throw new Error("Communications recipient reference is invalid.")
  }
  return value
}

export function protectCommunicationsEndpoint(value: string) {
  const normalized = value.trim()
  if (!normalized || normalized.length > 4_096) {
    throw new Error("A bounded Communications endpoint is required.")
  }
  return protectCommunicationsCredential(normalized)
}

export function resolveCommunicationsEndpoint(reference: string) {
  const value = resolveCommunicationsCredential(reference).trim()
  if (!value || value.length > 4_096) {
    throw new Error("Communications endpoint reference is invalid.")
  }
  return value
}

export function protectCommunicationsActionId(actionId: string) {
  if (!actionId.startsWith("rx:")) {
    throw new Error("A valid Communications action id is required.")
  }
  return protectCommunicationsCredential(actionId)
}

export function resolveCommunicationsActionId(reference: string) {
  const actionId = resolveCommunicationsCredential(reference)
  if (!actionId.startsWith("rx:")) {
    throw new Error("Communications action reference is invalid.")
  }
  return actionId
}

export type EmbeddedSignupState = {
  expiresAt: number
  nonce: string
  storeId: string
  tenantId: string
  userId: string
}

export function createEmbeddedSignupState(
  input: Omit<EmbeddedSignupState, "expiresAt" | "nonce">,
  secret: string,
) {
  const payload: EmbeddedSignupState = {
    ...input,
    expiresAt: Date.now() + 15 * 60_000,
    nonce: randomBytes(18).toString("base64url"),
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const signature = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url")
  return `${encoded}.${signature}`
}

export function verifyEmbeddedSignupState(value: string, secret: string) {
  const [encoded, signature] = value.split(".")
  if (!encoded || !signature) return null
  const expected = createHmac("sha256", secret)
    .update(encoded)
    .digest("base64url")
  const expectedBytes = Buffer.from(expected)
  const actualBytes = Buffer.from(signature)
  if (
    expectedBytes.length !== actualBytes.length ||
    !timingSafeEqual(expectedBytes, actualBytes)
  ) {
    return null
  }
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as EmbeddedSignupState
    return payload.expiresAt > Date.now() ? payload : null
  } catch {
    return null
  }
}

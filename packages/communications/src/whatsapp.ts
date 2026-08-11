import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto"
import { type RedisClientType, createClient } from "redis"

import { SERVICE_COMMERCE_CUSTOMER_ACTION_TEMPLATE_KEY } from "./service-commerce-action-capability"

const META_GRAPH_URL = "https://graph.facebook.com/v21.0"
export const WHATSAPP_SESSION_WINDOW_MS = 24 * 60 * 60_000

export type WhatsAppCredentials = {
  accessToken: string
  phoneNumberId: string
}

export type NormalizedWhatsAppMessageEvent = {
  externalCustomerId: string
  kind: "message"
  media?: { id: string; mediaType: string }
  messageId: string
  phoneNumberId: string
  quickActionId?: string
  text?: string
  timestamp?: string
  type: "interactive" | "media" | "text" | "unsupported"
}

export type NormalizedWhatsAppStatusEvent = {
  failureCode?: string
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
  fetchMedia(input: WhatsAppCredentials & { mediaId: string }): Promise<{
    bytes: Uint8Array
    mediaType: string
  }>
  sendButtons(
    input: WhatsAppCredentials & {
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
  return String((first as { id: unknown }).id)
}

function providerFact(value: unknown) {
  if (typeof value !== "string") return undefined
  const normalized = value.trim().toLowerCase()
  return /^[a-z0-9][a-z0-9_.-]{0,79}$/.test(normalized) ? normalized : undefined
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
    return { messageId: messageId(await json(response)) }
  }

  sendText(input: WhatsAppCredentials & { body: string; to: string }) {
    return this.#send(input, {
      text: { body: input.body, preview_url: false },
      to: input.to,
      type: "text",
    })
  }

  sendButtons(
    input: WhatsAppCredentials & {
      body: string
      buttons: WhatsAppButton[]
      to: string
    },
  ) {
    if (input.buttons.length < 1 || input.buttons.length > 3) {
      throw new Error("WhatsApp supports one to three reply buttons.")
    }
    return this.#send(input, {
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

  async fetchMedia(input: WhatsAppCredentials & { mediaId: string }) {
    const metadata = await json(
      await this.#fetch(`${META_GRAPH_URL}/${input.mediaId}`, {
        headers: { Authorization: `Bearer ${input.accessToken}` },
      }),
    )
    const url = String(metadata.url ?? "")
    if (!url.startsWith("https://")) {
      throw new Error("Meta returned an invalid private-media URL.")
    }
    const response = await this.#fetch(url, {
      headers: { Authorization: `Bearer ${input.accessToken}` },
    })
    if (!response.ok) throw new Error("WhatsApp media retrieval failed.")
    return {
      bytes: new Uint8Array(await response.arrayBuffer()),
      mediaType:
        response.headers.get("content-type") ?? "application/octet-stream",
    }
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
            body: "EwaTrade connection test. No customer information is included.",
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
        const mediaRecord =
          item.image && typeof item.image === "object"
            ? (item.image as Record<string, unknown>)
            : item.document && typeof item.document === "object"
              ? (item.document as Record<string, unknown>)
              : null
        events.push({
          externalCustomerId: String(item.from ?? ""),
          kind: "message",
          media: mediaRecord
            ? {
                id: String(mediaRecord.id ?? ""),
                mediaType: String(mediaRecord.mime_type ?? ""),
              }
            : undefined,
          messageId: String(item.id ?? ""),
          phoneNumberId,
          quickActionId: String(button.id ?? "") || undefined,
          text,
          timestamp: String(item.timestamp ?? "") || undefined,
          type:
            type === "text"
              ? "text"
              : type === "interactive"
                ? "interactive"
                : mediaRecord
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

export type CustomerMessageChannel = "sms" | "whatsapp"

export type CustomerMessageDeliveryResult = {
  providerAttemptId?: string
  providerKey: string
  status: "sent"
}

function providerConfig(channel: CustomerMessageChannel) {
  const prefix = channel === "whatsapp" ? "SERVICE_WHATSAPP" : "SERVICE_SMS"
  const url = process.env[`${prefix}_WEBHOOK_URL`]?.trim()
  const token = process.env[`${prefix}_WEBHOOK_TOKEN`]?.trim()
  return {
    providerKey:
      channel === "whatsapp"
        ? "service_whatsapp_webhook"
        : "service_sms_webhook",
    token,
    url,
  }
}

export function customerMessagingProviderStatus() {
  const sms = providerConfig("sms")
  const whatsapp = providerConfig("whatsapp")
  return {
    sms: { configured: Boolean(sms.url) },
    whatsapp: { configured: Boolean(whatsapp.url) },
  }
}

function responseAttemptId(value: unknown) {
  if (!value || typeof value !== "object") return undefined
  const record = value as Record<string, unknown>
  for (const key of ["messageId", "id", "providerAttemptId"]) {
    if (typeof record[key] === "string" && record[key]) {
      return record[key] as string
    }
  }
  return undefined
}

export class CustomerMessagingService {
  async send(input: {
    channel: CustomerMessageChannel
    intentId: string
    message: string
    to: string
  }): Promise<CustomerMessageDeliveryResult> {
    const config = providerConfig(input.channel)
    if (!config.url) {
      throw new Error(
        `${input.channel.toUpperCase()} provider is not configured.`,
      )
    }
    const headers: Record<string, string> = {
      "content-type": "application/json",
    }
    if (config.token) headers.authorization = `Bearer ${config.token}`
    const response = await fetch(config.url, {
      body: JSON.stringify({
        intentId: input.intentId,
        message: input.message,
        to: input.to,
      }),
      headers,
      method: "POST",
    })
    const payload = (await response.json().catch(() => null)) as unknown
    if (!response.ok) {
      throw new Error(`Customer message provider returned ${response.status}.`)
    }
    return {
      providerAttemptId: responseAttemptId(payload),
      providerKey: config.providerKey,
      status: "sent",
    }
  }
}

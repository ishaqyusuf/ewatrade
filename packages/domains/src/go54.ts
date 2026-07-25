import { createHmac } from "node:crypto"

import { normalizeDomainName } from "./domain-name"
import { normalizeProviderDomainStatus } from "./provider-status"
import {
  type DomainAvailability,
  type DomainMoney,
  type DomainProvider,
  DomainProviderError,
  type DomainRegistrant,
  type DomainRegistrationRequest,
} from "./types"

const DEFAULT_BASE_URL =
  "https://www.whogohost.com/host/modules/addons/DomainsReseller/api/index.php"

type Fetch = typeof fetch

type Go54Config = {
  apiKey: string
  baseUrl?: string
  fetch?: Fetch
  username: string
}

function hourStamp(date = new Date()) {
  const year = date.getUTCFullYear().toString().slice(-2)
  const month = (date.getUTCMonth() + 1).toString().padStart(2, "0")
  const day = date.getUTCDate().toString().padStart(2, "0")
  const hour = date.getUTCHours().toString().padStart(2, "0")
  return `${year}-${month}-${day} ${hour}`
}

export function createGo54Token(params: {
  apiKey: string
  date?: Date
  username: string
}) {
  const digest = createHmac("sha256", params.apiKey)
    .update(`${params.username}:${hourStamp(params.date)}`)
    .digest("hex")
  return Buffer.from(digest, "utf8").toString("base64")
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {}
}

function readMoney(
  value: unknown,
  fallbackCurrency = "NGN",
): DomainMoney | null {
  const record = asRecord(value)
  const rawAmount =
    record.price ?? record.register ?? record.amount ?? record.cost
  const amount = Number(rawAmount)

  if (!Number.isFinite(amount)) {
    return null
  }

  return {
    amountMinor: Math.round(amount * 100),
    currencyCode: String(record.currency ?? fallbackCurrency).toUpperCase(),
  }
}

function appendContact(
  body: URLSearchParams,
  contact: string,
  registrant: DomainRegistrant,
) {
  const prefix = `contacts[${contact}]`
  body.set(`${prefix}[firstname]`, registrant.firstName)
  body.set(`${prefix}[lastname]`, registrant.lastName)
  body.set(
    `${prefix}[fullname]`,
    `${registrant.firstName} ${registrant.lastName}`.trim(),
  )
  body.set(`${prefix}[companyname]`, registrant.companyName ?? "")
  body.set(`${prefix}[email]`, registrant.email)
  body.set(`${prefix}[address1]`, registrant.addressLine1)
  body.set(`${prefix}[address2]`, registrant.addressLine2 ?? "")
  body.set(`${prefix}[city]`, registrant.city)
  body.set(`${prefix}[state]`, registrant.region)
  body.set(`${prefix}[zipcode]`, registrant.postalCode ?? "")
  body.set(`${prefix}[country]`, registrant.countryCode)
  body.set(`${prefix}[phonenumber]`, formatGo54Phone(registrant))
}

function formatGo54Phone(registrant: DomainRegistrant) {
  const countryCode = registrant.phoneCountryCode.replace(/^\+/, "")
  const subscriber = registrant.phoneNumber.replace(/^0+/, "")
  return `+${countryCode}.${subscriber}`
}

function responseData(payload: Record<string, unknown>) {
  return asRecord(payload.data ?? payload.result ?? payload)
}

function assertSuccessfulPayload(
  payload: Record<string, unknown>,
  operation: string,
) {
  const data = responseData(payload)
  const rawStatus = String(
    data.status ?? payload.status ?? data.result ?? payload.result ?? "",
  )
  const status = normalizeProviderDomainStatus("GO54", rawStatus)
  const explicitFailure =
    data.success === false ||
    payload.success === false ||
    status === "failed" ||
    rawStatus.toLowerCase() === "error"

  if (explicitFailure) {
    throw new DomainProviderError({
      code: `GO54_${operation.toUpperCase()}_FAILED`,
      message: String(
        data.message ??
          payload.message ??
          data.error ??
          payload.error ??
          `GO54 ${operation} failed.`,
      ),
      provider: "GO54",
    })
  }

  return { data, rawStatus, status }
}

function readDate(data: Record<string, unknown>) {
  const raw =
    data.expiryDate ??
    data.expirydate ??
    data.expirationDate ??
    data.expiration_date
  if (!raw) return null
  const parsed = new Date(String(raw))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export class Go54DomainProvider implements DomainProvider {
  readonly #apiKey: string
  readonly #baseUrl: string
  readonly #fetch: Fetch
  readonly #username: string

  constructor(config: Go54Config) {
    this.#apiKey = config.apiKey
    this.#baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
    this.#fetch = config.fetch ?? fetch
    this.#username = config.username
  }

  async #request(
    path: string,
    init: RequestInit = {},
  ): Promise<Record<string, unknown>> {
    let response: Response

    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: "application/json",
          token: createGo54Token({
            apiKey: this.#apiKey,
            username: this.#username,
          }),
          username: this.#username,
          ...init.headers,
        },
      })
    } catch (cause) {
      throw new DomainProviderError({
        cause,
        code: "GO54_NETWORK_ERROR",
        isUncertain: init.method === "POST",
        message: "GO54 could not be reached.",
        provider: "GO54",
      })
    }

    const payload = asRecord(await response.json().catch(() => ({})))

    if (!response.ok) {
      throw new DomainProviderError({
        code: `GO54_HTTP_${response.status}`,
        isUncertain: response.status >= 500 && init.method === "POST",
        message: String(
          payload.message ?? payload.error ?? "GO54 rejected the request.",
        ),
        provider: "GO54",
        statusCode: response.status,
      })
    }

    return payload
  }

  async checkAvailability(domain: string): Promise<DomainAvailability> {
    const parsed = normalizeDomainName(domain)
    const body = new URLSearchParams({
      punnyCodeSearchTerm: parsed.label,
      searchTerm: parsed.label,
    })
    body.append("tldsToInclude[]", `.${parsed.tld}`)

    const payload = await this.#request("/domains/lookup", {
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
    })
    const data = responseData(payload)
    const result = asRecord(
      data[parsed.normalizedDomain] ??
        asRecord(data.results)[parsed.normalizedDomain] ??
        (Array.isArray(data.results) ? data.results[0] : data),
    )
    const registrationPrice = readMoney(
      result.price ?? result.pricing ?? result,
    ) ?? {
      amountMinor: 0,
      currencyCode: "NGN",
    }
    const renewalPrice = readMoney(result.renew ?? result.renewal)
    const status = String(result.status ?? result.available ?? "").toLowerCase()

    return {
      available:
        result.available === true ||
        status === "available" ||
        status === "true",
      domain: parsed.normalizedDomain,
      isPremium: Boolean(result.premium ?? result.isPremium),
      provider: "GO54",
      registrationPrice,
      renewalPrice,
    }
  }

  async registerDomain(request: DomainRegistrationRequest) {
    const body = new URLSearchParams({
      domain: normalizeDomainName(request.domain).normalizedDomain,
      regperiod: request.periodYears.toString(),
    })
    request.nameservers.forEach((nameserver, index) => {
      body.set(`nameservers[ns${index + 1}]`, nameserver)
    })
    for (const contact of ["registrant", "admin", "tech", "billing"] as const) {
      appendContact(body, contact, request.registrant)
    }

    const payload = await this.#request("/order/domains/register", {
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Idempotency-Key": request.idempotencyKey,
      },
      method: "POST",
    })
    const { data, status } = assertSuccessfulPayload(payload, "registration")

    return {
      expiresAt: readDate(data),
      providerCustomerHandle: null,
      providerDomainId:
        String(data.domainId ?? data.id ?? data.orderId ?? "") || null,
      registeredAt: status === "active" ? new Date() : null,
      status:
        status === "active"
          ? ("registered" as const)
          : status === "pending"
            ? ("pending" as const)
            : ("uncertain" as const),
    }
  }

  async renewDomain(params: {
    domain: string
    idempotencyKey: string
    periodYears: number
  }) {
    const body = new URLSearchParams({
      domain: normalizeDomainName(params.domain).normalizedDomain,
      regperiod: params.periodYears.toString(),
    })
    const payload = await this.#request("/order/domains/renew", {
      body,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Idempotency-Key": params.idempotencyKey,
      },
      method: "POST",
    })
    const { data, status } = assertSuccessfulPayload(payload, "renewal")

    return {
      expiresAt: readDate(data),
      providerReference: String(data.orderId ?? data.id ?? "") || null,
      status:
        status === "active" ? ("renewed" as const) : ("uncertain" as const),
    }
  }

  async getDomain(domain: string) {
    const normalizedDomain = normalizeDomainName(domain).normalizedDomain
    let payload: Record<string, unknown>

    try {
      payload = await this.#request(`/domains/${normalizedDomain}/sync`, {
        body: new URLSearchParams({ domain: normalizedDomain }),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        method: "POST",
      })
    } catch (error) {
      if (error instanceof DomainProviderError && error.statusCode === 404) {
        return {
          expiresAt: null,
          providerDomainId: null,
          rawStatus: "not_found",
          status: "not_found" as const,
        }
      }
      throw error
    }

    const { data, rawStatus, status } = assertSuccessfulPayload(payload, "sync")

    return {
      expiresAt: readDate(data),
      providerDomainId: String(data.id ?? data.domainId ?? "") || null,
      rawStatus,
      status,
    }
  }

  async getAuthCode(domain: string) {
    const normalizedDomain = normalizeDomainName(domain).normalizedDomain
    const payload = await this.#request(`/domains/${normalizedDomain}/eppcode`)
    const { data } = assertSuccessfulPayload(payload, "auth_code")
    const authCode = String(data.eppcode ?? data.authCode ?? "")

    if (!authCode) {
      throw new DomainProviderError({
        code: "GO54_AUTH_CODE_MISSING",
        message: "GO54 did not return a transfer authorization code.",
        provider: "GO54",
      })
    }

    return authCode
  }
}

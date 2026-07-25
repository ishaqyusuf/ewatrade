import { splitDomainName } from "./domain-name"
import { normalizeProviderDomainStatus } from "./provider-status"
import {
  type DomainAvailability,
  type DomainMoney,
  type DomainProvider,
  DomainProviderError,
  type DomainRegistrant,
  type DomainRegistrationRequest,
} from "./types"

const DEFAULT_BASE_URL = "https://api.openprovider.eu/v1beta"

type Fetch = typeof fetch

type OpenproviderConfig = {
  baseUrl?: string
  fetch?: Fetch
  password: string
  username: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {}
}

function readPrice(value: unknown): DomainMoney | null {
  const record = asRecord(value)
  const amount = Number(record.price)

  if (!Number.isFinite(amount)) {
    return null
  }

  return {
    amountMinor: Math.round(amount * 100),
    currencyCode: String(record.currency ?? "USD").toUpperCase(),
  }
}

function readPremiumCreatePrice(value: unknown): DomainMoney | null {
  const record = asRecord(value)
  const create = Number(asRecord(record.price).create)

  if (!Number.isFinite(create)) {
    return null
  }

  return {
    amountMinor: Math.round(create * 100),
    currencyCode: String(record.currency ?? "USD").toUpperCase(),
  }
}

function readDate(value: unknown) {
  if (!value) return null
  const parsed = new Date(String(value))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function customerPayload(registrant: DomainRegistrant) {
  return {
    address: {
      city: registrant.city,
      country: registrant.countryCode,
      number: "",
      state: registrant.region,
      street: [registrant.addressLine1, registrant.addressLine2]
        .filter(Boolean)
        .join(", "),
      zipcode: registrant.postalCode ?? "",
    },
    company_name: registrant.companyName ?? "",
    email: registrant.email,
    locale: "en_US",
    name: {
      first_name: registrant.firstName,
      last_name: registrant.lastName,
    },
    phone: {
      area_code: "",
      country_code: registrant.phoneCountryCode.startsWith("+")
        ? registrant.phoneCountryCode
        : `+${registrant.phoneCountryCode}`,
      subscriber_number: registrant.phoneNumber.replace(/^0+/, ""),
    },
  }
}

export class OpenproviderDomainProvider implements DomainProvider {
  readonly #baseUrl: string
  readonly #fetch: Fetch
  readonly #password: string
  readonly #username: string
  #token: string | null = null

  constructor(config: OpenproviderConfig) {
    this.#baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
    this.#fetch = config.fetch ?? fetch
    this.#password = config.password
    this.#username = config.username
  }

  async #authenticate() {
    if (this.#token) {
      return this.#token
    }

    const response = await this.#fetch(`${this.#baseUrl}/auth/login`, {
      body: JSON.stringify({
        ip: "0.0.0.0",
        password: this.#password,
        username: this.#username,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    const payload = asRecord(await response.json().catch(() => ({})))
    const data = asRecord(payload.data)
    const token = String(data.token ?? "")

    if (!response.ok || !token) {
      throw new DomainProviderError({
        code: "OPENPROVIDER_AUTH_FAILED",
        message: String(
          payload.desc ?? payload.message ?? "Openprovider login failed.",
        ),
        provider: "OPENPROVIDER",
        statusCode: response.status,
      })
    }

    this.#token = token
    return token
  }

  async #request(
    path: string,
    init: RequestInit = {},
    options: {
      retryAuthentication?: boolean
      uncertainOnFailure?: boolean
    } = {},
  ): Promise<Record<string, unknown>> {
    const retryAuthentication = options.retryAuthentication ?? true
    const uncertainOnFailure =
      options.uncertainOnFailure ?? init.method === "POST"
    const token = await this.#authenticate()
    let response: Response

    try {
      response = await this.#fetch(`${this.#baseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
      })
    } catch (cause) {
      throw new DomainProviderError({
        cause,
        code: "OPENPROVIDER_NETWORK_ERROR",
        isUncertain: uncertainOnFailure,
        message: "Openprovider could not be reached.",
        provider: "OPENPROVIDER",
      })
    }

    const payload = asRecord(await response.json().catch(() => ({})))

    if (response.status === 401 && retryAuthentication) {
      this.#token = null
      return this.#request(path, init, {
        ...options,
        retryAuthentication: false,
      })
    }

    if (!response.ok || Number(payload.code ?? 0) !== 0) {
      throw new DomainProviderError({
        code: `OPENPROVIDER_${payload.code ?? response.status}`,
        isUncertain: response.status >= 500 && uncertainOnFailure,
        message: String(
          payload.desc ??
            payload.message ??
            "Openprovider rejected the request.",
        ),
        provider: "OPENPROVIDER",
        statusCode: response.status,
      })
    }

    return payload
  }

  async checkAvailability(domain: string): Promise<DomainAvailability> {
    const parsed = splitDomainName(domain)
    const payload = await this.#request(
      "/domains/check",
      {
        body: JSON.stringify({
          domains: [parsed],
          with_price: true,
        }),
        method: "POST",
      },
      { uncertainOnFailure: false },
    )
    const data = asRecord(payload.data)
    const results = Array.isArray(data.results) ? data.results : []
    const result = Array.isArray(payload.data)
      ? asRecord(payload.data[0])
      : asRecord(results[0] ?? payload.data)
    const price = asRecord(result.price)
    const registrationPrice = (result.is_premium
      ? readPremiumCreatePrice(result.premium)
      : readPrice(price.reseller ?? price.product ?? price)) ?? {
      amountMinor: 0,
      currencyCode: "USD",
    }

    return {
      available: String(result.status).toLowerCase() === "free",
      domain: `${parsed.name}.${parsed.extension}`,
      isPremium: Boolean(result.is_premium),
      provider: "OPENPROVIDER",
      registrationPrice,
      renewalPrice: null,
    }
  }

  async #createCustomer(registrant: DomainRegistrant) {
    const payload = await this.#request(
      "/customers",
      {
        body: JSON.stringify(customerPayload(registrant)),
        method: "POST",
      },
      { uncertainOnFailure: false },
    )
    const data = asRecord(payload.data)
    const handle = String(data.handle ?? "")

    if (!handle) {
      throw new DomainProviderError({
        code: "OPENPROVIDER_CUSTOMER_HANDLE_MISSING",
        message: "Openprovider did not return a customer handle.",
        provider: "OPENPROVIDER",
      })
    }

    return handle
  }

  async registerDomain(request: DomainRegistrationRequest) {
    const parsed = splitDomainName(request.domain)
    const handle = await this.#createCustomer(request.registrant)
    const payload = await this.#request("/domains", {
      body: JSON.stringify({
        ...(request.isPremium
          ? {
              accept_premium_fee:
                request.acceptedProviderCost.amountMinor / 100,
            }
          : {}),
        admin_handle: handle,
        autorenew: "off",
        billing_handle: handle,
        domain: parsed,
        name_servers: request.nameservers.map((name) => ({ name })),
        owner_handle: handle,
        period: request.periodYears,
        tech_handle: handle,
      }),
      headers: { "X-Idempotency-Key": request.idempotencyKey },
      method: "POST",
    })
    const data = asRecord(payload.data)
    const rawStatus = String(data.status ?? "")
    const status = normalizeProviderDomainStatus("OPENPROVIDER", rawStatus)

    if (status === "failed") {
      throw new DomainProviderError({
        code: "OPENPROVIDER_REGISTRATION_FAILED",
        message: "Openprovider rejected the domain registration.",
        provider: "OPENPROVIDER",
      })
    }

    return {
      expiresAt: readDate(data.expiration_date),
      providerCustomerHandle: handle,
      providerDomainId: String(data.id ?? "") || null,
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
    const parsed = splitDomainName(params.domain)
    const current = await this.getDomain(params.domain)

    if (!current.providerDomainId) {
      throw new DomainProviderError({
        code: "OPENPROVIDER_DOMAIN_ID_MISSING",
        message: "Openprovider did not return a domain identifier.",
        provider: "OPENPROVIDER",
      })
    }

    const payload = await this.#request(
      `/domains/${current.providerDomainId}/renew`,
      {
        body: JSON.stringify({
          domain: parsed,
          id: Number(current.providerDomainId),
          period: params.periodYears,
        }),
        headers: { "X-Idempotency-Key": params.idempotencyKey },
        method: "POST",
      },
    )
    const data = asRecord(payload.data)
    const rawStatus = String(data.status ?? "")
    const status = normalizeProviderDomainStatus("OPENPROVIDER", rawStatus)

    if (status === "failed") {
      throw new DomainProviderError({
        code: "OPENPROVIDER_RENEWAL_FAILED",
        message: "Openprovider rejected the domain renewal.",
        provider: "OPENPROVIDER",
      })
    }

    return {
      expiresAt: readDate(data.expiration_date),
      providerReference: String(data.id ?? current.providerDomainId),
      status:
        status === "active" ? ("renewed" as const) : ("uncertain" as const),
    }
  }

  async getDomain(domain: string) {
    const parsed = splitDomainName(domain)
    const query = new URLSearchParams({
      full_name: `${parsed.name}.${parsed.extension}`,
      limit: "1",
    })
    const payload = await this.#request(`/domains?${query}`)
    const data = asRecord(payload.data)
    const results = Array.isArray(data.results) ? data.results : []
    const result = asRecord(results[0])

    return {
      expiresAt: readDate(
        result.registry_expiration_date ?? result.expiration_date,
      ),
      providerDomainId: String(result.id ?? "") || null,
      rawStatus: String(result.status ?? (results.length ? "" : "not_found")),
      status: results.length
        ? normalizeProviderDomainStatus("OPENPROVIDER", result.status)
        : ("not_found" as const),
    }
  }

  async getAuthCode(domain: string) {
    const current = await this.getDomain(domain)

    if (!current.providerDomainId) {
      throw new DomainProviderError({
        code: "OPENPROVIDER_DOMAIN_ID_MISSING",
        message: "Openprovider did not return a domain identifier.",
        provider: "OPENPROVIDER",
      })
    }

    const payload = await this.#request(
      `/domains/${current.providerDomainId}/authcode`,
    )
    const data = asRecord(payload.data)
    const authCode = String(data.auth_code ?? data.authcode ?? "")

    if (!authCode) {
      throw new DomainProviderError({
        code: "OPENPROVIDER_AUTH_CODE_MISSING",
        message: "Openprovider did not return a transfer authorization code.",
        provider: "OPENPROVIDER",
      })
    }

    return authCode
  }
}

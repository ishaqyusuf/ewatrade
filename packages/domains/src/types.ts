export const DOMAIN_PROVIDERS = ["GO54", "OPENPROVIDER"] as const

export type DomainProviderName = (typeof DOMAIN_PROVIDERS)[number]

export type DomainMoney = {
  amountMinor: number
  currencyCode: string
}

export type DomainAvailability = {
  available: boolean
  domain: string
  isPremium: boolean
  provider: DomainProviderName
  registrationPrice: DomainMoney
  renewalPrice: DomainMoney | null
}

export type DomainRegistrant = {
  addressLine1: string
  addressLine2?: string | null
  city: string
  companyName?: string | null
  countryCode: string
  email: string
  firstName: string
  lastName: string
  phoneCountryCode: string
  phoneNumber: string
  postalCode?: string | null
  region: string
}

export type DomainRegistrationRequest = {
  acceptedProviderCost: DomainMoney
  domain: string
  idempotencyKey: string
  isPremium: boolean
  nameservers: string[]
  periodYears: number
  registrant: DomainRegistrant
}

export type DomainRegistrationResult = {
  expiresAt: Date | null
  providerCustomerHandle: string | null
  providerDomainId: string | null
  registeredAt: Date | null
  status: "pending" | "registered" | "uncertain"
}

export type DomainLifecycleStatus =
  | "active"
  | "expired"
  | "failed"
  | "not_found"
  | "pending"
  | "redemption"
  | "suspended"
  | "transferred_out"
  | "unknown"

export type DomainProviderState = {
  expiresAt: Date | null
  providerDomainId: string | null
  rawStatus: string
  status: DomainLifecycleStatus
}

export type DomainRenewalResult = {
  expiresAt: Date | null
  providerReference: string | null
  status: "renewed" | "uncertain"
}

export type DomainProvider = {
  checkAvailability(domain: string): Promise<DomainAvailability>
  getAuthCode(domain: string): Promise<string>
  getDomain(domain: string): Promise<DomainProviderState>
  registerDomain(
    request: DomainRegistrationRequest,
  ): Promise<DomainRegistrationResult>
  renewDomain(params: {
    domain: string
    idempotencyKey: string
    periodYears: number
  }): Promise<DomainRenewalResult>
}

export class DomainProviderError extends Error {
  readonly code: string
  readonly isUncertain: boolean
  readonly provider: DomainProviderName
  readonly statusCode: number | null

  constructor(params: {
    cause?: unknown
    code: string
    isUncertain?: boolean
    message: string
    provider: DomainProviderName
    statusCode?: number | null
  }) {
    super(params.message, { cause: params.cause })
    this.name = "DomainProviderError"
    this.code = params.code
    this.provider = params.provider
    this.statusCode = params.statusCode ?? null
    this.isUncertain = params.isUncertain ?? false
  }
}

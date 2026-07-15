export type SharedProductPageParams = {
  productSlug: string
  storeSlug: string
  tenantSlug: string
}

export type SharedProductSearchParams = {
  error?: string
  requested?: string
  share?: string
}

export type SharedLinkCustomerErrorCode =
  | "CUSTOMER_ACCOUNT_EXISTS"
  | "CUSTOMER_AUTH_UNAVAILABLE"
  | "CUSTOMER_LOGIN_FAILED"
  | "CUSTOMER_NAME_REQUIRED"
  | "CUSTOMER_PASSWORD_REQUIRED"

export function getStorefrontBaseUrl() {
  return (
    process.env.STOREFRONT_URL ??
    process.env.NEXT_PUBLIC_STOREFRONT_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "https://ewatrade.com"
  ).replace(/\/+$/, "")
}

type HeaderSource = {
  get(name: string): string | null | undefined
}

function getFirstHeaderValue(value: string | null | undefined) {
  return value?.split(",")[0]?.trim() || null
}

function getDefaultProtocol(hostname: string) {
  return hostname === "localhost" ||
    hostname.startsWith("localhost:") ||
    hostname.startsWith("127.0.0.1") ||
    hostname.startsWith("[::1]")
    ? "http"
    : "https"
}

export function getStorefrontBaseUrlFromHeaders(headers: HeaderSource | null) {
  const fallbackBaseUrl = getStorefrontBaseUrl()
  const forwardedHost = getFirstHeaderValue(headers?.get("x-forwarded-host"))
  const host = forwardedHost ?? getFirstHeaderValue(headers?.get("host"))

  if (!host) return fallbackBaseUrl

  const forwardedProtocol = getFirstHeaderValue(
    headers?.get("x-forwarded-proto"),
  )
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : getDefaultProtocol(host)
  const hostWithoutProtocol = host.replace(/^[a-z][a-z\d+.-]*:\/\//i, "")
  const hostname = hostWithoutProtocol.split("/")[0]?.trim()

  if (!hostname) return fallbackBaseUrl

  try {
    const url = new URL(`${protocol}://${hostname}`)

    return url.toString().replace(/\/+$/, "")
  } catch {
    return fallbackBaseUrl
  }
}

export function getSharedProductPreviewImageUrl(input: {
  fallbackImageUrl: string
  productImageUrl?: string | null
}) {
  const productImageUrl = input.productImageUrl?.trim()

  if (!productImageUrl) return input.fallbackImageUrl

  try {
    const url = new URL(productImageUrl)
    const hostname = url.hostname.toLowerCase()
    const isLocalhost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".localhost")

    if (!["http:", "https:"].includes(url.protocol) || isLocalhost) {
      return input.fallbackImageUrl
    }

    return url.toString()
  } catch {
    return input.fallbackImageUrl
  }
}

export function getErrorMessage(error?: string) {
  if (error === "INSUFFICIENT_STOCK") {
    return "That quantity is no longer available. Please choose a smaller quantity."
  }

  if (error === "PRODUCT_VARIANT_NOT_FOUND") {
    return "Please choose an available product unit."
  }

  if (error === "CUSTOMER_NAME_REQUIRED") {
    return "Enter your name to create your customer account."
  }

  if (error === "CUSTOMER_PASSWORD_REQUIRED") {
    return "Enter a password with at least 8 characters."
  }

  if (error === "CUSTOMER_ACCOUNT_EXISTS") {
    return "An account already exists for this email. Choose returning customer and log in."
  }

  if (error === "CUSTOMER_LOGIN_FAILED") {
    return "We could not log you in with that email and password."
  }

  if (error === "CUSTOMER_AUTH_UNAVAILABLE") {
    return "We could not prepare your customer account. Please try again."
  }

  if (error) {
    return "We could not submit the request. Please review the form and try again."
  }

  return null
}

export function getSharedPath(input: SharedProductPageParams, token: string) {
  return `/p/${encodeURIComponent(input.tenantSlug)}/${encodeURIComponent(
    input.storeSlug,
  )}/${encodeURIComponent(input.productSlug)}?share=${encodeURIComponent(
    token,
  )}`
}

export function getFormValue(formData: FormData, key: string) {
  const value = formData.get(key)

  return typeof value === "string" ? value : ""
}

export function getCustomerAuthMode(value: string) {
  return value === "login" ? "login" : "register"
}

export function getOrderQuantity(value: string) {
  const parsed = Number(value)

  if (!Number.isFinite(parsed)) return 1

  return Math.max(1, Math.trunc(parsed))
}

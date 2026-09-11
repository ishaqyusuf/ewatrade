export type ErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "BAD_REQUEST"
  | "CONFLICT"
  | "CUSTOMER_ACCESS_DENIED"
  | "DATABASE_CONSTRAINT"
  | "DATABASE_POOL_TIMEOUT"
  | "DATABASE_TRANSACTION_TIMEOUT"
  | "DATABASE_WRITE_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "MESSAGING_PROVIDER_FAILED"
  | "MODULE_DISABLED"
  | "NETWORK_UNAVAILABLE"
  | "NOT_FOUND"
  | "OFFLINE_COMMAND_CONFLICT"
  | "OFFLINE_REVIEW_REQUIRED"
  | "PAYMENT_PROVIDER_FAILED"
  | "PERMISSION_DENIED"
  | "QUOTE_EXPIRED"
  | "RATE_LIMITED"
  | "REGISTRAR_PROVIDER_FAILED"
  | "ROLE_RESTRICTED"
  | "STORAGE_PROVIDER_FAILED"
  | "STOCK_CONFLICT"
  | "UNEXPECTED"
  | "VALIDATION_FAILED"

export type ProviderKind = "messaging" | "payment" | "registrar" | "storage"

type ErrorDescriptor = {
  message: string
  reportable: boolean
  retryable: boolean
  status: number
}

const descriptors: Record<ErrorCode, ErrorDescriptor> = {
  AUTHENTICATION_REQUIRED: {
    message: "Sign in again to continue.",
    reportable: false,
    retryable: false,
    status: 401,
  },
  BAD_REQUEST: {
    message: "Review the request and try again.",
    reportable: false,
    retryable: false,
    status: 400,
  },
  CONFLICT: {
    message: "This information changed. Refresh and try again.",
    reportable: false,
    retryable: false,
    status: 409,
  },
  CUSTOMER_ACCESS_DENIED: {
    message: "This customer link is no longer available.",
    reportable: false,
    retryable: false,
    status: 404,
  },
  DATABASE_CONSTRAINT: {
    message: "This change conflicts with existing information.",
    reportable: true,
    retryable: false,
    status: 409,
  },
  DATABASE_POOL_TIMEOUT: {
    message: "The service is temporarily busy. Try again shortly.",
    reportable: true,
    retryable: true,
    status: 503,
  },
  DATABASE_TRANSACTION_TIMEOUT: {
    message: "This action took too long. Please try again.",
    reportable: true,
    retryable: true,
    status: 503,
  },
  DATABASE_WRITE_CONFLICT: {
    message: "Another update happened first. Please try again.",
    reportable: true,
    retryable: true,
    status: 409,
  },
  IDEMPOTENCY_CONFLICT: {
    message: "This request conflicts with an earlier attempt.",
    reportable: false,
    retryable: false,
    status: 409,
  },
  MESSAGING_PROVIDER_FAILED: {
    message: "Messaging is temporarily unavailable. Please try again.",
    reportable: true,
    retryable: true,
    status: 503,
  },
  MODULE_DISABLED: {
    message: "This feature is not available for this store.",
    reportable: false,
    retryable: false,
    status: 403,
  },
  NETWORK_UNAVAILABLE: {
    message: "Check your connection and try again.",
    reportable: false,
    retryable: true,
    status: 503,
  },
  NOT_FOUND: {
    message: "The requested information could not be found.",
    reportable: false,
    retryable: false,
    status: 404,
  },
  OFFLINE_COMMAND_CONFLICT: {
    message: "This offline change needs review before it can be applied.",
    reportable: false,
    retryable: false,
    status: 409,
  },
  OFFLINE_REVIEW_REQUIRED: {
    message: "This offline change is waiting for management review.",
    reportable: false,
    retryable: false,
    status: 409,
  },
  PAYMENT_PROVIDER_FAILED: {
    message: "Payment processing is temporarily unavailable. Please try again.",
    reportable: true,
    retryable: true,
    status: 503,
  },
  PERMISSION_DENIED: {
    message: "You do not have permission to perform this action.",
    reportable: false,
    retryable: false,
    status: 403,
  },
  QUOTE_EXPIRED: {
    message: "This quote has expired. Request an updated quote.",
    reportable: false,
    retryable: false,
    status: 409,
  },
  RATE_LIMITED: {
    message: "Please wait a moment and try again.",
    reportable: false,
    retryable: true,
    status: 429,
  },
  REGISTRAR_PROVIDER_FAILED: {
    message:
      "Domain registration is temporarily unavailable. Please try again.",
    reportable: true,
    retryable: true,
    status: 503,
  },
  ROLE_RESTRICTED: {
    message: "Your current role cannot perform this action.",
    reportable: false,
    retryable: false,
    status: 403,
  },
  STORAGE_PROVIDER_FAILED: {
    message:
      "Private media storage is temporarily unavailable. Please try again.",
    reportable: true,
    retryable: true,
    status: 503,
  },
  STOCK_CONFLICT: {
    message:
      "Stock changed before this action completed. Refresh and try again.",
    reportable: false,
    retryable: false,
    status: 409,
  },
  UNEXPECTED: {
    message: "Something went wrong. Please try again.",
    reportable: true,
    retryable: false,
    status: 500,
  },
  VALIDATION_FAILED: {
    message: "Review the information provided and try again.",
    reportable: false,
    retryable: false,
    status: 400,
  },
}

export type AppErrorOptions = {
  cause?: unknown
  code: ErrorCode
  internalMessage?: string
  operation?: string
  referenceId?: string
}

function createReferenceId() {
  const runtimeCrypto = globalThis.crypto
  if (typeof runtimeCrypto?.randomUUID === "function")
    return runtimeCrypto.randomUUID()

  const timestamp = Date.now().toString(36)
  const entropy = Math.random().toString(36).slice(2, 14)
  return `err_${timestamp}_${entropy}`
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly operation?: string
  readonly publicMessage: string
  readonly referenceId: string
  readonly reportable: boolean
  readonly retryable: boolean
  readonly status: number

  constructor(options: AppErrorOptions) {
    const descriptor = descriptors[options.code]
    super(options.internalMessage ?? descriptor.message, {
      cause: options.cause,
    })
    this.name = "AppError"
    this.code = options.code
    this.operation = options.operation
    this.publicMessage = descriptor.message
    this.referenceId = options.referenceId ?? createReferenceId()
    this.reportable = descriptor.reportable
    this.retryable = descriptor.retryable
    this.status = descriptor.status
  }
}

const classifiedErrors = new WeakMap<object, AppError>()

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null
}

function codeOf(value: unknown) {
  const code = record(value)?.code
  return typeof code === "string" ? code : undefined
}

function messageOf(value: unknown) {
  const message =
    value instanceof Error ? value.message : record(value)?.message
  return typeof message === "string" ? message : ""
}

function statusOf(value: unknown) {
  const valueRecord = record(value)
  const status = valueRecord?.status ?? valueRecord?.statusCode
  return typeof status === "number" ? status : undefined
}

function providerCode(error: unknown): ErrorCode | undefined {
  const errorRecord = record(error)
  const code = codeOf(error)?.toUpperCase()
  const provider =
    typeof errorRecord?.provider === "string"
      ? errorRecord.provider.toLowerCase()
      : ""
  const name = typeof errorRecord?.name === "string" ? errorRecord.name : ""

  if (
    name === "DomainProviderError" ||
    code?.startsWith("GO54_") ||
    code?.startsWith("OPENPROVIDER_") ||
    provider === "go54" ||
    provider === "openprovider" ||
    provider === "registrar"
  )
    return "REGISTRAR_PROVIDER_FAILED"
  if (/paystack|payment|stripe|app_store|play_store/.test(provider))
    return "PAYMENT_PROVIDER_FAILED"
  if (/meta|whatsapp|messaging/.test(provider))
    return "MESSAGING_PROVIDER_FAILED"
  if (/storage|object_store|s3|upload/.test(provider))
    return "STORAGE_PROVIDER_FAILED"
  if (code === "PROVIDER_UNAVAILABLE") return "PAYMENT_PROVIDER_FAILED"
  return undefined
}

function classifyCode(error: unknown): ErrorCode {
  const errorRecord = record(error)
  const code = codeOf(error)
  const externalProviderCode = providerCode(error)
  if (externalProviderCode) return externalProviderCode
  if (errorRecord?.name === "ZodError" || Array.isArray(errorRecord?.issues))
    return "VALIDATION_FAILED"
  if (code === "P2002") return "CONFLICT"
  if (code === "P2003") return "DATABASE_CONSTRAINT"
  if (code === "P2024") return "DATABASE_POOL_TIMEOUT"
  if (code === "P2028") return "DATABASE_TRANSACTION_TIMEOUT"
  if (code === "P2034") return "DATABASE_WRITE_CONFLICT"
  if (code === "UNAUTHORIZED") return "AUTHENTICATION_REQUIRED"
  if (code === "FORBIDDEN") return "PERMISSION_DENIED"
  if (code === "NOT_FOUND") return "NOT_FOUND"
  if (code === "BAD_REQUEST" || code === "UNPROCESSABLE_CONTENT")
    return "VALIDATION_FAILED"
  if (code === "TOO_MANY_REQUESTS") return "RATE_LIMITED"
  if (code === "CONFLICT" || code === "PRECONDITION_FAILED") return "CONFLICT"
  if (
    code === "IDEMPOTENCY_MISMATCH" ||
    code?.endsWith("_IDEMPOTENCY_MISMATCH")
  )
    return "IDEMPOTENCY_CONFLICT"
  if (
    code === "INSUFFICIENT_STOCK" ||
    code === "OFFERING_UNAVAILABLE" ||
    code === "RESERVATION_NOT_FOUND" ||
    code === "REVISION_CONFLICT" ||
    code === "STALE_CONFIGURATION"
  )
    return "STOCK_CONFLICT"
  if (code === "PUBLIC_TOKEN_INVALID" || code === "PUBLIC_ACCESS_INVALID")
    return "CUSTOMER_ACCESS_DENIED"
  if (code === "QUOTE_EXPIRED" || code === "ACTION_EXPIRED")
    return "QUOTE_EXPIRED"
  if (code === "PRESCRIPTION_ROLE_REQUIRED" || code?.endsWith("_ROLE_REQUIRED"))
    return "ROLE_RESTRICTED"
  if (
    code === "POLICY_BLOCKED" ||
    code === "BOOKING_BLOCKED" ||
    code === "ACTION_BLOCKED" ||
    code === "INTAKE_BLOCKED"
  )
    return "MODULE_DISABLED"
  const status = statusOf(error)
  if (status === 400 || status === 422) return "VALIDATION_FAILED"
  if (status === 401) return "AUTHENTICATION_REQUIRED"
  if (status === 403) return "PERMISSION_DENIED"
  if (status === 404) return "NOT_FOUND"
  if (status === 409 || status === 412) return "CONFLICT"
  if (status === 429) return "RATE_LIMITED"
  const message = messageOf(error).toLowerCase()
  if (
    /econnreset|econnrefused|enotfound|network request failed|failed to fetch/.test(
      message,
    )
  )
    return "NETWORK_UNAVAILABLE"
  return "UNEXPECTED"
}

export function classifyError(
  error: unknown,
  options: Omit<AppErrorOptions, "code" | "cause"> = {},
) {
  if (error instanceof AppError) return error
  const errorRecord = record(error)
  if (errorRecord) {
    const cached = classifiedErrors.get(errorRecord)
    if (cached) return cached
  }
  const cause = errorRecord?.cause
  if (cause instanceof AppError) return cause
  const causeRecord = record(cause)
  if (cause && cause !== error && causeRecord) {
    const classifiedCause = new AppError({
      ...options,
      cause,
      code: classifyCode(cause),
      internalMessage: messageOf(cause) || undefined,
    })
    classifiedErrors.set(causeRecord, classifiedCause)
    if (errorRecord) classifiedErrors.set(errorRecord, classifiedCause)
    return classifiedCause
  }
  const classified = new AppError({
    ...options,
    cause: error,
    code: classifyCode(error),
    internalMessage: messageOf(error) || undefined,
  })
  if (errorRecord) classifiedErrors.set(errorRecord, classified)
  return classified
}

export function providerError(
  kind: ProviderKind,
  cause: unknown,
  operation: string,
) {
  const codeByProvider: Record<ProviderKind, ErrorCode> = {
    messaging: "MESSAGING_PROVIDER_FAILED",
    payment: "PAYMENT_PROVIDER_FAILED",
    registrar: "REGISTRAR_PROVIDER_FAILED",
    storage: "STORAGE_PROVIDER_FAILED",
  }
  return new AppError({ cause, code: codeByProvider[kind], operation })
}

export async function runProviderOperation<T>(
  kind: ProviderKind,
  operation: string,
  action: () => Promise<T> | T,
) {
  try {
    return await action()
  } catch (cause) {
    throw providerError(kind, cause, operation)
  }
}

export type PublicError = {
  code: ErrorCode
  message: string
  referenceId: string
  retryable: boolean
}

export function toPublicError(error: unknown): PublicError {
  const classified = classifyError(error)
  return {
    code: classified.code,
    message: classified.publicMessage,
    referenceId: classified.referenceId,
    retryable: classified.retryable,
  }
}

export function toPublicErrorEnvelope(error: unknown, requestId?: string) {
  return {
    error: toPublicError(error),
    ...(requestId ? { requestId } : {}),
  }
}

/**
 * An offline canary preflight inspects environment values only to derive safe
 * Boolean configuration facts. It never returns or logs credentials, customer
 * data, database records, provider responses, or opaque identifiers.
 */
export const SERVICE_COMMERCE_LIVE_CANARY_KINDS = [
  "meta_whatsapp",
  "payment",
  "generic_media_safety",
  "pharmacy_media_ocr",
  "courier_manual",
] as const

export type ServiceCommerceLiveCanaryKind =
  (typeof SERVICE_COMMERCE_LIVE_CANARY_KINDS)[number]

export type ServiceCommerceLiveCanaryPreflightInput = {
  evidence?: {
    connectionReferencePresent?: boolean
    consentedTestRecipientPresent?: boolean
    deliverySopApprovalReferencePresent?: boolean
    neutralTemplateApprovalPresent?: boolean
    pharmacyApprovalReferencePresent?: boolean
    productionProfileConfirmed?: boolean
    storeReferencePresent?: boolean
    tenantReferencePresent?: boolean
  }
  environment: Readonly<Record<string, string | undefined>>
  kind: unknown
}

export type ServiceCommerceLiveCanaryPreflight = {
  executionAuthorized: false
  kind: ServiceCommerceLiveCanaryKind | null
  missingEvidence: string[]
  missingEnvironmentKeys: string[]
  reasonCodes: string[]
  status: "BLOCKED" | "READY"
}

const COMMON_ENVIRONMENT_KEYS = [
  "APP_ENV",
  "DATABASE_PROFILE_VERIFIED",
  "EWATRADE_DATABASE_URL",
] as const

const ENVIRONMENT_KEYS_BY_KIND: Record<
  ServiceCommerceLiveCanaryKind,
  readonly string[]
> = {
  courier_manual: COMMON_ENVIRONMENT_KEYS,
  generic_media_safety: COMMON_ENVIRONMENT_KEYS,
  meta_whatsapp: [
    ...COMMON_ENVIRONMENT_KEYS,
    "TRIGGER_PROJECT_ID",
    "TRIGGER_SECRET_KEY",
    "META_APP_ID",
    "META_APP_SECRET",
    "WHATSAPP_WEBHOOK_VERIFY_TOKEN",
    "COMMUNICATIONS_CREDENTIAL_ENCRYPTION_KEY",
    "REDIS_URL",
  ],
  payment: [...COMMON_ENVIRONMENT_KEYS, "PAYSTACK_SECRET_KEY"],
  pharmacy_media_ocr: [
    ...COMMON_ENVIRONMENT_KEYS,
    "PRESCRIPTION_DATA_ENCRYPTION_KEY",
    "PRESCRIPTION_MEDIA_SAFETY_PROVIDER",
    "PRESCRIPTION_OCR_PROVIDER",
  ],
}

function isCanaryKind(value: unknown): value is ServiceCommerceLiveCanaryKind {
  return (
    typeof value === "string" &&
    SERVICE_COMMERCE_LIVE_CANARY_KINDS.includes(
      value as ServiceCommerceLiveCanaryKind,
    )
  )
}

function missingEvidenceFor(
  kind: ServiceCommerceLiveCanaryKind,
  evidence: NonNullable<ServiceCommerceLiveCanaryPreflightInput["evidence"]>,
) {
  const missing = [
    !evidence.productionProfileConfirmed && "production_profile_confirmation",
    !evidence.tenantReferencePresent && "tenant_reference",
    !evidence.storeReferencePresent && "store_reference",
  ]

  if (kind === "meta_whatsapp") {
    missing.push(
      !evidence.connectionReferencePresent && "connection_reference",
      !evidence.consentedTestRecipientPresent && "consented_test_recipient",
      !evidence.neutralTemplateApprovalPresent && "neutral_template_approval",
    )
  }

  if (kind === "pharmacy_media_ocr") {
    // Presence is only an operational input. It is not a legal, privacy, or
    // policy conclusion and must not enable execution by itself.
    missing.push(
      !evidence.pharmacyApprovalReferencePresent &&
        "pharmacy_approval_reference",
    )
  }

  if (kind === "courier_manual") {
    missing.push(
      !evidence.deliverySopApprovalReferencePresent &&
        "delivery_sop_approval_reference",
    )
  }

  return missing.filter((value): value is string => Boolean(value))
}

function unsupportedAdapterReasonCodes(kind: ServiceCommerceLiveCanaryKind) {
  switch (kind) {
    case "payment":
      return ["PAYMENT_CANARY_ADAPTER_UNSUPPORTED"]
    case "generic_media_safety":
      return [
        "GENERIC_PRIVATE_MEDIA_CANARY_ADAPTER_UNSUPPORTED",
        "GENERIC_MEDIA_SAFETY_CANARY_ADAPTER_UNSUPPORTED",
      ]
    case "pharmacy_media_ocr":
      return [
        "PHARMACY_PRIVATE_MEDIA_CANARY_ADAPTER_UNSUPPORTED",
        "PHARMACY_MEDIA_SAFETY_CANARY_ADAPTER_UNSUPPORTED",
        "PHARMACY_OCR_CANARY_ADAPTER_UNSUPPORTED",
      ]
    case "courier_manual":
      return ["COURIER_CANARY_ADAPTER_UNSUPPORTED"]
    case "meta_whatsapp":
      return []
  }
}

function hasNonEmptyEnvironmentValue(
  environment: Readonly<Record<string, string | undefined>>,
  key: string,
) {
  return Boolean(environment[key]?.trim())
}

function hasProductionProfile(
  environment: Readonly<Record<string, string | undefined>>,
) {
  return environment.APP_ENV === "production"
}

function hasVerifiedDatabaseProfile(
  environment: Readonly<Record<string, string | undefined>>,
) {
  const value = environment.DATABASE_PROFILE_VERIFIED
  return value === "1" || value === "true"
}

function hasHostedDatabaseUrl(
  environment: Readonly<Record<string, string | undefined>>,
) {
  const value = environment.EWATRADE_DATABASE_URL?.trim()
  if (!value) return false
  try {
    const url = new URL(value)
    const hostname = url.hostname
      .trim()
      .toLowerCase()
      .replace(/^\[|\]$/g, "")
    const protocol = url.protocol.toLowerCase()
    const isLocal =
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname === "mysql" ||
      hostname === "postgres" ||
      /^127(?:\.\d{1,3}){3}$/.test(hostname) ||
      hostname.startsWith("::ffff:127.")

    return (protocol === "postgres:" || protocol === "postgresql:") && !isLocal
  } catch {
    return false
  }
}

/**
 * Evaluates offline preflight readiness only. A READY result never permits a
 * provider, database, or network operation. Provider invocation needs a
 * separate owner-authorized process.
 */
export function evaluateServiceCommerceLiveCanaryPreflight(
  input: ServiceCommerceLiveCanaryPreflightInput,
): ServiceCommerceLiveCanaryPreflight {
  if (!isCanaryKind(input.kind)) {
    return {
      executionAuthorized: false,
      kind: null,
      missingEvidence: [],
      missingEnvironmentKeys: [],
      reasonCodes: ["UNSUPPORTED_CANARY_KIND"],
      status: "BLOCKED",
    }
  }

  const missingEnvironmentKeys = ENVIRONMENT_KEYS_BY_KIND[input.kind].filter(
    (key) => !hasNonEmptyEnvironmentValue(input.environment, key),
  )
  const missingEvidence = missingEvidenceFor(input.kind, input.evidence ?? {})
  const unsupportedAdapterReasons = unsupportedAdapterReasonCodes(input.kind)
  const environmentReasonCodes = [
    !hasProductionProfile(input.environment) && "APP_ENV_NOT_PRODUCTION",
    !hasVerifiedDatabaseProfile(input.environment) &&
      "DATABASE_PROFILE_UNVERIFIED",
    !hasHostedDatabaseUrl(input.environment) && "DATABASE_URL_INVALID_OR_LOCAL",
  ].filter((value): value is string => Boolean(value))
  const status =
    missingEnvironmentKeys.length === 0 &&
    missingEvidence.length === 0 &&
    environmentReasonCodes.length === 0 &&
    unsupportedAdapterReasons.length === 0
      ? "READY"
      : "BLOCKED"

  return {
    executionAuthorized: false,
    kind: input.kind,
    missingEvidence,
    missingEnvironmentKeys,
    reasonCodes: [
      ...(missingEnvironmentKeys.length > 0
        ? ["ENVIRONMENT_PREREQUISITES_MISSING"]
        : []),
      ...(missingEvidence.length > 0 ? ["EVIDENCE_PREREQUISITES_MISSING"] : []),
      ...environmentReasonCodes,
      ...unsupportedAdapterReasons,
      "OFFLINE_PREFLIGHT_ONLY",
    ],
    status,
  }
}

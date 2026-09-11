export const QA_ACCELERATOR_CONTRACT_VERSION = 1 as const

export const QA_ACCELERATOR_CLIENT_PLATFORMS = ["mobile", "web"] as const
export type QaAcceleratorClientPlatform =
  (typeof QA_ACCELERATOR_CLIENT_PLATFORMS)[number]

export type QaAcceleratorAvailability =
  | {
      available: true
      contractVersion: typeof QA_ACCELERATOR_CONTRACT_VERSION
      environment: "development" | "preview"
    }
  | {
      available: false
      category:
        | "disabled"
        | "environment_not_allowed"
        | "misconfigured"
        | "origin_not_allowed"
        | "upgrade_required"
      contractVersion: typeof QA_ACCELERATOR_CONTRACT_VERSION
    }

export type QaAcceleratorServerEnv = {
  APP_ENV?: string
  EMAIL_QA_DOMAIN_ROUTES?: string
  NODE_ENV?: string
  QA_ACCELERATOR_ALLOWED_ORIGINS?: string
  QA_ACCELERATOR_ENABLED?: string
  QA_ACCELERATOR_SECRET?: string
}

export type QaFormCoverageKind = "excluded" | "prerequisite" | "recipe"
export type QaFormCoverageDeclaration = {
  formId: string
  kind: QaFormCoverageKind
  reason?: string
  surface: "dashboard" | "marketing" | "mobile"
}

function normalizeEnvironment(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? ""
}

export function isQaAcceleratorClientMode(value: string | null | undefined) {
  const mode = normalizeEnvironment(value)
  return (
    mode === "local" ||
    mode === "dev" ||
    mode === "development" ||
    mode === "preview"
  )
}

export function normalizeQaDomain(value: string) {
  const candidate = value.trim().toLowerCase().replace(/\.$/, "")
  if (
    !candidate ||
    candidate.length > 253 ||
    candidate.includes("://") ||
    candidate.includes("/") ||
    candidate.includes("@") ||
    candidate.includes(":") ||
    candidate.startsWith("*.")
  ) {
    throw new Error("Enter a valid QA Domain without a protocol or path.")
  }

  const labels = candidate.split(".")
  if (
    labels.length < 2 ||
    labels.some(
      (label) =>
        !label ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  ) {
    throw new Error("Enter a valid QA Domain without a protocol or path.")
  }
  return candidate
}

export function configuredQaDomains(
  value: string | null | undefined,
): ReadonlySet<string> {
  if (!value?.trim()) return new Set()

  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return new Set()
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return new Set()
  }

  return new Set(
    Object.keys(parsed).flatMap((domain) => {
      try {
        return [normalizeQaDomain(domain)]
      } catch {
        return []
      }
    }),
  )
}

function configuredOrigins(value: string | null | undefined) {
  return new Set(
    value
      ?.split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .flatMap((entry) => {
        try {
          return [new URL(entry).origin]
        } catch {
          return []
        }
      }) ?? [],
  )
}

export function isConfiguredQaDomain(
  domain: string,
  env: Pick<QaAcceleratorServerEnv, "EMAIL_QA_DOMAIN_ROUTES">,
) {
  return configuredQaDomains(env.EMAIL_QA_DOMAIN_ROUTES).has(
    normalizeQaDomain(domain),
  )
}

export function assertQaAcceleratorStartupSafety(env: QaAcceleratorServerEnv) {
  const appEnvironment = normalizeEnvironment(env.APP_ENV)
  const nodeEnvironment = normalizeEnvironment(env.NODE_ENV)
  const effectiveEnvironment = appEnvironment || nodeEnvironment
  if (
    env.QA_ACCELERATOR_ENABLED === "true" &&
    effectiveEnvironment === "production"
  ) {
    throw new Error(
      "QA accelerator cannot be enabled in a production server environment.",
    )
  }
}

export function getQaAcceleratorAvailability(input: {
  clientContractVersion?: number
  env: QaAcceleratorServerEnv
  origin?: string | null
  platform?: QaAcceleratorClientPlatform
}): QaAcceleratorAvailability {
  assertQaAcceleratorStartupSafety(input.env)
  const appEnvironment = normalizeEnvironment(input.env.APP_ENV)
  const nodeEnvironment = normalizeEnvironment(input.env.NODE_ENV)
  const effectiveEnvironment = appEnvironment || nodeEnvironment

  if (
    effectiveEnvironment === "production" ||
    !["local", "dev", "development", "preview"].includes(effectiveEnvironment)
  ) {
    return {
      available: false,
      category: "environment_not_allowed",
      contractVersion: QA_ACCELERATOR_CONTRACT_VERSION,
    }
  }
  if (input.env.QA_ACCELERATOR_ENABLED !== "true") {
    return {
      available: false,
      category: "disabled",
      contractVersion: QA_ACCELERATOR_CONTRACT_VERSION,
    }
  }
  if (
    !input.env.QA_ACCELERATOR_SECRET?.trim() ||
    input.env.QA_ACCELERATOR_SECRET.trim().length < 32 ||
    configuredQaDomains(input.env.EMAIL_QA_DOMAIN_ROUTES).size === 0
  ) {
    return {
      available: false,
      category: "misconfigured",
      contractVersion: QA_ACCELERATOR_CONTRACT_VERSION,
    }
  }
  if (
    input.clientContractVersion !== undefined &&
    input.clientContractVersion !== QA_ACCELERATOR_CONTRACT_VERSION
  ) {
    return {
      available: false,
      category: "upgrade_required",
      contractVersion: QA_ACCELERATOR_CONTRACT_VERSION,
    }
  }
  if (input.platform === "web") {
    const origins = configuredOrigins(input.env.QA_ACCELERATOR_ALLOWED_ORIGINS)
    let origin: string | null = null
    try {
      origin = input.origin ? new URL(input.origin).origin : null
    } catch {
      origin = null
    }
    if (!origin || !origins.has(origin)) {
      return {
        available: false,
        category: "origin_not_allowed",
        contractVersion: QA_ACCELERATOR_CONTRACT_VERSION,
      }
    }
  }

  return {
    available: true,
    contractVersion: QA_ACCELERATOR_CONTRACT_VERSION,
    environment: effectiveEnvironment === "preview" ? "preview" : "development",
  }
}

export function assertQaFormCoverage(
  inventory: readonly string[],
  declarations: readonly QaFormCoverageDeclaration[],
) {
  const inventorySet = new Set(inventory)
  const counts = new Map<string, number>()
  for (const declaration of declarations) {
    counts.set(declaration.formId, (counts.get(declaration.formId) ?? 0) + 1)
  }

  const missing = inventory.filter((formId) => !counts.has(formId))
  const duplicate = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([formId]) => formId)
  const stale = [...counts.keys()].filter((formId) => !inventorySet.has(formId))
  if (missing.length || duplicate.length || stale.length) {
    throw new Error(
      `Invalid QA form coverage: ${JSON.stringify({ duplicate, missing, stale })}`,
    )
  }
  return { declarations: declarations.length, forms: inventory.length }
}

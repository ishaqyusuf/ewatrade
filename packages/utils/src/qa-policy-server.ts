import { type QaPolicy, type QaPolicyEntry, parseQaPolicy } from "./qa-policy"

const validityMs = 60_000
let cached: { key: string; policy: QaPolicy; fetchedAt: number } | undefined
let pending: { key: string; promise: Promise<QaPolicy> } | undefined
export function qaPolicyTarget(
  env: Record<string, string | undefined> = process.env,
) {
  const value = (env.APP_ENV || env.NODE_ENV || "").trim().toLowerCase()
  if (["local", "dev", "development"].includes(value))
    return "development" as const
  if (value === "preview" || value === "production") return value
  return null
}

/** Server-only central read. A failed refresh never extends the 60-second validity. */
export async function getQaPolicy(
  env: Record<string, string | undefined> = process.env,
): Promise<QaPolicy> {
  if (typeof window !== "undefined") throw new Error("QA policy is server-only")
  const target = qaPolicyTarget(env)
  const rawUrl = env.QA_POLICY_URL?.trim()
  const secret = env.QA_POLICY_READ_KEY?.trim()
  if (!target || !rawUrl || !secret || secret.length < 32)
    throw new Error("QA policy is unavailable.")
  const url = new URL(rawUrl)
  if (
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        target === "development" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/api/qa-policy/v1/ewatrade"
  )
    throw new Error("QA policy address is invalid.")
  const key = `${rawUrl}:${secret}:${target}`
  if (cached?.key === key && Date.now() - cached.fetchedAt < 30_000)
    return cached.policy
  if (pending?.key === key) return pending.promise
  const started = Date.now()
  const promise = (async () => {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${secret}` },
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(3000),
      })
      if (!response.ok) throw new Error("QA policy unavailable")
      const body = await response.text()
      if (body.length > 128_000) throw new Error("QA policy too large")
      const policy = parseQaPolicy(JSON.parse(body))
      if (cached?.key === key && policy.revision < cached.policy.revision)
        throw new Error("QA policy revision regressed")
      cached = { key, policy, fetchedAt: started }
      return policy
    } catch {
      if (cached?.key === key && Date.now() - cached.fetchedAt < validityMs)
        return cached.policy
      throw new Error("QA policy is unavailable.")
    } finally {
      if (pending?.key === key) pending = undefined
    }
  })()
  pending = { key, promise }
  return promise
}

export async function getQaPolicyEnvironment(
  env: Record<string, string | undefined> = process.env,
) {
  let policy: QaPolicy | null = null
  try {
    policy = await getQaPolicy(env)
  } catch {
    /* QA fails closed; ordinary authentication remains available. */
  }
  const target = qaPolicyTarget(env)
  const enabled = !!(target && policy?.environments[target])
  const routes = Object.fromEntries(
    (enabled ? (policy?.entries ?? []) : [])
      .filter((e) => e.active)
      .map((e) => [e.qa, e.email]),
  )
  return {
    ...env,
    EMAIL_QA_DOMAIN_ROUTES: JSON.stringify(routes),
    QA_TOOLS_ENABLED: String(enabled),
    QA_ACCELERATOR_ENABLED: String(enabled && target !== "production"),
  }
}

export async function managedQaIdentity(
  input: {
    email?: string | null
    phone?: string | null
    userId?: string | null
    entryId?: string | null
  },
  options: { requireActive?: boolean } = {},
): Promise<QaPolicyEntry | null> {
  const reserved = input.email?.trim().toLowerCase().endsWith(".test")
  let policy: QaPolicy
  try {
    policy = await getQaPolicy()
  } catch (error) {
    if (reserved || input.entryId || (input.phone && process.env.QA_POLICY_URL))
      throw error
    return null
  }
  const domain = input.email?.trim().toLowerCase().split("@")[1]
  const matches = policy.entries.filter(
    (e) =>
      e.id === input.entryId ||
      e.qa === domain ||
      (!!input.phone && e.phone === input.phone) ||
      (!!input.userId && e.accountId === input.userId),
  )
  if (matches.length > 1) throw new Error("QA identity bindings conflict.")
  const entry = matches[0] ?? null
  if (
    input.entryId &&
    (!entry ||
      entry.id !== input.entryId ||
      !input.phone ||
      entry.phone !== input.phone)
  )
    throw new Error("The selected QA phone no longer matches.")
  if (entry?.accountId && input.userId && entry.accountId !== input.userId)
    throw new Error("QA account binding does not match.")
  if (reserved && !entry) throw new Error("This QA identity is not configured.")
  const target = qaPolicyTarget()
  if (
    entry &&
    options.requireActive !== false &&
    (!entry.active || !target || !policy.environments[target])
  )
    throw new Error("QA entry is disabled.")
  return entry
}

export async function managedQaDomainEnabled(domain: string) {
  try {
    return !!(await managedQaIdentity({ email: `qa@${domain}` }))
  } catch {
    return false
  }
}

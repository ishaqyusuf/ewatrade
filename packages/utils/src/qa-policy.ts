export type QaPolicyEntry = {
  id: string
  name?: string | null
  email: string
  qa: string
  phone: string | null
  accountId: string | null
  active: boolean
}
export type QaPolicy = {
  projectId: "ewatrade"
  revision: number
  environments: Record<"development" | "preview" | "production", boolean>
  entries: QaPolicyEntry[]
}

export function parseQaPolicy(value: unknown): QaPolicy {
  if (!value || typeof value !== "object") throw new Error("Invalid QA policy")
  const p = value as Partial<QaPolicy>
  if (
    p.projectId !== "ewatrade" ||
    typeof p.revision !== "number" ||
    !Number.isInteger(p.revision) ||
    p.revision < 0 ||
    !p.environments ||
    ["development", "preview", "production"].some(
      (k) =>
        typeof p.environments?.[k as keyof QaPolicy["environments"]] !==
        "boolean",
    ) ||
    !Array.isArray(p.entries) ||
    p.entries.length > 100
  )
    throw new Error("Invalid QA policy")
  const ids = new Set<string>()
  const domains = new Set<string>()
  const phones = new Set<string>()
  const accounts = new Set<string>()
  for (const e of p.entries) {
    if (
      !e ||
      typeof e.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(e.id) ||
      !(
        e.name === undefined ||
        e.name === null ||
        (typeof e.name === "string" &&
          e.name.trim().length > 0 &&
          e.name.length <= 120)
      ) ||
      typeof e.email !== "string" ||
      e.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.email) ||
      /\.(test|invalid|localhost)$/.test(e.email) ||
      typeof e.qa !== "string" ||
      e.qa.length > 253 ||
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+test$/.test(e.qa) ||
      typeof e.active !== "boolean" ||
      !(
        e.phone === null ||
        (typeof e.phone === "string" && /^\+[1-9]\d{7,14}$/.test(e.phone))
      ) ||
      !(
        e.accountId === null ||
        (typeof e.accountId === "string" &&
          e.accountId.length > 0 &&
          e.accountId.length <= 100)
      ) ||
      ids.has(e.id) ||
      domains.has(e.qa) ||
      (e.phone && phones.has(e.phone)) ||
      (e.accountId && accounts.has(e.accountId))
    )
      throw new Error("Invalid QA entry")
    ids.add(e.id)
    domains.add(e.qa)
    if (e.phone) phones.add(e.phone)
    if (e.accountId) accounts.add(e.accountId)
  }
  return p as QaPolicy
}

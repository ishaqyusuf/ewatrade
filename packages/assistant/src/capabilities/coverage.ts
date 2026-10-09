import { procedureRules } from "./inventory"
import { capabilityManifest } from "./manifest"
import type { Capability, CoverageOwner, ProcedureRule } from "./types"

export type RouterProcedure = {
  path: string
  type: string
  /** Built on the tenant-scoped protected procedure. */
  merchant: boolean
  /** Canonical scoped-staff grant; null means Owner/Admin only. */
  staffAction?: string | null
}
export type CoverageRow = {
  path: string
  type: string
  audience: "merchant" | "other"
  owner: CoverageOwner
  status: "supported" | ProcedureRule["status"]
  detail: string
  staffAction: string | null
}

const ticketPattern = /^[A-HS]\d{2}$/
const nonMerchant: ProcedureRule = {
  owner: "platform",
  status: "excluded",
  reason: "Public, account or internal audience; not a merchant operation.",
}

function matches(pattern: string, path: string) {
  if (!pattern.includes("*")) return pattern === path
  const source = pattern
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*")
  return new RegExp(`^${source}$`).test(path)
}

/** Exact path first, then the longest matching pattern. */
export function ruleFor(
  path: string,
  rules: Record<string, ProcedureRule> = procedureRules,
) {
  if (rules[path]) return { pattern: path, rule: rules[path] }
  const pattern = Object.keys(rules)
    .filter((key) => key.includes("*") && matches(key, path))
    .sort((a, b) => b.length - a.length)[0]
  return pattern ? { pattern, rule: rules[pattern] } : null
}

/** Structural checks that need no router listing. */
export function validateCapabilityManifest(
  manifest: readonly Capability[] = capabilityManifest,
) {
  const errors: string[] = []
  const seen = new Set<string>()
  const actions = new Set<string>()
  const tools = new Map<string, string>()
  for (const capability of manifest) {
    const label = capability.id
    if (seen.has(capability.id)) errors.push(`${label}: duplicate ID`)
    seen.add(capability.id)
    if (!/^[a-z_]+(\.[a-z_]+)+$/.test(capability.id))
      errors.push(`${label}: ID must be dotted lower snake case`)
    if (!Number.isInteger(capability.version) || capability.version < 1)
      errors.push(`${label}: version must be a positive integer`)
    if (!capability.policy.roles.length)
      errors.push(`${label}: policy has no roles`)
    if (!capability.procedures.length)
      errors.push(`${label}: no canonical procedure`)
    if (!capability.clients.length) errors.push(`${label}: no client`)
    if (!capability.brain) errors.push(`${label}: no Brain link`)
    if (capability.mode === "write") {
      if (actions.has(capability.action))
        errors.push(`${label}: duplicate action ${capability.action}`)
      actions.add(capability.action)
      if (!capability.receipt) errors.push(`${label}: no receipt`)
      if (!capability.tests.length) errors.push(`${label}: no tests`)
      const parsed = capability.schema.safeParse({ action: capability.action })
      const actionIssue =
        !parsed.success &&
        parsed.error.issues.some((issue) => issue.path[0] === "action")
      if (actionIssue)
        errors.push(`${label}: schema does not accept ${capability.action}`)
    } else {
      const owner = tools.get(capability.tool)
      if (owner)
        errors.push(`${label}: tool ${capability.tool} used by ${owner}`)
      tools.set(capability.tool, capability.id)
    }
  }
  return errors
}

/** Classify every router procedure and report anything unmapped or stale. */
export function buildCapabilityCoverage(
  procedures: readonly RouterProcedure[],
  manifest: readonly Capability[] = capabilityManifest,
  rules: Record<string, ProcedureRule> = procedureRules,
) {
  const errors = validateCapabilityManifest(manifest)
  const paths = new Set(procedures.map((procedure) => procedure.path))
  const supported = new Map<string, Capability[]>()
  for (const capability of manifest)
    for (const path of capability.procedures) {
      if (!paths.has(path))
        errors.push(`${capability.id}: unknown procedure ${path}`)
      supported.set(path, [...(supported.get(path) ?? []), capability])
    }
  for (const [pattern, rule] of Object.entries(rules)) {
    if (rule.status === "planned" && !ticketPattern.test(rule.ticket))
      errors.push(`${pattern}: unknown ticket ${rule.ticket}`)
    if (!procedures.some((procedure) => matches(pattern, procedure.path)))
      errors.push(`${pattern}: rule matches no procedure`)
    if (supported.has(pattern))
      errors.push(`${pattern}: supported by the manifest and also classified`)
  }
  const rows: CoverageRow[] = procedures.map((procedure) => {
    const audience = procedure.merchant ? "merchant" : "other"
    const capabilities = supported.get(procedure.path)
    const [first] = capabilities ?? []
    if (capabilities && first)
      return {
        path: procedure.path,
        type: procedure.type,
        audience,
        owner: first.domain,
        status: "supported",
        detail: capabilities.map((capability) => capability.id).join(", "),
        staffAction: procedure.staffAction ?? null,
      }
    const match = ruleFor(procedure.path, rules)
    if (!match && procedure.merchant)
      errors.push(`${procedure.path}: merchant procedure is not classified`)
    const rule = match?.rule ?? nonMerchant
    return {
      path: procedure.path,
      type: procedure.type,
      audience,
      owner: rule.owner,
      status: rule.status,
      detail: rule.status === "planned" ? rule.ticket : rule.reason,
      staffAction: procedure.staffAction ?? null,
    }
  })
  return {
    rows: rows.sort((a, b) => a.path.localeCompare(b.path)),
    errors,
  }
}

export function renderCoverageMarkdown(
  rows: readonly CoverageRow[],
  manifest: readonly Capability[] = capabilityManifest,
) {
  const merchant = rows.filter((row) => row.audience === "merchant")
  const count = (status: CoverageRow["status"]) =>
    merchant.filter((row) => row.status === status).length
  const tickets = new Map<string, number>()
  for (const row of merchant)
    if (row.status === "planned")
      tickets.set(row.detail, (tickets.get(row.detail) ?? 0) + 1)
  const cell = (value: string) => value.replaceAll("|", "\\|")
  const staff = (row?: CoverageRow) =>
    row ? (row.staffAction ?? "Owner/Admin only") : "?"
  const byPath = new Map(rows.map((row) => [row.path, row]))
  return `# Assistant capability coverage

Generated by \`bun --cwd apps/api assistant:coverage\`. Do not edit by hand;
change \`packages/assistant/src/capabilities/\` and regenerate.
Tickets refer to the Brain plan \`.brain/plans/2026-10-09-assistant-business-operations.md\`.

## Summary

- Router procedures: ${rows.length} (${merchant.length} merchant, ${rows.length - merchant.length} public/account/internal)
- Merchant supported by a capability: ${count("supported")}
- Merchant planned: ${count("planned")}
- Merchant form-only: ${count("form_only")}
- Merchant excluded: ${count("excluded")}
- Capabilities: ${manifest.length} (${manifest.filter((entry) => entry.mode === "read").length} read, ${manifest.filter((entry) => entry.mode === "write").length} write)

## Capabilities

| ID | v | Mode | Tool | Roles | Scoped staff | Clients | Rollout | Procedures |
|---|---|---|---|---|---|---|---|---|
${manifest
  .map(
    (entry) =>
      `| \`${entry.id}\` | ${entry.version} | ${entry.mode === "write" ? `write (\`${entry.action}\`)` : "read"} | \`${entry.tool}\` | ${entry.policy.roles.join(", ")} | ${entry.procedures.map((path) => staff(byPath.get(path))).join(", ")} | ${entry.clients.join(", ")} | ${entry.rollout} | ${entry.procedures.map((path) => `\`${path}\``).join(", ")} |`,
  )
  .join("\n")}

## Planned merchant procedures by ticket

| Ticket | Procedures |
|---|---|
${[...tickets]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([ticket, total]) => `| ${ticket} | ${total} |`)
  .join("\n")}

## Merchant procedures

| Procedure | Type | Scoped staff | Owner | Status | Capability, ticket or reason |
|---|---|---|---|---|---|
${merchant
  .map(
    (row) =>
      `| \`${row.path}\` | ${row.type} | ${staff(row)} | ${row.owner} | ${row.status} | ${cell(row.detail)} |`,
  )
  .join("\n")}
`
}

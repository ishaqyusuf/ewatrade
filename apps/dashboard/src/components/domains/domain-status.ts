import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

export type DomainRow = RouterOutputs["domains"]["list"][number]
type DomainStatus = DomainRow["status"]

/** One plain label per connection status; codes never reach the screen. */
export const DOMAIN_STATUS: Record<
  DomainStatus,
  { label: string; tone: "ok" | "warn" | "info" | "bad" | "muted" }
> = {
  ACTIVE: { label: "Live", tone: "ok" },
  OWNERSHIP_PENDING: { label: "Needs one record", tone: "warn" },
  DNS_CONFIGURING: { label: "Connecting", tone: "info" },
  VERIFYING: { label: "Connecting", tone: "info" },
  FAILED: { label: "Needs attention", tone: "bad" },
  DISCONNECTED: { label: "Disconnected", tone: "muted" },
}

export const DOMAIN_STATUS_TONE = {
  ok: "bg-success text-success-foreground",
  warn: "bg-warning text-warning-foreground",
  info: "bg-info text-info-foreground",
  bad: "bg-danger text-danger-foreground",
  muted: "bg-muted text-muted-foreground",
} as const

const PROVIDER_LABEL: Record<string, string> = {
  GO54: "GO54",
  OPENPROVIDER: "Openprovider",
  EXTERNAL: "Another company",
}

/** Where the domain was bought. */
export function domainBoughtFrom(domain: Pick<DomainRow, "provider">) {
  return PROVIDER_LABEL[domain.provider] ?? "Another company"
}

const renewDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
})

/** When it renews, or that the other company handles renewal. */
export function domainRenews(domain: Pick<DomainRow, "expiresAt">) {
  return domain.expiresAt
    ? renewDate.format(new Date(domain.expiresAt))
    : "At the other company"
}

/** Waiting for the ownership record the owner adds where they bought it. */
export function domainNeedsRecord(
  domain: Pick<DomainRow, "status" | "verification">,
) {
  return (
    (domain.status === "OWNERSHIP_PENDING" || domain.status === "FAILED") &&
    Boolean(domain.verification.name && domain.verification.value)
  )
}

/** Count line: "1 domain", "3 domains". */
export function domainCount(count: number) {
  return `${count} domain${count === 1 ? "" : "s"}`
}

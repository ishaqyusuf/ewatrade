import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"

export type DomainRow = RouterOutputs["domains"]["list"][number]
type DomainStatus = DomainRow["status"]

/** One plain label per connection status; codes never reach the screen. */
export const DOMAIN_STATUS: Record<
  DomainStatus,
  { label: string; tone: "ok" | "warn" | "info" | "bad" | "muted" }
> = {
  ACTIVE: { label: "Live", tone: "ok" },
  OWNERSHIP_PENDING: { label: "Waiting for DNS record", tone: "warn" },
  DNS_CONFIGURING: { label: "Setting up", tone: "info" },
  VERIFYING: { label: "Checking", tone: "info" },
  FAILED: { label: "Needs attention", tone: "bad" },
  DISCONNECTED: { label: "Disconnected", tone: "muted" },
}

export const DOMAIN_STATUS_TONE = {
  ok: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  bad: "bg-red-500/15 text-red-700 dark:text-red-300",
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

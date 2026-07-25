import type { DomainLifecycleStatus, DomainProviderName } from "./types"

const ACTIVE_STATUSES = new Set([
  "act",
  "active",
  "registered",
  "registration successful",
  "success",
])
const PENDING_STATUSES = new Set([
  "pending",
  "pen",
  "pre",
  "processing",
  "req",
  "requested",
  "registering",
  "rrq",
  "sch",
])
const FAILED_STATUSES = new Set([
  "error",
  "fai",
  "failed",
  "registration failed",
])

export function normalizeProviderDomainStatus(
  _provider: DomainProviderName,
  value: unknown,
): DomainLifecycleStatus {
  const status = String(value ?? "")
    .trim()
    .toLowerCase()

  if (!status) return "unknown"
  if (ACTIVE_STATUSES.has(status)) return "active"
  if (PENDING_STATUSES.has(status)) return "pending"
  if (FAILED_STATUSES.has(status)) return "failed"
  if (status.includes("redemption")) return "redemption"
  if (status.includes("suspend") || status.includes("hold")) return "suspended"
  if (status === "del") return "expired"
  if (status.includes("expir")) return "expired"
  if (status.includes("transfer")) return "transferred_out"
  if (status === "404" || status === "not found" || status === "not_found") {
    return "not_found"
  }

  return "unknown"
}

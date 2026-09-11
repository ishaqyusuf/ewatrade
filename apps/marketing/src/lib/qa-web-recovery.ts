export type QaWebStatus =
  | "authorized"
  | "checking"
  | "needs_authorization"
  | "network_unavailable"
  | "unavailable"
  | "upgrade_required"

export type QaWebCapabilityResult = {
  available: boolean
  category?: string
}

export function statusForQaWebCapability(
  capability: QaWebCapabilityResult | null,
): QaWebStatus | "revalidate" {
  if (!capability) return "network_unavailable"
  if (capability.available) return "revalidate"
  return capability.category === "upgrade_required"
    ? "upgrade_required"
    : "unavailable"
}

export function statusForQaWebRevalidation(
  responseStatus: number | null,
): QaWebStatus {
  if (responseStatus === null) return "network_unavailable"
  if (responseStatus >= 200 && responseStatus < 300) return "authorized"
  if (responseStatus === 401) return "needs_authorization"
  if (responseStatus === 412 || responseStatus === 426) {
    return "upgrade_required"
  }
  return "unavailable"
}

export function shouldBlockQaWebStatus(status: QaWebStatus) {
  return status !== "authorized"
}

import type { DomainSheetMode } from "@/hooks/use-domain-params"
import { type DomainRow, domainNeedsRecord } from "./domain-status"

const copy: Record<DomainSheetMode, { description: string; title: string }> = {
  buy: {
    title: "Buy a domain",
    description: "Search, add the legal owner, and pay in a few steps.",
  },
  connect: {
    title: "Connect a domain",
    description:
      "Prove ownership with one DNS record, then we connect hosting.",
  },
  details: {
    title: "Domain details",
    description: "Its status, store and renewal date.",
  },
  progress: {
    title: "Domain setup",
    description: "Payment and registration continue safely in the background.",
  },
}

export function getDomainSheetHeader(
  mode: DomainSheetMode,
  domain?: DomainRow | null,
) {
  if (mode !== "details" || !domain) return copy[mode]
  if (domainNeedsRecord(domain))
    return {
      title: `Connect ${domain.hostname}`,
      description:
        "Prove you own this domain, then we connect it to your online store.",
    }
  return {
    title: domain.hostname,
    description: DETAILS_DESCRIPTION[domain.status](domain.isPrimary),
  }
}

const DETAILS_DESCRIPTION: Record<
  DomainRow["status"],
  (primary: boolean) => string
> = {
  ACTIVE: (primary) =>
    primary
      ? "Your main web address. Customers can visit it now."
      : "Customers can visit this address now.",
  OWNERSHIP_PENDING: () =>
    "Add the record where you bought this domain, then check again.",
  DNS_CONFIGURING: () =>
    "We're connecting this address to your online store. You can close this.",
  VERIFYING: () =>
    "We're connecting this address to your online store. This can take up to an hour.",
  FAILED: () =>
    "We couldn't connect this address. Check again, or contact support if it keeps happening.",
  DISCONNECTED: () => "This address no longer opens your online store.",
}

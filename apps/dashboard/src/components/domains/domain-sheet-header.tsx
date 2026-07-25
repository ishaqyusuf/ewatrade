import type { DomainSheetMode } from "@/hooks/use-domain-params"

const copy: Record<DomainSheetMode, { description: string; title: string }> = {
  buy: {
    title: "Buy a domain",
    description: "Search, add the legal owner, and pay in a few steps.",
  },
  connect: {
    title: "Connect an existing domain",
    description:
      "Prove ownership with one DNS record, then we connect hosting.",
  },
  details: {
    title: "Domain details",
    description: "Review connection, registrar, and renewal state.",
  },
  progress: {
    title: "Domain setup",
    description: "Payment and registration continue safely in the background.",
  },
}

export function getDomainSheetHeader(mode: DomainSheetMode) {
  return copy[mode]
}

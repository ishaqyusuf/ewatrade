"use client"

import { useDomainParams } from "@/hooks/use-domain-params"
import { useTRPC } from "@/trpc/client"
import { useQuery } from "@tanstack/react-query"
import { DomainDetails } from "./domain-details"
import { DomainProgress } from "./domain-progress"
import { DomainPurchaseFlow } from "./domain-purchase-flow"
import { ExternalDomainFlow } from "./external-domain-flow"

export function DomainContent({
  store,
}: {
  store: { id: string; name: string }
}) {
  const trpc = useTRPC()
  const { domainId, mode } = useDomainParams()
  const domains = useQuery(trpc.domains.list.queryOptions({}))
  const selected =
    domains.data?.find((domain) => domain.id === domainId) ?? null

  if (mode === "buy") return <DomainPurchaseFlow store={store} />
  if (mode === "connect") return <ExternalDomainFlow store={store} />
  if (mode === "progress") return <DomainProgress />
  return <DomainDetails domain={selected} />
}

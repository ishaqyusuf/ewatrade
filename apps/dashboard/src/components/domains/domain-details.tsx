"use client"

import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Button } from "@ewatrade/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"

type DomainRow = RouterOutputs["domains"]["list"][number]

export function DomainDetails({ domain }: { domain: DomainRow | null }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const retry = useMutation(
    trpc.domains.verifyConnection.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.domains.list.queryFilter())
      },
    }),
  )

  if (!domain) {
    return <p className="text-sm text-muted-foreground">Domain not found.</p>
  }

  return (
    <div className="grid gap-4">
      <dl className="grid gap-5 rounded-xl border border-border p-5 text-sm">
        <div>
          <dt className="text-muted-foreground">Domain</dt>
          <dd className="mt-1 text-base font-semibold">{domain.hostname}</dd>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-muted-foreground">Registrar</dt>
            <dd className="mt-1 font-medium">{domain.provider}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Connection</dt>
            <dd className="mt-1 font-medium">{domain.status}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Store</dt>
            <dd className="mt-1 font-medium">{domain.store.name}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Expires</dt>
            <dd className="mt-1 font-medium">
              {domain.expiresAt
                ? new Date(domain.expiresAt).toLocaleDateString()
                : "Not managed here"}
            </dd>
          </div>
        </div>
        {domain.status !== "ACTIVE" &&
        domain.verification.name &&
        domain.verification.value ? (
          <div className="grid gap-3 border-t border-border pt-4">
            <p className="font-medium">
              Add this {domain.verification.type ?? "TXT"} record at your DNS
              provider
            </p>
            <div>
              <dt className="text-muted-foreground">Name</dt>
              <dd className="mt-1 break-all font-mono">
                {domain.verification.name}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Value</dt>
              <dd className="mt-1 break-all font-mono">
                {domain.verification.value}
              </dd>
            </div>
          </div>
        ) : null}
      </dl>
      <div className="flex flex-wrap gap-2">
        {(domain.status === "FAILED" ||
          domain.status === "OWNERSHIP_PENDING") && (
          <Button
            disabled={retry.isPending}
            variant="outline"
            onClick={() => retry.mutate({ connectionId: domain.id })}
          >
            {retry.isPending ? "Retrying setup…" : "Retry setup"}
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() =>
            navigator.clipboard.writeText(`https://${domain.hostname}`)
          }
        >
          Copy storefront URL
        </Button>
      </div>
    </div>
  )
}

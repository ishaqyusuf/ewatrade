"use client"

import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import type { DomainRow } from "./columns"

export function DomainActionsMenu({
  domain,
  onManage,
}: {
  domain: DomainRow
  onManage: (domain: DomainRow) => void
}) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const retry = useMutation(
    trpc.domains.verifyConnection.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.domains.list.queryFilter())
      },
    }),
  )

  return (
    <div
      className="flex justify-end gap-1"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <Button size="sm" variant="ghost" onClick={() => onManage(domain)}>
        Manage
      </Button>
      {domain.status === "FAILED" || domain.status === "OWNERSHIP_PENDING" ? (
        <Button
          disabled={retry.isPending}
          size="sm"
          variant="ghost"
          onClick={() => retry.mutate({ connectionId: domain.id })}
        >
          {retry.isPending ? "Retrying…" : "Retry"}
        </Button>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        onClick={() =>
          navigator.clipboard.writeText(`https://${domain.hostname}`)
        }
      >
        Copy URL
      </Button>
    </div>
  )
}

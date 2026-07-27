"use client"

import { useTRPC } from "@/trpc/client"
import { Button } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

export function QaMaintenance() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [confirmation, setConfirmation] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const candidates = useQuery(trpc.qaMaintenance.candidates.queryOptions())
  const preview = useQuery(trpc.qaMaintenance.preview.queryOptions())
  const adopt = useMutation(
    trpc.qaMaintenance.adopt.mutationOptions({
      onSuccess: async () => {
        setSelected([])
        await Promise.all([
          queryClient.invalidateQueries(
            trpc.qaMaintenance.candidates.queryFilter(),
          ),
          queryClient.invalidateQueries(
            trpc.qaMaintenance.preview.queryFilter(),
          ),
        ])
      },
    }),
  )
  const purge = useMutation(
    trpc.qaMaintenance.start.mutationOptions({
      onSuccess: () => setConfirmation(""),
    }),
  )

  return (
    <div className="grid gap-6">
      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-medium">Candidate QA tenants</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Adoption is explicit; matching an email domain alone never makes a
          tenant purgeable.
        </p>
        <div className="mt-4 grid gap-2">
          {candidates.data?.map((candidate) => (
            <label
              key={candidate.id}
              className="flex items-center gap-3 text-sm"
            >
              <input
                type="checkbox"
                checked={selected.includes(candidate.id)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, candidate.id]
                      : current.filter((id) => id !== candidate.id),
                  )
                }
              />
              <span>{candidate.name}</span>
            </label>
          ))}
          {!candidates.data?.length && (
            <p className="text-sm text-muted-foreground">
              No candidates found.
            </p>
          )}
        </div>
        <Button
          className="mt-4"
          variant="outline"
          disabled={!selected.length || adopt.isPending}
          onClick={() => adopt.mutate({ tenantIds: selected })}
        >
          Adopt selected as QA
        </Button>
      </section>

      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-medium">Purge preview</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {Object.entries(preview.data?.counts ?? {}).map(([label, value]) => (
            <div key={label} className="rounded-lg border p-3">
              <div className="text-muted-foreground">{label}</div>
              <div className="mt-1 text-lg font-semibold">{String(value)}</div>
            </div>
          ))}
        </div>
        {!!preview.data?.blockers.length && (
          <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            Deletion is blocked by {preview.data.blockers.length} live
            commercial resource(s).
          </div>
        )}
        <label className="mt-5 grid gap-2 text-sm">
          Type <strong>PURGE ALL QA DATA</strong> to permanently continue.
          <input
            className="h-10 rounded-md border bg-background px-3"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>
        <Button
          className="mt-3"
          variant="destructive"
          disabled={
            confirmation !== "PURGE ALL QA DATA" ||
            !preview.data?.previewToken ||
            !!preview.data.blockers.length ||
            purge.isPending
          }
          onClick={() =>
            preview.data?.previewToken &&
            purge.mutate({
              confirmation: "PURGE ALL QA DATA",
              previewToken: preview.data.previewToken,
            })
          }
        >
          Permanently purge all QA data
        </Button>
      </section>
    </div>
  )
}

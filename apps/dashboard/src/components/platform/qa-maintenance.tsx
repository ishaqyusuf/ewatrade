"use client"

import { ConfirmAlert } from "@/components/forms/confirm-alert"
import { FormFeedback } from "@/components/forms/form-feedback"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import { Badge, Button, Checkbox, Input } from "@ewatrade/ui"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"

type Preview = RouterOutputs["qaMaintenance"]["preview"]
type RunStatus = NonNullable<RouterOutputs["qaMaintenance"]["run"]>["status"]

/** The literal the API requires; people type DELETE in the dialog instead. */
const PURGE_CONFIRMATION = "PURGE ALL QA DATA"
const ENVIRONMENT = { development: "Development", preview: "Preview" } as const
const BLOCKER = {
  live_subscription: "paid plan still active",
  purchased_domain: "bought a domain",
} as const
const RUN_STATUS: Record<RunStatus, string> = {
  QUEUED: "Waiting to start",
  RUNNING: "Deleting…",
  COMPLETED: "Done. QA data deleted.",
  PARTIALLY_COMPLETED: "Some QA businesses couldn’t be deleted.",
  FAILED: "Delete failed. Nothing more was removed.",
  BLOCKED: "Stopped: a QA business still has a paid plan or domain.",
}

const surface =
  "overflow-hidden rounded-[var(--ui-radius-surface)] border border-border bg-card"

function plural(count: number, one: string, many = `${one}s`) {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`
}

function Section({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="grid gap-3">
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** QA data first (the page's one job), then businesses that could become QA. */
export function QaMaintenance() {
  return (
    <div className="grid max-w-3xl gap-10">
      <QaData />
      <QaCandidates />
    </div>
  )
}

function QaData() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const preview = useQuery(trpc.qaMaintenance.preview.queryOptions())
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const [runId, setRunId] = useState<string | null>(null)
  const run = useQuery(
    trpc.qaMaintenance.run.queryOptions(
      { runId: runId ?? "" },
      { enabled: Boolean(runId) },
    ),
  )
  const purge = useMutation(
    trpc.qaMaintenance.start.mutationOptions({
      onSuccess: (started) => {
        setRunId(started.id)
        setOpen(false)
        setTyped("")
      },
      onError: () =>
        queryClient.invalidateQueries(trpc.qaMaintenance.preview.queryFilter()),
    }),
  )

  if (preview.isPending)
    return (
      <Section title="QA data">
        <div className={`h-40 animate-pulse ${surface} bg-muted`} />
      </Section>
    )
  if (preview.isError)
    return (
      <Section title="QA data">
        <FormFeedback appearance="dashboard">
          {preview.error.message}
        </FormFeedback>
      </Section>
    )

  const data = preview.data
  const environment = ENVIRONMENT[data.environment] ?? "Development"
  const businesses = data.counts.tenants
  const blocked = data.blockers.length > 0
  const empty = businesses === 0

  return (
    <Section
      title="QA data"
      action={
        <Badge variant="outline" className="h-8 px-3 text-sm">
          {environment}
        </Badge>
      }
    >
      <div className={surface}>
        <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
          {(
            [
              ["Businesses", data.counts.tenants],
              ["Stores", data.counts.stores],
              ["Members", data.counts.memberships],
              ["People", data.counts.users],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="grid gap-1 bg-card p-4">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-2xl font-semibold tabular-nums">
                {value.toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>
        {data.tenants.length ? (
          <details className="border-t border-border">
            <summary className="flex min-h-11 cursor-pointer items-center px-4 font-medium">
              Show {plural(data.tenants.length, "business", "businesses")}
            </summary>
            <ul className="max-h-80 divide-y divide-border overflow-y-auto border-t border-border">
              {data.tenants.map((tenant) => (
                <li
                  key={tenant.id}
                  className="flex min-h-11 items-center justify-between gap-3 px-4 py-2"
                >
                  <span className="min-w-0 truncate">{tenant.name}</span>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    {tenant.qaSourceDomain}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>

      {blocked ? (
        <div
          role="alert"
          className="grid gap-2 rounded-[var(--ui-radius-surface)] border border-border bg-warning p-4 text-warning-foreground"
        >
          <p className="font-medium">Can’t delete yet</p>
          <ul className="grid gap-1">
            {data.blockers.map((blocker) => (
              <li key={`${blocker.tenantId}:${blocker.category}`}>
                {blocker.tenantName}: {BLOCKER[blocker.category]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {runId ? (
        <output className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--ui-radius-surface)] border border-border bg-card p-4">
          <p className="font-medium">
            {run.data ? RUN_STATUS[run.data.status] : "Delete started"}
          </p>
          <Button
            variant="outline"
            disabled={run.isFetching}
            onClick={() => {
              void run.refetch()
              void preview.refetch()
            }}
          >
            {run.isFetching ? "Checking…" : "Check progress"}
          </Button>
        </output>
      ) : null}

      <Button
        variant="destructive"
        className="w-full sm:w-fit"
        disabled={empty || blocked || purge.isPending}
        onClick={() => {
          purge.reset()
          setTyped("")
          setOpen(true)
        }}
      >
        Delete QA data
      </Button>
      {empty ? (
        <p className="text-muted-foreground">No QA data in {environment}.</p>
      ) : null}

      <ConfirmAlert
        open={open}
        danger
        pending={purge.isPending}
        disabled={typed.trim().toUpperCase() !== "DELETE"}
        title={`Delete all QA data in ${environment}?`}
        description={`${plural(businesses, "QA business", "QA businesses")}, ${plural(data.counts.stores, "store")}, ${plural(data.counts.memberships, "member")} and ${plural(data.counts.users, "person", "people")}. This can’t be undone.`}
        action="Delete QA data"
        onCancel={() => setOpen(false)}
        onConfirm={() =>
          purge.mutate({
            confirmation: PURGE_CONFIRMATION,
            previewToken: data.previewToken,
          })
        }
      >
        <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-[var(--ui-radius-item)] border border-border">
          {data.tenants.map((tenant) => (
            <li key={tenant.id} className="truncate px-3 py-2">
              {tenant.name}
            </li>
          ))}
        </ul>
        <div className="grid gap-2">
          <label htmlFor="qa-delete-confirm" className="font-medium">
            Type <span className="font-semibold">DELETE</span> to confirm
          </label>
          <Input
            id="qa-delete-confirm"
            autoComplete="off"
            value={typed}
            disabled={purge.isPending}
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
        {purge.isError ? (
          <FormFeedback appearance="dashboard">
            {purge.error.data?.code === "CONFLICT"
              ? "The list changed. Check it again, then delete."
              : purge.error.message}
          </FormFeedback>
        ) : null}
      </ConfirmAlert>
    </Section>
  )
}

function QaCandidates() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const candidates = useQuery(trpc.qaMaintenance.candidates.queryOptions())
  const [selected, setSelected] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const adopt = useMutation(
    trpc.qaMaintenance.adopt.mutationOptions({
      onSuccess: async () => {
        setOpen(false)
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
  const chosen = (candidates.data ?? []).filter((candidate) =>
    selected.includes(candidate.id),
  )

  return (
    <Section
      title="Test owners in live data"
      action={
        candidates.data?.length ? (
          <Button
            variant="outline"
            className="max-sm:w-full"
            disabled={!chosen.length || adopt.isPending}
            onClick={() => {
              adopt.reset()
              setOpen(true)
            }}
          >
            {chosen.length ? `Mark ${chosen.length} as QA` : "Mark as QA"}
          </Button>
        ) : null
      }
    >
      {candidates.isPending ? (
        <div className={`h-24 animate-pulse ${surface} bg-muted`} />
      ) : candidates.isError ? (
        <FormFeedback appearance="dashboard">
          {candidates.error.message}
        </FormFeedback>
      ) : candidates.data.length ? (
        <ul className={`divide-y divide-border ${surface}`}>
          {candidates.data.map((candidate) => {
            const id = `qa-candidate-${candidate.id}`
            return (
              <li key={candidate.id}>
                <label
                  htmlFor={id}
                  className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2 hover:bg-[var(--hover)]"
                >
                  <Checkbox
                    id={id}
                    disabled={adopt.isPending}
                    checked={selected.includes(candidate.id)}
                    onCheckedChange={(checked) =>
                      setSelected((current) =>
                        checked
                          ? [...current, candidate.id]
                          : current.filter((value) => value !== candidate.id),
                      )
                    }
                  />
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate font-medium">
                      {candidate.name}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">
                      Owner on {candidate.qaSourceDomain}
                    </span>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground">None found.</p>
      )}

      <ConfirmAlert
        open={open}
        pending={adopt.isPending}
        title={`Mark ${plural(chosen.length, "business", "businesses")} as QA?`}
        description={`${chosen.length === 1 ? "It joins" : "They join"} the QA data above and ${chosen.length === 1 ? "is" : "are"} deleted with it.`}
        action="Mark as QA"
        onCancel={() => setOpen(false)}
        onConfirm={() =>
          adopt.mutate({ tenantIds: chosen.map((candidate) => candidate.id) })
        }
      >
        <ul className="max-h-40 divide-y divide-border overflow-y-auto rounded-[var(--ui-radius-item)] border border-border">
          {chosen.map((candidate) => (
            <li key={candidate.id} className="truncate px-3 py-2">
              {candidate.name}
            </li>
          ))}
        </ul>
        {adopt.isError ? (
          <FormFeedback appearance="dashboard">
            {adopt.error.message}
          </FormFeedback>
        ) : null}
      </ConfirmAlert>
    </Section>
  )
}

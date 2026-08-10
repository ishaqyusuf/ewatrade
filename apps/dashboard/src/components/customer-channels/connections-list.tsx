"use client"

import { Button } from "@ewatrade/ui"
import type { CustomerChannelConnection } from "./types"

const readinessTone = {
  blocked: "bg-destructive/10 text-destructive",
  configuration_required: "bg-amber-100 text-amber-900",
  ready: "bg-emerald-100 text-emerald-900",
  setup_required: "bg-muted text-muted-foreground",
  test_required: "bg-blue-100 text-blue-900",
} as const

function label(value: string) {
  return value.replaceAll("_", " ")
}

export function ConnectionsList({
  connections,
  onManage,
}: {
  connections: CustomerChannelConnection[]
  onManage: (connectionId: string) => void
}) {
  return (
    <section className="grid gap-4 rounded-xl border border-border bg-card p-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Configure and test
        </p>
        <h2 className="font-semibold">Connections</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A replacement remains a candidate until every readiness check passes,
          so a working customer route is never displaced by a failed test.
        </p>
      </div>

      {connections.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
          <p className="font-medium">No connections yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Start with Connect WhatsApp. Web entry remains a separate channel.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {connections.map((connection) => (
            <article
              className="grid gap-4 rounded-lg border border-border p-4 lg:grid-cols-[1fr_auto] lg:items-center"
              key={connection.id}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">
                    {connection.businessDisplayName || connection.displayNumber}
                  </h3>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${readinessTone[connection.readiness]}`}
                  >
                    {label(connection.readiness)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {connection.displayNumber} · {label(connection.lifecycle)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {connection.storeAssignments.length > 0
                    ? connection.storeAssignments
                        .map((store) => store.name)
                        .join(", ")
                    : "No Store assignments"}
                </p>
                {connection.lastTestFailureCode ? (
                  <p className="mt-2 text-xs text-destructive" role="alert">
                    Last test: {label(connection.lastTestFailureCode)}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => onManage(connection.id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Manage connection
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

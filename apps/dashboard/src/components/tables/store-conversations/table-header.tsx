"use client"

import type {
  getStoreConversationQueueInput,
  useStoreConversationParams,
} from "@/hooks/use-store-conversation-params"
import { Button } from "@ewatrade/ui"
import { useEffect, useState } from "react"

type Params = ReturnType<typeof useStoreConversationParams>

const requestKinds = [
  ["commerce_inquiry", "Product"],
  ["service_request", "Service"],
  ["prescription_request", "Prescription"],
] as const

export function StoreConversationTableHeader({
  input,
  params,
  stores,
}: {
  input: ReturnType<typeof getStoreConversationQueueInput>
  params: Params
  stores: Array<{ id: string; name: string }>
}) {
  const [queryDraft, setQueryDraft] = useState(params.q ?? "")
  useEffect(() => setQueryDraft(params.q ?? ""), [params.q])

  return (
    <section
      aria-label="Conversation filters"
      className="grid gap-3 rounded-xl border border-border bg-background p-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        Store
        <select
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          onChange={(event) =>
            void params.setFilters({ store: event.target.value })
          }
          value={input.storeId}
        >
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        Assignment
        <select
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          onChange={(event) =>
            void params.setFilters({
              assignment: event.target.value as Params["assignment"],
            })
          }
          value={input.assignment}
        >
          <option value="all">All</option>
          <option value="unassigned">Unassigned</option>
          <option value="mine">Mine</option>
          <option value="assigned">Assigned</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        Response SLA
        <select
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          onChange={(event) =>
            void params.setFilters({
              sla: event.target.value as Params["sla"],
            })
          }
          value={input.sla}
        >
          <option value="all">All</option>
          <option value="awaiting_response">Awaiting response</option>
          <option value="overdue">Overdue</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium text-muted-foreground">
        Sort
        <select
          className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
          onChange={(event) => {
            const [sort, direction] = event.target.value.split(":")
            void params.setFilters({
              direction: direction as Params["direction"],
              sort: sort as Params["sort"],
            })
          }}
          value={`${input.sort[0]}:${input.sort[1]}`}
        >
          <option value="last_customer_activity:desc">Newest activity</option>
          <option value="last_customer_activity:asc">Oldest activity</option>
          <option value="response_due_at:asc">Response due first</option>
        </select>
      </label>
      <fieldset className="grid gap-2 sm:col-span-2 lg:col-span-3">
        <legend className="text-xs font-medium text-muted-foreground">
          Request kinds
        </legend>
        <div className="flex flex-wrap gap-3">
          {requestKinds.map(([kind, label]) => (
            <label className="flex items-center gap-2 text-sm" key={kind}>
              <input
                checked={input.requestKinds.includes(kind)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...input.requestKinds, kind]
                    : input.requestKinds.filter((value) => value !== kind)
                  void params.setFilters({ requestKinds: next })
                }}
                type="checkbox"
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <form
        className="grid gap-1"
        onSubmit={(event) => {
          event.preventDefault()
          void params.setFilters({ q: queryDraft.trim() || null })
        }}
      >
        <label
          className="text-xs font-medium text-muted-foreground"
          htmlFor="conversation-search"
        >
          Conversation reference
        </label>
        <div className="flex gap-2">
          <input
            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
            id="conversation-search"
            onChange={(event) => setQueryDraft(event.target.value)}
            placeholder="Search reference"
            value={queryDraft}
          />
          <Button size="sm" type="submit" variant="outline">
            Apply
          </Button>
        </div>
      </form>
    </section>
  )
}

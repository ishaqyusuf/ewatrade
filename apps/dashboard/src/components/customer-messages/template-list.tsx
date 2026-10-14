"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import { useCustomerMessageParams } from "@/hooks/use-customer-message-params"
import { useTRPC } from "@/trpc/client"
import { customerMessageEvents } from "@ewatrade/customer-messages/client"
import { Button, cn } from "@ewatrade/ui"
import { SparklesIcon, WhatsappIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import {
  SAVED_MESSAGE_TONE,
  hidesCachedData,
  saveFailureText,
  savedMessageLabel,
} from "./message-status"
import {
  type TemplateScope,
  expectedFor,
  scopeTemplate,
  useTemplateMutations,
} from "./use-template-mutations"

/** Settings → WhatsApp messages: one row per customer-facing event. */
export function CustomerMessageTemplateList() {
  const trpc = useTRPC()
  const { setParams } = useCustomerMessageParams()
  const [scope, setScope] = useState<TemplateScope>("business")
  const [problem, setProblem] = useState<string | null>(null)
  const { setEnabled, reset } = useTemplateMutations()
  const list = useQuery(
    trpc.customerMessages.templates.list.queryOptions(undefined, {
      retry: false,
    }),
  )
  if (list.isError && (!list.data || hidesCachedData(list.error)))
    return (
      <div className="grid gap-3">
        <FormFeedback appearance="dashboard">{list.error.message}</FormFeedback>
        <Button
          variant="outline"
          className="w-fit"
          onClick={() => void list.refetch()}
        >
          Try again
        </Button>
      </div>
    )
  if (!list.data)
    return <output aria-live="polite">Loading WhatsApp messages…</output>
  const data = list.data
  const missing = data.statuses.filter((row) => row.state === "missing").length
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <fieldset
          className="flex flex-wrap gap-2"
          aria-label="Which wording to show"
        >
          <Button
            variant={scope === "business" ? "default" : "outline"}
            aria-pressed={scope === "business"}
            onClick={() => setScope("business")}
          >
            All Stores
          </Button>
          <Button
            variant={scope === "store" ? "default" : "outline"}
            aria-pressed={scope === "store"}
            onClick={() => setScope("store")}
          >
            {data.storeName}
          </Button>
        </fieldset>
        <Button
          variant="outline"
          onClick={() =>
            void setParams({ messageSheet: "compose-all", messageScope: scope })
          }
        >
          <HugeiconsIcon icon={SparklesIcon} className="size-4" />
          {missing ? `Write ${missing} missing` : "Compose all"}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {scope === "business"
          ? "Wording every Store uses unless it has its own. Staff see it ready on orders, edit it for one customer if needed, then send it from WhatsApp."
          : `What ${data.storeName} uses. A Store can keep the business wording, use its own, or turn a message off.`}
      </p>
      {problem ? (
        <FormFeedback appearance="dashboard">{problem}</FormFeedback>
      ) : null}
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {customerMessageEvents.map((event) => {
          const row = scopeTemplate(data, event.key, scope)
          const effective = data.statuses.find(
            (status) => status.eventKey === event.key,
          )
          // Business view shows the business row; Store view shows what applies.
          const state =
            scope === "business"
              ? row
                ? row.enabled
                  ? "composed"
                  : "disabled"
                : "missing"
              : (effective?.state ?? "missing")
          const label =
            scope === "business"
              ? savedMessageLabel(state, "business")
              : row
                ? savedMessageLabel(state, "store")
                : state === "missing"
                  ? "Not written yet"
                  : `${savedMessageLabel(state, "business")} · business wording`
          return (
            <li
              key={event.key}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-full",
                  state === "composed"
                    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : "bg-muted text-muted-foreground",
                )}
              >
                <HugeiconsIcon icon={WhatsappIcon} className="size-4" />
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="text-sm font-medium">{event.label}</span>
                <span className="text-xs text-muted-foreground">
                  {event.description}
                </span>
              </span>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs whitespace-nowrap",
                  SAVED_MESSAGE_TONE[state],
                )}
              >
                {label}
              </span>
              <span className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void setParams({
                      messageSheet: "template",
                      messageEvent: event.key,
                      messageScope: scope,
                    })
                  }
                >
                  {state === "missing" && !row ? "Write" : "Edit"}
                </Button>
                {row && scope === "store" && !row.enabled ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={reset.isPending}
                    onClick={() => {
                      setProblem(null)
                      reset.mutate(
                        { eventKey: event.key, scope, ...expectedFor(row) },
                        {
                          onError: (failure) =>
                            setProblem(saveFailureText(failure)),
                        },
                      )
                    }}
                  >
                    Use business wording
                  </Button>
                ) : row ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={setEnabled.isPending}
                    onClick={() => {
                      setProblem(null)
                      setEnabled.mutate(
                        {
                          eventKey: event.key,
                          scope,
                          enabled: !row.enabled,
                          ...expectedFor(row),
                        },
                        {
                          onError: (failure) =>
                            setProblem(saveFailureText(failure)),
                        },
                      )
                    }}
                  >
                    {row.enabled ? "Turn off" : "Turn on"}
                  </Button>
                ) : null}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

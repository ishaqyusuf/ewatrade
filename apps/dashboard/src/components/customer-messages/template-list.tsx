"use client"

import { FormFeedback } from "@/components/forms/form-feedback"
import {
  SettingsHeader,
  SettingsSavedMark,
  SettingsSection,
} from "@/components/settings/settings-page"
import {
  ALL_STORES,
  SettingsStorePicker,
} from "@/components/settings/settings-store-picker"
import { useSettingsAutosave } from "@/components/settings/use-settings-autosave"
import { useCustomerMessageParams } from "@/hooks/use-customer-message-params"
import { useSettingsStoreParams } from "@/hooks/use-settings-store-params"
import { useTRPC } from "@/trpc/client"
import {
  type CustomerMessageEventKey,
  customerMessageEvents,
} from "@ewatrade/customer-messages/client"
import { Button, Switch, cn } from "@ewatrade/ui"
import { SparklesIcon, WhatsappIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import {
  SAVED_MESSAGE_ROW,
  SAVED_MESSAGE_TONE,
  hidesCachedData,
  saveFailureText,
} from "./message-status"
import { savedMessageRowState } from "./template-model"
import {
  type SavedTemplate,
  type TemplateScope,
  expectedFor,
  scopeTemplate,
  templateListInput,
  useTemplateMutations,
} from "./use-template-mutations"

type StoreOption = { id: string; name: string }

/**
 * Settings → WhatsApp messages: one row per customer-facing event, for every
 * store (the business message) or for one store.
 */
export function CustomerMessageTemplateList({
  stores,
}: {
  stores: StoreOption[]
}) {
  const trpc = useTRPC()
  const { setParams } = useCustomerMessageParams()
  const { storeId: requested, setStoreId } = useSettingsStoreParams()
  const store = stores.find((each) => each.id === requested) ?? null
  const storeId = store?.id ?? null
  const scope: TemplateScope = store ? "store" : "business"
  const [problem, setProblem] = useState<string | null>(null)
  const { setEnabled } = useTemplateMutations(storeId)
  const autosave = useSettingsAutosave()
  const list = useQuery(
    trpc.customerMessages.templates.list.queryOptions(
      templateListInput(storeId),
      { retry: false },
    ),
  )
  const data = list.data
  const missing = data
    ? customerMessageEvents.filter(
        (event) => savedMessageRowState(data, event.key, scope) === "missing",
      ).length
    : 0

  function turn(
    eventKey: CustomerMessageEventKey,
    row: SavedTemplate,
    enabled: boolean,
    undoable = true,
  ) {
    setProblem(null)
    setEnabled.mutate(
      {
        ...templateListInput(storeId),
        eventKey,
        scope,
        enabled,
        ...expectedFor(row),
      },
      {
        onSuccess: (result) => {
          const message = enabled
            ? "Turned on. Staff can send it again."
            : "Turned off. Staff won’t see it on orders."
          const saved = result.removed ? null : result.template
          autosave.confirm(
            eventKey,
            message,
            undoable && saved
              ? () => turn(eventKey, saved, !enabled, false)
              : undefined,
          )
        },
        onError: (failure) => setProblem(saveFailureText(failure)),
      },
    )
  }

  return (
    <>
      <SettingsHeader
        title="WhatsApp messages"
        description="Write each message once. On an order, staff check it and send it from their own WhatsApp."
        actions={
          <>
            <SettingsStorePicker
              includeAll
              stores={stores}
              value={storeId ?? ALL_STORES}
              onChange={(value) => {
                setProblem(null)
                void setStoreId(value === ALL_STORES ? null : value)
              }}
            />
            {data ? (
              <Button
                variant="outline"
                onClick={() =>
                  void setParams({
                    messageSheet: "compose-all",
                    messageScope: scope,
                    messageStoreId: storeId,
                  })
                }
              >
                <HugeiconsIcon icon={SparklesIcon} className="size-4" />
                {missing ? `Write ${missing} missing` : "Write all"}
              </Button>
            ) : null}
          </>
        }
      />
      {list.isError && (!data || hidesCachedData(list.error)) ? (
        <div className="grid justify-items-start gap-3">
          <p className="text-sm">Couldn’t load WhatsApp messages.</p>
          <Button variant="outline" onClick={() => void list.refetch()}>
            Try again
          </Button>
        </div>
      ) : !data ? (
        <output aria-live="polite" className="text-sm text-muted-foreground">
          Loading WhatsApp messages…
        </output>
      ) : (
        <SettingsSection
          title={
            store ? `Messages at ${store.name}` : "Messages for every store"
          }
          description={
            store
              ? `${store.name} uses the business message unless you give it its own.`
              : "Every store uses these unless it has its own message."
          }
        >
          {problem ? (
            <div className="px-4 py-3">
              <FormFeedback appearance="dashboard">{problem}</FormFeedback>
            </div>
          ) : null}
          {customerMessageEvents.map((event) => {
            const state = savedMessageRowState(data, event.key, scope)
            const status = SAVED_MESSAGE_ROW[state]
            const on = status.tone === "composed"
            // The switch turns this view's own row on or off.
            const row =
              state === "ready" || state === "off"
                ? scopeTemplate(data, event.key, "business")
                : state === "own" || state === "ownoff"
                  ? scopeTemplate(data, event.key, "store")
                  : null
            return (
              <div
                key={event.key}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3.5"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full",
                    on
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <HugeiconsIcon icon={WhatsappIcon} className="size-4" />
                </span>
                <div className="min-w-0 flex-[1_1_200px]">
                  <div className="text-sm font-medium">{event.label}</div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {event.description}
                  </p>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2">
                  {autosave.saved(event.key) ? <SettingsSavedMark /> : null}
                  <span
                    className={cn(
                      "rounded-full border px-2 py-0.5 text-xs whitespace-nowrap",
                      SAVED_MESSAGE_TONE[status.tone],
                    )}
                  >
                    {status.label}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`${state === "missing" ? "Write" : "Edit"} ${event.label}`}
                    onClick={() =>
                      void setParams({
                        messageSheet: "template",
                        messageEvent: event.key,
                        messageScope: scope,
                        messageStoreId: storeId,
                      })
                    }
                  >
                    {state === "missing" ? "Write" : "Edit"}
                  </Button>
                  {row ? (
                    <Switch
                      aria-label={`Send ${event.label}`}
                      checked={row.enabled}
                      disabled={setEnabled.isPending}
                      onCheckedChange={(checked) =>
                        turn(event.key, row, checked)
                      }
                    />
                  ) : null}
                </div>
              </div>
            )
          })}
        </SettingsSection>
      )}
    </>
  )
}

"use client"

import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useTRPC } from "@/trpc/client"
import type { RouterOutputs } from "@ewatrade/api/trpc/routers/_app"
import {
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  Skeleton,
  Spinner,
  Switch,
  toast,
} from "@ewatrade/ui"
import { useMutation, useQuery } from "@tanstack/react-query"
import { type ComponentProps, useEffect, useId, useRef, useState } from "react"
import { useCatalogThemeClass } from "./catalog-appearance"

type Item = Pick<
  RouterOutputs["catalog"]["detail"]["overview"]["item"],
  "id" | "name" | "kind" | "status"
>
type Policy = {
  unavailable: boolean
  allowBookAhead: boolean
  platformListed: boolean
}
type Draft = Policy & { revision: number }
type Attempt = { key: string; clientOperationId: string }

const copy = {
  product: {
    unavailable:
      "Customers can't add it to their bag, whatever your stock says. Your stock records don't change.",
    bookAhead:
      "Customers can request it for a later date, even when sold out. It stays a request until you confirm stock.",
  },
  service: {
    unavailable: "Customers can't send ordinary requests for it.",
    bookAhead:
      "Customers can ask for a preferred date and time. It stays a request until you confirm the booking.",
  },
}

/** The server refuses a save whose expected revision is behind. */
function isStale(error: unknown) {
  return error instanceof Error && /changed\. Reload/.test(error.message)
}

/**
 * Website availability for one item in one Store, as a view inside the item's
 * details sheet. It never publishes the item; it saves, then returns to it.
 */
export function CatalogStorefrontSettingsView({
  item,
  storeId,
  storeName,
  back,
  onBusy,
  finalFocus,
}: {
  item: Item
  storeId: string
  storeName: string
  back(): void
  onBusy(value: boolean): void
  finalFocus?: ComponentProps<typeof SheetFrame>["finalFocus"]
}) {
  const themeClass = useCatalogThemeClass()
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const policy = useQuery(
    mountOwnedRead(
      trpc.catalog.storefront.get.queryOptions(
        { storeId, catalogItemId: item.id },
        {
          retry: false,
          staleTime: 0,
          gcTime: 0,
          refetchOnMount: "always",
          refetchOnWindowFocus: false,
          trpc: { abortOnUnmount: true },
        },
      ),
      mount,
    ),
  )
  const save = useMutation(trpc.catalog.storefront.save.mutationOptions())
  // The owner's change, pinned to the revision it was made against.
  const [draft, setDraft] = useState<Draft | null>(null)
  // One identity per payload, so an uncertain retry can't apply twice.
  const attempt = useRef<Attempt | null>(null)
  const busy = useRef(false)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      onBusy(false)
    }
  }, [onBusy])
  const unavailableId = useId()
  const bookAheadId = useId()
  const platformListedId = useId()

  const loaded = policy.isSuccess ? policy.data : null
  const values = draft ?? loaded
  const changed = Boolean(
    loaded &&
      draft &&
      (draft.unavailable !== loaded.unavailable ||
        draft.allowBookAhead !== loaded.allowBookAhead ||
        draft.platformListed !== loaded.platformListed),
  )
  const stale = save.isError && isStale(save.error)
  const ineligible =
    item.status === "archived"
      ? "It's archived, so customers can't see it."
      : item.status !== "active"
        ? "It's still a draft. Make it active before customers can see it."
        : null
  const disabled = !values || save.isPending || stale || Boolean(ineligible)
  const text = copy[item.kind === "service" ? "service" : "product"]

  function change(next: Partial<Policy>) {
    if (!values || disabled) return
    setDraft({
      unavailable: values.unavailable,
      allowBookAhead: values.allowBookAhead,
      platformListed: values.platformListed,
      revision: draft?.revision ?? values.revision,
      ...next,
    })
  }

  async function submit() {
    if (busy.current || !draft || !changed) return
    const key = JSON.stringify([
      draft.unavailable,
      draft.allowBookAhead,
      draft.platformListed,
      draft.revision,
    ])
    const operation =
      attempt.current?.key === key
        ? attempt.current
        : { key, clientOperationId: crypto.randomUUID() }
    attempt.current = operation
    busy.current = true
    onBusy(true)
    try {
      await save.mutateAsync({
        storeId,
        catalogItemId: item.id,
        unavailable: draft.unavailable,
        allowBookAhead: draft.allowBookAhead,
        ...(item.kind === "service"
          ? {}
          : { platformListed: draft.platformListed }),
        expectedRevision: draft.revision,
        clientOperationId: operation.clientOperationId,
      })
      if (!mounted.current) return
      toast.success("Storefront settings saved")
      back()
    } catch {
      // The mutation's error state carries the message; values stay as typed.
    } finally {
      busy.current = false
      if (mounted.current) onBusy(false)
    }
  }

  function reload() {
    attempt.current = null
    setDraft(null)
    save.reset()
    void policy.refetch()
  }

  return (
    <SheetFrame
      title="Storefront settings"
      popupClassName={themeClass}
      description={`${item.name} · ${storeName}`}
      back={{
        label: `Back to ${item.name}`,
        onClick: () => {
          if (!busy.current) back()
        },
      }}
      closeDisabled={save.isPending}
      finalFocus={finalFocus}
      footer={
        <Button
          type="button"
          disabled={!changed || disabled}
          aria-busy={save.isPending}
          onClick={() => void submit()}
        >
          {save.isPending ? (
            <>
              <Spinner aria-hidden="true" />
              Saving…
            </>
          ) : save.isError && !stale ? (
            "Try again"
          ) : (
            "Save storefront settings"
          )}
        </Button>
      }
    >
      <div className="space-y-5">
        {ineligible ? (
          <Alert appearance="dashboard">
            <AlertTitle>This item isn't on your website</AlertTitle>
            <AlertDescription>
              {ineligible} These settings never publish an item.
            </AlertDescription>
          </Alert>
        ) : null}
        {policy.isError ? (
          <Alert variant="destructive" appearance="dashboard">
            <AlertTitle>Couldn't load storefront settings.</AlertTitle>
            <AlertDescription className="grid justify-items-start gap-2">
              {policy.error.message}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void policy.refetch()}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : !values ? (
          <div aria-busy="true" className="grid gap-4">
            <span className="sr-only">Loading storefront settings…</span>
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : (
          <FieldSet disabled={disabled}>
            <FieldLegend>On your website</FieldLegend>
            <FieldGroup>
              <Field orientation="horizontal" data-disabled={disabled}>
                <FieldContent>
                  <FieldLabel htmlFor={unavailableId}>
                    Mark as unavailable
                  </FieldLabel>
                  <FieldDescription>{text.unavailable}</FieldDescription>
                </FieldContent>
                <Switch
                  id={unavailableId}
                  checked={values.unavailable}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    change({ unavailable: checked === true })
                  }
                />
              </Field>
              <Field orientation="horizontal" data-disabled={disabled}>
                <FieldContent>
                  <FieldLabel htmlFor={bookAheadId}>
                    Allow book ahead
                  </FieldLabel>
                  <FieldDescription>{text.bookAhead}</FieldDescription>
                </FieldContent>
                <Switch
                  id={bookAheadId}
                  checked={values.allowBookAhead}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    change({ allowBookAhead: checked === true })
                  }
                />
              </Field>
              {item.kind === "service" ? null : (
                <Field orientation="horizontal" data-disabled={disabled}>
                  <FieldContent>
                    <FieldLabel htmlFor={platformListedId}>
                      Show on your business page
                    </FieldLabel>
                    <FieldDescription>
                      Customers can find it on your ẸwáTrade business page once
                      you list your Store publicly. Your website is not changed.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    id={platformListedId}
                    checked={values.platformListed}
                    disabled={disabled}
                    onCheckedChange={(checked) =>
                      change({ platformListed: checked === true })
                    }
                  />
                </Field>
              )}
            </FieldGroup>
          </FieldSet>
        )}
        {values ? (
          <output className="block text-sm text-muted-foreground">
            {values.unavailable && values.allowBookAhead ? (
              <>
                Website shows <strong>Sold out now: request ahead</strong>
              </>
            ) : values.unavailable ? (
              <>
                Website shows <strong>Unavailable</strong>
              </>
            ) : (
              "Website follows your stock"
            )}
          </output>
        ) : null}
        {stale ? (
          <Alert variant="destructive" appearance="dashboard">
            <AlertDescription className="grid justify-items-start gap-2">
              These settings changed elsewhere. Reload to see the latest.
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={reload}
              >
                Reload
              </Button>
            </AlertDescription>
          </Alert>
        ) : save.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {save.error.message}
          </p>
        ) : null}
      </div>
    </SheetFrame>
  )
}

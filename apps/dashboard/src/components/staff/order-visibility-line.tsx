"use client"

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@ewatrade/ui"
import {
  ORDER_VISIBILITY_OPTIONS,
  type Visibility,
  useOrderVisibility,
  useUpdateOrderVisibility,
} from "./order-visibility-card"

/** Staff page: which orders cashiers and sales reps see, as one sentence with Change. */
export function OrderVisibilityLine({
  storeId,
  storeName,
}: {
  storeId: string
  storeName: string
}) {
  const query = useOrderVisibility(storeId)
  const update = useUpdateOrderVisibility(storeId)
  if (query.isPending) return <div className="h-[72px]" />
  if (query.isError)
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        Couldn’t load which orders cashiers and sales reps see.{" "}
        <Button variant="link" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </p>
    )
  const current = ORDER_VISIBILITY_OPTIONS.find(
    (option) => option.value === query.data.salesRepOrderVisibility,
  )
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[var(--ui-radius-surface)] border border-border bg-card px-4 py-3">
      <p className="grid min-w-0 flex-1 basis-56 gap-0.5">
        <span className="text-sm text-muted-foreground">
          Cashiers and sales reps in {storeName} see
        </span>
        <span className="text-base font-medium">
          {current?.label}
          {update.isPending ? " · Saving…" : ""}
        </span>
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              className="shrink-0"
              disabled={update.isPending}
            >
              Change
            </Button>
          }
        />
        <DropdownMenuContent appearance="dashboard" align="end">
          <DropdownMenuLabel>
            Cashiers and sales reps in {storeName} see
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={query.data.salesRepOrderVisibility}
            onValueChange={(value) =>
              update.mutate({ storeId, visibility: value as Visibility })
            }
          >
            {ORDER_VISIBILITY_OPTIONS.map((option) => (
              <DropdownMenuRadioItem
                key={option.value}
                value={option.value}
                closeOnClick
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {update.isError ? (
        <p role="alert" className="basis-full text-sm text-destructive">
          {update.error.message}
        </p>
      ) : null}
    </div>
  )
}

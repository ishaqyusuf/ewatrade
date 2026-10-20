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
import { InformationCircleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
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
  if (query.isPending) return <div className="h-8" />
  if (query.isError)
    return (
      <p role="alert" className="text-sm text-muted-foreground">
        Couldn’t load which orders cashiers and sales reps see.{" "}
        <Button variant="link" size="sm" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </p>
    )
  const current = ORDER_VISIBILITY_OPTIONS.find(
    (option) => option.value === query.data.salesRepOrderVisibility,
  )
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <HugeiconsIcon
        icon={InformationCircleIcon}
        className="size-4 shrink-0"
        aria-hidden="true"
      />
      <p className="min-w-0">
        In {storeName}, cashiers and sales reps see{" "}
        <span className="font-semibold text-foreground">
          {current?.label.toLowerCase()}
        </span>
        .{update.isPending ? " Saving…" : ""}
      </p>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0 rounded-none"
              disabled={update.isPending}
            >
              Change
            </Button>
          }
        />
        <DropdownMenuContent appearance="dashboard" align="start">
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
        <span role="alert" className="text-destructive">
          {update.error.message}
        </span>
      ) : null}
    </div>
  )
}

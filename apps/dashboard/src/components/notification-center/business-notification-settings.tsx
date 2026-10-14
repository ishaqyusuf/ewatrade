"use client"

import { NotificationPreferencesContent } from "@/components/notifications/notification-preferences-content"
import { SheetFrame } from "@/components/sheets/sheet-frame"
import { useTRPC } from "@/trpc/client"
import {
  freshShownRead,
  mountOwnedRead,
  nextReadMount,
} from "@ewatrade/assistant/general/staff-activity-target"
import type { BusinessEventType } from "@ewatrade/notifications/business-events"
import { Button, Sheet } from "@ewatrade/ui"
import { useMutation, useQuery } from "@tanstack/react-query"
import { parseAsBoolean, useQueryStates } from "nuqs"
import { useState } from "react"

const params = { alertPreferences: parseAsBoolean }

export function useAlertPreferencesParams() {
  const [{ alertPreferences }, setParams] = useQueryStates(params, {
    history: "push",
  })
  return {
    isOpen: alertPreferences === true,
    open: () => setParams({ alertPreferences: true }),
    close: () => setParams({ alertPreferences: null }),
  }
}

/** The signed-in member's own alert preferences, from the inbox. */
export function BusinessNotificationPreferencesSheet({
  scopeKey,
}: {
  scopeKey: string
}) {
  const { isOpen, close } = useAlertPreferencesParams()
  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) void close()
      }}
    >
      {isOpen ? (
        <SheetFrame
          title="My alert preferences"
          description="Choose which of your assigned alerts you receive."
        >
          <MyPreferences key={scopeKey} />
        </SheetFrame>
      ) : null}
    </Sheet>
  )
}

export function MyPreferences() {
  const trpc = useTRPC()
  const [mount] = useState(nextReadMount)
  const [pendingType, setPendingType] = useState<BusinessEventType | null>(null)
  const [error, setError] = useState<string | null>(null)
  const query = useQuery(
    mountOwnedRead(
      trpc.businessNotifications.myPreferences.queryOptions(undefined, {
        retry: false,
        staleTime: 0,
        gcTime: 0,
        refetchOnMount: "always",
        trpc: { abortOnUnmount: true },
      }),
      mount,
    ),
  )
  const update = useMutation(
    trpc.businessNotifications.updateMyPreferences.mutationOptions(),
  )
  const read = freshShownRead(query)
  if (read.state === "refused")
    return (
      <div role="alert" className="grid gap-3 text-sm">
        <p>Your alert preferences couldn't load.</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </div>
    )
  if (read.state !== "ready")
    return (
      <output aria-live="polite" className="text-sm text-muted-foreground">
        Loading your alert preferences…
      </output>
    )
  return (
    <div className="grid gap-3">
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <NotificationPreferencesContent
        items={read.data.items}
        catalog={read.data.catalog}
        pendingType={pendingType}
        onChange={(item, inApp) => {
          setPendingType(item.type)
          setError(null)
          update.mutate(
            { type: item.type, preference: { ...item.preference, inApp } },
            {
              onError: () => setError("That change wasn't saved. Try again."),
              onSettled: () => {
                setPendingType(null)
                void query.refetch()
              },
            },
          )
        }}
      />
    </div>
  )
}

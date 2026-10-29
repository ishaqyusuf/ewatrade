"use client"

import { SettingsNotice } from "@/components/settings/settings-page"
import { Button } from "@ewatrade/ui"
import type { ReactNode } from "react"

export type ChannelRead<T> = {
  data: T | undefined
  isError: boolean
  isPending: boolean
  refetch: () => Promise<unknown>
}

export function ChannelReadContent<T>({
  children,
  label,
  query,
}: {
  children: (data: T) => ReactNode
  label: string
  query: ChannelRead<T>
}) {
  if (query.isError) {
    return (
      <SettingsNotice
        tone="warning"
        action={
          <Button
            aria-label={`Retry ${label}`}
            className="bg-background"
            onClick={() => void query.refetch()}
            size="sm"
            variant="outline"
          >
            Try again
          </Button>
        }
      >
        Couldn't load {label}.
      </SettingsNotice>
    )
  }
  if (query.isPending || query.data === undefined) {
    return (
      <output
        aria-busy="true"
        className="block px-4 py-3.5 text-sm text-muted-foreground"
      >
        Loading {label}…
      </output>
    )
  }
  return children(query.data)
}

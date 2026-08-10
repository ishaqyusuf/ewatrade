"use client"

import type { CustomerChannelStoreOption } from "./types"

export function ChannelsHeader({
  canManage,
  onConnect,
  onStoreChange,
  selectedStoreId,
  stores,
}: {
  canManage: boolean
  onConnect: () => void
  onStoreChange: (storeId: string) => void
  selectedStoreId: string
  stores: CustomerChannelStoreOption[]
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-sm font-medium text-primary">Customer channels</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Connect customers to your business
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Manage web and WhatsApp entry points, location routing and the team
          handling customer requests.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        {stores.length > 1 ? (
          <label className="grid gap-1 text-xs text-muted-foreground">
            Store
            <select
              aria-label="Customer channels Store"
              className="h-10 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
              onChange={(event) => onStoreChange(event.target.value)}
              value={selectedStoreId}
            >
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <button
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
          disabled={!canManage}
          onClick={onConnect}
          type="button"
        >
          Connect WhatsApp
        </button>
      </div>
    </header>
  )
}

"use client"
import { Button, ControlField, SelectControl } from "@ewatrade/ui"

import { PageHeader, PageToolbar } from "@/components/page-header"

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
    <PageHeader
      eyebrow="Customer channels"
      title="Connect customers to your business"
      description="Manage web and WhatsApp entry points, location routing and the team handling customer requests."
    >
      <PageToolbar
        actions={
          <>
            {stores.length > 1 ? (
              <ControlField label={<>Store</>}>
                <SelectControl
                  aria-label="Customer channels Store"
                  onValueChange={(value) => onStoreChange(value)}
                  value={selectedStoreId}
                  options={[
                    ...(stores.map((store) => ({
                      value: store.id,
                      label: store.name,
                    })) ?? []),
                  ]}
                />
              </ControlField>
            ) : null}
            <Button
              disabled={!canManage}
              onClick={onConnect}
              className="h-9 rounded-none"
              appearance="form"
            >
              Connect WhatsApp
            </Button>
          </>
        }
      />
    </PageHeader>
  )
}

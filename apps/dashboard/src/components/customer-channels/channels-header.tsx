"use client"
import { SettingsHeader } from "@/components/settings/settings-page"
import { SettingsStorePicker } from "@/components/settings/settings-store-picker"
import { Button } from "@ewatrade/ui"

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
    <SettingsHeader
      title="Customer channels"
      description="Choose how customers reach you, which store gets each chat, and who replies."
      actions={
        <>
          <SettingsStorePicker
            stores={stores}
            value={selectedStoreId}
            onChange={onStoreChange}
          />
          <span
            title={
              canManage
                ? undefined
                : "Only an owner or admin can connect WhatsApp."
            }
          >
            <Button disabled={!canManage} onClick={onConnect} className="h-9">
              Connect WhatsApp
            </Button>
          </span>
        </>
      }
    />
  )
}

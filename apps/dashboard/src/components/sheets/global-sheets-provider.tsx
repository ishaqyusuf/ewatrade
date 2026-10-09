"use client"

import { type ReactNode, useSyncExternalStore } from "react"
import {
  type GlobalSheetAccess,
  type GlobalSheetStore,
  GlobalSheets,
} from "./global-sheets"

const subscribeToHydration = () => () => undefined

export function GlobalSheetsProvider({
  access,
  actorUserId,
  children,
  store,
  storeIds,
  tenantId,
}: {
  access: GlobalSheetAccess
  actorUserId: string
  children: ReactNode
  store: GlobalSheetStore
  storeIds: string[]
  tenantId: string
}) {
  const hydrated = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  )
  return (
    <>
      {children}
      {hydrated ? (
        <GlobalSheets
          key={`${actorUserId}:${tenantId}:${store.id}`}
          access={access}
          actorUserId={actorUserId}
          store={store}
          storeIds={storeIds}
          tenantId={tenantId}
        />
      ) : null}
    </>
  )
}

"use client"

import dynamic from "next/dynamic"
import { type ReactNode, useSyncExternalStore } from "react"
import type { GlobalSheetAccess, GlobalSheetStore } from "./global-sheets"

const GlobalSheets = dynamic(
  () => import("./global-sheets").then((module) => module.GlobalSheets),
  { ssr: false },
)

const subscribeToHydration = () => () => undefined

export function GlobalSheetsProvider({
  access,
  actorUserId,
  children,
  store,
  storeIds,
  tenantId,
  timeZone,
}: {
  access: GlobalSheetAccess
  actorUserId: string
  children: ReactNode
  store: GlobalSheetStore
  storeIds: string[]
  tenantId: string
  /** Business time zone for dates in sheets. */
  timeZone: string
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
          timeZone={timeZone}
        />
      ) : null}
    </>
  )
}

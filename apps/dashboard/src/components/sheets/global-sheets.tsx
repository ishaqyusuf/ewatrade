"use client"

import { CustomerLedgerSheet } from "./customer-ledger-sheet"
import { DomainSheet } from "./domain-sheet"
import { FinanceSheet } from "./finance-sheet"
import { PrescriptionRequestSheet } from "./prescription-request-sheet"
import { ServiceCommerceSheet } from "./service-commerce-sheet"
import { StoreConversationSheet } from "./store-conversation-sheet"

export type GlobalSheetAccess = {
  finance: boolean
  prescriptions: boolean
  managePrescriptionSetup: boolean
}

export function GlobalSheets({
  access,
  actorUserId,
  store,
  storeIds,
  tenantId,
}: {
  access: GlobalSheetAccess
  actorUserId: string
  store: { id: string; name: string }
  storeIds: string[]
  tenantId: string
}) {
  return (
    <>
      <DomainSheet store={store} />
      {access.finance ? (
        <CustomerLedgerSheet actorUserId={actorUserId} tenantId={tenantId} />
      ) : null}
      {access.finance ? (
        <FinanceSheet
          actorUserId={actorUserId}
          storeId={store.id}
          tenantId={tenantId}
        />
      ) : null}
      {access.prescriptions ? (
        <PrescriptionRequestSheet
          canManageSetup={access.managePrescriptionSetup}
          storeId={store.id}
        />
      ) : null}
      <ServiceCommerceSheet storeId={store.id} storeIds={storeIds} />
      <StoreConversationSheet storeId={store.id} storeIds={storeIds} />
    </>
  )
}

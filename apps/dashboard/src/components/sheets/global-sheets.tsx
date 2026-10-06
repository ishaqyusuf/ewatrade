"use client"

import { CustomerLedgerSheet } from "./customer-ledger-sheet"
import { DomainSheet } from "./domain-sheet"
import { FinanceSheet } from "./finance-sheet"
import { PrescriptionRequestSheet } from "./prescription-request-sheet"
import { ReceiptSheet } from "./receipt-sheet"
import { ServiceCommerceSheet } from "./service-commerce-sheet"
import { StoreConversationSheet } from "./store-conversation-sheet"

export type GlobalSheetAccess = {
  scopedStaff?: boolean
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
      {!access.scopedStaff ? <DomainSheet store={store} /> : null}
      <ReceiptSheet storeId={store.id} />
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
      {!access.scopedStaff ? (
        <>
          <ServiceCommerceSheet storeId={store.id} storeIds={storeIds} />
          <StoreConversationSheet storeId={store.id} storeIds={storeIds} />
        </>
      ) : null}
    </>
  )
}

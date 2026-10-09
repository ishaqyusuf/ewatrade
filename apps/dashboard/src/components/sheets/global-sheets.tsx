"use client"
import { CatalogAppearance } from "@/components/catalog-item/catalog-appearance"
import { CatalogItemSheet } from "@/components/catalog-item/catalog-item-sheet"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { Button } from "@ewatrade/ui"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { CustomerLedgerSheet } from "./customer-ledger-sheet"
import { DomainSheet } from "./domain-sheet"
import { FinanceSheet } from "./finance-sheet"
import { PrescriptionRequestSheet } from "./prescription-request-sheet"
import { ReceiptSheet } from "./receipt-sheet"
import { ServiceCommerceSheet } from "./service-commerce-sheet"
import { StoreConversationSheet } from "./store-conversation-sheet"

export type GlobalSheetAccess = {
  catalog?: boolean
  scopedStaff?: boolean
  finance: boolean
  prescriptions: boolean
  managePrescriptionSetup: boolean
}
export type GlobalSheetStore = {
  id: string
  name: string
  currencyCode: string
  businessProfileKey: string | null
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
  store: GlobalSheetStore
  storeIds: string[]
  tenantId: string
}) {
  const pathname = usePathname()
  const { setCatalogItemMode } = useCatalogItemParams()
  const [notice, setNotice] = useState<string | null>(null)
  return (
    <>
      {access.catalog && pathname !== "/catalog" ? (
        <CatalogAppearance>
          <CatalogItemSheet
            storeId={store.id}
            currencyCode={store.currencyCode}
            businessProfileKey={store.businessProfileKey}
            onCreated={(name) => {
              setNotice(`${name} added.`)
              void setCatalogItemMode(null)
            }}
          />
        </CatalogAppearance>
      ) : null}
      {notice ? (
        <div className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border bg-background p-4 shadow-lg">
          <output>{notice}</output>
          <Button variant="ghost" size="sm" onClick={() => setNotice(null)}>
            Dismiss
          </Button>
        </div>
      ) : null}
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

"use client"
import { CatalogAppearance } from "@/components/catalog-item/catalog-appearance"
import { CatalogItemDetailModal } from "@/components/catalog-item/catalog-item-detail-modal"
import { CatalogItemSheet } from "@/components/catalog-item/catalog-item-sheet"
import { useAssistantDraftJobOverlay } from "@/hooks/use-assistant-draft-job-handoff"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { Button } from "@ewatrade/ui"
import { usePathname } from "next/navigation"
import { useState } from "react"
import { CustomerRequestSheet } from "./customer-request-sheet"
import { ServiceIntakeReceiptSheet } from "./service-intake-receipt-sheet"
import { ServiceIntakeSheet } from "./service-intake-sheet"
import { ServiceJobSheet } from "./service-job-sheet"
import { ServiceWorkOriginalSheet } from "./service-work-original-sheet"

import { BusinessNotificationPreferencesSheet } from "@/components/notification-center/business-notification-settings"
import { ActivitySheet } from "./activity-sheet"
import { AssistantBookingSheet } from "./assistant-booking-sheet"
import { AssistantCashCountSheet } from "./assistant-cash-count-sheet"
import { AssistantDayCloseSheet } from "./assistant-day-close-sheet"
import { AssistantManualMessageSheet } from "./assistant-manual-message-sheet"
import { AssistantQuoteApprovalSheet } from "./assistant-quote-approval-sheet"
import { AssistantServiceRequestSheet } from "./assistant-service-request-sheet"
import { BusinessReportSheet } from "./business-report-sheet"
import { CloseoutSheet } from "./closeout-sheet"
import { CustomerDetailsSheet } from "./customer-details-sheet"
import { CustomerLedgerSheet } from "./customer-ledger-sheet"
import { CustomerMessageSheet } from "./customer-message-sheet"
import { DomainSheet } from "./domain-sheet"
import { FinanceMovementDetailsSheet } from "./finance-movement-details-sheet"
import { FinanceSheet } from "./finance-sheet"
import { InventoryOperationDetailsSheet } from "./inventory-operation-details-sheet"
import { OrderDetailsSheet } from "./order-details-sheet"
import { PrescriptionRequestSheet } from "./prescription-request-sheet"
import { PurchaseBillDetailsSheet } from "./purchase-bill-details-sheet"
import { PurchaseRegistrationDetailsSheet } from "./purchase-registration-details-sheet"
import { ReceiptSheet } from "./receipt-sheet"
import { ServiceCommerceSheet } from "./service-commerce-sheet"
import { StaffAccessSheet } from "./staff-access-sheet"
import { StaffActivitySheet } from "./staff-activity-sheet"
import { StaffDirectorySheet } from "./staff-directory-sheet"
import { StaffHistorySheet } from "./staff-history-sheet"
import { StaffInvitationSheet } from "./staff-invitation-sheet"
import { StaffMemberSheet } from "./staff-member-sheet"
import { StaffStatusSheet } from "./staff-status-sheet"
import { StockCountSheet } from "./stock-count-sheet"
import { StockTransferDetailsSheet } from "./stock-transfer-details-sheet"
import { StoreConversationSheet } from "./store-conversation-sheet"
import { StoreSettingsSheet } from "./store-settings-sheet"

export type GlobalSheetAccess = {
  /** Existing native Service Jobs operator/manager access, independent of assistant intake. */
  serviceJobs?: boolean
  manageServiceJobs?: boolean
  serviceIntake?: boolean
  /** Website & domain launch gate and role; the sheet mounts only when true. */
  domains?: boolean
  staffHistory?: boolean
  staffDirectory?: boolean
  sales: boolean
  /** The Orders list and full order pages. */
  ordersPage?: boolean
  catalog?: boolean
  /** Fresh Shell role/Store-access fingerprint. Missing identity withholds catalog detail. */
  catalogReadAccessKey?: string
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
  timeZone,
}: {
  access: GlobalSheetAccess
  actorUserId: string
  store: GlobalSheetStore
  storeIds: string[]
  tenantId: string
  timeZone: string
}) {
  const objectScope = JSON.stringify([actorUserId, tenantId, store.id])
  const pathname = usePathname()
  const ownedJob = useAssistantDraftJobOverlay()
  const jobParams = useServiceWorkParams()
  const ownedJobOpen = Boolean(
    ownedJob && jobParams.sheet === "job" && jobParams.jobId === ownedJob.jobId,
  )
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
            onSaved={(name) => setNotice(`${name} saved.`)}
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
      {access.domains && !access.scopedStaff ? (
        <DomainSheet store={store} />
      ) : null}
      {(access.sales || access.catalog) && access.catalogReadAccessKey ? (
        <CatalogItemDetailModal
          key={`catalog-detail:${objectScope}:${Boolean(access.catalog)}:${access.catalogReadAccessKey}`}
          actorUserId={actorUserId}
          tenantId={tenantId}
          store={store}
          readOnly={!access.catalog}
          accessKey={access.catalogReadAccessKey}
          canCreateServiceJob={Boolean(access.serviceJobs)}
        />
      ) : null}
      {access.sales ? (
        <>
          <OrderDetailsSheet
            storeId={store.id}
            fullPage={Boolean(access.ordersPage)}
            timeZone={timeZone}
          />
          <CustomerDetailsSheet />
          {/* WhatsApp messages; drafts reset with user, business or Store. */}
          <CustomerMessageSheet key={`customer-message:${objectScope}`} />
        </>
      ) : null}
      {access.serviceIntake ? (
        <ServiceIntakeReceiptSheet
          key={`service-intake:${objectScope}`}
          timeZone={timeZone}
        />
      ) : null}
      {access.serviceJobs ? (
        <ServiceIntakeSheet
          key={`new-service-job:${objectScope}:${Boolean(access.manageServiceJobs)}`}
          tenantId={tenantId}
          canManage={Boolean(access.manageServiceJobs)}
          store={store}
        />
      ) : null}
      {access.serviceJobs && access.manageServiceJobs ? (
        <CustomerRequestSheet
          key={`native-service-request:${objectScope}`}
          store={store}
          timeZone={timeZone}
        />
      ) : null}
      {(access.serviceIntake || ownedJobOpen) && pathname !== "/services" ? (
        <ServiceJobSheet
          canManage
          storeId={store.id}
          scope={{ actorUserId, tenantId, storeId: store.id }}
          nativeAccessAvailable={Boolean(access.serviceIntake)}
        />
      ) : null}
      {/* Exact original reads authorize independently of the intake-editor role. */}
      <AssistantQuoteApprovalSheet
        key={`quotation:${objectScope}`}
        scopeKey={objectScope}
      />
      {access.serviceIntake ? (
        <AssistantManualMessageSheet
          key={`manual-message:${objectScope}`}
          scopeKey={objectScope}
        />
      ) : null}
      {access.serviceIntake ? (
        <AssistantServiceRequestSheet
          key={`service-request:${objectScope}`}
          scopeKey={objectScope}
        />
      ) : null}
      <AssistantBookingSheet
        key={`booking:${objectScope}`}
        scopeKey={objectScope}
      />
      <ServiceWorkOriginalSheet
        key={`service-work-original:${objectScope}`}
        scopeKey={objectScope}
        timeZone={timeZone}
      />
      {access.sales ? (
        <BusinessReportSheet key={`business-report:${objectScope}`} />
      ) : null}
      {/* The protected activity query re-checks Owner/Admin/Manager access. */}
      <StaffActivitySheet
        timeZone={timeZone}
        context={{
          scopeKey: objectScope,
          activeStoreId: store.id,
          opens: {
            order: Boolean(access.sales),
            product: Boolean(access.catalog),
            serviceJob:
              Boolean(access.serviceIntake) && pathname !== "/services",
          },
        }}
      />
      {/* Business Activity detail; the server re-reads under current access. */}
      <ActivitySheet
        key={`activity:${objectScope}`}
        timeZone={timeZone}
        context={{
          scopeKey: objectScope,
          activeStoreId: store.id,
          access: {
            sales: Boolean(access.sales),
            catalog: Boolean(access.catalog),
            staffDirectory: Boolean(access.staffDirectory),
            staffHistory: Boolean(access.staffHistory),
            finance: Boolean(access.finance),
            serviceJobs:
              Boolean(access.serviceIntake) && pathname !== "/services",
          },
        }}
      />
      <BusinessNotificationPreferencesSheet
        key={`alert-preferences:${objectScope}`}
        scopeKey={objectScope}
      />
      {access.staffHistory ? <StaffHistorySheet /> : null}
      {access.staffHistory ? (
        <StaffAccessSheet
          key={`staff-access:${objectScope}`}
          timeZone={timeZone}
        />
      ) : null}
      {access.staffHistory ? (
        <StaffStatusSheet
          key={`staff-status:${objectScope}`}
          timeZone={timeZone}
        />
      ) : null}
      {access.staffHistory ? <StaffInvitationSheet /> : null}
      {access.staffDirectory ? (
        <>
          <StaffDirectorySheet />
          <StaffMemberSheet historyAllowed={Boolean(access.staffHistory)} />
        </>
      ) : null}
      {/* Server procedures enforce Owner/Admin and plan per section. */}
      <StoreSettingsSheet />
      <StockTransferDetailsSheet storeId={store.id} />
      <InventoryOperationDetailsSheet storeId={store.id} />
      <ReceiptSheet storeId={store.id} />
      <StockCountSheet storeId={store.id} />
      <CloseoutSheet storeId={store.id} />
      {access.finance ? (
        <CustomerLedgerSheet actorUserId={actorUserId} tenantId={tenantId} />
      ) : null}
      {access.finance ? (
        <AssistantCashCountSheet key={`cash-count:${objectScope}`} />
      ) : null}
      {access.finance ? (
        <AssistantDayCloseSheet key={`day-close:${objectScope}`} />
      ) : null}
      {access.finance ? <FinanceMovementDetailsSheet /> : null}
      {access.finance ? <PurchaseRegistrationDetailsSheet /> : null}
      {access.finance ? <PurchaseBillDetailsSheet /> : null}
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

"use client"
import { CatalogAppearance } from "@/components/catalog-item/catalog-appearance"
import { useAssistantDraftJobOverlay } from "@/hooks/use-assistant-draft-job-handoff"
import { useCatalogItemParams } from "@/hooks/use-catalog-item-params"
import { useServiceWorkParams } from "@/hooks/use-service-work-params"
import { Button } from "@ewatrade/ui"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { useGlobalSheetIntents } from "@/hooks/use-global-sheet-intents"
import dynamic from "next/dynamic"
import { ActivatedSheet, SheetCodeLoading } from "./activated-sheet"

const CatalogItemDetailModal = dynamic(
  () =>
    import("@/components/catalog-item/catalog-item-detail-modal").then(
      (module) => module.CatalogItemDetailModal,
    ),
  { loading: SheetCodeLoading },
)
const CatalogItemSheet = dynamic(
  () =>
    import("@/components/catalog-item/catalog-item-sheet").then(
      (module) => module.CatalogItemSheet,
    ),
  { loading: SheetCodeLoading },
)
const CustomerRequestSheet = dynamic(
  () =>
    import("./customer-request-sheet").then(
      (module) => module.CustomerRequestSheet,
    ),
  { loading: SheetCodeLoading },
)
const ServiceIntakeReceiptSheet = dynamic(
  () =>
    import("./service-intake-receipt-sheet").then(
      (module) => module.ServiceIntakeReceiptSheet,
    ),
  { loading: SheetCodeLoading },
)
const ServiceIntakeSheet = dynamic(
  () =>
    import("./service-intake-sheet").then(
      (module) => module.ServiceIntakeSheet,
    ),
  { loading: SheetCodeLoading },
)
const ServiceJobSheet = dynamic(
  () => import("./service-job-sheet").then((module) => module.ServiceJobSheet),
  { loading: SheetCodeLoading },
)
const ServiceWorkOriginalSheet = dynamic(
  () =>
    import("./service-work-original-sheet").then(
      (module) => module.ServiceWorkOriginalSheet,
    ),
  { loading: SheetCodeLoading },
)
const BusinessNotificationPreferencesSheet = dynamic(
  () =>
    import(
      "@/components/notification-center/business-notification-settings"
    ).then((module) => module.BusinessNotificationPreferencesSheet),
  { loading: SheetCodeLoading },
)
const ActivitySheet = dynamic(
  () => import("./activity-sheet").then((module) => module.ActivitySheet),
  { loading: SheetCodeLoading },
)
const AssistantBookingSheet = dynamic(
  () =>
    import("./assistant-booking-sheet").then(
      (module) => module.AssistantBookingSheet,
    ),
  { loading: SheetCodeLoading },
)
const AssistantCashCountSheet = dynamic(
  () =>
    import("./assistant-cash-count-sheet").then(
      (module) => module.AssistantCashCountSheet,
    ),
  { loading: SheetCodeLoading },
)
const AssistantDayCloseSheet = dynamic(
  () =>
    import("./assistant-day-close-sheet").then(
      (module) => module.AssistantDayCloseSheet,
    ),
  { loading: SheetCodeLoading },
)
const AssistantManualMessageSheet = dynamic(
  () =>
    import("./assistant-manual-message-sheet").then(
      (module) => module.AssistantManualMessageSheet,
    ),
  { loading: SheetCodeLoading },
)
const AssistantQuoteApprovalSheet = dynamic(
  () =>
    import("./assistant-quote-approval-sheet").then(
      (module) => module.AssistantQuoteApprovalSheet,
    ),
  { loading: SheetCodeLoading },
)
const AssistantServiceRequestSheet = dynamic(
  () =>
    import("./assistant-service-request-sheet").then(
      (module) => module.AssistantServiceRequestSheet,
    ),
  { loading: SheetCodeLoading },
)
const BusinessReportSheet = dynamic(
  () =>
    import("./business-report-sheet").then(
      (module) => module.BusinessReportSheet,
    ),
  { loading: SheetCodeLoading },
)
const CloseoutSheet = dynamic(
  () => import("./closeout-sheet").then((module) => module.CloseoutSheet),
  { loading: SheetCodeLoading },
)
const CustomerDetailsSheet = dynamic(
  () =>
    import("./customer-details-sheet").then(
      (module) => module.CustomerDetailsSheet,
    ),
  { loading: SheetCodeLoading },
)
const CustomerLedgerSheet = dynamic(
  () =>
    import("./customer-ledger-sheet").then(
      (module) => module.CustomerLedgerSheet,
    ),
  { loading: SheetCodeLoading },
)
const CustomerMessageSheet = dynamic(
  () =>
    import("./customer-message-sheet").then(
      (module) => module.CustomerMessageSheet,
    ),
  { loading: SheetCodeLoading },
)
const DomainSheet = dynamic(
  () => import("./domain-sheet").then((module) => module.DomainSheet),
  { loading: SheetCodeLoading },
)
const FinanceMovementDetailsSheet = dynamic(
  () =>
    import("./finance-movement-details-sheet").then(
      (module) => module.FinanceMovementDetailsSheet,
    ),
  { loading: SheetCodeLoading },
)
const FinanceSheet = dynamic(
  () => import("./finance-sheet").then((module) => module.FinanceSheet),
  { loading: SheetCodeLoading },
)
const InventoryOperationDetailsSheet = dynamic(
  () =>
    import("./inventory-operation-details-sheet").then(
      (module) => module.InventoryOperationDetailsSheet,
    ),
  { loading: SheetCodeLoading },
)
const OrderDetailsSheet = dynamic(
  () =>
    import("./order-details-sheet").then((module) => module.OrderDetailsSheet),
  { loading: SheetCodeLoading },
)
const PrescriptionRequestSheet = dynamic(
  () =>
    import("./prescription-request-sheet").then(
      (module) => module.PrescriptionRequestSheet,
    ),
  { loading: SheetCodeLoading },
)
const PurchaseBillDetailsSheet = dynamic(
  () =>
    import("./purchase-bill-details-sheet").then(
      (module) => module.PurchaseBillDetailsSheet,
    ),
  { loading: SheetCodeLoading },
)
const PurchaseRegistrationDetailsSheet = dynamic(
  () =>
    import("./purchase-registration-details-sheet").then(
      (module) => module.PurchaseRegistrationDetailsSheet,
    ),
  { loading: SheetCodeLoading },
)
const ReceiptSheet = dynamic(
  () => import("./receipt-sheet").then((module) => module.ReceiptSheet),
  { loading: SheetCodeLoading },
)
const ServiceCommerceSheet = dynamic(
  () =>
    import("./service-commerce-sheet").then(
      (module) => module.ServiceCommerceSheet,
    ),
  { loading: SheetCodeLoading },
)
const StaffAccessSheet = dynamic(
  () =>
    import("./staff-access-sheet").then((module) => module.StaffAccessSheet),
  { loading: SheetCodeLoading },
)
const StaffActivitySheet = dynamic(
  () =>
    import("./staff-activity-sheet").then(
      (module) => module.StaffActivitySheet,
    ),
  { loading: SheetCodeLoading },
)
const StaffDirectorySheet = dynamic(
  () =>
    import("./staff-directory-sheet").then(
      (module) => module.StaffDirectorySheet,
    ),
  { loading: SheetCodeLoading },
)
const StaffHistorySheet = dynamic(
  () =>
    import("./staff-history-sheet").then((module) => module.StaffHistorySheet),
  { loading: SheetCodeLoading },
)
const StaffInvitationSheet = dynamic(
  () =>
    import("./staff-invitation-sheet").then(
      (module) => module.StaffInvitationSheet,
    ),
  { loading: SheetCodeLoading },
)
const StaffMemberSheet = dynamic(
  () =>
    import("./staff-member-sheet").then((module) => module.StaffMemberSheet),
  { loading: SheetCodeLoading },
)
const StaffStatusSheet = dynamic(
  () =>
    import("./staff-status-sheet").then((module) => module.StaffStatusSheet),
  { loading: SheetCodeLoading },
)
const StockCountSheet = dynamic(
  () => import("./stock-count-sheet").then((module) => module.StockCountSheet),
  { loading: SheetCodeLoading },
)
const StockTransferDetailsSheet = dynamic(
  () =>
    import("./stock-transfer-details-sheet").then(
      (module) => module.StockTransferDetailsSheet,
    ),
  { loading: SheetCodeLoading },
)
const StoreConversationSheet = dynamic(
  () =>
    import("./store-conversation-sheet").then(
      (module) => module.StoreConversationSheet,
    ),
  { loading: SheetCodeLoading },
)
const StoreSettingsSheet = dynamic(
  () =>
    import("./store-settings-sheet").then(
      (module) => module.StoreSettingsSheet,
    ),
  { loading: SheetCodeLoading },
)

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
  const intent = useGlobalSheetIntents()
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
          <ActivatedSheet
            key={`CatalogItemSheet:${objectScope}`}
            active={intent.CatalogItemSheet}
          >
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
          </ActivatedSheet>
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
        <ActivatedSheet
          key={`DomainSheet:${objectScope}`}
          active={intent.DomainSheet}
        >
          <DomainSheet store={store} />
        </ActivatedSheet>
      ) : null}
      {(access.sales || access.catalog) && access.catalogReadAccessKey ? (
        <ActivatedSheet
          key={`CatalogItemDetailModal:${objectScope}`}
          active={intent.CatalogItemDetailModal}
        >
          <CatalogItemDetailModal
            key={`catalog-detail:${objectScope}:${Boolean(access.catalog)}:${access.catalogReadAccessKey}`}
            actorUserId={actorUserId}
            tenantId={tenantId}
            store={store}
            readOnly={!access.catalog}
            accessKey={access.catalogReadAccessKey}
            canCreateServiceJob={Boolean(access.serviceJobs)}
          />
        </ActivatedSheet>
      ) : null}
      {access.sales ? (
        <>
          <ActivatedSheet
            key={`OrderDetailsSheet:${objectScope}`}
            active={intent.OrderDetailsSheet}
          >
            <OrderDetailsSheet
              storeId={store.id}
              fullPage={Boolean(access.ordersPage)}
              timeZone={timeZone}
            />
          </ActivatedSheet>
          <ActivatedSheet
            key={`CustomerDetailsSheet:${objectScope}`}
            active={intent.CustomerDetailsSheet}
          >
            <CustomerDetailsSheet />
          </ActivatedSheet>
          {/* WhatsApp messages; drafts reset with user, business or Store. */}
          <ActivatedSheet
            key={`CustomerMessageSheet:${objectScope}`}
            active={intent.CustomerMessageSheet}
          >
            <CustomerMessageSheet key={`customer-message:${objectScope}`} />
          </ActivatedSheet>
        </>
      ) : null}
      {access.serviceIntake ? (
        <ActivatedSheet
          key={`ServiceIntakeReceiptSheet:${objectScope}`}
          active={intent.ServiceIntakeReceiptSheet}
        >
          <ServiceIntakeReceiptSheet
            key={`service-intake:${objectScope}`}
            timeZone={timeZone}
          />
        </ActivatedSheet>
      ) : null}
      {access.serviceJobs ? (
        <ActivatedSheet
          key={`ServiceIntakeSheet:${objectScope}`}
          active={intent.ServiceIntakeSheet}
        >
          <ServiceIntakeSheet
            key={`new-service-job:${objectScope}:${Boolean(access.manageServiceJobs)}`}
            tenantId={tenantId}
            canManage={Boolean(access.manageServiceJobs)}
            store={store}
          />
        </ActivatedSheet>
      ) : null}
      {access.serviceJobs && access.manageServiceJobs ? (
        <ActivatedSheet
          key={`CustomerRequestSheet:${objectScope}`}
          active={intent.CustomerRequestSheet}
        >
          <CustomerRequestSheet
            key={`native-service-request:${objectScope}`}
            store={store}
            timeZone={timeZone}
          />
        </ActivatedSheet>
      ) : null}
      {(access.serviceIntake || ownedJobOpen) && pathname !== "/services" ? (
        <ActivatedSheet
          key={`ServiceJobSheet:${objectScope}`}
          active={intent.ServiceJobSheet}
        >
          <ServiceJobSheet
            canManage
            storeId={store.id}
            scope={{ actorUserId, tenantId, storeId: store.id }}
            nativeAccessAvailable={Boolean(access.serviceIntake)}
          />
        </ActivatedSheet>
      ) : null}
      {/* Exact original reads authorize independently of the intake-editor role. */}
      <ActivatedSheet
        key={`AssistantQuoteApprovalSheet:${objectScope}`}
        active={intent.AssistantQuoteApprovalSheet}
      >
        <AssistantQuoteApprovalSheet
          key={`quotation:${objectScope}`}
          scopeKey={objectScope}
        />
      </ActivatedSheet>
      {access.serviceIntake ? (
        <ActivatedSheet
          key={`AssistantManualMessageSheet:${objectScope}`}
          active={intent.AssistantManualMessageSheet}
        >
          <AssistantManualMessageSheet
            key={`manual-message:${objectScope}`}
            scopeKey={objectScope}
          />
        </ActivatedSheet>
      ) : null}
      {access.serviceIntake ? (
        <ActivatedSheet
          key={`AssistantServiceRequestSheet:${objectScope}`}
          active={intent.AssistantServiceRequestSheet}
        >
          <AssistantServiceRequestSheet
            key={`service-request:${objectScope}`}
            scopeKey={objectScope}
          />
        </ActivatedSheet>
      ) : null}
      <ActivatedSheet
        key={`AssistantBookingSheet:${objectScope}`}
        active={intent.AssistantBookingSheet}
      >
        <AssistantBookingSheet
          key={`booking:${objectScope}`}
          scopeKey={objectScope}
        />
      </ActivatedSheet>
      <ActivatedSheet
        key={`ServiceWorkOriginalSheet:${objectScope}`}
        active={intent.ServiceWorkOriginalSheet}
      >
        <ServiceWorkOriginalSheet
          key={`service-work-original:${objectScope}`}
          scopeKey={objectScope}
          timeZone={timeZone}
        />
      </ActivatedSheet>
      {access.sales ? (
        <ActivatedSheet
          key={`BusinessReportSheet:${objectScope}`}
          active={intent.BusinessReportSheet}
        >
          <BusinessReportSheet key={`business-report:${objectScope}`} />
        </ActivatedSheet>
      ) : null}
      {/* The protected activity query re-checks Owner/Admin/Manager access. */}
      <ActivatedSheet
        key={`StaffActivitySheet:${objectScope}`}
        active={intent.StaffActivitySheet}
      >
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
      </ActivatedSheet>
      {/* Business Activity detail; the server re-reads under current access. */}
      <ActivatedSheet
        key={`ActivitySheet:${objectScope}`}
        active={intent.ActivitySheet}
      >
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
      </ActivatedSheet>
      <ActivatedSheet
        key={`BusinessNotificationPreferencesSheet:${objectScope}`}
        active={intent.BusinessNotificationPreferencesSheet}
      >
        <BusinessNotificationPreferencesSheet
          key={`alert-preferences:${objectScope}`}
          scopeKey={objectScope}
        />
      </ActivatedSheet>
      {access.staffHistory ? (
        <ActivatedSheet
          key={`StaffHistorySheet:${objectScope}`}
          active={intent.StaffHistorySheet}
        >
          <StaffHistorySheet />
        </ActivatedSheet>
      ) : null}
      {access.staffHistory ? (
        <ActivatedSheet
          key={`StaffAccessSheet:${objectScope}`}
          active={intent.StaffAccessSheet}
        >
          <StaffAccessSheet
            key={`staff-access:${objectScope}`}
            timeZone={timeZone}
          />
        </ActivatedSheet>
      ) : null}
      {access.staffHistory ? (
        <ActivatedSheet
          key={`StaffStatusSheet:${objectScope}`}
          active={intent.StaffStatusSheet}
        >
          <StaffStatusSheet
            key={`staff-status:${objectScope}`}
            timeZone={timeZone}
          />
        </ActivatedSheet>
      ) : null}
      {access.staffHistory ? (
        <ActivatedSheet
          key={`StaffInvitationSheet:${objectScope}`}
          active={intent.StaffInvitationSheet}
        >
          <StaffInvitationSheet />
        </ActivatedSheet>
      ) : null}
      {access.staffDirectory ? (
        <>
          <ActivatedSheet
            key={`StaffDirectorySheet:${objectScope}`}
            active={intent.StaffDirectorySheet}
          >
            <StaffDirectorySheet />
          </ActivatedSheet>
          <ActivatedSheet
            key={`StaffMemberSheet:${objectScope}`}
            active={intent.StaffMemberSheet}
          >
            <StaffMemberSheet historyAllowed={Boolean(access.staffHistory)} />
          </ActivatedSheet>
        </>
      ) : null}
      {/* Server procedures enforce Owner/Admin and plan per section. */}
      <ActivatedSheet
        key={`StoreSettingsSheet:${objectScope}`}
        active={intent.StoreSettingsSheet}
      >
        <StoreSettingsSheet />
      </ActivatedSheet>
      <ActivatedSheet
        key={`StockTransferDetailsSheet:${objectScope}`}
        active={intent.StockTransferDetailsSheet}
      >
        <StockTransferDetailsSheet storeId={store.id} />
      </ActivatedSheet>
      <ActivatedSheet
        key={`InventoryOperationDetailsSheet:${objectScope}`}
        active={intent.InventoryOperationDetailsSheet}
      >
        <InventoryOperationDetailsSheet storeId={store.id} />
      </ActivatedSheet>
      <ActivatedSheet
        key={`ReceiptSheet:${objectScope}`}
        active={intent.ReceiptSheet}
      >
        <ReceiptSheet storeId={store.id} />
      </ActivatedSheet>
      <ActivatedSheet
        key={`StockCountSheet:${objectScope}`}
        active={intent.StockCountSheet}
      >
        <StockCountSheet storeId={store.id} />
      </ActivatedSheet>
      <ActivatedSheet
        key={`CloseoutSheet:${objectScope}`}
        active={intent.CloseoutSheet}
      >
        <CloseoutSheet storeId={store.id} />
      </ActivatedSheet>
      {access.finance ? (
        <ActivatedSheet
          key={`CustomerLedgerSheet:${objectScope}`}
          active={intent.CustomerLedgerSheet}
        >
          <CustomerLedgerSheet actorUserId={actorUserId} tenantId={tenantId} />
        </ActivatedSheet>
      ) : null}
      {access.finance ? (
        <ActivatedSheet
          key={`AssistantCashCountSheet:${objectScope}`}
          active={intent.AssistantCashCountSheet}
        >
          <AssistantCashCountSheet key={`cash-count:${objectScope}`} />
        </ActivatedSheet>
      ) : null}
      {access.finance ? (
        <ActivatedSheet
          key={`AssistantDayCloseSheet:${objectScope}`}
          active={intent.AssistantDayCloseSheet}
        >
          <AssistantDayCloseSheet key={`day-close:${objectScope}`} />
        </ActivatedSheet>
      ) : null}
      {access.finance ? (
        <ActivatedSheet
          key={`FinanceMovementDetailsSheet:${objectScope}`}
          active={intent.FinanceMovementDetailsSheet}
        >
          <FinanceMovementDetailsSheet />
        </ActivatedSheet>
      ) : null}
      {access.finance ? (
        <ActivatedSheet
          key={`PurchaseRegistrationDetailsSheet:${objectScope}`}
          active={intent.PurchaseRegistrationDetailsSheet}
        >
          <PurchaseRegistrationDetailsSheet />
        </ActivatedSheet>
      ) : null}
      {access.finance ? (
        <ActivatedSheet
          key={`PurchaseBillDetailsSheet:${objectScope}`}
          active={intent.PurchaseBillDetailsSheet}
        >
          <PurchaseBillDetailsSheet />
        </ActivatedSheet>
      ) : null}
      {access.finance ? (
        <ActivatedSheet
          key={`FinanceSheet:${objectScope}`}
          active={intent.FinanceSheet}
        >
          <FinanceSheet
            actorUserId={actorUserId}
            storeId={store.id}
            tenantId={tenantId}
          />
        </ActivatedSheet>
      ) : null}
      {access.prescriptions ? (
        <ActivatedSheet
          key={`PrescriptionRequestSheet:${objectScope}`}
          active={intent.PrescriptionRequestSheet}
        >
          <PrescriptionRequestSheet
            canManageSetup={access.managePrescriptionSetup}
            storeId={store.id}
          />
        </ActivatedSheet>
      ) : null}
      {!access.scopedStaff ? (
        <>
          <ActivatedSheet
            key={`ServiceCommerceSheet:${objectScope}`}
            active={intent.ServiceCommerceSheet}
          >
            <ServiceCommerceSheet storeId={store.id} storeIds={storeIds} />
          </ActivatedSheet>
          <ActivatedSheet
            key={`StoreConversationSheet:${objectScope}`}
            active={intent.StoreConversationSheet}
          >
            <StoreConversationSheet storeId={store.id} storeIds={storeIds} />
          </ActivatedSheet>
        </>
      ) : null}
    </>
  )
}
